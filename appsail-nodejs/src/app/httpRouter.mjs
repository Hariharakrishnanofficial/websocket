/**
 * HTTP router composition.
 *
 * Phase 1: only health + root routes are mounted. Phase 2 will add
 * /telemetry, /diagnostics, /sessions, /connections, /config, and
 * /controller/emergency-stop here.
 *
 * Every route module exports a `Router` factory that receives shared
 * dependencies, keeping wiring explicit and testable.
 */

import express from 'express';
import { buildHealthRoutes } from '../modules/health/healthRoutes.mjs';

export function buildHttpRouter({ config, sessionRegistry, configRepo }) {
  const router = express.Router();

  router.use(buildHealthRoutes({ config, sessionRegistry, configRepo }));

  // Phase 2 mount points (placeholders documented, not implemented):
  //   router.use('/telemetry',   buildTelemetryRoutes({ ... }));
  //   router.use('/diagnostics', buildDiagnosticsRoutes({ ... }));
  //   router.use('/sessions',    buildSessionRoutes({ ... }));
  //   router.use('/connections', buildConnectionRoutes({ ... }));
  //   router.use('/config',      buildConfigRoutes({ ... }));
  //   router.use('/controller',  buildControllerRoutes({ ... }));

  // 404 fallback — JSON-shaped so clients can parse uniformly
  router.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      path: req.path,
      requestId: req.id,
    });
  });

  // Error fallback — last-resort, never leaks stack traces
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    res.status(err.statusCode || 500).json({
      error: err.code || 'internal_error',
      message: err.expose ? err.message : 'request failed',
      requestId: req.id,
    });
  });

  return router;
}
