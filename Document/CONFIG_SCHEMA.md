# CONFIG_SCHEMA.md — Configuration Schema Reference

> **System**: Robot Control WebSocket Platform  
> **Storage Backend**: Zoho Catalyst Cloud Scale — NoSQL + Cache  
> **Last Updated**: June 2026  
> **Status**: Canonical specification — all config services MUST conform to this schema

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & Design Principles](#2-architecture--design-principles)
3. [Key Naming Convention](#3-key-naming-convention)
4. [Shared Schema Definitions](#4-shared-schema-definitions)
5. [Collection 1 — Environment Configuration](#5-collection-1--environment-configuration)
6. [Collection 2 — WebSocket Configuration](#6-collection-2--websocket-configuration)
7. [Collection 3 — Robot Instance Configuration](#7-collection-3--robot-instance-configuration)
8. [Collection 4 — Controller Defaults Configuration](#8-collection-4--controller-defaults-configuration)
9. [Collection 5 — Feature Flags](#9-collection-5--feature-flags)
10. [Collection 6 — Telemetry Configuration](#10-collection-6--telemetry-configuration)
11. [Collection 7 — OTA (Over-the-Air) Configuration](#11-collection-7--ota-over-the-air-configuration)
12. [Collection 8 — UI / PWA Settings](#12-collection-8--ui--pwa-settings)
13. [Collection 9 — Diagnostics Configuration](#13-collection-9--diagnostics-configuration)
14. [Collection 10 — Audit Log](#14-collection-10--audit-log)
15. [Versioning Strategy](#15-versioning-strategy)
16. [Inheritance Model](#16-inheritance-model)
17. [Secret Reference Pattern](#17-secret-reference-pattern)
18. [Indexing & Query Patterns](#18-indexing--query-patterns)
19. [Validation Rules & Constraints](#19-validation-rules--constraints)
20. [Environment Promotion Workflow](#20-environment-promotion-workflow)
21. [Cache Integration](#21-cache-integration)
22. [API Contract — Config CRUD](#22-api-contract--config-crud)
23. [Client SDK Usage](#23-client-sdk-usage)
24. [Migration & Seed Data](#24-migration--seed-data)
25. [JSON Schema Files](#25-json-schema-files)
26. [Cross-References](#26-cross-references)

---

## 1. Overview

The configuration schema defines how every runtime parameter of the robot-control system is stored, validated, versioned, and propagated across three layers:

```
┌──────────────────────┐         ┌─────────────────────────┐         ┌──────────────────┐
│  React Controller    │◄── C4 ──│  AppSail Relay (Node)   │── C3 ──►│  ESP32 Firmware  │
│  UI / PWA settings   │         │  WS config, env config  │         │  Robot instance  │
│  Feature flags       │         │  Telemetry, diagnostics │         │  OTA config      │
└──────────────────────┘         └─────────────────────────┘         └──────────────────┘
        ▲                                   ▲                                ▲
        │                                   │                                │
        └───────────────── NoSQL + Cache ────┘────────────────── NoSQL ───────┘
```

**Storage layer**: Zoho Catalyst NoSQL for persistent configuration documents. Catalyst Cache for hot secrets and frequently accessed values.

**Design goals**:
- Zero-downtime config changes via hot-reload
- Environment isolation (development → staging → production)
- Full audit trail for every mutation
- Schema validation before write
- Secret references instead of inline credentials

---

## 2. Architecture & Design Principles

### 2.1 Single Source of Truth
All configuration lives in Catalyst NoSQL. No environment variables, `.env` files, or hard-coded constants for runtime-tunable values. Environment variables are used **only** for bootstrap (Catalyst project ID, auth tokens to reach NoSQL).

### 2.2 Immutable Versions
Config documents are never updated in-place for critical changes. Instead, a new version is created (`configVersion` incremented). The active version is determined by the `active` flag. Previous versions are retained for rollback.

### 2.3 Fail-Safe Defaults
Every field has a documented default. If NoSQL is unreachable at boot, each layer falls back to compiled-in defaults that guarantee safe operation (robot stopped, reconnect enabled, conservative rate limits).

### 2.4 Separation of Concerns
Each collection maps to exactly one concern (environment, websocket, robot hardware, controller UX, etc.). No cross-cutting fields — shared constants live in `env.*` and are inherited.

### 2.5 Catalyst NoSQL Alignment
All schemas conform to Catalyst NoSQL capabilities:
- Documents stored as JSON objects in named collections
- Each document has a system-generated `_id` plus our composite `key` field
- Indexes on `key`, `environment`, `configVersion`, `active`
- Query via Catalyst NoSQL query syntax

---

## 3. Key Naming Convention

Every configuration document uses a hierarchical **dot-delimited key** as its primary identifier.

```
<domain>.<scope>.<identifier>
```

| Pattern | Example | Description |
|---------|---------|-------------|
| `env.<environment>` | `env.development` | Environment-level settings |
| `ws.<environment>` | `ws.production` | WebSocket settings per env |
| `robot.instance.<robotId>` | `robot.instance.esp32-alpha-01` | Per-robot hardware config |
| `controller.defaults.<environment>` | `controller.defaults.staging` | Controller defaults per env |
| `flags.<environment>` | `flags.production` | Feature flags per env |
| `telemetry.<environment>` | `telemetry.production` | Telemetry pipeline config |
| `ota.<environment>` | `ota.production` | OTA update settings |
| `ui.<environment>` | `ui.production` | UI/PWA frontend settings |
| `diagnostics.<environment>` | `diagnostics.development` | Debug & diagnostics config |

**Rules**:
- Lowercase only, alphanumeric + hyphens within segments
- Maximum 3 segments (domain.scope.id)
- `<environment>` is one of: `development`, `staging`, `production`
- `<robotId>` follows pattern: `esp32-<name>-<nn>` (e.g., `esp32-alpha-01`)

---

## 4. Shared Schema Definitions

### 4.1 Audit Fields (required on every document)

Every configuration document MUST include these audit fields:

```json
{
  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial configuration",
  "lastDeployedAt": null,
  "deployedBy": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `configVersion` | Integer | ✅ | Monotonically increasing version number |
| `active` | Boolean | ✅ | Whether this version is the currently active one |
| `createdAt` | DateTime (ISO 8601) | ✅ | Document creation timestamp |
| `createdBy` | String (email) | ✅ | Identity of the creator |
| `updatedAt` | DateTime (ISO 8601) | ✅ | Last modification timestamp |
| `updatedBy` | String (email) | ✅ | Identity of last modifier |
| `changeReason` | String (max 500 chars) | ✅ | Human-readable reason for the change |
| `lastDeployedAt` | DateTime / null | ❌ | When this config was last deployed to target env |
| `deployedBy` | String / null | ❌ | Identity of deployer |

### 4.2 Secret Reference Type

Credentials are never stored inline. Instead, a reference key points to Catalyst Cache:

```json
{
  "type": "secretRef",
  "cacheSegment": "secrets",
  "cacheKey": "robot-token-esp32-alpha-01",
  "rotateAfterDays": 90
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"secretRef"` (literal) | Discriminator — identifies this as a cache reference |
| `cacheSegment` | String | Catalyst Cache segment name |
| `cacheKey` | String | Key within the cache segment |
| `rotateAfterDays` | Integer / null | Auto-rotation policy in days (null = manual) |

### 4.3 Environment Enum

```json
{
  "enum": ["development", "staging", "production"]
}
```

---

## 5. Collection 1 — Environment Configuration

**Collection name**: `cfg_environment`  
**Key pattern**: `env.<environment>`  
**Purpose**: Top-level environment metadata. All other collections reference this.

### Full Schema

```json
{
  "key": "env.production",
  "environment": "production",
  "displayName": "Production",
  "catalystProjectId": "4000000006007",
  "datacenter": "US",
  "region": "us-east-1",

  "urls": {
    "publicBaseUrl": "https://robotcontrol.example.com",
    "wsBaseUrl": "wss://robotcontrol.example.com/ws",
    "apiBaseUrl": "https://robotcontrol.example.com/api/v1",
    "healthCheckUrl": "https://robotcontrol.example.com/health"
  },

  "logging": {
    "level": "warn",
    "structured": true,
    "sampleRate": 0.1,
    "excludePatterns": ["heartbeat", "ping/pong"]
  },

  "security": {
    "isProductionSafe": true,
    "requireTokenAuth": true,
    "corsAllowedOrigins": ["https://robotcontrol.example.com"],
    "rateLimitGlobal": {
      "requestsPerMinute": 1000,
      "burstSize": 50
    }
  },

  "inheritsFrom": null,

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial production environment setup",
  "lastDeployedAt": "2026-06-01T14:00:00.000Z",
  "deployedBy": "admin@example.com"
}
```

### Field Reference

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `key` | String | ✅ | — | Pattern: `env\.(development|staging|production)` |
| `environment` | Enum | ✅ | — | `development` \| `staging` \| `production` |
| `displayName` | String | ✅ | — | Max 50 chars |
| `catalystProjectId` | String | ✅ | — | Catalyst project ID (numeric string) |
| `datacenter` | String | ✅ | `"US"` | One of: `US`, `EU`, `AU`, `IN`, `CA` |
| `region` | String | ❌ | `null` | Datacenter sub-region |
| `urls.publicBaseUrl` | String (URL) | ✅ | — | Must start with `https://` in production |
| `urls.wsBaseUrl` | String (URL) | ✅ | — | Must start with `wss://` in production |
| `urls.apiBaseUrl` | String (URL) | ✅ | — | Must start with `https://` in production |
| `urls.healthCheckUrl` | String (URL) | ❌ | derived | Defaults to `{publicBaseUrl}/health` |
| `logging.level` | Enum | ✅ | `"info"` | `debug` \| `info` \| `warn` \| `error` |
| `logging.structured` | Boolean | ❌ | `true` | JSON-structured logs |
| `logging.sampleRate` | Float | ❌ | `1.0` | 0.0–1.0, fraction of requests to log |
| `logging.excludePatterns` | Array[String] | ❌ | `[]` | Log messages matching these are suppressed |
| `security.isProductionSafe` | Boolean | ✅ | `false` | `true` only for production |
| `security.requireTokenAuth` | Boolean | ✅ | `true` | Enforce token auth on WS connections |
| `security.corsAllowedOrigins` | Array[String] | ❌ | `["*"]` | Empty array = all blocked; `["*"]` = open |
| `security.rateLimitGlobal.requestsPerMinute` | Integer | ❌ | `1000` | Min: 10, Max: 10000 |
| `security.rateLimitGlobal.burstSize` | Integer | ❌ | `50` | Min: 1, Max: 500 |
| `inheritsFrom` | String / null | ❌ | `null` | Key of parent env config for inheritance |

### Validation Rules

1. **Production safety**: If `environment === "production"`, then `security.isProductionSafe` MUST be `true` and all URLs MUST use `https://` / `wss://`.
2. **No self-inheritance**: `inheritsFrom` MUST NOT equal `key`.
3. **No circular inheritance**: The inheritance chain must terminate (max depth: 3).
4. **Unique active version**: Only one document per `key` may have `active: true`.

---

## 6. Collection 2 — WebSocket Configuration

**Collection name**: `cfg_websocket`  
**Key pattern**: `ws.<environment>`  
**Purpose**: All WebSocket server parameters for the AppSail Relay (Layer 2).

### Full Schema

```json
{
  "key": "ws.production",
  "environment": "production",

  "endpoints": {
    "primaryPath": "/ws",
    "fallbackPath": "/",
    "videoPath": "/video"
  },

  "rateLimit": {
    "commandsPerSecond": 50,
    "burst": 10,
    "windowMs": 1000,
    "penaltyAction": "drop"
  },

  "dedupe": {
    "serverWindowMs": 200,
    "clientWindowMs": 250,
    "bypassCommands": ["S"]
  },

  "heartbeat": {
    "controllerIntervalMs": 300,
    "serverPingIntervalMs": 30000,
    "pongTimeoutMs": 10000,
    "missedPongsBeforeKill": 1
  },

  "registration": {
    "timeoutMs": 5000,
    "tokenRequired": true,
    "robotTokenRef": {
      "type": "secretRef",
      "cacheSegment": "secrets",
      "cacheKey": "ws-robot-token-prod",
      "rotateAfterDays": 90
    },
    "controllerTokenRef": {
      "type": "secretRef",
      "cacheSegment": "secrets",
      "cacheKey": "ws-controller-token-prod",
      "rotateAfterDays": 90
    }
  },

  "payload": {
    "maxCommandBytes": 1,
    "maxFrameBytes": 4096,
    "maxJsonEnvelopeBytes": 256,
    "encoding": "utf-8"
  },

  "connection": {
    "maxControllers": 10,
    "maxRobots": 1,
    "robotReplacementPolicy": "kick-previous",
    "idleTimeoutMs": 300000
  },

  "allowedOrigins": [
    "https://robotcontrol.example.com"
  ],

  "tls": {
    "required": true,
    "minVersion": "TLSv1.2"
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial WebSocket configuration"
}
```

### Field Reference

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `endpoints.primaryPath` | String | ✅ | `"/ws"` | Must start with `/` |
| `endpoints.fallbackPath` | String | ❌ | `"/"` | Must start with `/` |
| `endpoints.videoPath` | String | ❌ | `"/video"` | Must start with `/` |
| `rateLimit.commandsPerSecond` | Integer | ✅ | `50` | Min: 1, Max: 200 |
| `rateLimit.burst` | Integer | ✅ | `10` | Min: 1, Max: 50 |
| `rateLimit.windowMs` | Integer | ❌ | `1000` | Sliding window size in ms |
| `rateLimit.penaltyAction` | Enum | ❌ | `"drop"` | `drop` \| `throttle` \| `disconnect` |
| `dedupe.serverWindowMs` | Integer | ✅ | `200` | Must be < `heartbeat.controllerIntervalMs` |
| `dedupe.clientWindowMs` | Integer | ✅ | `250` | Must be < `heartbeat.controllerIntervalMs` |
| `dedupe.bypassCommands` | Array[String] | ❌ | `["S"]` | Commands exempt from deduplication |
| `heartbeat.controllerIntervalMs` | Integer | ✅ | `300` | Min: 100, Max: 5000 |
| `heartbeat.serverPingIntervalMs` | Integer | ✅ | `30000` | Min: 5000, Max: 120000 |
| `heartbeat.pongTimeoutMs` | Integer | ❌ | `10000` | Time to wait for pong |
| `heartbeat.missedPongsBeforeKill` | Integer | ❌ | `1` | Min: 1, Max: 5 |
| `registration.timeoutMs` | Integer | ✅ | `5000` | Min: 1000, Max: 30000 |
| `registration.tokenRequired` | Boolean | ✅ | `true` | — |
| `registration.robotTokenRef` | SecretRef | Conditional | — | Required if `tokenRequired: true` |
| `registration.controllerTokenRef` | SecretRef | Conditional | — | Required if `tokenRequired: true` |
| `payload.maxCommandBytes` | Integer | ✅ | `1` | Fixed: single ASCII byte |
| `payload.maxFrameBytes` | Integer | ✅ | `4096` | Min: 64, Max: 65536 |
| `payload.maxJsonEnvelopeBytes` | Integer | ❌ | `256` | For JSON-wrapped commands |
| `payload.encoding` | String | ❌ | `"utf-8"` | — |
| `connection.maxControllers` | Integer | ❌ | `10` | Min: 1, Max: 100 |
| `connection.maxRobots` | Integer | ❌ | `1` | Currently fixed at 1 |
| `connection.robotReplacementPolicy` | Enum | ❌ | `"kick-previous"` | `kick-previous` \| `reject-new` |
| `connection.idleTimeoutMs` | Integer | ❌ | `300000` | 0 = no idle timeout |
| `allowedOrigins` | Array[String] | ❌ | `["*"]` | Empty = block all; `["*"]` = open |
| `tls.required` | Boolean | ❌ | `true` | Must be `true` in production |
| `tls.minVersion` | String | ❌ | `"TLSv1.2"` | — |

### Timing Invariant (MUST be enforced)

```
dedupe.clientWindowMs < heartbeat.controllerIntervalMs < firmware.commandTimeoutMs

        250 ms          <         300 ms                <       750 ms
```

Violation of this invariant will either:
- **Drop heartbeats** (robot stops mid-hold) — if dedupe ≥ heartbeat
- **Disable the watchdog** (robot runs forever on lost connection) — if heartbeat ≥ timeout

The config validation layer MUST reject any write that breaks this invariant.

---

## 7. Collection 3 — Robot Instance Configuration

**Collection name**: `cfg_robot`  
**Key pattern**: `robot.instance.<robotId>`  
**Purpose**: Per-robot hardware, networking, and motion parameters (Layer 3 — ESP32).

### Full Schema

```json
{
  "key": "robot.instance.esp32-alpha-01",
  "robotId": "esp32-alpha-01",
  "environment": "development",

  "hardware": {
    "model": "ESP32-WROOM-32",
    "chipRevision": "v3",
    "flashSizeMB": 4,
    "firmwareSlot": "A",
    "firmwareVersion": "1.2.0",
    "boardLayout": "custom-l298n-4pin"
  },

  "wifi": {
    "ssidRef": {
      "type": "secretRef",
      "cacheSegment": "secrets",
      "cacheKey": "wifi-ssid-alpha-01",
      "rotateAfterDays": null
    },
    "passwordRef": {
      "type": "secretRef",
      "cacheSegment": "secrets",
      "cacheKey": "wifi-password-alpha-01",
      "rotateAfterDays": 180
    },
    "staticIp": null,
    "dns": "8.8.8.8",
    "reconnectBackoffMs": 2000,
    "reconnectMaxMs": 30000
  },

  "websocket": {
    "serverUrl": "wss://robotcontrol.example.com/ws",
    "tokenRef": {
      "type": "secretRef",
      "cacheSegment": "secrets",
      "cacheKey": "robot-token-esp32-alpha-01",
      "rotateAfterDays": 90
    },
    "reconnectBaseMs": 2000,
    "reconnectMaxMs": 30000,
    "registrationJson": {
      "type": "robot",
      "id": "esp32-alpha-01"
    }
  },

  "motion": {
    "driverType": "L298N",
    "pins": {
      "motorA": {
        "in1": 27,
        "in2": 26,
        "enable": 14
      },
      "motorB": {
        "in1": 25,
        "in2": 33,
        "enable": 32
      }
    },
    "speedLimit": 0.8,
    "defaultSpeed": 255,
    "rampUpMs": 50,
    "emergencyStopPinLow": true
  },

  "watchdog": {
    "commandTimeoutMs": 750,
    "enabled": true,
    "action": "stop"
  },

  "status": {
    "reportIntervalMs": 30000,
    "includeHeapFree": true,
    "includeWifiRssi": true,
    "includeUptimeSeconds": true
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial robot registration"
}
```

### Field Reference

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `robotId` | String | ✅ | — | Pattern: `esp32-[a-z]+-\d{2}` |
| `environment` | Enum | ✅ | — | dev/staging/prod |
| `hardware.model` | String | ✅ | — | e.g., `ESP32-WROOM-32`, `ESP32-S3` |
| `hardware.chipRevision` | String | ❌ | `null` | — |
| `hardware.flashSizeMB` | Integer | ❌ | `4` | 2, 4, 8, 16 |
| `hardware.firmwareSlot` | String | ✅ | `"A"` | `A` or `B` (for A/B OTA) |
| `hardware.firmwareVersion` | String | ✅ | `"0.0.0"` | SemVer format |
| `hardware.boardLayout` | String | ❌ | `null` | Custom identifier for pin mapping |
| `wifi.ssidRef` | SecretRef | ✅ | — | Reference to cached SSID |
| `wifi.passwordRef` | SecretRef | ✅ | — | Reference to cached password |
| `wifi.staticIp` | String / null | ❌ | `null` | IPv4 or null for DHCP |
| `wifi.dns` | String | ❌ | `"8.8.8.8"` | DNS server IPv4 |
| `wifi.reconnectBackoffMs` | Integer | ❌ | `2000` | Base backoff for WiFi reconnect |
| `wifi.reconnectMaxMs` | Integer | ❌ | `30000` | Max backoff cap |
| `websocket.serverUrl` | String (URL) | ✅ | — | Must match `env.*.urls.wsBaseUrl` |
| `websocket.tokenRef` | SecretRef | ✅ | — | Registration token |
| `websocket.reconnectBaseMs` | Integer | ❌ | `2000` | — |
| `websocket.reconnectMaxMs` | Integer | ❌ | `30000` | Capped backoff |
| `websocket.registrationJson` | Object | ✅ | — | Sent on WS connect |
| `motion.driverType` | String | ✅ | `"L298N"` | Motor driver IC |
| `motion.pins` | Object | ✅ | — | GPIO pin map (see sub-schema) |
| `motion.speedLimit` | Float | ✅ | `1.0` | 0.0–1.0, multiplier on PWM |
| `motion.defaultSpeed` | Integer | ❌ | `255` | PWM value 0–255 |
| `motion.rampUpMs` | Integer | ❌ | `0` | Gradual speed ramp (0 = instant) |
| `motion.emergencyStopPinLow` | Boolean | ❌ | `true` | Drive all pins LOW on emergency |
| `watchdog.commandTimeoutMs` | Integer | ✅ | `750` | Min: 500, Max: 5000 |
| `watchdog.enabled` | Boolean | ❌ | `true` | — |
| `watchdog.action` | Enum | ❌ | `"stop"` | `stop` \| `brake` \| `coast` |
| `status.reportIntervalMs` | Integer | ❌ | `30000` | 0 = disabled |
| `status.includeHeapFree` | Boolean | ❌ | `true` | — |
| `status.includeWifiRssi` | Boolean | ❌ | `true` | — |
| `status.includeUptimeSeconds` | Boolean | ❌ | `true` | — |

### Motor Pin Sub-Schema

```json
{
  "motorA": {
    "in1": { "type": "integer", "minimum": 0, "maximum": 39, "description": "GPIO pin" },
    "in2": { "type": "integer", "minimum": 0, "maximum": 39 },
    "enable": { "type": "integer", "minimum": 0, "maximum": 39, "description": "PWM enable pin (optional for some drivers)" }
  },
  "motorB": {
    "in1": { "type": "integer", "minimum": 0, "maximum": 39 },
    "in2": { "type": "integer", "minimum": 0, "maximum": 39 },
    "enable": { "type": "integer", "minimum": 0, "maximum": 39 }
  }
}
```

**Validation**: All 6 pin values MUST be unique (no two fields share the same GPIO).

---

## 8. Collection 4 — Controller Defaults Configuration

**Collection name**: `cfg_controller`  
**Key pattern**: `controller.defaults.<environment>`  
**Purpose**: Default settings for React Controller clients (Layer 1).

### Full Schema

```json
{
  "key": "controller.defaults.production",
  "environment": "production",

  "websocket": {
    "url": "wss://robotcontrol.example.com/ws",
    "controllerTokenRef": {
      "type": "secretRef",
      "cacheSegment": "secrets",
      "cacheKey": "ws-controller-token-prod",
      "rotateAfterDays": 90
    }
  },

  "heartbeat": {
    "intervalMs": 300,
    "dedupeMs": 250
  },

  "reconnect": {
    "enabled": true,
    "baseDelayMs": 1000,
    "maxDelayMs": 8000,
    "maxAttempts": 0,
    "backoffMultiplier": 2.0
  },

  "commands": {
    "validCommands": ["F", "B", "L", "R", "S"],
    "stopCommand": "S",
    "stopAlwaysForwarded": true
  },

  "input": {
    "keyboardEnabled": true,
    "touchEnabled": true,
    "gamepadEnabled": false,
    "keyMap": {
      "ArrowUp": "F",
      "ArrowDown": "B",
      "ArrowLeft": "L",
      "ArrowRight": "R",
      "w": "F",
      "s": "B",
      "a": "L",
      "d": "R",
      " ": "S"
    },
    "touchDeadZonePx": 10,
    "longPressThresholdMs": 0
  },

  "display": {
    "showDebugPanel": false,
    "maxLogLines": 100,
    "showLatencyIndicator": true,
    "showConnectionBadge": true,
    "theme": "dark"
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial controller defaults"
}
```

### Field Reference

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `websocket.url` | String (URL) | ✅ | — | Must match env WS URL |
| `websocket.controllerTokenRef` | SecretRef | Conditional | — | Required if env `requireTokenAuth: true` |
| `heartbeat.intervalMs` | Integer | ✅ | `300` | Must align with WS config timing invariant |
| `heartbeat.dedupeMs` | Integer | ✅ | `250` | Must be < `heartbeat.intervalMs` |
| `reconnect.enabled` | Boolean | ✅ | `true` | — |
| `reconnect.baseDelayMs` | Integer | ❌ | `1000` | Min: 100 |
| `reconnect.maxDelayMs` | Integer | ❌ | `8000` | Max: 60000 |
| `reconnect.maxAttempts` | Integer | ❌ | `0` | 0 = unlimited |
| `reconnect.backoffMultiplier` | Float | ❌ | `2.0` | 1.0–4.0 |
| `commands.validCommands` | Array[String] | ✅ | `["F","B","L","R","S"]` | — |
| `commands.stopCommand` | String | ✅ | `"S"` | Must be in `validCommands` |
| `commands.stopAlwaysForwarded` | Boolean | ❌ | `true` | Never dedupe STOP |
| `input.keyboardEnabled` | Boolean | ❌ | `true` | — |
| `input.touchEnabled` | Boolean | ❌ | `true` | — |
| `input.gamepadEnabled` | Boolean | ❌ | `false` | Future: Gamepad API |
| `input.keyMap` | Object | ❌ | (see schema) | Key event → command mapping |
| `input.touchDeadZonePx` | Integer | ❌ | `10` | — |
| `display.showDebugPanel` | Boolean | ❌ | `false` | `true` in development only |
| `display.maxLogLines` | Integer | ❌ | `100` | Min: 10, Max: 1000 |
| `display.showLatencyIndicator` | Boolean | ❌ | `true` | — |
| `display.showConnectionBadge` | Boolean | ❌ | `true` | — |
| `display.theme` | Enum | ❌ | `"dark"` | `dark` \| `light` \| `system` |

---

## 9. Collection 5 — Feature Flags

**Collection name**: `cfg_feature_flags`  
**Key pattern**: `flags.<environment>`  
**Purpose**: Runtime feature toggles that can enable/disable features without redeployment.

### Full Schema

```json
{
  "key": "flags.production",
  "environment": "production",

  "flags": {
    "enableVideoStream": {
      "enabled": false,
      "description": "Enable video streaming endpoint",
      "rolloutPercentage": 0,
      "enabledForRobots": [],
      "enabledForUsers": [],
      "expiresAt": null
    },
    "enableTelemetryDashboard": {
      "enabled": true,
      "description": "Show telemetry data in controller UI",
      "rolloutPercentage": 100,
      "enabledForRobots": [],
      "enabledForUsers": [],
      "expiresAt": null
    },
    "enableGamepadInput": {
      "enabled": false,
      "description": "Gamepad API support in controller",
      "rolloutPercentage": 0,
      "enabledForRobots": [],
      "enabledForUsers": [],
      "expiresAt": null
    },
    "enableOtaUpdates": {
      "enabled": false,
      "description": "Over-the-air firmware updates",
      "rolloutPercentage": 0,
      "enabledForRobots": ["esp32-alpha-01"],
      "enabledForUsers": [],
      "expiresAt": "2026-12-31T23:59:59Z"
    },
    "enableAdvancedDiagnostics": {
      "enabled": true,
      "description": "Extended diagnostic data collection",
      "rolloutPercentage": 50,
      "enabledForRobots": [],
      "enabledForUsers": [],
      "expiresAt": null
    }
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial feature flags"
}
```

### Flag Object Sub-Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | Boolean | ✅ | `false` | Master toggle |
| `description` | String | ✅ | — | Human-readable description |
| `rolloutPercentage` | Integer | ❌ | `100` | 0–100, percentage of traffic |
| `enabledForRobots` | Array[String] | ❌ | `[]` | Robot IDs with explicit access |
| `enabledForUsers` | Array[String] | ❌ | `[]` | User emails with explicit access |
| `expiresAt` | DateTime / null | ❌ | `null` | Auto-disable after this time |

### Evaluation Logic

```
isEnabled(flagName, context):
  flag = flags[flagName]
  if !flag.enabled → false
  if flag.expiresAt && now > flag.expiresAt → false
  if context.robotId in flag.enabledForRobots → true
  if context.userId in flag.enabledForUsers → true
  if hash(context.sessionId) % 100 < flag.rolloutPercentage → true
  return false
```

---

## 10. Collection 6 — Telemetry Configuration

**Collection name**: `cfg_telemetry`  
**Key pattern**: `telemetry.<environment>`  
**Purpose**: Controls what telemetry data is collected, how it's stored, and retention policies.

### Full Schema

```json
{
  "key": "telemetry.production",
  "environment": "production",

  "collection": {
    "enabled": true,
    "intervalMs": 5000,
    "metrics": {
      "commandLatencyMs": true,
      "wsFrameCount": true,
      "wsReconnectCount": true,
      "robotHeapFree": true,
      "robotWifiRssi": true,
      "robotUptimeSeconds": true,
      "relayActiveConnections": true,
      "relayCommandsPerSecond": true,
      "dedupeDropCount": true,
      "rateLimitHitCount": true
    }
  },

  "storage": {
    "backend": "catalyst-datastore",
    "tableName": "telemetry_events",
    "batchSize": 50,
    "flushIntervalMs": 10000,
    "retentionDays": 30,
    "archiveToStratus": true,
    "stratusBucket": "telemetry-archive"
  },

  "alerting": {
    "enabled": true,
    "rules": [
      {
        "metric": "commandLatencyMs",
        "condition": "avg > 500",
        "windowMinutes": 5,
        "action": "email",
        "recipient": "ops@example.com"
      },
      {
        "metric": "robotWifiRssi",
        "condition": "min < -80",
        "windowMinutes": 1,
        "action": "email",
        "recipient": "ops@example.com"
      }
    ]
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial telemetry configuration"
}
```

### Field Reference

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `collection.enabled` | Boolean | ✅ | `true` | — |
| `collection.intervalMs` | Integer | ❌ | `5000` | Min: 1000, Max: 60000 |
| `collection.metrics.*` | Boolean | ❌ | `true` | Toggle individual metrics |
| `storage.backend` | Enum | ✅ | `"catalyst-datastore"` | `catalyst-datastore` \| `catalyst-nosql` |
| `storage.tableName` | String | ✅ | `"telemetry_events"` | — |
| `storage.batchSize` | Integer | ❌ | `50` | Min: 1, Max: 200 |
| `storage.flushIntervalMs` | Integer | ❌ | `10000` | Min: 1000 |
| `storage.retentionDays` | Integer | ❌ | `30` | 0 = unlimited |
| `storage.archiveToStratus` | Boolean | ❌ | `false` | Archive before deletion |
| `storage.stratusBucket` | String | Conditional | — | Required if `archiveToStratus: true` |
| `alerting.enabled` | Boolean | ❌ | `false` | — |
| `alerting.rules` | Array[AlertRule] | Conditional | `[]` | Required if `alerting.enabled: true` |

---

## 11. Collection 7 — OTA (Over-the-Air) Configuration

**Collection name**: `cfg_ota`  
**Key pattern**: `ota.<environment>`  
**Purpose**: Firmware update delivery settings for ESP32 robots.

### Full Schema

```json
{
  "key": "ota.production",
  "environment": "production",

  "enabled": false,

  "server": {
    "firmwareBucket": "firmware-releases",
    "manifestPath": "manifest.json",
    "checksumAlgorithm": "sha256"
  },

  "policy": {
    "autoUpdate": false,
    "requireApproval": true,
    "updateWindowCron": "0 2 * * 0",
    "maxConcurrentUpdates": 1,
    "rollbackOnFailure": true,
    "maxRetries": 3
  },

  "targetSelector": {
    "allRobots": false,
    "robotIds": ["esp32-alpha-01"],
    "firmwareVersionBelow": "1.2.0",
    "targetVersion": "1.3.0"
  },

  "notification": {
    "notifyOnStart": true,
    "notifyOnComplete": true,
    "notifyOnFailure": true,
    "recipients": ["ops@example.com"]
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial OTA configuration - disabled"
}
```

### Field Reference

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `enabled` | Boolean | ✅ | `false` | Master toggle for OTA |
| `server.firmwareBucket` | String | ✅ | — | Stratus bucket name |
| `server.manifestPath` | String | ❌ | `"manifest.json"` | Path in bucket |
| `server.checksumAlgorithm` | Enum | ❌ | `"sha256"` | `sha256` \| `md5` |
| `policy.autoUpdate` | Boolean | ❌ | `false` | Auto-push to robots |
| `policy.requireApproval` | Boolean | ❌ | `true` | Manual approval step |
| `policy.updateWindowCron` | String (cron) | ❌ | `null` | Allowed update window |
| `policy.maxConcurrentUpdates` | Integer | ❌ | `1` | Min: 1 |
| `policy.rollbackOnFailure` | Boolean | ❌ | `true` | Revert on failed update |
| `policy.maxRetries` | Integer | ❌ | `3` | Min: 0, Max: 10 |
| `targetSelector.allRobots` | Boolean | ❌ | `false` | Target all registered robots |
| `targetSelector.robotIds` | Array[String] | Conditional | `[]` | Required if `allRobots: false` |
| `targetSelector.firmwareVersionBelow` | String (SemVer) | ❌ | `null` | Only target older versions |
| `targetSelector.targetVersion` | String (SemVer) | ✅ | — | Version to deploy |

---

## 12. Collection 8 — UI / PWA Settings

**Collection name**: `cfg_ui`  
**Key pattern**: `ui.<environment>`  
**Purpose**: Frontend presentation, PWA manifest, and user experience settings.

### Full Schema

```json
{
  "key": "ui.production",
  "environment": "production",

  "pwa": {
    "enabled": true,
    "appName": "Robot Controller",
    "shortName": "RobotCtrl",
    "description": "Real-time robot control interface",
    "themeColor": "#1a1a2e",
    "backgroundColor": "#16213e",
    "display": "standalone",
    "orientation": "portrait",
    "startUrl": "/",
    "scope": "/",
    "iconSizes": [72, 96, 128, 144, 152, 192, 384, 512]
  },

  "layout": {
    "controlPadPosition": "bottom",
    "controlPadSize": "large",
    "showHeader": true,
    "showFooter": false,
    "compactMode": false,
    "statusBarPosition": "top"
  },

  "branding": {
    "logoUrl": "/assets/logo.svg",
    "faviconUrl": "/assets/favicon.ico",
    "primaryColor": "#e94560",
    "secondaryColor": "#0f3460",
    "accentColor": "#533483",
    "fontFamily": "Inter, system-ui, sans-serif"
  },

  "accessibility": {
    "highContrastMode": false,
    "reducedMotion": false,
    "hapticFeedback": true,
    "audioFeedback": false,
    "largeButtons": false,
    "screenReaderHints": true
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial UI configuration"
}
```

---

## 13. Collection 9 — Diagnostics Configuration

**Collection name**: `cfg_diagnostics`  
**Key pattern**: `diagnostics.<environment>`  
**Purpose**: Debug, profiling, and diagnostic data collection settings.

### Full Schema

```json
{
  "key": "diagnostics.development",
  "environment": "development",

  "debug": {
    "enabled": true,
    "verboseWsFrames": true,
    "logAllCommands": true,
    "logTimingBreakdown": true,
    "logDedupeDecisions": true,
    "logRateLimitEvents": true
  },

  "profiling": {
    "enabled": false,
    "cpuProfileIntervalMs": 60000,
    "heapSnapshotOnOom": true,
    "traceWsLatency": true
  },

  "healthCheck": {
    "enabled": true,
    "intervalMs": 30000,
    "endpoint": "/health",
    "includeDetails": true,
    "checks": ["websocket", "nosql", "cache", "memory"]
  },

  "errorReporting": {
    "enabled": true,
    "captureUnhandledRejections": true,
    "captureUncaughtExceptions": true,
    "stackTraceLimit": 20,
    "sanitizeSecrets": true,
    "reportToMail": false,
    "reportRecipient": null
  },

  "configVersion": 1,
  "active": true,
  "createdAt": "2026-06-01T12:00:00.000Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial diagnostics - development verbose mode"
}
```

---

## 14. Collection 10 — Audit Log

**Collection name**: `cfg_audit_log`  
**Key pattern**: `audit.<timestamp>.<collection>.<key>`  
**Purpose**: Immutable log of all configuration changes.

### Schema

```json
{
  "key": "audit.2026-06-01T12:00:00Z.cfg_websocket.ws.production",
  "timestamp": "2026-06-01T12:00:00.000Z",

  "action": "update",
  "collection": "cfg_websocket",
  "documentKey": "ws.production",
  "previousVersion": 1,
  "newVersion": 2,

  "actor": {
    "email": "admin@example.com",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0"
  },

  "changes": [
    {
      "path": "rateLimit.commandsPerSecond",
      "oldValue": 50,
      "newValue": 75
    }
  ],

  "changeReason": "Increased rate limit for multi-robot testing",
  "approvedBy": "lead@example.com",
  "deployedAt": null
}
```

### Actions

| Action | Description |
|--------|-------------|
| `create` | New config document created |
| `update` | Existing document modified (new version) |
| `activate` | Version made active |
| `deactivate` | Version deactivated |
| `rollback` | Active version reverted to previous |
| `delete` | Document soft-deleted |
| `promote` | Config promoted to higher environment |

### Retention
- **Development**: 90 days
- **Staging**: 180 days
- **Production**: 365 days (archived to Stratus after retention)

---

## 15. Versioning Strategy

### Rules

1. Every config document carries a `configVersion` (positive integer, starts at 1).
2. Mutations create a **new document** with `configVersion + 1` and `active: true`.
3. The previous version is updated to `active: false` (atomic swap).
4. Rollback = set an older version's `active: true` and current version's `active: false`.
5. Maximum retained versions per key: **10**. Oldest inactive versions are pruned by a Cron job.

### Version Lifecycle

```
  v1 (active) ──── mutation ────► v1 (inactive)
                                  v2 (active)
                                  
  v2 (active) ──── mutation ────► v1 (inactive)
                                  v2 (inactive)
                                  v3 (active)

  v3 (active) ──── rollback ───► v1 (inactive)
                                  v2 (active)    ◄── restored
                                  v3 (inactive)
```

### ZCQL Queries for Version Management

```sql
-- Get active config for a key
SELECT * FROM cfg_websocket WHERE key = 'ws.production' AND active = true

-- Get version history
SELECT configVersion, updatedAt, updatedBy, changeReason 
FROM cfg_websocket WHERE key = 'ws.production' ORDER BY configVersion DESC

-- Find all active configs for an environment
SELECT * FROM cfg_environment WHERE environment = 'production' AND active = true
```

---

## 16. Inheritance Model

Some configuration collections support **environment inheritance** to reduce duplication.

### How It Works

```
env.development (base)
  └─── env.staging (inheritsFrom: "env.development")
         └─── env.production (inheritsFrom: "env.staging")
```

### Resolution Algorithm

```
resolveConfig(key, environment):
  doc = loadActive(key)
  if doc.inheritsFrom:
    parent = resolveConfig(doc.inheritsFrom)    // recursive
    return deepMerge(parent, doc)               // doc fields override parent
  return doc
```

### Rules

1. **Max depth**: 3 levels of inheritance.
2. **Field-level override**: Child fields completely replace parent fields (no partial merge within nested objects).
3. **Explicit null**: Setting a field to `null` in the child clears the inherited value.
4. **No cross-collection inheritance**: `ws.*` cannot inherit from `env.*`.
5. **Collections supporting inheritance**: `cfg_environment`, `cfg_controller`, `cfg_diagnostics`.
6. **Collections NOT supporting inheritance**: `cfg_robot` (instance-specific), `cfg_audit_log` (immutable).

---

## 17. Secret Reference Pattern

### Why References, Not Values

Storing secrets directly in NoSQL documents creates:
- **Exposure risk**: Anyone with NoSQL read access sees credentials
- **Rotation complexity**: Must find and update every document containing the secret
- **Audit gap**: Secret access isn't logged separately from config reads

### Implementation

```
┌─────────────────┐      resolve at runtime       ┌────────────────────────┐
│  NoSQL Document  │  ──────────────────────────►  │  Catalyst Cache        │
│                  │                                │                        │
│  "tokenRef": {   │     cacheSegment + cacheKey   │  segment: "secrets"    │
│    "type":       │  ──────────────────────────►  │  key: "robot-token-01" │
│    "secretRef",  │                                │  value: "abc123..."    │
│    "cacheSegment"│                                │  ttl: 86400            │
│    ...           │                                │                        │
│  }               │                                │                        │
└─────────────────┘                                └────────────────────────┘
```

### Cache Segment Layout

| Segment | Key Pattern | Example | TTL |
|---------|-------------|---------|-----|
| `secrets` | `wifi-ssid-<robotId>` | `wifi-ssid-esp32-alpha-01` | 24h |
| `secrets` | `wifi-password-<robotId>` | `wifi-password-esp32-alpha-01` | 24h |
| `secrets` | `robot-token-<robotId>` | `robot-token-esp32-alpha-01` | 24h |
| `secrets` | `ws-robot-token-<env>` | `ws-robot-token-prod` | 24h |
| `secrets` | `ws-controller-token-<env>` | `ws-controller-token-prod` | 24h |

### Secret Resolution (Node.js SDK)

```js
const catalyst = require('zcatalyst-sdk-node');

async function resolveSecretRef(app, secretRef) {
  if (!secretRef || secretRef.type !== 'secretRef') {
    throw new Error('Invalid secret reference');
  }
  const cache = app.cache();
  const segment = cache.segment(secretRef.cacheSegment);
  const value = await segment.getValue(secretRef.cacheKey);
  if (!value) {
    throw new Error(`Secret not found: ${secretRef.cacheSegment}/${secretRef.cacheKey}`);
  }
  return value;
}
```

---

## 18. Indexing & Query Patterns

### Required Indexes

| Collection | Index Fields | Type | Purpose |
|------------|-------------|------|---------|
| All `cfg_*` | `key` | Unique (per active) | Primary lookup |
| All `cfg_*` | `environment` | Standard | Filter by env |
| All `cfg_*` | `active` | Standard | Find active versions |
| All `cfg_*` | `configVersion` | Standard | Version ordering |
| `cfg_robot` | `robotId` | Unique | Robot lookup |
| `cfg_audit_log` | `timestamp` | Standard | Time-range queries |
| `cfg_audit_log` | `collection` + `documentKey` | Compound | History per config |
| `cfg_audit_log` | `actor.email` | Standard | Who changed what |
| `cfg_feature_flags` | `flags.*.enabled` | Standard | Active flag scan |

### Common Query Patterns

```sql
-- 1. Load active WebSocket config for production
SELECT * FROM cfg_websocket 
WHERE key = 'ws.production' AND active = true

-- 2. List all robots in development environment
SELECT robotId, hardware.model, hardware.firmwareVersion 
FROM cfg_robot 
WHERE environment = 'development' AND active = true

-- 3. Get audit trail for a specific config key (last 50 changes)
SELECT timestamp, action, actor.email, changeReason 
FROM cfg_audit_log 
WHERE documentKey = 'ws.production' 
ORDER BY timestamp DESC 
LIMIT 50

-- 4. Find robots with firmware below target version
SELECT robotId, hardware.firmwareVersion 
FROM cfg_robot 
WHERE active = true AND hardware.firmwareVersion < '1.3.0'

-- 5. Count active feature flags per environment
SELECT environment, COUNT(*) 
FROM cfg_feature_flags 
WHERE active = true 
GROUP BY environment
```

---

## 19. Validation Rules & Constraints

### Cross-Field Validations

| Rule ID | Collection | Condition | Error Message |
|---------|-----------|-----------|---------------|
| V001 | `cfg_websocket` | `dedupe.clientWindowMs < heartbeat.controllerIntervalMs` | Timing invariant violated: dedupe must be less than heartbeat |
| V002 | `cfg_websocket` | `dedupe.serverWindowMs < heartbeat.controllerIntervalMs` | Server dedupe must be less than heartbeat interval |
| V003 | `cfg_environment` | If `environment === "production"` → `urls.wsBaseUrl` starts with `wss://` | Production must use secure WebSocket |
| V004 | `cfg_environment` | If `environment === "production"` → `security.isProductionSafe === true` | Production safety flag must be set |
| V005 | `cfg_environment` | `inheritsFrom !== key` | Self-inheritance not allowed |
| V006 | `cfg_robot` | All pin values in `motion.pins` are unique | Duplicate GPIO pin assignment |
| V007 | `cfg_robot` | `watchdog.commandTimeoutMs > heartbeat interval × 2` | Watchdog must exceed 2× heartbeat |
| V008 | `cfg_controller` | `heartbeat.dedupeMs < heartbeat.intervalMs` | Client dedupe must be less than heartbeat |
| V009 | `cfg_ota` | If `enabled` → `targetSelector.targetVersion` is valid SemVer | OTA target version required when enabled |
| V010 | `cfg_telemetry` | If `storage.archiveToStratus` → `storage.stratusBucket` is non-empty | Archive bucket required when archiving enabled |

### Type Validations

| Type | Validation |
|------|-----------|
| URL | Must match `^https?://` or `^wss?://`; valid URL parse |
| Email | Must match `^[^@]+@[^@]+\.[^@]+$` |
| SemVer | Must match `^\d+\.\d+\.\d+$` |
| Cron | Must be valid 5-field cron expression |
| GPIO Pin | Integer 0–39 (ESP32 valid GPIO range) |
| SecretRef | Must have `type: "secretRef"`, non-empty `cacheSegment` and `cacheKey` |

### Pre-Write Validation Flow

```
Client request (create/update)
  │
  ├─ 1. JSON schema validation (structure, types, required fields)
  ├─ 2. Type-specific validation (URL, email, SemVer, etc.)
  ├─ 3. Cross-field validation (timing invariants, conditional requirements)
  ├─ 4. Cross-collection validation (referenced env exists, robot ID unique)
  ├─ 5. Inheritance chain validation (no cycles, max depth)
  │
  ├── ALL PASS → write to NoSQL + audit log
  └── ANY FAIL → 400 with detailed error array
```

---

## 20. Environment Promotion Workflow

### Flow

```
development ──── promote ────► staging ──── promote ────► production
                                                           │
                                                   requires approval
                                                   by role: AppAdmin
```

### Promotion Steps

1. **Snapshot**: Copy the active config from source environment.
2. **Remap**: Update `environment` field, `key` pattern, and URL references.
3. **Validate**: Run all validation rules against the target environment constraints.
4. **Review**: If target is production → require manual approval.
5. **Write**: Create new version in target collection with `active: true`.
6. **Audit**: Log the promotion in `cfg_audit_log` with `action: "promote"`.
7. **Notify**: Send email via Catalyst Mail to stakeholders.

### What Gets Promoted vs. What Doesn't

| Promoted | Not Promoted |
|----------|-------------|
| WebSocket config (timing, limits) | Secret values (new refs created) |
| Controller defaults (UX settings) | Robot instance configs (env-specific) |
| Feature flags (with rollout reset to 0%) | Audit logs |
| Telemetry config | Diagnostics (dev-only settings) |
| OTA policy | Cache entries |
| UI settings | — |

---

## 21. Cache Integration

### Two-Layer Cache Strategy

```
┌──────────────┐     miss     ┌────────────────┐     miss     ┌──────────────┐
│ In-Process   │ ──────────► │ Catalyst Cache  │ ──────────► │ Catalyst     │
│ Memory Cache │              │ (distributed)   │              │ NoSQL        │
│ TTL: 60s     │ ◄────────── │ TTL: 300s       │ ◄────────── │ (persistent) │
└──────────────┘    populate  └────────────────┘    populate  └──────────────┘
```

### Cache Key Patterns

| Purpose | Cache Key | TTL | Segment |
|---------|----------|-----|---------|
| Active env config | `config:env:<environment>` | 300s | `config` |
| Active WS config | `config:ws:<environment>` | 300s | `config` |
| Controller defaults | `config:controller:<environment>` | 300s | `config` |
| Feature flags | `config:flags:<environment>` | 60s | `config` |
| Robot config | `config:robot:<robotId>` | 300s | `config` |
| Secret value | `<cacheKey>` | 86400s | `secrets` |

### Cache Invalidation

On every config write:
1. Delete the corresponding cache key from Catalyst Cache.
2. Broadcast an invalidation event via Custom Event Listener to all AppSail instances.
3. Each instance clears its in-process cache for that key.

---

## 22. API Contract — Config CRUD

### Endpoints (Serverless Functions / AppSail)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/config/:collection/:key` | Get active config | Token |
| `GET` | `/api/v1/config/:collection/:key/versions` | List all versions | Token |
| `GET` | `/api/v1/config/:collection/:key/version/:v` | Get specific version | Token |
| `POST` | `/api/v1/config/:collection` | Create new config | Admin |
| `PUT` | `/api/v1/config/:collection/:key` | Update (creates new version) | Admin |
| `POST` | `/api/v1/config/:collection/:key/rollback/:v` | Rollback to version | Admin |
| `POST` | `/api/v1/config/:collection/:key/promote` | Promote to next env | Admin |
| `DELETE` | `/api/v1/config/:collection/:key` | Soft delete | Admin |

### Request/Response Format

**Create / Update Request**:
```json
{
  "data": { /* full config document body, excluding audit fields */ },
  "changeReason": "Updated rate limits for load testing"
}
```

**Success Response**:
```json
{
  "status": "success",
  "data": { /* full document with audit fields populated */ },
  "meta": {
    "collection": "cfg_websocket",
    "key": "ws.production",
    "configVersion": 3,
    "previousVersion": 2
  }
}
```

**Validation Error Response**:
```json
{
  "status": "error",
  "errors": [
    {
      "ruleId": "V001",
      "field": "dedupe.clientWindowMs",
      "message": "Timing invariant violated: dedupe (350) must be less than heartbeat (300)",
      "expected": "< 300",
      "received": 350
    }
  ]
}
```

---

## 23. Client SDK Usage

### Node.js (AppSail Relay) — Load Config at Boot

```js
const catalyst = require('zcatalyst-sdk-node');

class ConfigService {
  constructor(app) {
    this.app = app;
    this.nosql = app.nosql();
    this.cache = app.cache();
    this._inMemory = new Map();
  }

  async loadActiveConfig(collection, key) {
    // 1. Check in-process cache
    const cacheKey = `${collection}:${key}`;
    if (this._inMemory.has(cacheKey)) {
      const cached = this._inMemory.get(cacheKey);
      if (Date.now() - cached.loadedAt < 60000) return cached.data;
    }

    // 2. Check Catalyst Cache
    try {
      const segment = this.cache.segment('config');
      const cached = await segment.getValue(`config:${cacheKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        this._inMemory.set(cacheKey, { data: parsed, loadedAt: Date.now() });
        return parsed;
      }
    } catch (e) { /* cache miss or error — fall through */ }

    // 3. Query NoSQL
    const table = this.nosql.collection(collection);
    const results = await table.query({
      where: { key, active: true },
      limit: 1
    });

    if (!results.length) throw new Error(`Config not found: ${collection}/${key}`);
    const doc = results[0];

    // 4. Populate caches
    const segment = this.cache.segment('config');
    await segment.putValue(`config:${cacheKey}`, JSON.stringify(doc), 300);
    this._inMemory.set(cacheKey, { data: doc, loadedAt: Date.now() });

    return doc;
  }

  async resolveSecrets(config) {
    const resolved = JSON.parse(JSON.stringify(config));
    await this._walkAndResolve(resolved);
    return resolved;
  }

  async _walkAndResolve(obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') {
        if (v.type === 'secretRef') {
          const segment = this.cache.segment(v.cacheSegment);
          obj[k] = await segment.getValue(v.cacheKey);
        } else {
          await this._walkAndResolve(v);
        }
      }
    }
  }

  invalidate(collection, key) {
    this._inMemory.delete(`${collection}:${key}`);
  }
}

module.exports = ConfigService;
```

### React (Web SDK) — Load Controller Config

```js
import catalyst from 'zcatalyst-sdk-web';

async function loadControllerConfig(environment = 'production') {
  const app = catalyst.initialize();
  
  // Use API endpoint (not direct NoSQL — browser has no server SDK)
  const response = await fetch(
    `/api/v1/config/cfg_controller/controller.defaults.${environment}`,
    { credentials: 'include' }
  );

  if (!response.ok) {
    console.warn('[config] Failed to load remote config, using defaults');
    return getDefaultControllerConfig();
  }

  const { data } = await response.json();
  return data;
}

function getDefaultControllerConfig() {
  return {
    heartbeat: { intervalMs: 300, dedupeMs: 250 },
    reconnect: { enabled: true, baseDelayMs: 1000, maxDelayMs: 8000 },
    commands: { validCommands: ['F', 'B', 'L', 'R', 'S'], stopCommand: 'S' },
    input: { keyboardEnabled: true, touchEnabled: true },
    display: { showDebugPanel: false, maxLogLines: 100, theme: 'dark' }
  };
}
```

---

## 24. Migration & Seed Data

### Initial Setup Script

Run once per environment to create collections and seed default configs:

```js
// scripts/seed-config.js
const catalyst = require('zcatalyst-sdk-node');

async function seedEnvironment(app, env) {
  const nosql = app.nosql();

  const collections = [
    'cfg_environment',
    'cfg_websocket',
    'cfg_robot',
    'cfg_controller',
    'cfg_feature_flags',
    'cfg_telemetry',
    'cfg_ota',
    'cfg_ui',
    'cfg_diagnostics',
    'cfg_audit_log'
  ];

  // Create collections if they don't exist
  for (const name of collections) {
    try {
      await nosql.createCollection(name);
      console.log(`✓ Created collection: ${name}`);
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log(`· Collection exists: ${name}`);
      } else {
        throw e;
      }
    }
  }

  // Seed environment config
  const envConfig = {
    key: `env.${env}`,
    environment: env,
    displayName: env.charAt(0).toUpperCase() + env.slice(1),
    catalystProjectId: process.env.CATALYST_PROJECT_ID,
    datacenter: 'US',
    urls: {
      publicBaseUrl: env === 'production'
        ? 'https://robotcontrol.example.com'
        : `https://${env}.robotcontrol.example.com`,
      wsBaseUrl: env === 'production'
        ? 'wss://robotcontrol.example.com/ws'
        : `wss://${env}.robotcontrol.example.com/ws`,
      apiBaseUrl: env === 'production'
        ? 'https://robotcontrol.example.com/api/v1'
        : `https://${env}.robotcontrol.example.com/api/v1`
    },
    logging: {
      level: env === 'production' ? 'warn' : 'debug',
      structured: true,
      sampleRate: env === 'production' ? 0.1 : 1.0
    },
    security: {
      isProductionSafe: env === 'production',
      requireTokenAuth: env !== 'development',
      corsAllowedOrigins: env === 'development' ? ['*'] : [`https://${env}.robotcontrol.example.com`]
    },
    inheritsFrom: null,
    configVersion: 1,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system@seed',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system@seed',
    changeReason: 'Initial seed'
  };

  await nosql.collection('cfg_environment').insertOne(envConfig);
  console.log(`✓ Seeded: env.${env}`);
}
```

### Migration Versioning

Config migrations are tracked in a `cfg_migrations` collection:

```json
{
  "migrationId": "001_initial_schema",
  "appliedAt": "2026-06-01T12:00:00.000Z",
  "appliedBy": "system@migration",
  "description": "Create all collections and seed default configs",
  "reversible": true
}
```

---

## 25. JSON Schema Files

Formal JSON Schema (Draft-07) files are maintained alongside this document:

| File | Collection | Description |
|------|-----------|-------------|
| `config_schema_controller.json` | `cfg_controller` | Controller defaults validation |
| `config_schema_robot.json` | `cfg_robot` | Robot instance validation |
| `config_schema_environment.json` | `cfg_environment` | *(planned)* Environment validation |
| `config_schema_websocket.json` | `cfg_websocket` | *(planned)* WebSocket validation |
| `config_schema_feature_flags.json` | `cfg_feature_flags` | *(planned)* Feature flags validation |
| `config_schema_telemetry.json` | `cfg_telemetry` | *(planned)* Telemetry validation |
| `config_schema_ota.json` | `cfg_ota` | *(planned)* OTA validation |
| `config_schema_ui.json` | `cfg_ui` | *(planned)* UI/PWA validation |
| `config_schema_diagnostics.json` | `cfg_diagnostics` | *(planned)* Diagnostics validation |

These JSON Schema files are used by the API validation layer (Section 19) to enforce structural correctness before any write to NoSQL.

---

## 26. Cross-References

| Document | Relationship |
|----------|-------------|
| `CORE_LOGIC.md` | Timing constants (§1), dedupe rules (§2-§4), and safety invariants referenced in this schema |
| `zoho_catalyst_cloud_scale_agent_guide.md` | NoSQL API, Cache API, Event Listeners, Cron used by config services |
| `config_schema_controller.json` | JSON Schema for Collection 4 validation |
| `config_schema_robot.json` | JSON Schema for Collection 3 validation |
| `README.md` | Deployment instructions and environment variable bootstrap |

### Timing Constant Cross-Reference (Schema ↔ Core Logic)

| Schema Field | Collection | Core Logic Constant | Value | Layer |
|-------------|-----------|-------------------|-------|-------|
| `heartbeat.controllerIntervalMs` | `cfg_websocket` | `HEARTBEAT_MS` | 300ms | Controller |
| `dedupe.clientWindowMs` | `cfg_websocket` | `DEDUPE_MS` | 250ms | Controller |
| `dedupe.serverWindowMs` | `cfg_websocket` | `CMD_DEDUPE_MS` | 200ms | Relay |
| `watchdog.commandTimeoutMs` | `cfg_robot` | `COMMAND_TIMEOUT_MS` | 750ms | Firmware |
| `heartbeat.serverPingIntervalMs` | `cfg_websocket` | Server ping interval | 30s | Relay |
| `registration.timeoutMs` | `cfg_websocket` | Registration timeout | 5s | Relay |

---

*This document is the canonical reference for all configuration structures in the robot control system. All config services, validation layers, and seed scripts MUST conform to the schemas defined here.*

*For questions or updates, file an issue with the `config-schema` label.*
