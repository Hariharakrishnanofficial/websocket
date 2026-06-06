# Robot WS Relay — Catalyst AppSail

Node.js WebSocket relay deployed on **Zoho Catalyst AppSail**.
Routes single-character motion commands from browser controllers to a registered ESP32 robot.

## Endpoints

| Path | Type | Purpose |
|---|---|---|
| `/` | HTTP GET | Service banner JSON |
| `/health` | HTTP GET | Liveness probe |
| `/ws` | WebSocket | Controller + robot connection endpoint |
| `/` | WebSocket | Also accepts WS upgrades (convenience) |

## Local run

```bash
cd appsail-nodejs
npm install
npm start                 # listens on $X_ZOHO_CATALYST_LISTEN_PORT or 9000
```

Smoke test:
```bash
curl http://localhost:9000/health
```

## Deploy to Catalyst

From the project root:

```bash
catalyst deploy --only appsail
```

After the first deploy, copy the public AppSail URL printed by the CLI
(e.g. `https://appsail-XXXXXXXXXX.development.catalystserverless.com`)
and set it as `VITE_WS_URL` in the Slate frontend (`react-vite/.env.production`).

The Slate controller should use the matching `wss://` URL (Catalyst terminates TLS at the edge):
```
VITE_WS_URL=wss://appsail-XXXXXXXXXX.development.catalystserverless.com/ws
```

## Stack

- Node.js ≥ 16 (AppSail `node16` stack)
- `express` for HTTP routes
- `ws` for WebSocket handling (shares the same HTTP listener)
- Single process, stateless apart from in-memory client sets
