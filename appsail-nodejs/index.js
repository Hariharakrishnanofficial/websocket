/**
 * ============================================================================
 *  Robot Control AppSail Service — entry shim
 * ============================================================================
 *  The monolithic implementation lives in `index.legacy.js` and is preserved
 *  for reference during the Phase 1 → Phase 2 migration.
 *
 *  The active runtime now lives under `src/app/`:
 *    src/app/index.mjs   → boot
 *    src/app/server.mjs  → composition
 *    src/app/wsRouter    → WS upgrade routing
 *    src/app/httpRouter  → REST routes
 *    src/modules/*       → role gateways + health
 *    src/infra/catalyst  → NoSQL adapter + config repo
 *    src/config          → three-layer config loader
 *
 *  Catalyst AppSail still launches via `node index.js` per app-config.json.
 * ============================================================================
 */

import './src/app/index.mjs';
