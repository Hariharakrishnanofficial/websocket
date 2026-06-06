# `shared/` — Reusable Building Blocks

Code used by **two or more** features (or by `app/`). If only one feature uses it, it does not belong here.

```
shared/
├── ui/         # design-system primitives (Button, Card, Field, …)
├── layout/     # AppShell, BottomNav, TopStatusBar
├── indicators/ # ConnectionDot, BatteryGauge, LatencyPill, SignalBars
├── hooks/      # generic hooks (useHoldButton, useKeyboardControl, useWakeLock, usePWAInstall)
├── lib/        # framework-agnostic helpers (date, math, format)
├── stores/     # cross-feature zustand slices (connection, settings, log)
└── constants/
```

**Rules:**
- No imports from `@features/*` or `@app/*` (would create cycles).
- Every primitive must be documented + storybook-friendly (props typed via JSDoc).
