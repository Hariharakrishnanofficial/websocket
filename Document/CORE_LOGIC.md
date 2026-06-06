# Core Logic — Robot Control System

End-to-end documentation of the three layers that make up the realtime robot-control system. This document captures **only the core logic** — the decisions, contracts, and edge cases that matter — not boilerplate.

```
┌──────────────────────┐   WSS    ┌─────────────────────────┐   WSS   ┌──────────────────┐
│  React Controller    │ ───────► │  AppSail Relay (Node)   │ ──────► │  ESP32 Firmware  │
│  (browser, touch/kbd)│ ◄─────── │  ws broker + dedupe     │ ◄────── │  motor driver    │
└──────────────────────┘          └─────────────────────────┘         └──────────────────┘
        Layer 1                          Layer 2                            Layer 3
```

---

## Table of Contents
1. [Shared Protocol Contract](#1-shared-protocol-contract)
2. [Layer 1 — React Controller (`useRobotSocket.js`)](#2-layer-1--react-controller-userobotsocketjs)
3. [Layer 2 — AppSail Relay (`appsail-nodejs/index.js`)](#3-layer-2--appsail-relay-appsail-nodejsindexjs)
4. [Layer 3 — ESP32 Firmware (`firmware/esp32_robot.ino`)](#4-layer-3--esp32-firmware-firmwareesp32_robotino)
5. [End-to-End Flow Trace](#5-end-to-end-flow-trace)
6. [Critical Design Decisions](#6-critical-design-decisions)

---

## 1. Shared Protocol Contract

All three layers agree on **one byte per command**.

### Command alphabet
| Char | Meaning   |
|------|-----------|
| `F`  | Forward   |
| `B`  | Backward  |
| `L`  | Turn Left |
| `R`  | Turn Right|
| `S`  | Stop      |

### Frame types
| Direction         | Format                          | Example                                          |
|-------------------|---------------------------------|--------------------------------------------------|
| First frame (any) | JSON registration               | `{"type":"controller"}` / `{"type":"robot"}`     |
| Controller → Relay → Robot | Single ASCII byte    | `F`                                              |
| Relay → Controller (status) | JSON                  | `{"type":"status","robotConnected":true}`        |
| Relay → Controller (error)  | JSON                  | `{"type":"error","message":"robot offline"}`     |
| Robot → Relay → Controllers | Plain text → wrapped JSON | `{"type":"telemetry","data":"..."}`         |

### Timing constants (must stay aligned across layers)

| Constant            | Value  | Layer       | Rationale                                              |
|---------------------|--------|-------------|--------------------------------------------------------|
| `HEARTBEAT_MS`      | 300 ms | Controller  | Resend held command — keeps firmware watchdog alive    |
| `DEDUPE_MS`         | 250 ms | Controller  | Client-side dupe drop (< HEARTBEAT so heartbeats pass) |
| `CMD_DEDUPE_MS`     | 200 ms | Relay       | Server-side safety net for stale clients               |
| `COMMAND_TIMEOUT_MS`| 750 ms | Firmware    | 2.5× heartbeat — tolerates 1 missed frame, stops on 2  |

**Invariant:** `DEDUPE_MS < HEARTBEAT_MS < COMMAND_TIMEOUT_MS`. Breaking this either drops heartbeats (robot stops mid-hold) or makes the watchdog useless.

---

## 2. Layer 1 — React Controller (`useRobotSocket.js`)

### Responsibility
Translate user **press/release intent** into a minimal stream of WS frames, keeping the firmware watchdog satisfied without spamming the network.

### Public API (returned by the hook)
```js
{
  status,        // 'connecting' | 'connected' | 'disconnected'
  robotOnline,   // boolean — robot present on the relay
  serverURL, setServerURL,
  logLines,      // recent activity for on-screen debug panel
  sendCmd,       // (cmd, { force }) => boolean   — single-shot
  startHold,     // (cmd) => void                  — begin hold + heartbeat
  stopHold,      // () => void                     — release: emit STOP
  activeCmd,     // currently-held command or null
  reconnect,     // force reconnect with backoff reset
}
```

### Core state (refs, not state — closure-stable)
```
wsRef          — current WebSocket instance
heldCmd        — currently-held direction char or null
heartbeatId    — setInterval id for heartbeat resend
lastSentCmd    — last byte put on the wire (for dedupe)
lastSentAt     — timestamp of last send (for dedupe window)
```

### Press → Release lifecycle

```
   onPointerDown ─► startHold('F')
                    │
                    ├─ rawSend('F')                    ← immediate first frame
                    ├─ setActiveCmd('F') (UI hint)
                    └─ setInterval(rawSend('F'), 300)  ← heartbeat
                                                       │
                                                       │  (3 frames/sec on the wire)
                                                       │
   onPointerUp   ─► stopHold()
                    │
                    ├─ clearInterval(heartbeatId)
                    ├─ rawSend('S')                    ← release frame
                    └─ lastSentCmd = null              ← unblock next direction
```

### Edge cases that drive the implementation

| Edge case                                                    | How it's handled                                                                                                                                                |
|--------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| OS keyboard auto-repeat fires `keydown` every ~30 ms         | `startHold` returns early if `heldCmd === cmd` → no duplicate intervals                                                                                         |
| User swipes from up-arrow button to right-arrow button       | `startHold('R')` calls `stopHeartbeat()` first → direction swap with **no** intermediate STOP (firmware reinterprets instantly)                                  |
| Touch release fires both `pointerup` and `pointerleave`      | `stopHold` is **idempotent** — does NOT early-return when `heldCmd` is null; second call is a safe no-op                                                         |
| Socket drops mid-hold                                        | `ws.onclose` clears the heartbeat timer **but preserves `heldCmd`** so next release still emits S consistently                                                   |
| User presses STOP button explicitly                          | `sendCmd('S', { force: true })` bypasses dedupe — release must never be swallowed                                                                                |
| Server URL discovery without a hard-coded value              | Priority: `VITE_WS_URL` env → `?server=` query param → derived from page URL (`wss://host/ws` for HTTPS pages, `ws://host:4600/ws` for HTTP dev)                  |

### Dedupe rule (single source of truth)
```js
if (!force && cmd === lastSentCmd && now - lastSentAt < DEDUPE_MS) drop;
```
Applies only to **non-heartbeat** single-shot sends. Heartbeats go through `rawSend` directly to bypass it.

### Auto-reconnect
Exponential backoff capped at 8 s: `min(1000 * 2^retries, 8000)`. Counter resets on a successful `onopen`.

---

## 3. Layer 2 — AppSail Relay (`appsail-nodejs/index.js`)

### Responsibility
Cheap, stateless message broker. Pair *N* controllers with **one** robot. Add authentication, rate-limiting, and a dedupe safety net so a misbehaving client can't bring down the link.

### Endpoints
| Path      | Purpose                                          |
|-----------|--------------------------------------------------|
| `GET /`        | Service banner JSON                         |
| `GET /health`  | Liveness + non-sensitive config summary     |
| `WS  /ws`      | WebSocket endpoint (preferred)              |
| `WS  /`        | WebSocket endpoint (also accepted)          |

### Connection state machine

```
        ┌─────────────────┐
        │  connection in  │
        └────────┬────────┘
                 │ awaiting registration (5 s timer)
                 ▼
  ┌──────────────────────────────────────────┐
  │ first message MUST be JSON registration  │
  │  {"type":"robot",      "token":"..."} OR │
  │  {"type":"controller", "token":"..."}    │
  └────────┬─────────────────────────┬───────┘
           │ valid                   │ invalid / timeout
           ▼                         ▼
  ┌────────────────┐         ┌──────────────────┐
  │ role assigned  │         │ close 4000/4001  │
  │ welcome sent   │         └──────────────────┘
  └────────────────┘
```

### State (process-global, single replica)
```
controllers : Set<WebSocket>   — many allowed
robot       : WebSocket | null — only one active; new robot replaces previous
```

### Per-controller bookkeeping (attached to the `ws` object)
```
ws.cmdWindowStart  ws.cmdCount      — sliding 1-second rate-limit window
ws.lastCmd         ws.lastCmdAt     — for CMD_DEDUPE_MS safety net
ws.dedupedCount                     — for periodic log surfacing
```

### Command path (controller → robot)

```
inbound text  ──► role check (controller?)
              ──► rate-limit check (CMD_RATE_LIMIT = 50/s sliding window)
              ──► parse: raw byte OR  {"cmd":"F"}  JSON envelope
              ──► uppercase + validate against VALID_COMMANDS
              ──► dedupe: drop if (cmd === lastCmd) && cmd !== 'S' && Δt < 200ms
              ──► robot.send(cmd)   ← single ASCII byte
```

**Key rule:** `'S'` (STOP) is **never** deduped. Even if a controller sends 100 STOPs in a row, every one is forwarded. Releasing the robot is non-negotiable.

### Robot path (robot → controllers)
Robot can send any text. Each frame is wrapped into `{"type":"telemetry","data": "..."}` and broadcast to **all** controllers (useful for debug overlay).

### Security knobs (env-configurable)
| Env var             | Effect                                                                |
|---------------------|-----------------------------------------------------------------------|
| `ROBOT_TOKEN`       | Required `token` field in robot registration (empty = disabled)       |
| `CONTROLLER_TOKEN`  | Required `token` field in controller registration                     |
| `ALLOWED_ORIGINS`   | Comma-separated allow-list (empty = open). Non-browser clients exempt.|

### Resilience features
- **Heartbeat:** every 30 s, ping all clients. Clients that didn't pong since the last interval are `terminate()`d.
- **Max payload:** 4 KB — kills oversized frames at the WS layer.
- **Registration timeout:** 5 s; silent clients are closed with code 4000.
- **Graceful shutdown:** on SIGINT/SIGTERM, close all sockets with 1001, then exit; 3 s hard-kill fallback.
- **Notify on robot status change:** every controller receives `{type:"status",robotConnected:bool}` whenever the robot connects/disconnects.

---

## 4. Layer 3 — ESP32 Firmware (`firmware/esp32_robot.ino`)

### Responsibility
Establish a resilient WSS link to the relay, translate inbound command bytes into motor pin states, and **fail safe** (stop the robot) on any loss of signal.

### State

| Variable         | Meaning                                                       |
|------------------|---------------------------------------------------------------|
| `wifiState`      | `WIFI_IDLE` / `WIFI_CONNECTING` / `WIFI_READY` — state machine |
| `wsConnected`    | WebSocket session open                                         |
| `currentMotion`  | Last applied direction char (`F`/`B`/`L`/`R`/`S`/0)            |
| `isMoving`       | True when `currentMotion != 'S'`                               |
| `lastCommandMs`  | Watchdog reference — refreshed by every inbound command        |
| `wsBackoffMs`    | Linear-doubling reconnect backoff (capped at 30 s)             |

### Main loop (non-blocking, single-threaded)

```
loop() ─► pumpWiFi()             // state machine; never blocks
       ─► if WIFI_READY && !wsConnected → connectWebSocket()
       ─► wsClient.poll()        // drain WS RX queue
       ─► if isMoving && (now − lastCommandMs > 750) → stopRobot()      ◄── WATCHDOG
       ─► periodic status print  (change-driven, 30 s heartbeat)
```

### Motion dispatcher (the only thing that touches motor pins)

```c
applyMotion(dir):
  if dir == currentMotion: return false        ◄── fast path on heartbeat
  switch dir:
    'F' → writeMotorPins(H,L, H,L)
    'B' → writeMotorPins(L,H, L,H)
    'L' → writeMotorPins(L,H, H,L)
    'R' → writeMotorPins(H,L, L,H)
    'S' → writeMotorPins(L,L, L,L)
  currentMotion = dir
  isMoving = (dir != 'S')
```

**Why state-tracked:** heartbeat frames arrive 3×/sec for the same direction. Without this fast path we'd thrash 4 GPIO pins 12 times/sec and dump a serial line on each one, throttling the WS pump.

### WebSocket message handling

```
onWsMessage(data):
  if len == 1: handleCommand(data[0])             ◄── primary path
  else if data contains "\"cmd\"":                ◄── JSON envelope fallback
    parse out char after "cmd":"
    handleCommand(c)
  else:
    log truncated (≤64 chars) — never let a rogue server stall the loop
```

### Connection establishment (with pre-flight diagnostics)

The naive call sequence (`WiFi.begin` → `wsClient.connect`) hides three different failure modes behind one error. We split them out so logs tell you exactly what broke:

```
connectWebSocket():
  1. parseWsUrl(url) → host, port, path, secure
  2. WiFi.hostByName(host)            ◄── DNS probe
  3. WiFiClient.connect(ip, port)      ◄── raw TCP probe (router/firewall?)
  4. if wss:
       WiFiClientSecure.setCACert(ROOT_CA_PEM)
       tls.connect(host, port)         ◄── TLS handshake probe (cert/SNI?)
  5. wsClient.setCACert(ROOT_CA_PEM)
  6. wsClient.connect(url)             ◄── WS upgrade
  7. onWsEvent(ConnectionOpened) sends registration JSON
```

Each step logs distinctly. If "DNS ok" prints but "TCP" doesn't, the upstream router is blocking the port. If TCP ok but TLS fails, it's a cert/SNI issue (typically library bug or wrong CA root).

### Safety guarantees

| Event                              | Action                                                                        |
|------------------------------------|-------------------------------------------------------------------------------|
| `wsClient` closes                  | `stopRobot()` immediately, schedule reconnect after `wsBackoffMs`              |
| Wi-Fi transitions READY → IDLE     | `stopRobot()` immediately                                                      |
| No command received for 750 ms     | Watchdog fires: `stopRobot()` + log `[wdt] command timeout`                    |
| Boot                               | All motor pins driven LOW before WS connection is attempted                    |
| Successful connect after failures  | `wsBackoffMs` reset to base 2 s                                                |

### Why a separate TLS probe?
Older `ArduinoWebsockets` versions silently fail wss:// when `setInsecure()` is used on ESP32 — it nulls the CA pointer but never calls the underlying `WiFiClientSecure::setInsecure()`. The library returns `false` from `connect()` with no log line. The probe surfaces this as "TLS probe FAILED" with actionable advice. **Fix in firmware:** always use `setCACert(ROOT_CA_PEM)`, never `setInsecure()`.

---

## 5. End-to-End Flow Trace

What happens when the user presses & holds the ↑ button for ~1 second.

```
t=0ms     Controller   onPointerDown('F')
                       → startHold('F'):
                            heldCmd = 'F'
                            rawSend('F')            ── WS:F ──►
                            setInterval(rawSend('F'), 300)

t=5ms     Relay        rate-limit: 1/50 ok
                       dedupe: lastCmd null → pass
                       lastCmd='F', lastCmdAt=5
                                                   ── WS:F ──►

t=15ms    Firmware     onWsMessage("F")
                       handleCommand('F')
                       lastCommandMs = millis()    ◄── watchdog refreshed
                       applyMotion('F'):
                          currentMotion was 0 → state change
                          digitalWrite pins HIGH/LOW/HIGH/LOW
                          Serial: "[motion] FORWARD"
                          currentMotion='F', isMoving=true

t=300ms   Controller   heartbeat tick → rawSend('F')
                                                   ── WS:F ──►
t=305ms   Relay        dedupe: cmd==='F', Δt=300ms > 200ms → pass
                                                   ── WS:F ──►
t=315ms   Firmware     applyMotion('F'): currentMotion already 'F'
                       → no-op fast path, no pin writes, no log
                       (watchdog still refreshed by handleCommand)

t=600ms   ── same heartbeat cycle ──
t=900ms   ── same heartbeat cycle ──

t=1000ms  Controller   onPointerUp → stopHold():
                       clearInterval(heartbeatId)
                       rawSend('S')
                       lastSentCmd = null
                                                   ── WS:S ──►
t=1005ms  Relay        cmd === 'S' → dedupe bypassed (rule: STOP always forwarded)
                                                   ── WS:S ──►
t=1015ms  Firmware     handleCommand('S')
                       applyMotion('S'):
                          state change → pins LOW
                          Serial: "[motion] STOP"
                          isMoving = false  ◄── watchdog now disarmed
```

**Frames on the wire:** 5 total (1 initial F + 3 heartbeats + 1 release S) for a 1-second hold. Pre-optimization design would have produced ~30 frames.

---

## 6. Critical Design Decisions

### Why one ASCII byte instead of JSON?
- WS frame overhead is fixed (~2-6 bytes header). JSON payload `{"cmd":"F"}` is 11 bytes vs 1.
- ESP32 doesn't need to parse JSON in the hot path.
- JSON parsing kept only as a **fallback** for testing tools (curl, browser console).

### Why three independent dedupe layers (client / server / firmware)?
Defense in depth. Any one of them suffices in isolation, but:
- **Client** dedupe = lowest cost (drop before sending).
- **Server** dedupe = catches stale clients still running old JS bundles.
- **Firmware** state-check (`applyMotion` fast-path) = saves GPIO/serial work even if both upper layers misbehave.

### Why is STOP never deduped at any layer?
A duplicated STOP is harmless. A *dropped* STOP leaves the robot driving. The asymmetry is intentional — STOP is a strictly latency-critical safety frame.

### Why a watchdog at all, given explicit release frames?
Network can lose the release frame; the browser tab can close; the user can yank Wi-Fi. The watchdog is the last line of defense — it converts "lost signal" into "stop", which is always safe.

### Why 750 ms watchdog (not 500 ms or 1500 ms)?
- Heartbeat = 300 ms → 1 dropped heartbeat = 600 ms gap (must NOT trip the wdt).
- 2 dropped heartbeats = 900 ms gap (MUST trip the wdt).
- 750 ms is the midpoint: tolerant of one packet loss, intolerant of a dead link.

### Why is reconnection backoff capped (8 s controller / 30 s firmware)?
Avoid hammering the relay on widespread outages while still recovering quickly once it returns. The asymmetry (8 vs 30) reflects the fact that browser tabs are usually short-lived while the firmware runs 24/7.

### Why use server-side state changes to notify controllers (`type:"status"`)?
Controllers can connect at any time relative to the robot. Without the push notification, a controller wouldn't know the robot dropped offline until the next command bounced with `"robot offline"`. The pushed status enables a clear UI indicator before any command is attempted.

---

## File Map

| Layer      | File                                                   | Lines (core) |
|------------|--------------------------------------------------------|--------------|
| Controller | `react-vite/src/useRobotSocket.js`                     | ~200         |
| Relay      | `appsail-nodejs/index.js`                              | ~330         |
| Firmware   | `firmware/esp32_robot.ino`                             | ~430         |
| Deploy     | `catalyst.json` (slate + appsail targets)              | —            |

---

*Document covers logic only. For deployment URLs, env-var setup, and Catalyst CLI usage, see `README.md`.*
