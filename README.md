# Internet Robot Control System — Deployed on Zoho Catalyst

Browser **Slate (React+Vite) Controller** ↔ **Catalyst AppSail Node.js Relay** ↔ **ESP32 Robot**

```
┌──────────────────────┐  wss://  ┌────────────────────────┐  wss://  ┌──────────────┐
│  Slate (react-vite)  │ ───────▶ │  AppSail (Node + ws)   │ ───────▶ │  ESP32 Robot │
│  src/App.jsx         │ ◀─────── │  appsail-nodejs/       │ ◀─────── │  esp32_robot │
└──────────────────────┘          └────────────────────────┘          └──────────────┘
```

Single-character protocol for minimum latency:
`F` Forward · `B` Backward · `L` Left · `R` Right · `S` Stop

---

## Repository layout

```
Websocket/
├── catalyst.json                ← registers Slate + AppSail with Catalyst CLI
├── .catalystrc                  ← Catalyst project link (PWA, IN DC)
│
├── appsail-nodejs/              ← 🟢 production backend (AppSail)
│   ├── app-config.json          ←     node16, mem 256 MB, cmd "node index.js"
│   ├── package.json             ←     express + ws
│   └── index.js                 ←     HTTP + WebSocket relay (ESM)
│
├── react-vite/                  ← 🟢 production frontend (Slate)
│   ├── .catalyst/slate-config.toml
│   ├── .env.development         ←     VITE_WS_URL=ws://localhost:9000/ws
│   ├── .env.production.example  ←     copy & fill with AppSail wss:// URL
│   └── src/
│       ├── App.jsx              ←     Robot Controller UI
│       ├── App.css
│       ├── useRobotSocket.js    ←     reusable WebSocket hook
│       ├── index.css
│       └── main.jsx
│
├── firmware/esp32_robot.ino     ← Catalyst-ready WSS firmware
│
└── (legacy)                     ← kept for reference, not deployed
    ├── server/server.js
    └── controller/index.html
```

---

## 1. Run locally (before deploying)

### Backend
```bash
cd appsail-nodejs
npm install
npm start                 # listens on $X_ZOHO_CATALYST_LISTEN_PORT or 9000
curl http://localhost:9000/health
```

### Frontend
```bash
cd react-vite
npm install
npm run dev               # http://localhost:5173
```

`react-vite/.env.development` already points the controller at
`ws://localhost:9000/ws`, so the dev server connects to your local AppSail
backend.

### Smoke test (no ESP32)
Fake a robot from a terminal:
```bash
node -e '
const W = require("ws");
const c = new W("ws://localhost:9000/ws");
c.on("open",   () => c.send(JSON.stringify({type:"robot"})));
c.on("message", m => console.log("robot got:", m.toString()));
'
```
Now open `http://localhost:5173`, press a button, and observe the command
arriving in all three places (browser log, backend stdout, fake-robot console).

---

## 2. Deploy to Catalyst

The repo is already linked to project **PWA** (`30690000000163001`, IN DC)
via `.catalystrc`, and `catalyst.json` registers both components.

```bash
# Make sure you're logged in
catalyst login

# Deploy backend first so we can grab its public URL
catalyst deploy --only appsail
```

After deploy, Catalyst will print an AppSail URL, e.g.:
```
https://appsail-XXXXXXXXXX.development.catalystserverless.com
```

### Wire the frontend to the deployed backend
```bash
cp react-vite/.env.production.example react-vite/.env.production
# edit react-vite/.env.production:
# VITE_WS_URL=wss://appsail-XXXXXXXXXX.development.catalystserverless.com/ws
```

### Deploy the frontend
```bash
catalyst deploy --only client
# or simply:  catalyst deploy
```

You now have:
- **Frontend (Slate)**: `https://<project>.<dc>.catalystserverless.com/`
- **Backend (AppSail)**: `https://appsail-XXXX.../`
- WebSocket path: `wss://appsail-XXXX.../ws`

---

## 3. Flash the ESP32

### Required libraries
- **ArduinoWebsockets** by *Gil Maimon* (Library Manager, ≥ 0.5.3 for WSS)
- ESP32 board package ("esp32 by Espressif Systems")

### Configure
Open `firmware/esp32_robot.ino` and set:
```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* WS_SERVER_URL = "wss://appsail-XXXXXXXXXX.development.catalystserverless.com/ws";
const bool  USE_INSECURE_TLS = true;   // quickest path; pin CA for production
```

### Build & upload
1. Tools → Board → **ESP32 Dev Module**
2. Select correct Serial Port
3. **Upload**
4. Open Serial Monitor @ **115200 baud**

Expected output:
```
[wifi] connected, IP=192.168.1.42
[ws]   connecting -> wss://appsail-...
[ws]   connected
[motion] FORWARD          ← when you press the button in the browser
```

### Wiring (placeholder GPIOs)
| Signal           | GPIO |
| ---------------- | ---- |
| Left motor FWD   | 25 |
| Left motor REV   | 26 |
| Right motor FWD  | 32 |
| Right motor REV  | 33 |
| Status LED       | 2  |

Replace the bodies of `moveForward / moveBackward / turnLeft / turnRight /
stopRobot` to match your motor driver (DRV8833, L298N, PWM channels, etc).

---

## Safety features

- **Watchdog** – ESP32 calls `stopRobot()` if no command arrives within **500 ms**.
- **On disconnect** – firmware immediately stops the motors.
- **On server shutdown** – clients receive close-frame `1001`.
- **Replace-on-reconnect** – if a new robot registers, the previous robot
  is closed cleanly with code `4002`.

---

## Architecture notes

| Concern | Decision |
|---|---|
| Port binding | `process.env.X_ZOHO_CATALYST_LISTEN_PORT` (AppSail requirement) |
| TLS | Terminated at Catalyst edge → backend speaks plain HTTP/WS internally |
| HTTP + WS same listener | Yes — `http.createServer` shared with `WebSocketServer({ noServer: true })` |
| Frontend WS URL | Build-time `VITE_WS_URL` → runtime `?server=` override → auto-derive fallback |
| Cross-origin | Slate + AppSail live on different subdomains; WebSocket has no CORS so it just works |
| Latency optimisation | Single-byte payloads, `WiFi.setSleep(false)` on ESP32, no app-level acks |

---

## License
MIT
