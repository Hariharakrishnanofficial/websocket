/**
 * Repository for the versioned `cfg_*` tables.
 *
 * Loads the **active** row for the current profile from each table by
 * querying the `gsi_env_active` GSI (partition=environment, sort=active='true').
 * Returns an overlay shaped as:
 *
 *   {
 *     cfg_environment:  { configVersion, revisionId, payload },
 *     cfg_websocket:    { configVersion, revisionId, payload },
 *     cfg_feature_flags:{ configVersion, revisionId, payload },
 *     ...
 *   }
 *
 * `payload` is the row's free-form JSON (everything other than the key
 * columns). The config loader (`src/config/index.mjs`) consumes this overlay
 * via `applyOverlay()`.
 *
 * Missing tables / missing active rows are returned as `null` for that key.
 * This keeps the loader's fallback chain simple and predictable.
 */

import { logger } from '../../shared/logger.js';

const VERSIONED_TABLES = Object.freeze([
  'cfg_environment',
  'cfg_websocket',
  'cfg_robot',
  'cfg_controller',
  'cfg_feature_flags',
  'cfg_telemetry',
  'cfg_ota',
  'cfg_ui',
  'cfg_diagnostics',
]);

function extractPayload(row) {
  if (!row) return null;
  const {
    key: _k, robotId: _r, configVersion, revisionId,
    environment, active,
    ...rest
  } = row;
  return {
    configVersion: configVersion ?? 0,
    revisionId:    revisionId ?? null,
    environment,
    payload: rest,
  };
}

export function createConfigRepository({ nosqlClient }) {
  if (!nosqlClient) throw new Error('configRepository: nosqlClient is required');

  async function loadOne(table, environment) {
    try {
      // cfg_robot uses a different PK (`robotId`) and a different GSI
      // (`gsi_robot_status`). The active-config pattern only applies to the
      // 9 environment-scoped tables. Skip cfg_robot here — it is queried
      // ad-hoc per robotId by the RobotService.
      if (table === 'cfg_robot') return null;
      const rows = await nosqlClient.query({
        table,
        index: 'gsi_env_active',
        partition: { environment },
        sort: { active: 'true' },
        order: 'DESC',
        limit: 1,
      });
      const top = rows?.[0] ?? null;
      return extractPayload(top);
    } catch (err) {
      // Catalyst returns 404-style errors for tables that don't exist yet
      // (e.g. before first console-time provisioning). Treat as "no overlay".
      logger.debug(`configRepository: ${table} query failed — ${err.message}`);
      return null;
    }
  }

  return {
    async loadActive(environment) {
      const overlay = {};
      await Promise.all(
        VERSIONED_TABLES.map(async (t) => { overlay[t] = await loadOne(t, environment); })
      );
      return overlay;
    },
    /** Seed helper used by tests + dev bootstrap. */
    async seedDevDefaults() {
      // Only callable when the underlying client is the emulator (idempotent).
      if (nosqlClient.mode !== 'emulator') return;
      const seedAt = new Date().toISOString();
      const env = 'development';
      const baseRow = (table, key, payload) => ({
        key,
        configVersion: 1,
        environment: env,
        active: 'true',
        revisionId: `${table}-seed-1`,
        updatedAt: seedAt,
        ...payload,
      });
      await nosqlClient.put('cfg_environment', baseRow('cfg_environment', `env.${env}`, {
        port: 9000,
        notes: 'auto-seeded dev defaults',
      }));
      await nosqlClient.put('cfg_websocket', baseRow('cfg_websocket', 'websocket.default', {
        endpointPath: '/ws',
        videoEndpointPath: '/video',
        cmdRateLimit: 50,
        cmdDedupeMs: 200,
        heartbeatMs: 30_000,
        registerTimeoutMs: 5_000,
        maxCmdBytes: 4096,
        maxVideoFrameBytes: 98_304,
        maxTotalBytes: 102_400,
        allowedOrigins: [],
      }));
      await nosqlClient.put('cfg_feature_flags', baseRow('cfg_feature_flags', 'flags.default', {
        'feature.serverDedupe': true,
        'feature.cameraStream': true,
      }));
    },
    VERSIONED_TABLES,
  };
}
