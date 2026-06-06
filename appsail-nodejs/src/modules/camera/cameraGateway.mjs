/**
 * Camera WebSocket gateway.
 *
 * Handles a single ESP32-CAM client that streams binary JPEG frames.
 * The relay's job is fan-out: each accepted frame is forwarded to every
 * controller with strict back-pressure protection (skip-not-queue).
 *
 * Per-second windowed stats are maintained on the injected `videoStats`
 * object so the /health endpoint can publish fpsIn / fpsOut / kbpsIn
 * without per-request work.
 */

import { WebSocket } from 'ws';
import { logger } from '../../shared/logger.js';
import { safeSend, isOpen } from '../../shared/ws-utils.js';

export function createCameraGateway({ sessionRegistry, config, broadcastStatus, videoStats }) {

  function register(ws, registration, { remoteIp }) {
    const expected = config.current().auth.cameraToken;
    if (expected && registration.token !== expected) {
      logger.warn(`CAMERA rejected (${remoteIp}): bad token`);
      try { ws.close(4003, 'unauthorized'); } catch { /* noop */ }
      return null;
    }
    const { entry, previous } = sessionRegistry.setCamera(ws, { remoteIp });
    if (previous?.ws && previous.ws !== ws) {
      logger.info('replacing previous camera connection');
      try { previous.ws.close(4002, 'replaced'); } catch { /* noop */ }
    }
    ws.role = 'camera';
    ws.sessionId = entry.id;
    logger.info(`CAMERA registered (${remoteIp}) id=${entry.id}`);
    safeSend(ws, JSON.stringify({ type: 'welcome', role: 'camera' }));
    broadcastStatus();
    return entry;
  }

  function handleBinary(ws, frame) {
    if (sessionRegistry.camera?.ws !== ws) return;
    const len = frame.length;
    const maxFrame = config.current().websocket.maxVideoFrameBytes;
    if (len > maxFrame) {
      videoStats.framesDropped += 1;
      if (videoStats.framesDropped % 30 === 1) {
        logger.warn(`camera frame ${len}B exceeds cap ${maxFrame}B - dropped`);
      }
      return;
    }
    videoStats.framesIn   += 1;
    videoStats.bytesIn    += len;
    videoStats.lastFrameAt = Date.now();
    sessionRegistry.touch(sessionRegistry.camera);
    fanout(frame, maxFrame);
  }

  function handleText(_ws, text) {
    // Cameras may send JSON control frames (e.g. heartbeats). Log + drop.
    logger.debug(`CAMERA->relay (json, ${text.length}B): ${text.slice(0, 120)}`);
  }

  function handleClose(ws, { code, reason }) {
    const cleared = sessionRegistry.clearCamera(ws);
    if (cleared) {
      logger.info(`CAMERA disconnected (${code} ${reason}) id=${cleared.id}`);
      broadcastStatus();
    }
  }

  function fanout(frame, maxFrame) {
    let sent = 0, dropped = 0;
    for (const c of sessionRegistry.controllerIterator()) {
      const sock = c.ws;
      if (!isOpen(sock)) continue;
      // Back-pressure: if the kernel buffer already holds more than one
      // frame's worth of data, skip this frame for this client. Driving on
      // a stale feed is worse than skipping one frame.
      if (sock.bufferedAmount > maxFrame) { dropped += 1; continue; }
      try { sock.send(frame, { binary: true }); sent += 1; }
      catch (err) { logger.warn(`video send error: ${err.message}`); }
    }
    videoStats.framesOut     += sent;
    videoStats.framesDropped += dropped;
  }

  return { register, handleBinary, handleText, handleClose };
}

// Re-export for the server to construct an empty stats object.
export function createVideoStats() {
  return {
    framesIn: 0, framesOut: 0, bytesIn: 0, framesDropped: 0, lastFrameAt: 0,
    fpsIn: 0,    fpsOut: 0,    kbpsIn: 0,
  };
}

export { WebSocket }; // for tests that need to import the same ws build
