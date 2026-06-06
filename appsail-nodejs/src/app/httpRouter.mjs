/**
 * HTTP router mount point (Phase 2 entry).
 *
 * Phase 1 mounts only the health routes, and does so directly from
 * `server.mjs` via `createHealthRouter().mount(app)` to keep the boot path
 * obvious. This file is the planned home for Phase 2's REST surface:
 *
 *   /telemetry/*           — robot telemetry CRUD + recent windows
 *   /diagnostics/*         — error logs, alerts, audit log
 *   /sessions              — session list / detail / kill
 *   /connections           — live WS connections
 *   /config                — read effective config (sanitised)
 *   /controller/emergency-stop — broadcast STOP to all bound controllers
 *
 * Once those route factories land, switch `server.mjs` to call
 * `app.use(buildHttpRouter({...}))` and remove the direct health mount.
 */

import express from 'express';

// eslint-disable-next-line no-unused-vars
export function buildHttpRouter(_deps) {
  const router = express.Router();
  // Phase 2: mount route factories here.
  return router;
}
