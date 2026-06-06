# `services/` — Transport & Integration Layer

Side-effectful, framework-agnostic clients. **Reusable across features.**

- `RobotClient.js` — WebSocket transport (controllers + video frames)
- `protocol.js`    — local envelope builders/parsers (use `@ws/shared-protocol` for constants)
- `storage.js`     — localStorage adapter
- `feedback.js`    — haptics + audio cues
- `telemetryParser.js` — robot telemetry decoder

**Rules:**
- No React/JSX imports here. Services are headless.
- All hard-coded strings (`'cmd'`, `'welcome'`, …) must come from `@ws/shared-protocol`.
