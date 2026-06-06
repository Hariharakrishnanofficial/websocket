/**
 * Centralised env reader. Safe to call at module load.
 * Never reference `import.meta.env` directly elsewhere — go through here.
 */
const env = import.meta.env || {};

export const ENV = Object.freeze({
  RELAY_URL:     env.VITE_RELAY_URL     || 'wss://relay.example.com/ws',
  VIDEO_URL:     env.VITE_VIDEO_URL     || 'wss://relay.example.com/video',
  CONTROLLER_TOKEN: env.VITE_CONTROLLER_TOKEN || '',
  MODE:          env.MODE               || 'development',
  IS_PROD:       env.PROD === true,
});
