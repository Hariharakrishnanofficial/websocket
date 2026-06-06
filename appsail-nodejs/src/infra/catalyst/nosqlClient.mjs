/**
 * Catalyst NoSQL client adapter.
 *
 * Production: wraps the real `zcatalyst-sdk-node` ZCQL client.
 * Dev / test: uses the in-process emulator (`@ws/nosql-emulator`) which mirrors
 * the exact subset of semantics we depend on (partition+sort keys, GSIs,
 * BEGINS_WITH / BETWEEN sort-key ops, TTL).
 *
 * Selection rules:
 *   - mode='emulator'           → always emulator (used by tests + offline dev)
 *   - mode='catalyst'           → require the SDK; throw if unavailable
 *   - mode='auto' (default)     → catalyst if `CATALYST_PROJECT_ID` and the SDK
 *                                 are present, else emulator
 *
 * Public surface (intentionally tiny — only what the relay needs):
 *   client.get(table, partition, sort?)               → Promise<item|null>
 *   client.query({ table, index?, partition, sort?, order?, limit? }) → Promise<item[]>
 *   client.put(table, item)                            → Promise<item>
 *   client.delete(table, partition, sort?)             → Promise<boolean>
 *   client.mode                                        → 'emulator' | 'catalyst'
 *   client.healthy()                                   → Promise<boolean>
 */

import { logger } from '../../shared/logger.js';

let cachedEmulator = null;

async function loadEmulator() {
  if (cachedEmulator) return cachedEmulator;
  const { Emulator } = await import('@ws/nosql-emulator');
  const { SCHEMA }   = await import('@ws/nosql-emulator/schema');
  cachedEmulator = new Emulator(SCHEMA);
  return cachedEmulator;
}

async function tryLoadCatalystSdk() {
  try {
    // The Catalyst SDK ships with the AppSail runtime; in our workspace it is
    // not installed as a dependency. Use a dynamic import so this file can be
    // required in environments where the SDK is unavailable.
    const sdk = await import('zcatalyst-sdk-node').catch(() => null);
    return sdk?.default ?? sdk ?? null;
  } catch {
    return null;
  }
}

function emulatorAdapter(emu) {
  return {
    mode: 'emulator',
    async get(table, partition, sort)        { return emu.get(table, partition, sort); },
    async query(spec)                        { return emu.query(spec); },
    async put(table, item)                   { return emu.put(table, item); },
    async delete(table, partition, sort)     { return emu.delete(table, partition, sort); },
    async healthy()                          { return true; },
    /** Exposes the emulator for test fixtures. Not used in production. */
    _emulator: emu,
  };
}

function catalystAdapter(catalyst) {
  // Thin wrapper that maps our query spec to ZCQL.
  // ZCQL is read-only via SELECT; writes use the table-level insert/update APIs.
  // We only need:
  //   1. get by PK (+ optional SK)
  //   2. query by GSI partition (+ optional SK predicate)
  //   3. put / delete by PK
  const datastore = catalyst.datastore();
  return {
    mode: 'catalyst',
    async get(table, partition, sort) {
      // For our cfg_* tables PK is always (key,configVersion) — use ZCQL.
      // (Both args fall back to a parameterised SELECT.)
      const t = datastore.table(table);
      const rows = sort !== undefined
        ? await t.getRow({ partition, sort })       // shape depends on SDK ver
        : await t.getRow({ partition });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row ?? null;
    },
    async query(spec) {
      const { table, index, partition, sort, order = 'ASC', limit } = spec;
      // Build a minimal ZCQL SELECT. Callers stay decoupled from SQL.
      const where = Object.entries(partition).map(([k, v]) => `${k} = ${quote(v)}`);
      if (sort) {
        for (const [k, v] of Object.entries(sort)) {
          if (v && typeof v === 'object' && v.op) {
            switch (v.op) {
              case '=':           where.push(`${k} = ${quote(v.value)}`);                       break;
              case '<':           where.push(`${k} < ${quote(v.value)}`);                       break;
              case '<=':          where.push(`${k} <= ${quote(v.value)}`);                      break;
              case '>':           where.push(`${k} > ${quote(v.value)}`);                       break;
              case '>=':          where.push(`${k} >= ${quote(v.value)}`);                      break;
              case 'BETWEEN':     where.push(`${k} BETWEEN ${quote(v.from)} AND ${quote(v.to)}`); break;
              case 'BEGINS_WITH': where.push(`${k} LIKE ${quote(`${v.value}%`)}`);                break;
              default: throw new Error(`unsupported sort op: ${v.op}`);
            }
          } else {
            where.push(`${k} = ${quote(v)}`);
          }
        }
      }
      const indexClause = index ? ` USE INDEX ${index}` : '';
      const orderClause = ` ORDER BY ${Object.keys(sort ?? partition)[0]} ${order}`;
      const limitClause = limit ? ` LIMIT ${limit}` : '';
      const zcql = `SELECT * FROM ${table}${indexClause} WHERE ${where.join(' AND ')}${orderClause}${limitClause}`;
      const rows = await catalyst.zcql().executeZCQLQuery(zcql);
      // ZCQL returns [{ <table>: { ...row } }, ...] — flatten.
      return rows.map(r => r[table] ?? r);
    },
    async put(table, item) {
      const t = datastore.table(table);
      const created = await t.insertRow(item);
      return created;
    },
    async delete(table, partition, sort) {
      const t = datastore.table(table);
      const ok = await t.deleteRow({ partition, sort });
      return !!ok;
    },
    async healthy() {
      try { await catalyst.zcql().executeZCQLQuery('SELECT 1'); return true; }
      catch { return false; }
    },
  };

  function quote(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  }
}

/**
 * Factory. `mode` defaults to 'auto'.
 *
 * @param {{ mode?: 'auto'|'emulator'|'catalyst', catalystApp?: object }} [opts]
 */
export async function createNoSqlClient(opts = {}) {
  const mode = opts.mode ?? 'auto';

  if (mode === 'emulator') {
    const emu = await loadEmulator();
    logger.info('nosql: using in-memory emulator (explicit)');
    return emulatorAdapter(emu);
  }

  if (mode === 'catalyst') {
    const sdk = await tryLoadCatalystSdk();
    if (!sdk) throw new Error('zcatalyst-sdk-node not installed but mode=catalyst');
    const app = opts.catalystApp ?? sdk.initialize?.();
    logger.info('nosql: using Catalyst datastore (explicit)');
    return catalystAdapter(app);
  }

  // mode === 'auto'
  if (process.env.CATALYST_PROJECT_ID) {
    const sdk = await tryLoadCatalystSdk();
    if (sdk) {
      const app = opts.catalystApp ?? sdk.initialize?.();
      logger.info('nosql: using Catalyst datastore (auto-detected)');
      return catalystAdapter(app);
    }
    logger.warn('nosql: CATALYST_PROJECT_ID set but SDK missing — falling back to emulator');
  } else {
    logger.info('nosql: no CATALYST_PROJECT_ID — using in-memory emulator');
  }
  const emu = await loadEmulator();
  return emulatorAdapter(emu);
}
