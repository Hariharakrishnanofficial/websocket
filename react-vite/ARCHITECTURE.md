# Robot Controller PWA — Architecture

Production-grade Progressive Web App for the existing AppSail relay + ESP32
robot. Protocol contract (single ASCII byte, 300 ms heartbeat, 750 ms
watchdog, STOP-never-deduped) is preserved bit-for-bit — see
[`../CORE_LOGIC.md`](../CORE_LOGIC.md) for the contract this app upholds.

---

## 1. File tree

```
react-vite/
├── public/
│   ├── icons/               PWA icons (192/512/maskable + apple-touch)
│   ├── offline.html         Service-worker offline fallback
│   └── vite.svg
├── scripts/
│   └── make-icons.py        Regenerates placeholder icons
├── src/
│   ├── App.jsx              Router shell + lazy routes + bridge mount
│   ├── main.jsx             ReactDOM bootstrap + SW registration
│   ├── index.css            Tailwind layers + design tokens
│   │
│   ├── routes/              One file per screen
│   │   ├── ControllerScreen.jsx
│   │   ├── SettingsScreen.jsx
│   │   ├── TelemetryScreen.jsx
│   │   ├── DiagnosticsScreen.jsx
│   │   └── AboutScreen.jsx
│   │
│   ├── components/
│   │   ├── layout/          AppShell, TopStatusBar, BottomNav
│   │   ├── controller/      DirectionPad, PadButton, EmergencyStop, ActiveCommandBadge
│   │   ├── indicators/      ConnectionDot, LatencyPill, BatteryGauge, SignalBars
│   │   ├── telemetry/       StatCard, UptimeClock, ThroughputSparkline
│   │   ├── diagnostics/     LogStream, LogFilterBar, ExportLogsButton
│   │   └── ui/              Card, Button, Toggle, Slider, Select, Field
│   │
│   ├── stores/              Zustand state slices
│   │   ├── connectionStore.js
│   │   ├── controllerStore.js
│   │   ├── settingsStore.js   (persisted)
│   │   ├── telemetryStore.js
│   │   └── logStore.js        (RAF-batched ring buffer, cap 1000)
│   │
│   ├── hooks/
│   │   ├── useRobotSocket.js    Bridge: RobotClient → stores
│   │   ├── useHoldButton.js     Pointer capture + haptics
│   │   ├── useKeyboardControl.js  Arrow/WASD/space, repeat-filtered
│   │   ├── useLatencyProbe.js   Best-effort RTT (no protocol change)
│   │   ├── useWakeLock.js       Keeps screen on while driving (Android)
│   │   └── usePWAInstall.js     beforeinstallprompt capture
│   │
│   ├── services/
│   │   ├── protocol.js          Frozen constants from CORE_LOGIC.md
│   │   ├── RobotClient.js       Framework-agnostic WS singleton
│   │   ├── telemetryParser.js   JSON / k=v / freeform decoder
│   │   ├── feedback.js          Vibration + WebAudio click
│   │   └── storage.js           localStorage wrapper
│   │
│   └── pwa/
│       └── registerSW.js        Service-worker bootstrap
│
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js           Includes vite-plugin-pwa with WS denylist
├── index.html               PWA meta tags (manifest, iOS, theme-color)
└── package.json
```

---

## 2. Component hierarchy

```
<App>
 ├─ useRobotSocketBridge()        (singleton: RobotClient → stores)
 └─ <BrowserRouter>
     └─ <AppShell>
         ├─ <TopStatusBar>
         │    ├─ <ConnectionDot>      ← connectionStore
         │    ├─ <SignalBars>         ← telemetryStore.rssi
         │    ├─ <LatencyPill>        ← useLatencyProbe
         │    └─ <BatteryGauge>       ← telemetryStore.battery
         ├─ <Outlet>
         │    ├─ /            <ControllerScreen>
         │    │                 ├─ <ActiveCommandBadge>    ← controllerStore.activeCmd
         │    │                 ├─ <DirectionPad>
         │    │                 │     └─ <PadButton/>×5    ← useHoldButton(cmd)
         │    │                 └─ <EmergencyStop>          → robotClient.emergencyStop()
         │    ├─ /telemetry   <TelemetryScreen>           ← telemetryStore, connectionStore
         │    ├─ /diagnostics <DiagnosticsScreen>         ← logStore (filterable), exportable
         │    ├─ /settings    <SettingsScreen>            ← settingsStore (persisted)
         │    └─ /about       <AboutScreen>               ← usePWAInstall
         └─ <BottomNav>                                    (Framer Motion layoutId active pill)
```

---

## 3. State flow

```
                        ┌──────────────────────┐
        UI events ───►  │   RobotClient        │ ◄── WebSocket frames
        (hold/release)  │  (singleton, src/    │      (AppSail relay)
                        │   services/...)      │
                        └─────────┬────────────┘
                                  │ events
              ┌───────────────────┼────────────────────┐
              ▼                   ▼                    ▼
        status/                 tx/rx/                heartbeat/
        robotOnline             dedupe                error
              │                   │                    │
        ┌─────┴────┐    ┌─────────┴────────┐    ┌──────┴──────┐
        │connection│    │controllerStore   │    │  logStore   │
        │   Store  │    │telemetryStore    │    │ (RAF-batched│
        │          │    │                  │    │  ring buffer)│
        └────┬─────┘    └─────────┬────────┘    └──────┬──────┘
             │                    │                    │
             ▼                    ▼                    ▼
        TopStatusBar      DirectionPad +         DiagnosticsScreen
        TelemetryScreen   TelemetryScreen        (filterable, export)
        DiagnosticsScreen
```

`settingsStore` is the only persisted slice (localStorage, `pwa.settings.v1`).
URL changes there propagate one-way to `RobotClient.setServerURL()`, which
triggers a reconnect.

---

## 4. Data flow (1-second forward hold)

```
t=0     PadButton.onPointerDown
         → useHoldButton.startHold('F')
         → robotClient.startHold('F')
            ├─ rawSend('F')                         ── WS:F ──►
            ├─ activeCmd='F'  (emits 'activeCmd')
            │   └─ controllerStore.setActive('F')
            ├─ recordTx → telemetryStore.incTx + throughput bucket
            ├─ logStore.push({dir:'tx', msg:'F'})
            └─ setInterval(rawSend('F'), 300)
t=300   heartbeat tick → rawSend('F')               ── WS:F ──►
t=600   heartbeat tick → rawSend('F')               ── WS:F ──►
t=900   heartbeat tick → rawSend('F')               ── WS:F ──►
t=1000  onPointerUp → robotClient.stopHold()
         ├─ clearInterval
         ├─ activeCmd=null
         └─ rawSend('S')   (force-bypasses dedupe)  ── WS:S ──►

Total frames on the wire: 5  (1 initial + 3 heartbeats + 1 release)
```

This matches CORE_LOGIC.md §5 trace exactly. No protocol semantics changed.

---

## 5. Performance characteristics

| Aspect                  | Result                                                |
|-------------------------|-------------------------------------------------------|
| Initial JS (gzipped)    | ~105 KB (react 53 + motion 38 + index 11 + workbox 2) |
| CSS                     | 3.7 KB gz                                             |
| Route code-splitting    | Controller eager; Settings / Telemetry / Diagnostics / About lazy |
| Heartbeat timer         | Owned by RobotClient (outside React lifecycle)        |
| Log throughput          | RAF-batched (1000-entry ring buffer)                  |
| Controller rerenders    | Only when `activeCmd` changes (sliced selectors)      |
| Safety-critical events  | STOP on: release, blur, visibilitychange, pagehide, emergency button |

---

## 6. Development roadmap

1. **Real brand assets** — replace generated PNGs in `public/icons/` and
   `apple-touch-icon.png` with a brand kit (recommended sizes already match
   manifest declarations).
2. **Latency probe** — if firmware adds a `pong` or echoes a sequence id
   in telemetry, switch `useLatencyProbe.js` from "next-RX" heuristic to
   an exact RTT.
3. **Gamepad support** — wire the existing `controller.sensitivity` slider
   to a Gamepad API loop; the slider is already plumbed.
4. **Optional analytics** — `usePWAInstall.installed` + `displayMode` hooks
   into any analytics SDK without touching protocol code.
5. **i18n** — strings are already centralised in route files; ready to
   migrate to a lightweight i18n layer if needed.

---

## 7. Production deployment (Catalyst AppSail + Slate)

No change to deployment topology (`catalyst.json` and `slate-config.toml`
remain authoritative).

```bash
# From repo root
cd react-vite
npm install
npm run build           # produces ./dist with sw.js + manifest.webmanifest

# Deploy in two passes (or together)
catalyst deploy --only appsail     # WebSocket relay (unchanged)
catalyst deploy --only slate       # PWA bundle

# Or together
catalyst deploy
```

### Environment variables (Slate)

| Var                       | Where               | Effect                                                |
|---------------------------|---------------------|-------------------------------------------------------|
| `VITE_WS_URL`             | `.env.production`   | Hard-codes the WebSocket URL into the bundle          |
| `VITE_CONTROLLER_TOKEN`   | `.env.production`   | Token sent in the `{"type":"controller"}` registration |

If `VITE_WS_URL` is unset, the controller derives `wss://<page-host>/ws`
from the page URL (matches the original behaviour).

### Cache headers

`vite-plugin-pwa` emits hashed filenames for all assets, so Catalyst's
default cache strategy is fine. `sw.js` and `manifest.webmanifest` are
re-fetched per-revision by the SW lifecycle itself.

### PWA installability checklist

- [x] HTTPS (Catalyst Slate)
- [x] `manifest.webmanifest` reachable at root
- [x] 192×192 + 512×512 icons (+ maskable + apple-touch)
- [x] `display: standalone`, `start_url: /`, `scope: /`
- [x] Service worker active, offline shell at `/offline.html`
- [x] `theme-color` + `apple-mobile-web-app-*` meta tags
- [x] WebSocket explicitly bypassed by SW (`NetworkOnly` for `ws:`/`wss:`)

### Verification

1. Open the Slate URL on Android Chrome → menu → "Install app".
2. On iOS Safari → share sheet → "Add to Home Screen".
3. Launch from home screen, confirm `wss://` connection works in standalone
   mode (this is where many PWAs break — verified during build by isolating
   the WS protocol from any runtime caching).
4. Cut network mid-drive → emergency-stop path fires automatically
   (visibility/blur/pagehide handlers).
5. Restore network → exponential reconnect kicks in, capped at 8 s.

---

## 8. Replacing icons

```bash
# Regenerate placeholders (Python, no deps):
python3 scripts/make-icons.py

# To use real brand PNGs instead, drop into public/icons/ with these names:
#   icon-192.png            (any-purpose 192×192)
#   icon-512.png            (any-purpose 512×512)
#   icon-maskable-512.png   (maskable 512×512, 80% safe area inset)
#   apple-touch-icon.png    (180×180, opaque background)
```
