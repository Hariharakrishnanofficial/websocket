# `modules/` — Per-role Domain Modules

Each subfolder owns one connection role. Layout per module:

```
modules/<role>/
├── handler.js     # ws.on('message') logic
├── register.js    # first-frame registration / auth
├── state.js       # in-memory state (single robot, controller Set, …)
└── index.js       # public barrel
```

Current modules: `controller/`, `robot/`, `camera/`, `health/`.

**Rules:** modules may import from `@shared/*`, `@config/*`, and
`@ws/shared-protocol`. They must NOT cross-import sibling modules — go through
`@shared/state` or pub/sub instead.
