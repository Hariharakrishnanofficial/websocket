/**
 * Catalyst NoSQL — In-Memory Emulator
 * ====================================
 *
 * Mirrors the subset of Catalyst Cloud Scale NoSQL semantics we depend on:
 *   - Composite primary key  (partition key + optional sort key)
 *   - Typed attributes (String / Number / Boolean)
 *   - Up to 5 Global Secondary Indexes per table (`gsi_*`)
 *   - GSI projections: `All` | `KeysOnly` | `Include`
 *   - TTL attribute (epoch seconds) → auto-purge on read
 *   - Query operators: `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `BEGINS_WITH`
 *   - Scan with optional filter
 *   - Sort direction `ASC` / `DESC` (Catalyst default for sort-key range is ASC)
 *
 * Not modelled (out of scope for the relay's needs):
 *   - Full ZCQL parser  (we expose a programmatic query() API instead)
 *   - Transactions
 *   - Conditional writes
 *
 * Usage:
 *   import { Emulator } from '@ws/nosql-emulator';
 *   import { SCHEMA }   from '@ws/nosql-emulator/schema';
 *   const db = new Emulator(SCHEMA);
 *   db.put('cfg_environment', { key:'env.production', configVersion:1, environment:'production', active:'true' });
 *   const rows = db.query({ table:'cfg_environment', index:'gsi_env_active',
 *                           partition:{ environment:'production' }, sort:{ active:'true' } });
 */

import { ALLOWED_KEY_TYPES, MAX_GSI_PER_TABLE } from './schema.mjs';

const now = () => Math.floor(Date.now() / 1000);

function typeOf(value) {
  if (typeof value === 'string')  return 'String';
  if (typeof value === 'number')  return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  return typeof value;
}

function pkSortKey(pkValue, skValue) {
  // Tuple encoding that preserves equality + lexicographic comparability.
  return `${pkValue}\u0000${skValue ?? ''}`;
}

export class EmulatorError extends Error {
  constructor(code, msg) { super(msg); this.code = code; this.name = 'EmulatorError'; }
}

export class Emulator {
  constructor(schema) {
    if (!schema?.tables) throw new EmulatorError('BAD_SCHEMA', 'schema.tables is required');
    this.schema = schema;
    /** @type {Map<string, Map<string, object>>}  table → (pkSortKey → item) */
    this.tables = new Map();
    /** @type {Map<string, Map<string, Map<string, Set<string>>>>}  table → index → (pkValue → Set<pkSortKey>) */
    this.indexes = new Map();

    for (const [name, def] of Object.entries(schema.tables)) {
      this._validateTableDef(name, def);
      this.tables.set(name, new Map());
      const ixMap = new Map();
      for (const ix of def.indexes) ixMap.set(ix.name, new Map());
      this.indexes.set(name, ixMap);
    }
  }

  // ---------------------------------------------------------------- validation

  _validateTableDef(name, def) {
    if (!def.partitionKey?.name)        throw new EmulatorError('BAD_PK', `${name}: missing partitionKey`);
    if (!ALLOWED_KEY_TYPES.includes(def.partitionKey.type))
      throw new EmulatorError('BAD_PK_TYPE', `${name}: partitionKey type must be one of ${ALLOWED_KEY_TYPES}`);
    if (def.sortKey && !ALLOWED_KEY_TYPES.includes(def.sortKey.type))
      throw new EmulatorError('BAD_SK_TYPE', `${name}: sortKey type must be one of ${ALLOWED_KEY_TYPES}`);
    if (!Array.isArray(def.indexes))    throw new EmulatorError('BAD_IX', `${name}: indexes must be array`);
    if (def.indexes.length > MAX_GSI_PER_TABLE)
      throw new EmulatorError('TOO_MANY_GSI', `${name}: at most ${MAX_GSI_PER_TABLE} GSIs allowed`);
    const ixNames = new Set();
    for (const ix of def.indexes) {
      if (!ix.name?.startsWith('gsi_'))
        throw new EmulatorError('BAD_IX_NAME', `${name}: index name '${ix.name}' must start with 'gsi_'`);
      if (ixNames.has(ix.name))
        throw new EmulatorError('DUP_IX_NAME', `${name}: duplicate index name '${ix.name}'`);
      ixNames.add(ix.name);
      if (!ix.partitionKey?.name)
        throw new EmulatorError('BAD_IX_PK', `${ix.name}: missing partitionKey`);
      if (!ALLOWED_KEY_TYPES.includes(ix.partitionKey.type))
        throw new EmulatorError('BAD_IX_PK_TYPE', `${ix.name}: bad PK type`);
      if (ix.sortKey && !ALLOWED_KEY_TYPES.includes(ix.sortKey.type))
        throw new EmulatorError('BAD_IX_SK_TYPE', `${ix.name}: bad SK type`);
    }
  }

  _enforceTypes(tableName, item) {
    const def = this.schema.tables[tableName];
    const pk = item[def.partitionKey.name];
    if (pk === undefined || pk === null)
      throw new EmulatorError('MISSING_PK', `${tableName}: partition key '${def.partitionKey.name}' is required`);
    if (typeOf(pk) !== def.partitionKey.type)
      throw new EmulatorError('TYPE_MISMATCH',
        `${tableName}.${def.partitionKey.name}: expected ${def.partitionKey.type}, got ${typeOf(pk)}`);
    if (def.sortKey) {
      const sk = item[def.sortKey.name];
      if (sk === undefined || sk === null)
        throw new EmulatorError('MISSING_SK', `${tableName}: sort key '${def.sortKey.name}' is required`);
      if (typeOf(sk) !== def.sortKey.type)
        throw new EmulatorError('TYPE_MISMATCH',
          `${tableName}.${def.sortKey.name}: expected ${def.sortKey.type}, got ${typeOf(sk)}`);
    }
    for (const attr of def.requiredAttrs ?? []) {
      if (item[attr] === undefined)
        throw new EmulatorError('MISSING_ATTR', `${tableName}: required attribute '${attr}' missing`);
    }
  }

  // ---------------------------------------------------------------- TTL purge

  _isExpired(tableName, item) {
    const ttlAttr = this.schema.tables[tableName].ttlAttr;
    if (!ttlAttr) return false;
    const exp = item[ttlAttr];
    return typeof exp === 'number' && exp <= now();
  }

  // ---------------------------------------------------------------- write API

  put(tableName, item) {
    const def = this.schema.tables[tableName];
    if (!def) throw new EmulatorError('NO_TABLE', `unknown table '${tableName}'`);
    this._enforceTypes(tableName, item);
    const pkVal = item[def.partitionKey.name];
    const skVal = def.sortKey ? item[def.sortKey.name] : null;
    const storeKey = pkSortKey(pkVal, skVal);

    const stored = JSON.parse(JSON.stringify(item)); // defensive deep copy
    const previous = this.tables.get(tableName).get(storeKey);
    this.tables.get(tableName).set(storeKey, stored);

    // Re-index: remove old GSI entries, then add new ones
    if (previous) this._unindex(tableName, previous, storeKey);
    this._index(tableName, stored, storeKey);
    return stored;
  }

  get(tableName, partitionValue, sortValue) {
    const def = this.schema.tables[tableName];
    if (!def) throw new EmulatorError('NO_TABLE', `unknown table '${tableName}'`);
    const storeKey = pkSortKey(partitionValue, def.sortKey ? sortValue : null);
    const item = this.tables.get(tableName).get(storeKey);
    if (!item) return null;
    if (this._isExpired(tableName, item)) {
      this.delete(tableName, partitionValue, sortValue);
      return null;
    }
    return JSON.parse(JSON.stringify(item));
  }

  delete(tableName, partitionValue, sortValue) {
    const def = this.schema.tables[tableName];
    if (!def) throw new EmulatorError('NO_TABLE', `unknown table '${tableName}'`);
    const storeKey = pkSortKey(partitionValue, def.sortKey ? sortValue : null);
    const item = this.tables.get(tableName).get(storeKey);
    if (!item) return false;
    this.tables.get(tableName).delete(storeKey);
    this._unindex(tableName, item, storeKey);
    return true;
  }

  // ---------------------------------------------------------------- indexing

  _index(tableName, item, storeKey) {
    const def = this.schema.tables[tableName];
    for (const ix of def.indexes) {
      const pkVal = item[ix.partitionKey.name];
      if (pkVal === undefined || pkVal === null) continue;       // sparse index
      const ixMap = this.indexes.get(tableName).get(ix.name);
      if (!ixMap.has(pkVal)) ixMap.set(pkVal, new Set());
      ixMap.get(pkVal).add(storeKey);
    }
  }

  _unindex(tableName, item, storeKey) {
    const def = this.schema.tables[tableName];
    for (const ix of def.indexes) {
      const pkVal = item[ix.partitionKey.name];
      if (pkVal === undefined || pkVal === null) continue;
      const bucket = this.indexes.get(tableName).get(ix.name).get(pkVal);
      if (bucket) {
        bucket.delete(storeKey);
        if (bucket.size === 0) this.indexes.get(tableName).get(ix.name).delete(pkVal);
      }
    }
  }

  // ---------------------------------------------------------------- query

  /**
   * @param {Object}    spec
   * @param {string}    spec.table
   * @param {string}   [spec.index]      — GSI name; omit to query base table by PK/SK
   * @param {Object}    spec.partition   — `{ <pkName>: value }`
   * @param {Object|null}[spec.sort]     — `{ <skName>: value }` (equality)
   *                                       or `{ <skName>: { op:'>=', value:42 } }`
   *                                       or `{ <skName>: { op:'BETWEEN', from:1, to:9 } }`
   *                                       or `{ <skName>: { op:'BEGINS_WITH', value:'2025-' } }`
   * @param {'ASC'|'DESC'}[spec.order='ASC']
   * @param {number}   [spec.limit]
   */
  query(spec) {
    const { table, index, partition, sort = null, order = 'ASC', limit = Infinity } = spec;
    const def = this.schema.tables[table];
    if (!def) throw new EmulatorError('NO_TABLE', `unknown table '${table}'`);

    let candidates;  // Array<item>
    let skName;

    if (index) {
      const ix = def.indexes.find(i => i.name === index);
      if (!ix) throw new EmulatorError('NO_INDEX', `index '${index}' not found on '${table}'`);
      const pkName = ix.partitionKey.name;
      const pkValue = partition?.[pkName];
      if (pkValue === undefined)
        throw new EmulatorError('MISSING_QUERY_PK', `query missing partition key '${pkName}'`);
      const bucket = this.indexes.get(table).get(index).get(pkValue) ?? new Set();
      candidates = [...bucket].map(k => this.tables.get(table).get(k)).filter(Boolean);
      skName = ix.sortKey?.name ?? null;
    } else {
      const pkName = def.partitionKey.name;
      const pkValue = partition?.[pkName];
      if (pkValue === undefined)
        throw new EmulatorError('MISSING_QUERY_PK', `query missing partition key '${pkName}'`);
      // Base-table PK scan: walk the partition by key prefix.
      const prefix = `${pkValue}\u0000`;
      candidates = [];
      for (const [k, v] of this.tables.get(table)) {
        if (k.startsWith(prefix)) candidates.push(v);
      }
      skName = def.sortKey?.name ?? null;
    }

    // Filter out expired
    candidates = candidates.filter(it => !this._isExpired(table, it));

    // Apply sort-key predicate
    if (sort && skName) {
      const skSpec = sort[skName];
      if (skSpec !== undefined) candidates = candidates.filter(it => matchSk(it[skName], skSpec));
    }

    // Sort
    if (skName) {
      candidates.sort((a, b) => cmp(a[skName], b[skName]) * (order === 'DESC' ? -1 : 1));
    }

    return candidates.slice(0, limit).map(it => JSON.parse(JSON.stringify(it)));
  }

  /**
   * Full table scan with optional filter callback.
   * Honours TTL purge. Use sparingly — O(n).
   */
  scan(tableName, filterFn) {
    const def = this.schema.tables[tableName];
    if (!def) throw new EmulatorError('NO_TABLE', `unknown table '${tableName}'`);
    const out = [];
    for (const item of this.tables.get(tableName).values()) {
      if (this._isExpired(tableName, item)) continue;
      if (!filterFn || filterFn(item)) out.push(JSON.parse(JSON.stringify(item)));
    }
    return out;
  }

  /** Returns count of stored items (excluding expired). */
  count(tableName) { return this.scan(tableName).length; }

  /** Introspect: list configured indexes for a table. */
  describeIndexes(tableName) {
    const def = this.schema.tables[tableName];
    if (!def) throw new EmulatorError('NO_TABLE', `unknown table '${tableName}'`);
    return def.indexes.map(ix => ({ ...ix }));
  }
}

function cmp(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function matchSk(value, spec) {
  if (typeof spec !== 'object' || spec === null) return value === spec;
  switch (spec.op) {
    case '=':           return value === spec.value;
    case '<':           return cmp(value, spec.value) <  0;
    case '<=':          return cmp(value, spec.value) <= 0;
    case '>':           return cmp(value, spec.value) >  0;
    case '>=':          return cmp(value, spec.value) >= 0;
    case 'BETWEEN':     return cmp(value, spec.from) >= 0 && cmp(value, spec.to) <= 0;
    case 'BEGINS_WITH': return typeof value === 'string' && value.startsWith(spec.value);
    default: throw new EmulatorError('BAD_OP', `unsupported sort-key op '${spec.op}'`);
  }
}
