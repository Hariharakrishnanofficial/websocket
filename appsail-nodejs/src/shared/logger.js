/**
 * Tiny structured logger. Timestamp + level prefix; safe to use during boot.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function emit(level, args) {
  if (LEVELS[level] < CURRENT) return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${ts}] ${level.toUpperCase()}`, ...args);
}

export const logger = {
  debug: (...a) => emit('debug', a),
  info:  (...a) => emit('info',  a),
  warn:  (...a) => emit('warn',  a),
  error: (...a) => emit('error', a),
};
