import { ENV } from './env.js';

export const ENDPOINTS = Object.freeze({
  ws:    ENV.RELAY_URL,
  video: ENV.VIDEO_URL,
});
