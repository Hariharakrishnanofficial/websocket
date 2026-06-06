/**
 * Production-safe defaults for the AppSail relay.
 *
 * These values are embedded in the binary so the relay can boot and serve
 * traffic even if Catalyst NoSQL is unreachable. They MUST mirror the
 * `production-safe` values documented in `Document/CONFIG_SCHEMA.md` §7.
 *
 * Never put secrets here. Secrets resolve from Catalyst Cache via
 * `cfg_secrets_ref` pointers; absence yields empty strings (token-required
 * mode will then reject unauthenticated connections — fail closed).
 */

'use strict';

const safeDefaults = Object.freeze({
  environment: process.env.ENVIRONMENT || 'production',
  websocket: {
    endpointPath: '/ws',
    videoEndpointPath: '/video',
    rateLimit:    { commandsPerSecond: 50, burst: 80 },
    dedupe:       { serverWindowMs: 200, clientWindowMs: 250 },
    heartbeat:    { controllerMs: 300, serverPingMs: 30000, watchdogMs: 750 },
    registration: { timeoutMs: 5000, tokenRequired: true },
    payload:      { maxCmdBytes: 4096, maxVideoFrameBytes: 98304, maxTotalBytes: 102400 },
    allowedOrigins: [],
    reconnect:    { initialBackoffMs: 1000, maxBackoffMs: 8000, strategy: 'exponential', jitterPct: 20 },
    logging:      { verbose: false, logFrames: false, redactTokens: true },
  },
  diagnostics: {
    logging: { level: 'info' },
    tracing: { sampleRate: 0.05 },
  },
  featureFlags: {
    'feature.serverDedupe': { killSwitch: false, enabled: { development: true, staging: true, production: true } },
    'feature.cameraStream': { killSwitch: false, enabled: { development: true, staging: true, production: false } },
  },
  secrets: {
    robotToken: process.env.ROBOT_TOKEN || '',
    controllerToken: process.env.CONTROLLER_TOKEN || '',
    cameraToken: process.env.CAMERA_TOKEN || '',
  },
  configVersion: 0,
  revisionId: 'safe-defaults',
});

module.exports = safeDefaults;
