/**
 * WebSocket router.
 *
 * Protocol (preserved from legacy index.js so existing controllers, robots,
 * and the React client stay compatible):
 *
 *   - Upgrade paths: `/ws` and `/video` (alias). Both speak the same
 *     register-by-first-frame protocol — the path is purely cosmetic so
 *     ESP32-CAM URLs can read as `wss://.../video`.
 *   - First frame from any client MUST be a JSON envelope:
 *         { "type": "robot" | "controller" | "camera", "token"?: "..." }
 *     A binary first frame is a protocol error → close 4001.
 *     A non-JSON text first frame is a protocol error → close 4001.
 *     No frame within `registerTimeoutMs` → close 4000.
 *   - After registration, frames are dispatched by `ws.role` to the matching
 *     gateway's `handleText` / `handleBinary` callback.
 *
 * Origin gating: an allow-list is enforced for browser clients (those that
 * present an `Origin` header). Header-less clients (ESP32, curl, tests with
 * no origin) are permitted through — matches legacy behaviour.
 */

import { WebSocketServer } from 'ws';
import { URL } from 'url';

import { logger } from '../shared/logger.js';

const ALLOWED_PATHS = new Set(['/', '/ws', '/video']);

export function attachWsRouter({ httpServer, config, sessionRegistry, gateways }) {
  const snap0 = config.current();
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: snap0.websocket.maxTotalBytes,
  });

  // ---- upgrade gate -------------------------------------------------------
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      return rejectUpgrade(socket, 400, 'Bad Request');
    }

    if (!ALLOWED_PATHS.has(pathname)) {
      logger.warn(`ws upgrade rejected: unknown path "${pathname}"`);
      return rejectUpgrade(socket, 404, 'Not Found');
    }

    if (!isOriginAllowed(req, config.current())) {
      logger.warn(`ws upgrade rejected: origin "${req.headers.origin}" not in allow-list`);
      return rejectUpgrade(socket, 403, 'Forbidden');
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      wss.emit('connection', ws, req);
    });
  });

  // ---- per-connection lifecycle ------------------------------------------
  wss.on('connection', (ws, req) => {
    ws.role    = null;
    ws.isAlive = true;
    const remoteIp = ws.remoteIp;
    logger.info(`new connection from ${remoteIp} (awaiting registration)`);

    const snap = config.current();
    const registerTimer = setTimeout(() => {
      if (!ws.role) {
        logger.info(`registration timeout for ${remoteIp} — closing`);
        try { ws.close(4000, 'registration timeout'); } catch { /* noop */ }
      }
    }, snap.websocket.registerTimeoutMs);

    ws.on('message', (raw, isBinary) => {
      // ---- pre-registration: must be a JSON text frame ------------------
      if (!ws.role) {
        if (isBinary) {
          try { ws.close(4001, 'binary before registration'); } catch { /* noop */ }
          return;
        }
        let msg;
        try { msg = JSON.parse(raw.toString()); }
        catch {
          try { ws.close(4001, 'invalid registration'); } catch { /* noop */ }
          return;
        }
        const gw = gateways[msg.type];
        if (!gw) {
          try { ws.close(4001, 'unknown role'); } catch { /* noop */ }
          return;
        }
        const entry = gw.register(ws, msg, { remoteIp });
        if (!entry) return;            // gateway already closed the socket
        clearTimeout(registerTimer);
        return;
      }

      // ---- post-registration: per-role payload guard --------------------
      // The transport-level `maxPayload` (= maxTotalBytes) is sized to the
      // largest expected video frame so cameras can stream. But controllers
      // and robots only send small JSON commands — anything bigger than
      // `maxCmdBytes` is almost certainly abuse and must be rejected with
      // a 1009 (message too big) close, matching the legacy contract.
      const snapNow = config.current();
      const size    = raw.length;
      const overCmd = !isBinary && size > snapNow.websocket.maxCmdBytes;
      const overVid =  isBinary && size > snapNow.websocket.maxVideoFrameBytes;
      if (overCmd || overVid) {
        const cap = overCmd ? snapNow.websocket.maxCmdBytes
                            : snapNow.websocket.maxVideoFrameBytes;
        logger.warn(
          `payload too large from ${ws.role} (${size} > ${cap} bytes) — closing 1009`,
        );
        try { ws.close(1009, 'message too big'); } catch { /* noop */ }
        return;
      }

      // ---- post-registration: dispatch by role --------------------------
      const gw = gateways[ws.role];
      if (!gw) return;
      if (isBinary) gw.handleBinary?.(ws, raw);
      else          gw.handleText?.(ws, raw.toString());
    });

    ws.on('pong',  () => { ws.isAlive = true; });
    ws.on('error', (err) => logger.warn(`socket error: ${err.message}`));

    ws.on('close', (code, reasonBuf) => {
      clearTimeout(registerTimer);
      const reason = reasonBuf?.toString?.() ?? '';
      const gw = gateways[ws.role];
      if (gw) gw.handleClose?.(ws, { code, reason });
      else    logger.info(`unregistered client disconnected (${code})`);
    });
  });

  return wss;
}

function isOriginAllowed(req, snapshot) {
  const allowed = snapshot.websocket.allowedOrigins;
  if (!allowed || allowed.length === 0) return true;   // open mode
  const origin = req.headers.origin;
  if (!origin) return true;                            // non-browser clients
  return allowed.includes(origin);
}

function rejectUpgrade(socket, code, reason) {
  try {
    socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
  } catch { /* noop */ }
  socket.destroy();
}
