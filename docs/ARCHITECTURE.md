# Architecture

```
Websocket/
├── react-vite/          # PWA (browser controller UI)
├── appsail-nodejs/      # WebSocket relay (Catalyst AppSail)
├── packages/
│   └── shared-protocol/ # Wire contracts shared by both apps
├── firmware/            # ESP32 sketches (robot + camera)
└── docs/                # ADRs, deployment guides
```

## Data flow

```
ESP32-CAM ── wss://relay/video ──┐
                                 ├─► AppSail relay ─► wss://relay/ws ── PWA (controllers)
ESP32 robot ─ wss://relay/ws ────┘                                       │
                              ◄── cmd envelopes ────────────────────────┘
```

## Layering rules

### `react-vite/src`
| Layer       | May import from                          | Purpose                          |
|-------------|------------------------------------------|----------------------------------|
| `app/`      | features, shared, services, config       | Bootstrap, routing, providers    |
| `features/` | shared, services, config                 | Vertical domain slices           |
| `shared/`   | shared (itself), config                  | Reusable UI kit + utilities      |
| `services/` | shared, config, `@ws/shared-protocol`    | Transport, storage, parsers      |
| `config/`   | —                                        | Env constants                    |

Features **must not** import from sibling features.

### `appsail-nodejs/src`
| Layer       | May import from                          | Purpose                          |
|-------------|------------------------------------------|----------------------------------|
| `app/`      | modules, shared, config                  | Express + WS server bootstrap    |
| `modules/`  | shared, config, `@ws/shared-protocol`    | Per-role handlers (ctrl/robot/cam)|
| `shared/`   | shared (itself), config                  | Logger, errors, rate-limiter, ws-utils |
| `infra/`    | shared, config                           | Catalyst SDK, metrics adapters   |
| `config/`   | —                                        | Env loading                      |
