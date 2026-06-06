/**
 * Controller WebSocket gateway.
 *
 * Implements the command-processing pipeline for browser controllers:
 *
 *   text frame → parse → validate set → rate-limit → dedupe → route to robot
 *
 * Per-controller mutable state (rate window + dedupe memory) lives on the
 * `ws` object — same as the legacy index.js — so we don't have to allocate
 * extra Maps. The behaviour is verified end-to-end by test/relay.test.mjs
 * and test/phase1.test.mjs.
 */

import { logger } from '../../shared/logger.js';
import { safeSend, isOpen } from '../../shared/ws-utils.js';

const VALID_COMMANDS = new Set(['F', 'B', 'L', 'R', 'S']);
const STOP_CMD       = 'S';

export function createControllerGateway({ sessionRegistry, config }) {

  function register(ws, registration, { remoteIp }) {
    const expected = config.current().auth.controllerToken;
    if (expected && registration.token !== expected) {
      logger.warn(`CONTROLLER rejected (${remoteIp}): bad token`);
      try { ws.close(4003, 'unauthorized'); } catch { /* noop */ }
      return null;
    }

    const entry = sessionRegistry.addController(ws, { remoteIp });
    ws.role          = 'controller';
    ws.sessionId     = entry.id;
    ws.cmdWindowStart = Date.now();
    ws.cmdCount      = 0;
    ws.lastCmd       = null;
    ws.lastCmdAt     = 0;
    ws.dedupedCount  = 0;

    logger.info(`CONTROLLER registered (${remoteIp}) id=${entry.id} total=${sessionRegistry.controllerCount}`);
    safeSend(ws, JSON.stringify({
      type:            'welcome',
      role:            'controller',
      robotConnected:  !!sessionRegistry.robot,
      cameraConnected: !!sessionRegistry.camera,
    }));
    return entry;
  }

  /**
   * Process a controller text frame. The frame may be a raw single-character
   * command or a JSON envelope `{cmd:"F"}`. Returns an outcome enum useful
   * for tests / metrics:
   *   'forwarded' | 'invalid' | 'rate-limited' | 'deduped' | 'robot-offline'
   */
  function handleText(ws, text) {
    const snap = config.current();
    const { cmdRateLimit, cmdDedupeMs } = snap.websocket;

    // 1) rate limit (sliding 1-second window)
    const now = Date.now();
    if (now - ws.cmdWindowStart >= 1000) {
      ws.cmdWindowStart = now;
      ws.cmdCount       = 0;
    }
    ws.cmdCount += 1;
    if (ws.cmdCount > cmdRateLimit) {
      if (ws.cmdCount === cmdRateLimit + 1) {
        logger.warn(`controller ${ws.sessionId} rate-limited (>${cmdRateLimit}/s)`);
        safeSend(ws, JSON.stringify({ type: 'error', message: 'rate limit exceeded' }));
      }
      return 'rate-limited';
    }

    // 2) parse
    let cmd = text;
    if (text.startsWith('{')) {
      try { cmd = (JSON.parse(text).cmd || '').toUpperCase(); }
      catch { cmd = ''; }
    }
    cmd = (cmd || '').toUpperCase();

    // 3) validate
    if (!VALID_COMMANDS.has(cmd)) {
      logger.debug(`invalid command from controller ${ws.sessionId}: "${text}"`);
      return 'invalid';
    }

    // 4) dedupe (STOP always passes through — emergency-stop must never be swallowed)
    if (cmdDedupeMs > 0 && cmd !== STOP_CMD
        && cmd === ws.lastCmd && (now - ws.lastCmdAt) < cmdDedupeMs) {
      ws.dedupedCount += 1;
      if (ws.dedupedCount % 100 === 1) {
        logger.info(`controller ${ws.sessionId} sent ${ws.dedupedCount} duplicate '${cmd}' frames (dedupe ${cmdDedupeMs}ms)`);
      }
      return 'deduped';
    }
    ws.lastCmd   = cmd;
    ws.lastCmdAt = now;

    // 5) route
    const robot = sessionRegistry.robot;
    if (robot && isOpen(robot.ws)) {
      try { robot.ws.send(cmd); } catch (err) {
        logger.warn(`robot send error: ${err.message}`);
        return 'robot-offline';
      }
      logger.debug(`CMD ${cmd}  ->  robot OK`);
      sessionRegistry.touch(robot);
      return 'forwarded';
    }
    safeSend(ws, JSON.stringify({ type: 'error', message: 'robot offline' }));
    logger.debug(`CMD ${cmd}  ->  robot OFFLINE`);
    return 'robot-offline';
  }

  function handleClose(ws, { code }) {
    const entry = sessionRegistry.findControllerByWs(ws);
    if (!entry) return;
    sessionRegistry.removeController(entry.id);
    logger.info(`CONTROLLER disconnected (${code}) id=${entry.id} remaining=${sessionRegistry.controllerCount}`);
  }

  return { register, handleText, handleClose, VALID_COMMANDS };
}
