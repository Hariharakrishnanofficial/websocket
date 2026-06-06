import { WebSocket } from 'ws';
import { logger } from './logger.js';

export function isOpen(ws) {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

export function safeSend(ws, payload, opts) {
  if (!isOpen(ws)) return false;
  try { ws.send(payload, opts); return true; }
  catch (err) { logger.warn('send error:', err.message); return false; }
}

export function broadcast(clients, payload) {
  let n = 0;
  for (const c of clients) if (safeSend(c, payload)) n += 1;
  return n;
}
