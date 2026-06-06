# `config/` — Environment & Runtime Configuration

Single source of truth for env-derived constants. No business logic.

- `env.js` — reads `import.meta.env` + safe defaults
- `endpoints.js` — relay WS URL, REST base URL
- `featureFlags.js`

**Rules:**
- May NOT import from any other layer.
- Must be safe to call during module load (no async).
