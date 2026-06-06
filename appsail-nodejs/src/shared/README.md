# `shared/` — Reusable Building Blocks

Used by two or more modules. No business logic specific to a role.

- `logger.js`        — timestamped console wrapper, log-level gating
- `errors.js`        — typed error classes (`UnauthorizedError`, `RateLimitError`, …)
- `rate-limiter.js`  — sliding-window per-client counter
- `ws-utils.js`      — `safeSend`, `broadcast`, `isOpen`
- `dedupe.js`        — duplicate-message suppressor

No imports from `@modules/*` or `@app/*`.
