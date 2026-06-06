/**
 * AppSail server composition.
 *
 * Boot sequence:
 *   1. Load env + defaults (synchronous, never fails).
 *   2. Try to load NoSQL-backed config (hot-reloads every 30s). Failure is
 *      logged but non-fatal — the server boots on safe defaults.
 *   3. Build Express app with logging + JSON parsing + HTTP router.
 *   4. Create HTTP server, attach WS router.
 *   5. Start session-registry heartbeat sweeper.
 *   6. Wire graceful shutdown on SIGTERM / SIGINT.
 *
 * Returns the resolved `{ httpServer, wss, shutdown }` so tests can drive it.
 */

import express from 'express';
import { createServer } from 'http';
import { randomUUID } from 'crypto';

import { loadConfig } from '../config/index.mjs';
import { createNosqlClient } from '../infra/catalyst/nosqlClient.mjs';
import { createConfigRepository } from '../infra/catalyst/configRepository.mjs';
import { createSessionRegistry } from '../modules/session/sessionRegistry.mjs';
import { buildHttpRouter } from './httpRouter.mjs';
import { attachWsRouter } from './wsRouter.mjs';
import { logger } from '../shared/logger.js';

const HEARTBEAT_SWEEP_MS = 5_000;

export async function startServer() {
  // ---- 1. Config ----------------------------------------------------------
  const config = await loadConfig();
  logger.info(
    {
      env: config.env,
      port: config.port,
      hasNosql: config.nosql.enabled,
      configSource: config.source,
    },
    'server.config.loaded',
  );

  // ---- 2. Infrastructure --------------------------------------------------
  const nosql = createNosqlClient(config);
  const configRepo = createConfigRepository({ nosql, config });

  // Start hot-reload poller if NoSQL is reachable (non-fatal if not)
  configRepo.startPolling?.().catch((err) => {
    logger.warn({ err: err.message }, 'config.repo.poll_start_failed');
  });

  // ---- 3. Session registry ------------------------------------------------
  const sessionRegistry = createSessionRegistry({ config });

  // ---- 4. Express + HTTP --------------------------------------------------
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: config.http?.bodyLimit || '64kb' }));

  // Request-id middleware (lightweight — full logging middleware lands in Phase 2)
  app.use((req, _res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    next();
  });

  app.use(buildHttpRouter({ config, sessionRegistry, configRepo }));

  const httpServer = createServer(app);

  // ---- 5. WebSocket -------------------------------------------------------
  const wss = attachWsRouter({ httpServer, config, sessionRegistry });

  // ---- 6. Heartbeat sweeper ----------------------------------------------
  const sweepTimer = setInterval(() => {
    try {
      sessionRegistry.sweepStale();
    } catch (err) {
      logger.error({ err: err.message }, 'session.sweep.failed');
    }
  }, HEARTBEAT_SWEEP_MS);
  sweepTimer.unref?.();

  // ---- 7. Listen ----------------------------------------------------------
  await new Promise((resolve) => httpServer.listen(config.port, resolve));
  logger.info({ port: config.port }, 'server.listening');

  // ---- 8. Graceful shutdown ----------------------------------------------
  let shuttingDown = false;
  const shutdown = async (signal = 'manual') => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'server.shutdown.begin');

    clearInterval(sweepTimer);
    configRepo.stopPolling?.();

    // Close WS connections with a clean code
    for (const client of wss.clients) {
      try { client.close(1001, 'server-shutdown'); } catch { /* noop */ }
    }
    await new Promise((resolve) => wss.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(() => resolve()));

    logger.info('server.shutdown.complete');
  };

  process.once('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));
  process.once('SIGINT', () => shutdown('SIGINT').then(() => process.exit(0)));

  return { app, httpServer, wss, sessionRegistry, configRepo, config, shutdown };
}
