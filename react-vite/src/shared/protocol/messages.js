/**
 * Canonical WebSocket envelope `type` values.
 * Mirror of `@ws/shared-protocol/messages` — every text frame on the relay
 * carries `{ type: <one of these>, ...payload }`.
 *
 * The envelope discriminator key is **`type`** (not `t`). Do not rename
 * without coordinating both PWA and AppSail relay sides.
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

/** Envelope discriminator field name. */
export const MSG_TYPE_KEY = 'type';

export const ALL_MSG_TYPES = Object.values(MSG);

/** Shallow validation that an object looks like an envelope. */
export function isEnvelope(obj) {
  return !!obj && typeof obj === 'object' && typeof obj[MSG_TYPE_KEY] === 'string';
}
