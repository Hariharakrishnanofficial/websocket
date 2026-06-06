# `features/` — Vertical Domain Slices

Each subfolder is a **self-contained business capability**. Anything used by only ONE feature lives here.

Layout per feature:
```
features/<name>/
├── components/   # feature-specific UI
├── hooks/        # feature-specific hooks
├── store.js      # zustand slice (if needed)
├── api.js        # feature-scoped service calls
├── index.js      # public barrel (what other layers may import)
└── README.md
```

**Rules:**
- Features **MUST NOT** import from sibling features. Promote to `@shared/*` instead.
- Only the feature's `index.js` is part of the public API.
- Tests colocated as `*.test.js`.

Current features: `controller`, `telemetry`, `diagnostics`, `video`, `settings`.
