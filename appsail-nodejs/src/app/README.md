# `app/` — Server Bootstrap

**Not reusable.** Composes everything for *this* process.

- `server.js`     — creates `http.Server` + `WebSocketServer`, mounts routes
- `routes.js`     — HTTP routes (`/`, `/health`)
- `upgrade.js`    — WS upgrade gating (path + origin checks)
- `index.js`      — entry point; reads config, starts listener

Allowed imports: `@modules/*`, `@shared/*`, `@infra/*`, `@config/*`.
