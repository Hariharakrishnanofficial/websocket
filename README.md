# Websocket Robot Platform

Enterprise monorepo for a realtime ESP32 robot controller.

| Workspace                       | Role                                                                 |
|---------------------------------|----------------------------------------------------------------------|
| `react-vite/`                   | PWA controller UI (React + Vite + Zustand + Tailwind)                |
| `appsail-nodejs/`               | WebSocket relay deployed on Zoho Catalyst AppSail (Node.js + `ws`)   |
| `packages/shared-protocol/`     | Wire-format contracts (roles, message types, limits)                 |
| `firmware/`                     | ESP32 Arduino sketches (robot + AI-Thinker camera)                   |

## Quick start

```bash
npm install                   # installs all workspaces
npm run dev:relay             # boots WS relay on :9000
npm run dev:web               # boots PWA on :4800
npm run test:relay            # runs 17 relay tests
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for layering rules and data flow.
