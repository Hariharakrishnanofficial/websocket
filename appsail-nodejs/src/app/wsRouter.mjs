/**
 * WebSocket router.
 *
 * Owns the single `WebSocketServer` (noServer mode) and routes raw HTTP
 * upgrades to per-role handlers based on URL path:
 *
 *   /ws/robot       → robotGateway
 *   /ws/controller  → controllerGateway
 *   /ws/camera      → cameraGateway
 *
 * Path gating + origin checks happen here so handlers stay focused on
 * protocol logic. Each handler receives the live `WebSocket` plus the
 * shared `sessionRegistry` and `config`.
 */

import { WebSocketServer } from 'ws';
import { URL } from 'url';

import { attachRobotGateway } from '../modules/robot/robotGateway.mjs';
import { attachControllerGateway } from '../modules/controller/controllerGateway.mjs';
import { attachCameraGateway } from '../modules/camera/cameraGateway.mjs';
import { logger } from '../shared/logger.js';

const ROLE_BY_PATH = {
  '/ws/robot': 'robot',
  '/ws/controller': 'controller',
  '/ws/camera': 'camera',
};

export function attachWsRouter({ httpServer, config, sessionRegistry }) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return rejectUpgrade(socket, 400, 'Bad Request');
    }

    const role = ROLE_BY_PATH[pathname];
    if (!role) {
      logger.warn({ url: req.url }, 'ws.upgrade.unknown_path');
      return rejectUpgrade(socket, 404, 'Not Found');
    }

    if (!isOriginAllowed(req, config)) {
      logger.warn({ origin: req.headers.origin, role }, 'ws.upgrade.origin_blocked');
      return rejectUpgrade(socket, 403, 'Forbidden');
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.role = role;
      ws.remoteIp = req.socket.remoteAddress;
      wss.emit('connection', ws, req, role);
    });
  });

  // Single connection handler dispatches by role.
  wss.on('connection', (ws, req, role) => {
    switch (role) {
      case 'robot':
        attachRobotGateway({ ws, req, config, sessionRegistry });
        break;
      case 'controller':
        attachControllerGateway({ ws, req, config, sessionRegistry });
        break;
      case 'camera':
        attachCameraGateway({ ws, req, config, sessionRegistry });
        break;
      default:
        // Unreachable — guarded by ROLE_BY_PATH above.
        ws.close(1011, 'unknown-role');
    }
  });

  return wss;
}

function isOriginAllowed(req, config) {
  const allowed = config.ws?.allowedOrigins;
  if (!allowed || allowed.length === 0 || allowed.includes('*')) return true;
  const origin = req.headers.origin;
  if (!origin) return config.ws?.allowMissingOrigin !== false;
  return allowed.includes(origin);
}

function rejectUpgrade(socket, code, reason) {
  try {
    socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
  } catch { /* noop */ }
  socket.destroy();
}
