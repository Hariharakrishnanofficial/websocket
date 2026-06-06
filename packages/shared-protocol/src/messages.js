/**
 * Canonical WebSocket envelope `type` values.
 * Every text frame on the relay carries `{ type: <one of these>, ...payload }`.
 *
 * NOTE: The envelope discriminator key is **`type`** (not `t`). This matches
 * the wire format used by both the AppSail relay (`appsail-nodejs/index.js`)
 * and the browser RobotClient. Do not rename without coordinating both sides.
 */
export const MSG = Object.freeze({
  // Server → client lifecycle
  WELCOME:   'welcome',
  STATUS:    'status',
  ERROR:     'error',
  PONG:      'pong',

  // Client → server
  HELLO:     'hello',
  PING:      'ping',
  CMD:       'cmd',          // controller → robot
  TELEMETRY: 'telemetry',    // robot → controller(s)
});

/** Envelope discriminator field name. Kept as a constant for refactor safety. */
export const MSG_TYPE_KEY = 'type';

export const ALL_MSG_TYPES = Object.values(MSG);

/** Shallow validation that an object looks like an envelope. */
export function isEnvelope(obj) {
  return !!obj && typeof obj === 'object' && typeof obj[MSG_TYPE_KEY] === 'string';
}
