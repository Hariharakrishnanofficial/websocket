/**
 * Three-layer configuration loader.
 *
 *   layer 1 — built-in safe defaults  (src/config/safeDefaults.js)
 *   layer 2 — process environment     (src/config/env.js)
 *   layer 3 — NoSQL cfg_* tables      (src/infra/catalyst/configRepository.mjs)
 *
 * The loader resolves each layer in order, deep-merging the result. Layer 3
 * (NoSQL) is optional: if the repository is unavailable (boot-time, network
 * loss, unconfigured emulator), the loader returns the merged layer 1+2
 * snapshot so the relay can always boot and serve traffic.
 *
 * Hot reload:
 *   `startHotReload(ms)` polls the repository every `ms` ms and, on a
 *   `configVersion` change, re-emits a `change` event with the new snapshot.
 *
 * IMPORTANT: secrets never leak through `snapshot.summary`. Tokens are
 * described as `{ set, length }` only.
 */

import { EventEmitter } from 'node:events';
import safeDefaults from './safeDefaults.js';
import { ENV } from './env.js';
import { resolveProfile } from './profiles.mjs';
import { logger } from '../shared/logger.js';

const DEFAULT_HOT_RELOAD_MS = 30_000;

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  for (const v of Object.values(obj)) deepFreeze(v);
  return Object.freeze(obj);
}

function describeSecret(value) {
  if (!value) return { set: false };
  return { set: true, length: value.length };
}

/**
 * Build the merged config snapshot from layers 1 + 2 only (no NoSQL).
 * Pure function — safe to call during boot before any I/O is available.
 */
export function buildBaseSnapshot() {
  const profile = resolveProfile();
  const allowedOrigins = ENV.ALLOWED_ORIGINS.size > 0
    ? [...ENV.ALLOWED_ORIGINS]
    : safeDefaults.websocket.allowedOrigins;

  return {
    profile,
    configVersion: safeDefaults.configVersion,
    revisionId:    safeDefaults.revisionId,
    source:        'env+defaults',
    server: {
      port: ENV.PORT,
    },
    websocket: {
      endpointPath:      safeDefaults.websocket.endpointPath,
      videoEndpointPath: safeDefaults.websocket.videoEndpointPath,
      allowedOrigins,
      maxCmdBytes:         ENV.MAX_CMD_PAYLOAD,
      maxVideoFrameBytes:  ENV.MAX_VIDEO_FRAME_BYTES,
      maxTotalBytes:       Math.max(ENV.MAX_VIDEO_FRAME_BYTES + 2048, ENV.MAX_CMD_PAYLOAD),
      cmdRateLimit:        ENV.CMD_RATE_LIMIT,
      cmdDedupeMs:         ENV.CMD_DEDUPE_MS,
      heartbeatMs:         ENV.HEARTBEAT_MS,
      registerTimeoutMs:   ENV.REGISTER_TIMEOUT_MS,
    },
    auth: {
      robotToken:      ENV.ROBOT_TOKEN,
      controllerToken: ENV.CONTROLLER_TOKEN,
      cameraToken:     ENV.CAMERA_TOKEN,
    },
    featureFlags: safeDefaults.featureFlags,
  };
}

/**
 * Produce a leak-safe summary suitable for /health and startup banners.
 */
export function summarise(snapshot) {
  return {
    profile:      snapshot.profile,
    configVersion: snapshot.configVersion,
    revisionId:    snapshot.revisionId,
    source:        snapshot.source,
    port:          snapshot.server.port,
    robotToken:      describeSecret(snapshot.auth.robotToken),
    controllerToken: describeSecret(snapshot.auth.controllerToken),
    cameraToken:     describeSecret(snapshot.auth.cameraToken),
    allowedOrigins:  snapshot.websocket.allowedOrigins.length === 0
      ? '* (open)'
      : snapshot.websocket.allowedOrigins,
    maxPayloadBytes:    snapshot.websocket.maxTotalBytes,
    maxVideoFrameBytes: snapshot.websocket.maxVideoFrameBytes,
    cmdRateLimit:       snapshot.websocket.cmdRateLimit,
    cmdDedupeMs:        snapshot.websocket.cmdDedupeMs,
    heartbeatMs:        snapshot.websocket.heartbeatMs,
  };
}

/**
 * Merge a NoSQL-sourced overlay onto a base snapshot.
 * The overlay is the value returned by `configRepository.loadActive()`.
 */
function applyOverlay(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;

  const ws = overlay.cfg_websocket?.payload ?? {};
  const env = overlay.cfg_environment?.payload ?? {};
  const flags = overlay.cfg_feature_flags?.payload ?? {};

  return {
    ...base,
    configVersion: overlay.cfg_environment?.configVersion ?? base.configVersion,
    revisionId:    overlay.cfg_environment?.revisionId    ?? base.revisionId,
    source:        'nosql+env+defaults',
    server: {
      ...base.server,
      port: env.port ?? base.server.port,
    },
    websocket: {
      ...base.websocket,
      endpointPath:       ws.endpointPath      ?? base.websocket.endpointPath,
      videoEndpointPath:  ws.videoEndpointPath ?? base.websocket.videoEndpointPath,
      allowedOrigins:     ws.allowedOrigins    ?? base.websocket.allowedOrigins,
      maxCmdBytes:        ws.maxCmdBytes       ?? base.websocket.maxCmdBytes,
      maxVideoFrameBytes: ws.maxVideoFrameBytes ?? base.websocket.maxVideoFrameBytes,
      maxTotalBytes:      ws.maxTotalBytes     ?? base.websocket.maxTotalBytes,
      cmdRateLimit:       ws.cmdRateLimit      ?? base.websocket.cmdRateLimit,
      cmdDedupeMs:        ws.cmdDedupeMs       ?? base.websocket.cmdDedupeMs,
      heartbeatMs:        ws.heartbeatMs       ?? base.websocket.heartbeatMs,
      registerTimeoutMs:  ws.registerTimeoutMs ?? base.websocket.registerTimeoutMs,
    },
    featureFlags: { ...base.featureFlags, ...flags },
  };
}

/**
 * Public loader. Returns an EventEmitter snapshot manager.
 *
 *   const cfg = await createConfig({ repository });
 *   cfg.current();           // -> latest merged snapshot
 *   cfg.summary();           // -> leak-safe object for /health
 *   cfg.on('change', s => …);
 *   cfg.startHotReload(30000);
 *   cfg.stop();
 *
 * `repository` is optional; without it the loader stays at layers 1+2.
 */
export async function createConfig({ repository = null, hotReloadMs = DEFAULT_HOT_RELOAD_MS } = {}) {
  const emitter = new EventEmitter();
  let snapshot = deepFreeze(buildBaseSnapshot());
  let pollTimer = null;
  let stopped = false;

  async function refresh() {
    if (!repository || stopped) return;
    try {
      const overlay = await repository.loadActive(snapshot.profile);
      const merged = deepFreeze(applyOverlay(buildBaseSnapshot(), overlay));
      const versionChanged = merged.configVersion !== snapshot.configVersion
        || merged.revisionId  !== snapshot.revisionId;
      snapshot = merged;
      if (versionChanged) {
        logger.info(`config: reloaded version=${merged.configVersion} revision=${merged.revisionId}`);
        emitter.emit('change', snapshot);
      }
    } catch (err) {
      logger.warn(`config: hot-reload failed, retaining previous snapshot — ${err.message}`);
    }
  }

  if (repository) await refresh();

  return {
    current() { return snapshot; },
    summary() { return summarise(snapshot); },
    on(event, fn) { emitter.on(event, fn); return this; },
    off(event, fn) { emitter.off(event, fn); return this; },
    async refresh() { await refresh(); return snapshot; },
    startHotReload(ms = hotReloadMs) {
      if (pollTimer || !repository) return;
      pollTimer = setInterval(refresh, ms);
      pollTimer.unref?.();
    },
    stop() {
      stopped = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    },
  };
}
