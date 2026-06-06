/**
 * Wire-level limits. Mirror these in the relay's env defaults.
 */
export const LIMITS = Object.freeze({
  /** Max text-frame size for controller/robot envelopes. */
  MAX_TEXT_FRAME_BYTES:  4 * 1024,
  /** Max binary-frame size for camera JPEG payloads. */
  MAX_VIDEO_FRAME_BYTES: 96 * 1024,
  /** Per-controller command rate cap (msgs/sec). */
  CMD_RATE_PER_SEC:      50,
});
