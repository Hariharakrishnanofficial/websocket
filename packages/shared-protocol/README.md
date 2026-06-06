# @ws/shared-protocol

Single source of truth for WebSocket message envelopes, role names, and wire-format limits shared between the **PWA** (`react-vite`) and the **relay** (`appsail-nodejs`).

## Usage

```js
import { ROLE, MSG, LIMITS, isEnvelope } from '@ws/shared-protocol';

if (parsed.t === MSG.CMD) { /* … */ }
```

## Why a package?

- Prevents string-typo bugs ("`telmetry`" vs "`telemetry`")
- Allows the relay & client to evolve the protocol in lockstep
- Surfaces breaking changes via a single version bump
