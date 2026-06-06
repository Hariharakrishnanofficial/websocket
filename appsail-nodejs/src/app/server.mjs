/**
 * AppSail server composition.
 *
 * Boot sequence:
 *   1. Build the NoSQL client (auto: emulator unless Catalyst SDK + project
 *      id are present). Non-fatal on failure — we fall through to layers 1+2.
 *   2. Build the config controller (defaults → env → optional NoSQL overlay).
 *      `current()` always returns a snapshot, even when NoSQL is unavailable.
 *   3. Build the session registry (in-memory, single-process for Phase 1).
 *   4. Build Express + JSON parser + request-id + health routes.
 *   5. Create HTTP server, attach the WS router (single `/ws`, alias `/video`).
 *   6. Start the WS ping/pong heartbeat loop (replaces TCP-level keepalives).
 *   7. Wire graceful shutdown on SIGTERM / SIGINT.
 *
 * Returns `{ app, httpServer, wss, sessionRegistry, config, shutdown }`
 * so tests can drive the composition without spawning a child process.
 */

import express from 'express';
import { createServer } from 'http';
import { randomUUID } from 'crypto';

import { createConfig } from '../config/index.mjs';
import { createNoSqlClient } from '../infra/catalyst/nosqlClient.mjs';
import { createConfigRepository } from '../infra/catalyst/configRepository.mjs';
import { createSessionRegistry } from '../modules/session/sessionRegistry.mjs';
import { createRobotGateway } from '../modules/robot/robotGateway.mjs';
import { createControllerGateway } from '../modules/controller/controllerGateway.mjs';
import { createCameraGateway, createVideoStats } from '../modules/camera/cameraGateway.mjs';
import { createHealthRouter } from '../modules/health/healthRoutes.mjs';
import { attachWsRouter } from './wsRouter.mjs';
import { safeSend } from '../shared/ws-utils.js';
import { logger } from '../shared/logger.js';

const HEARTBEAT_SWEEP_MS = 30_000;   // WS ping cadence
const VIDEO_STATS_TICK_MS = 1_000;   // /health fps/kbps refresh

export async function startServer({ listen = true } = {}) {
  // ---- 1. NoSQL (optional, non-fatal) ------------------------------------
  let nosqlClient = null;
  let configRepo  = null;
  try {
    nosqlClient = await createNoSqlClient({ mode: process.env.NOSQL_MODE || 'auto' });
    configRepo  = createConfigRepository({ nosqlClient });
  } catch (err) {
    logger.warn(`nosql unavailable, continuing with env+defaults — ${err.message}`);
  }

  // ---- 2. Config (always succeeds) ---------------------------------------
  const config = await createConfig({ repository: configRepo });
  // Hot-reload only if we actually have a repository.
  if (configRepo) config.startHotReload();

  const snap = config.summary();
  logger.info(`config: profile=${snap.profile} revision=${snap.revisionId} source=${snap.source} port=${snap.port}`);

  // ---- 3. Session registry -----------------------------------------------
  const sessionRegistry = createSessionRegistry();

  // ---- 4. Video stats + status broadcaster -------------------------------
  const videoStats = createVideoStats();

  function broadcastStatus() {
    const envelope = JSON.stringify({
      type:            'status',
      robotConnected:  !!sessionRegistry.robot,
      cameraConnected: !!sessionRegistry.camera,
    });
    sessionRegistry.eachController((c) => safeSend(c.ws, envelope));
  }

  // ---- 5. Gateways --------------------------------------------------------
  const robotGw      = createRobotGateway({ sessionRegistry, config, broadcastStatus });
  const controllerGw = createControllerGateway({ sessionRegistry, config });
  const cameraGw     = createCameraGateway({ sessionRegistry, config, broadcastStatus, videoStats });

  // ---- 6. Express ---------------------------------------------------------
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use((req, _res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    next();
  });

  // Health router returns a mount function — invoke it with the app
  createHealthRouter({ sessionRegistry, config, videoStats })(app);

  // 404 + error fallbacks (Phase 2 routes will register before these)
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path, requestId: req.id });
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    logger.error(`request error: ${err.message}`);
    res.status(err.statusCode || 500).json({
      error: err.code || 'internal_error',
      requestId: req.id,
    });
  });

  // ---- 7. HTTP + WS -------------------------------------------------------
  const httpServer = createServer(app);
  const wss = attachWsRouter({
    httpServer,
    config,
    sessionRegistry,
    gateways: { robot: robotGw, controller: controllerGw, camera: cameraGw },
  });

  // ---- 8. WS ping/pong heartbeat -----------------------------------------
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { try { ws.terminate(); } catch { /* noop */ } continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* noop */ }
    }
  }, snap.heartbeatMs || HEARTBEAT_SWEEP_MS);
  heartbeatTimer.unref?.();

  // ---- 9. Per-second video-stats roll-up (cheap) -------------------------
  let lastFramesIn = 0, lastFramesOut = 0, lastBytesIn = 0;
  const videoTick = setInterval(() => {
    videoStats.fpsIn  = videoStats.framesIn  - lastFramesIn;
    videoStats.fpsOut = videoStats.framesOut - lastFramesOut;
    videoStats.kbpsIn = Math.round(((videoStats.bytesIn - lastBytesIn) * 8) / 1024);
    lastFramesIn  = videoStats.framesIn;
    lastFramesOut = videoStats.framesOut;
    lastBytesIn   = videoStats.bytesIn;
  }, VIDEO_STATS_TICK_MS);
  videoTick.unref?.();

  // ---- 10. Listen ---------------------------------------------------------
  if (listen) {
    await new Promise((resolve) => httpServer.listen(snap.port, resolve));
    logger.info(`server listening on :${snap.port}  (WS /ws, /video)`);
  }

  // ---- 11. Graceful shutdown ---------------------------------------------
  let shuttingDown = false;
  async function shutdown(signal = 'manual') {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`shutdown begin (${signal})`);
    clearInterval(heartbeatTimer);
    clearInterval(videoTick);
    config.stop();
    for (const client of wss.clients) {
      try { client.close(1001, 'server-shutdown'); } catch { /* noop */ }
    }
    await new Promise((resolve) => wss.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(() => resolve()));
    logger.info('shutdown complete');
  }

  process.once('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));
  process.once('SIGINT',  () => shutdown('SIGINT').then(()  => process.exit(0)));

  return { app, httpServer, wss, sessionRegistry, config, videoStats, shutdown };
}
