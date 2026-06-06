/**
 * AppSail entry point.
 *
 * Boots the server. On unhandled startup failure, logs and exits non-zero
 * so Catalyst's supervisor restarts the instance.
 */

import { startServer } from './server.mjs';
import { logger } from '../shared/logger.js';

startServer().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'server.startup.failed');
  process.exit(1);
});
