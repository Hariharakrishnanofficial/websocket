/**
 * Canonical Catalyst NoSQL schema for the Robot WS Relay project.
 *
 * Source of truth: Document/CATALYST_NOSQL_TABLE_FIELDS.md §11 (Master Summary)
 * and §1–§10 (per-table sections). Any drift between this file and the MD
 * document is a test failure.
 *
 * Shape:
 *   tables[name] = {
 *     partitionKey:  { name, type },
 *     sortKey:       { name, type } | null,
 *     ttlAttr:       string | null,
 *     indexes:       Array<{ name, partitionKey:{name,type}, sortKey:{name,type}|null, attributeType:'All'|'KeysOnly'|'Include' }>,
 *     requiredAttrs: string[]      // attributes every item must define
 *   }
 */
export const SCHEMA = Object.freeze({
  tables: {
    cfg_environment: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_websocket: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_robot: {
      partitionKey: { name: 'robotId',       type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_robot_status',
          partitionKey: { name: 'status',    type: 'String' },
          sortKey:      { name: 'updatedAt', type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['robotId', 'configVersion', 'environment', 'active']
    },

    cfg_controller: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_feature_flags: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_telemetry: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_ota: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_ui: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_diagnostics: {
      partitionKey: { name: 'key',           type: 'String' },
      sortKey:      { name: 'configVersion', type: 'Number' },
      ttlAttr:      null,
      indexes: [
        {
          name: 'gsi_env_active',
          partitionKey: { name: 'environment', type: 'String' },
          sortKey:      { name: 'active',      type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['key', 'configVersion', 'environment', 'active']
    },

    cfg_audit_log: {
      partitionKey: { name: 'documentKey', type: 'String' },
      sortKey:      { name: 'timestamp',   type: 'String' },
      ttlAttr:      'expiresAt',
      indexes: [
        {
          name: 'gsi_audit_actor',
          partitionKey: { name: 'actor',     type: 'String' },
          sortKey:      { name: 'timestamp', type: 'String' },
          attributeType: 'All'
        },
        {
          name: 'gsi_audit_target',
          partitionKey: { name: 'collection', type: 'String' },
          sortKey:      { name: 'timestamp',  type: 'String' },
          attributeType: 'All'
        }
      ],
      requiredAttrs: ['documentKey', 'timestamp', 'actor', 'collection']
    }
  }
});

export const TABLE_NAMES = Object.freeze(Object.keys(SCHEMA.tables));

export const ALL_INDEXES = Object.freeze(
  TABLE_NAMES.flatMap(t =>
    SCHEMA.tables[t].indexes.map(ix => ({ table: t, ...ix }))
  )
);

/** Catalyst NoSQL allows max 5 GSIs per table. */
export const MAX_GSI_PER_TABLE = 5;

/** Allowed Catalyst attribute types for keys. */
export const ALLOWED_KEY_TYPES = Object.freeze(['String', 'Number', 'Boolean']);

/** Allowed projection / attribute-type values in the Create Index dialog. */
export const ALLOWED_ATTR_TYPES = Object.freeze(['All', 'KeysOnly', 'Include']);
