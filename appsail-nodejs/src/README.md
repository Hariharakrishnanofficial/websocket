# `appsail-nodejs/src`

Enterprise layout for the WS relay. Currently the runtime entry is the legacy
`../index.js`. New work should land in this tree; the monolith will be carved
into these modules incrementally without breaking the AppSail deploy.

```
src/
├── app/        # bootstrap: Express + HTTP + WS upgrade routing
├── modules/    # per-role handlers (controller, robot, camera, health)
├── shared/    # reusable: logger, errors, rate-limiter, ws-utils
├── infra/      # Catalyst SDK, metrics, persistence adapters
└── config/     # env loading, safe defaults
```

See `/docs/ARCHITECTURE.md` for layering rules.
