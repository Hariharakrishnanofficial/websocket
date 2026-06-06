/**
 * NoSQL Table & Index Suite — Reporter
 * ====================================
 *
 *   Runs schema & index tests programmatically and prints a coverage matrix:
 *
 *      Table              Base CRUD  Indexes Tested
 *      cfg_environment    PASS       gsi_env_active  PASS
 *      …
 *      ─────────────────────────────────────────────
 *      Tables:  10 / 10   Indexes: 11 / 11
 *
 *   Run with:  npm run test:nosql-report  (added to package.json)
 *   This is *informational* — the authoritative pass/fail comes from
 *   `node --test test/`.
 */

import { Emulator }      from '@ws/nosql-emulator';
import { SCHEMA, ALL_INDEXES, TABLE_NAMES } from '@ws/nosql-emulator/schema';

const ISO = (d) => new Date(d).toISOString();

const results = {
  tables:  new Map(TABLE_NAMES.map(t => [t, { crud: 'PEND', notes: '' }])),
  indexes: new Map(ALL_INDEXES.map(i => [`${i.table}.${i.name}`, { status: 'PEND', notes: '' }]))
};

function ok(label, fn) {
  try { fn(); return { status: 'PASS' }; }
  catch (e) { return { status: 'FAIL', notes: e.message }; }
}

// ────────────────────────────────────────────────────────────── 1. Base CRUD

const baseFixtures = {
  cfg_environment:   { key: 'env.prod',            configVersion: 1, environment: 'production', active: 'true' },
  cfg_websocket:     { key: 'ws.prod',             configVersion: 1, environment: 'production', active: 'true' },
  cfg_robot:         { robotId: 'r-1',             configVersion: 1, environment: 'production', active: 'true', status: 'online', updatedAt: ISO('2025-01-01T00:00:00Z') },
  cfg_controller:    { key: 'ctrl.prod',           configVersion: 1, environment: 'production', active: 'true' },
  cfg_feature_flags: { key: 'flags.prod',          configVersion: 1, environment: 'production', active: 'true' },
  cfg_telemetry:     { key: 'tel.prod',            configVersion: 1, environment: 'production', active: 'true' },
  cfg_ota:           { key: 'ota.prod',            configVersion: 1, environment: 'production', active: 'true' },
  cfg_ui:            { key: 'ui.prod',             configVersion: 1, environment: 'production', active: 'true' },
  cfg_diagnostics:   { key: 'diag.prod',           configVersion: 1, environment: 'production', active: 'true' },
  cfg_audit_log:     { documentKey: 'cfg_x/k',     timestamp: ISO('2025-01-01T00:00:00Z'),
                       actor: 'u@x.com',           collection: 'cfg_x' }
};

for (const [table, item] of Object.entries(baseFixtures)) {
  const r = ok(`${table} CRUD`, () => {
    const db  = new Emulator(SCHEMA);
    const def = SCHEMA.tables[table];
    db.put(table, item);
    const pkVal = item[def.partitionKey.name];
    const skVal = def.sortKey ? item[def.sortKey.name] : undefined;
    if (!db.get(table, pkVal, skVal))     throw new Error('get returned null');
    if (!db.delete(table, pkVal, skVal))  throw new Error('delete returned false');
    if (db.count(table) !== 0)            throw new Error('count not zero after delete');
  });
  results.tables.get(table).crud  = r.status;
  results.tables.get(table).notes = r.notes ?? '';
}

// ────────────────────────────────────────────────────────────── 2. Indexes

for (const ix of ALL_INDEXES) {
  const key = `${ix.table}.${ix.name}`;
  const r = ok(key, () => {
    const db  = new Emulator(SCHEMA);
    const def = SCHEMA.tables[ix.table];
    const pkN = def.partitionKey.name;
    const skN = def.sortKey?.name;
    const ixPkN = ix.partitionKey.name;
    const ixSkN = ix.sortKey?.name;

    // synth two items that share the index partition value
    const ixPkVal = 'xPart';
    const ixSk1   = ixSkN === 'updatedAt' || ixSkN === 'timestamp'
                      ? ISO('2025-01-01T00:00:00Z') : 'aaa';
    const ixSk2   = ixSkN === 'updatedAt' || ixSkN === 'timestamp'
                      ? ISO('2025-01-02T00:00:00Z') : 'bbb';

    const baseAttrs = {
      environment: 'production', active: 'true',
      status: 'online', updatedAt: ISO('2025-01-01T00:00:00Z'),
      actor: 'u@x.com', collection: 'cfg_x'
    };

    const item1 = { ...baseAttrs, [pkN]: 'k1' };
    const item2 = { ...baseAttrs, [pkN]: 'k2' };
    if (skN) { item1[skN] = skN === 'timestamp' ? ISO('2025-01-01T00:00:00Z') : 1;
               item2[skN] = skN === 'timestamp' ? ISO('2025-01-02T00:00:00Z') : 2; }
    item1[ixPkN] = ixPkVal; item2[ixPkN] = ixPkVal;
    if (ixSkN) { item1[ixSkN] = ixSk1; item2[ixSkN] = ixSk2; }

    db.put(ix.table, item1);
    db.put(ix.table, item2);

    const rows = db.query({
      table: ix.table, index: ix.name,
      partition: { [ixPkN]: ixPkVal },
      order: 'DESC'
    });
    if (rows.length !== 2) throw new Error(`expected 2 rows, got ${rows.length}`);
    if (ixSkN && rows[0][ixSkN] !== ixSk2) throw new Error('DESC order broken');
  });
  results.indexes.get(key).status = r.status;
  results.indexes.get(key).notes  = r.notes ?? '';
}

// ────────────────────────────────────────────────────────────── 3. Report

const COLOR = process.stdout.isTTY;
const c = (code, s) => COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
const green = s => c(32, s), red = s => c(31, s), bold = s => c(1, s), dim = s => c(2, s);
const pad   = (s, w) => String(s).padEnd(w);

console.log(bold('\n📋 Catalyst NoSQL — Tables & Indexes Coverage Report\n'));
console.log(dim('Source of truth: Document/CATALYST_NOSQL_TABLE_FIELDS.md §11\n'));

console.log(bold(pad('Table', 22) + pad('Base CRUD', 12) + 'Indexes'));
console.log(dim('─'.repeat(78)));

let tablePass = 0, indexPass = 0;
for (const [table, info] of results.tables) {
  const tStatus = info.crud === 'PASS' ? green('  PASS') : red('  FAIL');
  if (info.crud === 'PASS') tablePass++;
  const tableIdx = SCHEMA.tables[table].indexes;
  const ixLabels = tableIdx.length === 0
    ? dim('(none)')
    : tableIdx.map(ix => {
        const k = `${table}.${ix.name}`;
        const s = results.indexes.get(k)?.status;
        if (s === 'PASS') indexPass++;
        return (s === 'PASS' ? green(`${ix.name} ✓`) : red(`${ix.name} ✗`));
      }).join('  ');
  console.log(pad(table, 22) + pad(tStatus + dim(`  ${info.crud}`), 12) + '  ' + ixLabels);
  if (info.notes) console.log(dim('  └─ ' + info.notes));
}

console.log(dim('─'.repeat(78)));
const tTotal = results.tables.size;
const iTotal = results.indexes.size;
console.log(
  bold('Tables:  ') + (tablePass === tTotal ? green(`${tablePass} / ${tTotal}`) : red(`${tablePass} / ${tTotal}`)) +
  '    ' +
  bold('Indexes: ') + (indexPass === iTotal ? green(`${indexPass} / ${iTotal}`) : red(`${indexPass} / ${iTotal}`))
);

for (const [k, v] of results.indexes) {
  if (v.status !== 'PASS') console.log(red(`  ✗ ${k}: ${v.notes}`));
}

console.log('');
const allPass = tablePass === tTotal && indexPass === iTotal;
process.exit(allPass ? 0 : 1);
