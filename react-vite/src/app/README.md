# `app/` — Application Bootstrap

**Not reusable.** This layer wires everything together for *this specific application*.

Contents:
- `App.jsx` — root component + router shell
- `main.jsx` — React DOM render + service-worker bootstrap
- `providers/` — context providers (theme, error boundary, query client, etc.)
- `router/` — route table, lazy-loaded screens, guards

Allowed imports: `@features/*`, `@shared/*`, `@services/*`, `@config/*`.
