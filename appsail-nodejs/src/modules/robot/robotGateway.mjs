/**
 * Robot WebSocket gateway.
 *
 * Wraps the per-connection state machine for a registered ROBOT:
 *   - validates token
 *   - replaces a prior robot socket if one exists
 *   - relays incoming text frames (telemetry) to all controllers
 *   - notifies controllers on connect / disconnect
 *
 * No global state lives here — the caller injects `sessionRegistry`,
 * `config`, and a `broadcastStatus()` hook.
 */

import { logger } from '../../shared/logger.js';
import { safeSend } from '../../shared/ws-utils.js';

export function createRobotGateway({ sessionRegistry, config, broadcastStatus, onTelemetry }) {

  /**
   * Handle the robot registration JSON frame.
   * Returns the entry on success, throws AppError-shaped on failure.
   */
  function register(ws, registration, { remoteIp }) {
    const expected = config.current().auth.robotToken;
    if (expected && registration.token !== expected) {
      logger.warn(`ROBOT rejected (${remoteIp}): bad token`);
      try { ws.close(4003, 'unauthorized'); } catch { /* noop */ }
      return null;
    }
    const { entry, previous } = sessionRegistry.setRobot(ws, { remoteIp });
    if (previous?.ws && previous.ws !== ws) {
      logger.info('replacing previous robot connection');
      try { previous.ws.close(4002, 'replaced'); } catch { /* noop */ }
    }
    ws.role  = 'robot';
    ws.sessionId = entry.id;
    logger.info(`ROBOT registered (${remoteIp}) id=${entry.id}`);
    safeSend(ws, JSON.stringify({ type: 'welcome', role: 'robot' }));
    broadcastStatus();
    return entry;
  }

  /**
   * Handle a post-registration text frame from the robot.
   * Robots send telemetry as plain text; we relay verbatim to controllers
   * inside a typed envelope.
   */
  function handleText(ws, text) {
    if (sessionRegistry.robot?.ws !== ws) return;
    sessionRegistry.touch(sessionRegistry.robot);
    logger.debug(`ROBOT->ctrl: ${text}`);
    const envelope = JSON.stringify({ type: 'telemetry', data: text });
    sessionRegistry.eachController((c) => safeSend(c.ws, envelope));
    onTelemetry?.(text);
  }

  /**
   * Cleanup on socket close.
   */
  function handleClose(ws, { code, reason }) {
    const cleared = sessionRegistry.clearRobot(ws);
    if (cleared) {
      logger.info(`ROBOT disconnected (${code} ${reason}) id=${cleared.id}`);
      broadcastStatus();
    }
  }

  return { register, handleText, handleClose };
}
