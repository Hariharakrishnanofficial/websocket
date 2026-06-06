import { LIMITS } from '@ws/shared-protocol';

const num = (v, d) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; };
const csv = (v)    => (v || '').split(',').map(s => s.trim()).filter(Boolean);

export const ENV = Object.freeze({
  PORT:               num(process.env.X_ZOHO_CATALYST_LISTEN_PORT, 9000),
  ROBOT_TOKEN:        process.env.ROBOT_TOKEN      || '',
  CONTROLLER_TOKEN:   process.env.CONTROLLER_TOKEN || '',
  CAMERA_TOKEN:       process.env.CAMERA_TOKEN     || '',
  ALLOWED_ORIGINS:    new Set(csv(process.env.ALLOWED_ORIGINS)),
  MAX_VIDEO_FRAME_BYTES: num(process.env.MAX_VIDEO_FRAME_BYTES, LIMITS.MAX_VIDEO_FRAME_BYTES),
  MAX_CMD_PAYLOAD:    LIMITS.MAX_TEXT_FRAME_BYTES,
  CMD_RATE_LIMIT:     num(process.env.CMD_RATE_LIMIT,  LIMITS.CMD_RATE_PER_SEC),
  CMD_DEDUPE_MS:      num(process.env.CMD_DEDUPE_MS,   200),
  HEARTBEAT_MS:       num(process.env.HEARTBEAT_MS,    30_000),
  REGISTER_TIMEOUT_MS: num(process.env.REGISTER_TIMEOUT_MS, 5_000),
  NODE_ENV:           process.env.NODE_ENV || 'development',
});
