/**
 * NoSQL Schema Conformance Tests
 * ==============================
 *
 *   Validates that:
 *     1. The canonical schema (packages/nosql-emulator/schema.mjs) matches the
 *        master summary in Document/CATALYST_NOSQL_TABLE_FIELDS.md §11.
 *     2. Every table declares exactly the expected indexes.
 *     3. Catalyst constraints are respected (≤5 GSIs, allowed key types,
 *        `gsi_*` naming convention, valid attribute-type projections).
 *     4. `cfg_audit_log` is the only table with a TTL attribute.
 */

import { test, describe } from 'node:test';
import assert             from 'node:assert/strict';
import { readFileSync }   from 'node:fs';
import { fileURLToPath }  from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  SCHEMA, TABLE_NAMES, ALL_INDEXES,
  MAX_GSI_PER_TABLE, ALLOWED_KEY_TYPES, ALLOWED_ATTR_TYPES
} from '@ws/nosql-emulator/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MD_PATH   = resolve(__dirname, '../../Document/CATALYST_NOSQL_TABLE_FIELDS.md');

const EXPECTED_TABLES = [
  'cfg_environment', 'cfg_websocket', 'cfg_robot',     'cfg_controller',
  'cfg_feature_flags', 'cfg_telemetry', 'cfg_ota',     'cfg_ui',
  'cfg_diagnostics', 'cfg_audit_log'
];

const EXPECTED_INDEXES = [
  'gsi_env_active',    // 8 tables share this index name
  'gsi_robot_status',
  'gsi_audit_actor',
  'gsi_audit_target'
];

// ────────────────────────────────────────────────────────────────────────────────

describe('Schema — Table Inventory', () => {
  test('exactly 10 tables defined', () => {
    assert.equal(TABLE_NAMES.length, 10);
  });

  test('all 10 expected tables present', () => {
    for (const name of EXPECTED_TABLES) {
      assert.ok(TABLE_NAMES.includes(name), `missing table ${name}`);
    }
  });

  test('no unexpected tables', () => {
    for (const name of TABLE_NAMES) {
      assert.ok(EXPECTED_TABLES.includes(name), `unexpected table ${name}`);
    }
  });
});

describe('Schema — Primary Keys', () => {
  for (const name of EXPECTED_TABLES) {
    test(`${name}: PK and SK declared with allowed types`, () => {
      const def = SCHEMA.tables[name];
      assert.ok(def.partitionKey.name, 'partitionKey.name required');
      assert.ok(ALLOWED_KEY_TYPES.includes(def.partitionKey.type));
      if (def.sortKey) {
        assert.ok(def.sortKey.name, 'sortKey.name required');
        assert.ok(ALLOWED_KEY_TYPES.includes(def.sortKey.type));
      }
    });
  }

  test('cfg_environment uses key + configVersion', () => {
    const t = SCHEMA.tables.cfg_environment;
    assert.deepEqual(t.partitionKey, { name: 'key', type: 'String' });
    assert.deepEqual(t.sortKey,      { name: 'configVersion', type: 'Number' });
  });

  test('cfg_robot uses robotId + configVersion', () => {
    const t = SCHEMA.tables.cfg_robot;
    assert.deepEqual(t.partitionKey, { name: 'robotId', type: 'String' });
    assert.deepEqual(t.sortKey,      { name: 'configVersion', type: 'Number' });
  });

  test('cfg_audit_log uses documentKey + timestamp (String SK for ISO-8601 ordering)', () => {
    const t = SCHEMA.tables.cfg_audit_log;
    assert.deepEqual(t.partitionKey, { name: 'documentKey', type: 'String' });
    assert.deepEqual(t.sortKey,      { name: 'timestamp',   type: 'String' });
  });
});

describe('Schema — TTL', () => {
  test('only cfg_audit_log has TTL attribute', () => {
    for (const name of EXPECTED_TABLES) {
      const def = SCHEMA.tables[name];
      if (name === 'cfg_audit_log') assert.equal(def.ttlAttr, 'expiresAt');
      else                          assert.equal(def.ttlAttr, null, `${name} should not have ttlAttr`);
    }
  });
});

describe('Schema — Secondary Indexes', () => {
  test('every index name starts with gsi_', () => {
    for (const ix of ALL_INDEXES) {
      assert.ok(ix.name.startsWith('gsi_'), `${ix.name} must start with 'gsi_'`);
    }
  });

  test('every index name is one of the 4 known indexes', () => {
    for (const ix of ALL_INDEXES) {
      assert.ok(EXPECTED_INDEXES.includes(ix.name), `unexpected index '${ix.name}'`);
    }
  });

  test('no table exceeds Catalyst MAX_GSI limit (5)', () => {
    for (const name of EXPECTED_TABLES) {
      const def = SCHEMA.tables[name];
      assert.ok(def.indexes.length <= MAX_GSI_PER_TABLE,
        `${name} has ${def.indexes.length} indexes (max ${MAX_GSI_PER_TABLE})`);
    }
  });

  test('every projection uses an allowed attributeType', () => {
    for (const ix of ALL_INDEXES) {
      assert.ok(ALLOWED_ATTR_TYPES.includes(ix.attributeType),
        `${ix.table}.${ix.name} attributeType '${ix.attributeType}' not allowed`);
    }
  });

  test('all GSIs use attributeType = "All" (per §11 master summary note)', () => {
    for (const ix of ALL_INDEXES) {
      assert.equal(ix.attributeType, 'All', `${ix.table}.${ix.name} should project All`);
    }
  });

  test('gsi_env_active appears on the 8 expected tables', () => {
    const tables = ALL_INDEXES.filter(i => i.name === 'gsi_env_active').map(i => i.table);
    assert.deepEqual(tables.sort(), [
      'cfg_controller', 'cfg_diagnostics', 'cfg_environment',
      'cfg_feature_flags', 'cfg_ota', 'cfg_telemetry', 'cfg_ui', 'cfg_websocket'
    ].sort());
  });

  test('gsi_robot_status is exclusive to cfg_robot', () => {
    const matches = ALL_INDEXES.filter(i => i.name === 'gsi_robot_status');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].table, 'cfg_robot');
    assert.deepEqual(matches[0].partitionKey, { name: 'status',    type: 'String' });
    assert.deepEqual(matches[0].sortKey,      { name: 'updatedAt', type: 'String' });
  });

  test('cfg_audit_log declares exactly 2 GSIs: actor + target', () => {
    const idx = SCHEMA.tables.cfg_audit_log.indexes;
    assert.equal(idx.length, 2);
    const names = idx.map(i => i.name).sort();
    assert.deepEqual(names, ['gsi_audit_actor', 'gsi_audit_target']);
  });

  test('total index count across all tables = 11', () => {
    // 8× gsi_env_active + 1× gsi_robot_status + 2× audit = 11
    assert.equal(ALL_INDEXES.length, 11);
  });
});

describe('Schema — Drift vs Markdown Document', () => {
  const md = readFileSync(MD_PATH, 'utf8');

  test('MD §11 contains every table from the schema', () => {
    for (const name of EXPECTED_TABLES) {
      assert.match(md, new RegExp(`\\b${name}\\b`), `MD missing '${name}'`);
    }
  });

  test('MD references every GSI name from the schema', () => {
    for (const name of EXPECTED_INDEXES) {
      assert.match(md, new RegExp(`\\b${name}\\b`), `MD missing '${name}'`);
    }
  });

  test('MD documents 10 tables in §11 row count', () => {
    const sectionMatch = md.match(/## 11\.[\s\S]*?##\s/);
    assert.ok(sectionMatch, '§11 section not found');
    const section = sectionMatch[0];
    // Count data rows of the form: "| <digit> | `cfg_..."
    const rows = section.match(/\|\s*\d+\s*\|\s*`cfg_/g) ?? [];
    assert.equal(rows.length, 10, `expected 10 data rows in §11, found ${rows.length}`);
  });
});
