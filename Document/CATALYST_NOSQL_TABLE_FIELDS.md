# Catalyst NoSQL — Table Creation Field Reference

> **Purpose**: Step-by-step field-level specification for creating all 10 NoSQL tables defined in [`CONFIG_SCHEMA.md`](./CONFIG_SCHEMA.md) inside the **Zoho Catalyst Console**.
>
> **Source of truth**:
> - `CONFIG_SCHEMA.md` — business schema (10 collections, fields, versioning rules)
> - `zoho_catalyst_cloud_scale_agent_guide.md` §6 — Catalyst NoSQL constraints
> - Catalyst Docs — Components, Indexing, Data Types
>
> **Important**: Catalyst NoSQL tables can **only be created from the Console UI** (`Catalyst Console → Cloud Scale → NoSQL → Create Table`). No SDK/API can create tables. After creation, your code only inserts / updates / queries items.

---

## 0. Catalyst Console — "Create Table" Dialog (Verified Against Live UI)

When you click **Catalyst Console → Cloud Scale → NoSQL → Create Table**, the dialog presents **exactly four sections** in this order. The labels below are the **verbatim** labels shown in the Catalyst Console (Brave / Chrome, `console.catalyst.zoho.in`, verified 2025).

### Section 1 — Table Name (top of dialog)

| Form Field | Description | Required? | Allowed Values |
|------------|-------------|-----------|----------------|
| **Table Name** | Identifier for the table (single text input) | ✅ | Alphanumeric + underscore, max 32 chars, must start with a letter. **Immutable after creation.** |

### Section 2 — Primary Key

This section has **two columns** (Partition Key + Data Type) and a **radio toggle** below for the optional Sort Key.

| Form Field | UI Control | Required? | Allowed Values |
|------------|-----------|-----------|----------------|
| **Partition Key** | Text input | ✅ | Attribute name (e.g. `key`, `robotId`, `documentKey`) |
| **Data Type** (Partition Key) | Dropdown | ✅ | `String` / `Number` / `Boolean` |
| **Include Sort Key?** | Radio buttons: ● **Yes** &nbsp;&nbsp; ○ **No** | ✅ | Select **Yes** for all 10 of our tables |
| **Sort Key** | Text input (shown only when "Yes" is selected) | If "Yes" | Attribute name (e.g. `configVersion`, `timestamp`) |
| **Data Type** (Sort Key) | Dropdown (shown only when "Yes" is selected) | If "Yes" | `String` / `Number` / `Boolean` |

### Section 3 — Additional Sort Keys ⚠️ *(Leave Empty for All 10 Tables)*

> **This is NOT where you create secondary indexes (GSIs).** This Catalyst-specific feature lets you mark **extra attributes as sortable** within the same partition. For our versioned-config pattern, the single Sort Key (`configVersion` / `timestamp`) is enough.
>
> ✅ **Action: Skip this section entirely. Do not add anything here.**

### Section 4 — Time To Live (TTL)

| Form Field | UI Control | Required? | Use Case |
|------------|-----------|-----------|----------|
| **TTL Attribute Name** | Text input | ❌ | Name of a **Number** attribute holding an epoch-seconds expiry. Catalyst auto-deletes items when the epoch passes. |

> ✅ **Action**: Leave **empty** for 9 of 10 tables. Enter `expiresAt` **only** for `cfg_audit_log`.

### Bottom of Dialog

- **Cancel** button (discard)
- **Create** button (provisions the table — irreversible for primary-key choices)

> 💡 **Schema-less attributes**: All fields other than the Partition Key, Sort Key, and any index keys are **not declared at table creation**. They live as free-form JSON inside each item — add / rename / remove them from your application code at any time.
>
> 🔐 **GSIs are created AFTER the table exists**, from the table's detail page under the **Indexes** tab. See §12.

### Visual Reference — Dialog Layout (verified from `console.catalyst.zoho.in`)

```
┌────────────────────────────────────────────────────────────┐
│ Create Table                                          ✕    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Table Name                                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ cfg_environment                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ── Primary Key ──────────────────────────────────────────  │
│                                                            │
│  Partition Key                       Data Type             │
│  ┌────────────────────────────┐     ┌──────────────────┐   │
│  │ key                        │     │ String        ▼  │   │
│  └────────────────────────────┘     └──────────────────┘   │
│                                                            │
│  Include Sort Key?    ● Yes      ○ No                      │
│                                                            │
│  Sort Key                            Data Type             │
│  ┌────────────────────────────┐     ┌──────────────────┐   │
│  │ configVersion              │     │ Number        ▼  │   │
│  └────────────────────────────┘     └──────────────────┘   │
│                                                            │
│  ── Additional Sort Keys ─────────────────────────  [+]    │
│  (leave empty — NOT for GSIs; skip this section)           │
│                                                            │
│  ── Time To Live (TTL) ──────────────────────────────────  │
│  TTL Attribute Name                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ (leave empty — only used in cfg_audit_log)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│                                  [ Cancel ]  [ Create ]    │
└────────────────────────────────────────────────────────────┘
```

> 📸 The above layout was reverse-engineered from the actual Catalyst Console dialog (Brave browser, `console.catalyst.zoho.in`). Field names, the radio button text "Include Sort Key?", and section headings are **verbatim** matches.

---

## 1. `cfg_environment` — Environment-Wide Configuration

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_environment` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty — skip section)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Find active config per environment |

### Item Attribute Skeleton (stored as JSON, not declared at create-time)

```json
{
  "key": "env.production",
  "configVersion": 3,
  "environment": "production",
  "active": true,
  "displayName": "Production",
  "inheritsFrom": null,
  "logLevel": "warn",
  "deployment": { "region": "us-east-1", "stage": "prod" },
  "security": { "isProductionSafe": true, "minTlsVersion": "1.2", "allowedOrigins": ["https://..."] },
  "limits": { "maxConcurrentRobots": 500, "maxConcurrentSessions": 2000 },
  "createdAt": "2025-01-15T10:00:00Z",
  "createdBy": "admin@example.com",
  "updatedAt": "2025-01-15T10:00:00Z",
  "updatedBy": "admin@example.com",
  "changeReason": "Initial creation"
}
```

---

## 2. `cfg_websocket` — WebSocket Server Configuration

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_websocket` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Resolve active WS config per env |

### Item Attribute Skeleton

```json
{
  "key": "ws.production",
  "configVersion": 5,
  "environment": "production",
  "active": true,
  "endpoint": { "host": "ws.example.com", "port": 443, "path": "/ws", "protocol": "wss" },
  "heartbeat": { "controllerIntervalMs": 300, "robotIntervalMs": 1000, "missedBeatsBeforeOffline": 3 },
  "dedupe": { "enabled": true, "windowMs": 200, "bypassCommands": ["S"] },
  "rateLimit": { "controllerCommandsPerSecond": 50, "robotTelemetryPerSecond": 20 },
  "reconnect": { "initialDelayMs": 500, "maxDelayMs": 30000, "backoffFactor": 2 },
  "security": { "requireAuth": true, "tokenTtlSeconds": 3600 },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 3. `cfg_robot` — Per-Robot Hardware & Behavior

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_robot` |
| **Partition Key** | `robotId` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

> Fill in the **Create Index** dialog (§12) with these values:

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_robot_status` | `status` (String) | `updatedAt` (String) | `All` | List robots by online/offline/maintenance status, newest first |

### Item Attribute Skeleton

```json
{
  "robotId": "esp32-alpha-01",
  "configVersion": 7,
  "environment": "production",
  "active": true,
  "displayName": "Lab Robot Alpha",
  "hardware": {
    "model": "ESP32-WROOM-32",
    "firmwareVersion": "1.4.2",
    "macAddress": "AA:BB:CC:DD:EE:FF"
  },
  "motion": {
    "pins": {
      "motorA": { "in1": 14, "in2": 27, "pwm": 26 },
      "motorB": { "in1": 25, "in2": 33, "pwm": 32 }
    },
    "pwmFrequencyHz": 5000,
    "maxSpeed": 255
  },
  "registration": {
    "robotTokenRef": { "type": "cache", "cacheSegment": "secrets", "cacheKey": "robot_token_alpha_01", "rotateAfterDays": 30 }
  },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 4. `cfg_controller` — Controller / Operator Console Defaults

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_controller` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Active controller defaults per env |

### Item Attribute Skeleton

```json
{
  "key": "controller.defaults.production",
  "configVersion": 2,
  "environment": "production",
  "active": true,
  "input": { "deadZone": 0.15, "pollIntervalMs": 50 },
  "ui": { "showLatency": true, "showBatteryWarnings": true },
  "commandMap": { "forward": "F", "back": "B", "left": "L", "right": "R", "stop": "S" },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 5. `cfg_feature_flags` — Runtime Feature Toggles

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_feature_flags` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Active feature-flag set per env |

### Item Attribute Skeleton

```json
{
  "key": "flags.production",
  "configVersion": 4,
  "environment": "production",
  "active": true,
  "flags": {
    "enableVideoStream": { "enabled": false, "rolloutPercent": 0, "enabledForRobots": [] },
    "enableNewDedupe": { "enabled": true, "rolloutPercent": 100, "enabledForRobots": [] },
    "enableTelemetryV2": { "enabled": true, "rolloutPercent": 50, "enabledForRobots": ["esp32-alpha-01"] }
  },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 6. `cfg_telemetry` — Telemetry Collection Policy

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_telemetry` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Active telemetry policy per env |

### Item Attribute Skeleton

```json
{
  "key": "telemetry.production",
  "configVersion": 1,
  "environment": "production",
  "active": true,
  "collection": {
    "enabled": true,
    "sampleRateHz": 5,
    "metrics": ["battery", "rssi", "uptime", "errorCount"]
  },
  "retention": { "hotDays": 7, "warmDays": 30, "coldDays": 365 },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 7. `cfg_ota` — Over-The-Air Firmware Update Campaigns

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_ota` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Active OTA campaigns per env |

### Item Attribute Skeleton

```json
{
  "key": "ota.production.campaign-2025-q1",
  "configVersion": 1,
  "environment": "production",
  "active": true,
  "firmware": {
    "targetVersion": "1.5.0",
    "minimumCurrentVersion": "1.4.0",
    "downloadUrl": "https://...",
    "checksumSha256": "..."
  },
  "rollout": { "strategy": "canary", "batchPercent": 10, "pauseOnFailure": true },
  "schedule": { "startAt": "2025-02-01T00:00:00Z", "endAt": "2025-02-15T00:00:00Z" },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 8. `cfg_ui` — UI Theme & Layout Defaults

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_ui` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Active UI theme per env |

### Item Attribute Skeleton

```json
{
  "key": "ui.production",
  "configVersion": 2,
  "environment": "production",
  "active": true,
  "theme": { "mode": "dark", "primary": "#2563eb", "accent": "#10b981" },
  "layout": { "sidebar": "left", "videoTileSize": "large" },
  "branding": { "logoUrl": "https://...", "appTitle": "Robot Control Center" },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 9. `cfg_diagnostics` — Logging & Debug Settings

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_diagnostics` |
| **Partition Key** | `key` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `configVersion` |
| **Data Type** (Sort Key) | `Number` |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | *(leave empty)* |

### Secondary Indexes (GSI)

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_env_active` | `environment` (String) | `active` (String) | `All` | Active diagnostics policy per env |

### Item Attribute Skeleton

```json
{
  "key": "diagnostics.production",
  "configVersion": 1,
  "environment": "production",
  "active": true,
  "logging": { "level": "warn", "destinations": ["catalyst-logs", "console"] },
  "tracing": { "enabled": false, "sampleRate": 0.05 },
  "alerts": { "errorRateThreshold": 0.02, "latencyThresholdMs": 500 },
  "createdAt": "...", "createdBy": "...", "updatedAt": "...", "updatedBy": "...", "changeReason": "..."
}
```

---

## 10. `cfg_audit_log` — Append-Only Change History

### Console Form Values

| Form Field | Value |
|------------|-------|
| **Table Name** | `cfg_audit_log` |
| **Partition Key** | `documentKey` |
| **Data Type** (Partition Key) | `String` |
| **Include Sort Key?** | ● **Yes** |
| **Sort Key** | `timestamp` |
| **Data Type** (Sort Key) | `String` *(ISO 8601 — string-sortable)* |
| **Additional Sort Keys** | *(leave empty)* |
| **TTL Attribute Name** | `expiresAt` *(Number attribute — epoch seconds; auto-purge after retention period)* |

### Secondary Indexes (GSI)

> Fill in the **Create Index** dialog (§12) with these values:

| Index Name | Partition Key | Sort Key | Attribute Type | Purpose |
|------------|--------------|---------|----------------|---------|
| `gsi_audit_actor` | `actor` (String) | `timestamp` (String) | `All` | All changes by a specific user, newest first |
| `gsi_audit_target` | `collection` (String) | `timestamp` (String) | `All` | All changes to a specific collection, newest first |

### Item Attribute Skeleton

```json
{
  "documentKey": "ws.production",
  "timestamp": "2025-01-15T10:32:14.512Z",
  "collection": "cfg_websocket",
  "configVersion": 5,
  "action": "UPDATE",
  "actor": { "email": "ops@example.com", "userId": "u_4421", "role": "admin" },
  "diff": { "heartbeat.controllerIntervalMs": { "from": 500, "to": 300 } },
  "changeReason": "Reduce latency for new controller release",
  "ipAddress": "10.0.4.22",
  "expiresAt": 1798800000
}
```

---

## 11. Master Summary Table — All 10 Tables at a Glance

| # | Table | Partition Key | PK Type | Sort Key | SK Type | TTL Attr | Secondary Indexes (GSI) |
|---|-------|--------------|---------|---------|---------|---------|------------------------|
| 1 | `cfg_environment` | `key` | String | `configVersion` | Number | — | `gsi_env_active` |
| 2 | `cfg_websocket` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 3 | `cfg_robot` | `robotId` | String | `configVersion` | Number | — | `gsi_robot_status` |
| 4 | `cfg_controller` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 5 | `cfg_feature_flags` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 6 | `cfg_telemetry` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 7 | `cfg_ota` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 8 | `cfg_ui` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 9 | `cfg_diagnostics` | `key` | String | `configVersion` | Number | — | *(none required)* |
| 10 | `cfg_audit_log` | `documentKey` | String | `timestamp` | String | `expiresAt` | `gsi_audit_actor`, `gsi_audit_target` |

> For all GSIs in our design, choose **`All`** in the `Select Attribute Type` dropdown so list queries return complete documents in a single read.

---

## 12. Catalyst Console — "Create Index" Dialog (Verified Against Live UI)

> ⚠️ **Important distinction**: Secondary indexes are **NOT** created from the "Create Table" dialog you saw in §0. They are created **after** the table exists, by opening the table's detail page → **Indexes** tab → **Create Index** button. The "Additional Sort Keys" section in the Create Table dialog is a **different feature** and should be left empty.

### 12.1 Dialog Structure (verbatim from `console.catalyst.zoho.in`)

The Create Index dialog presents **three sections** in this order:

| # | Section | Contents |
|---|---------|----------|
| 1 | **Index Name** (top) | Single text input |
| 2 | **Primary Key** (grouped block with description) | Partition Key + Data Type, Include Sort Key? radio, Sort Key + Data Type |
| 3 | **Select Attribute Type** (bottom) | Single dropdown that controls projection |

Below the three sections: **Cancel** and **Create** buttons.

### 12.2 Field-Level Reference

| Form Field | UI Control | Required? | Allowed Values / Notes |
|------------|-----------|-----------|------------------------|
| **Index Name** | Text input | ✅ | Alphanumeric + underscore. Naming convention: `gsi_<purpose>` (e.g. `gsi_env_active`). **Immutable after creation.** |
| **Partition Key** | Text input | ✅ | Type an attribute name (e.g. `environment`, `status`, `actor`). Must be an attribute that exists — or will exist — on items in the table. |
| **Data Type** (Partition Key) | Dropdown — placeholder `Select a type` | ✅ | `String` / `Number` / `Boolean`. Must match the attribute's actual data type in stored items. |
| **Include Sort Key?** | Radio buttons: ● **Yes** ○ **No** | ✅ | Choose **Yes** to enable `WHERE pk = X AND sk <op> Y` range queries and `ORDER BY sk` sorting. |
| **Sort Key** | Text input (shown only when "Yes") | If Yes | Attribute name to sort by within each partition (e.g. `active`, `timestamp`, `updatedAt`). |
| **Data Type** (Sort Key) | Dropdown — placeholder `Select a type` | If Yes | `String` / `Number` / `Boolean`. ISO 8601 timestamps must be `String` to sort chronologically. |
| **Select Attribute Type** | Dropdown — placeholder `Select a type` | ✅ | **Controls projection** — i.e. which attributes the index physically stores and returns. Pick the option that gives you the attributes your query needs (see §12.3). |

> 📸 **Verified facts from the screenshot**:
> - `Partition Key` and `Sort Key` are **text inputs** (you type the attribute name).
> - `Data Type` cells are **dropdowns** with placeholder text `Select a type`.
> - `Include Sort Key?` defaults to ● **Yes** in the dialog.
> - The **bottom dropdown is labelled `Select Attribute Type`** — this is the projection control. There is no Yes/No radio for projection.

### 12.3 Understanding "Select Attribute Type" (Projection)

The `Select Attribute Type` dropdown determines **what is stored inside the index** and therefore what a query against the index can return without a second lookup. The three options follow the standard NoSQL projection model:

| Option | What gets stored in the index | When to use |
|--------|-------------------------------|-------------|
| **All** | Every attribute of the matched item | ✅ **Recommended for our 4 GSIs.** Single read returns full config / audit row — no follow-up `getItem` needed. |
| **Keys Only** | Only the table's primary key + the index's key attributes | Cheapest storage, but every query needs a follow-up `getItem(tableId, primaryKey)` to fetch the rest. |
| **Include** | Keys + a custom list of additional attributes you specify | Hybrid — useful when you only ever need a known subset (e.g. just `displayName` + `status`). |

> ✅ **For all 4 of our GSIs, choose `All`** — config and audit reads must be a single round-trip from the agent.

### 12.4 Visual Reference — Dialog Layout

```
┌────────────────────────────────────────────────────────────┐
│ Create Index                                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Index Name                                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ gsi_env_active                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Primary Key                                          │  │
│  │ The Primary Key is a combination of a Partition Key  │  │
│  │ and a Sort Key, and it uniquely identifies an item   │  │
│  │ in the table.                                        │  │
│  │                                                      │  │
│  │  Partition Key             Data Type                 │  │
│  │  ┌────────────────────┐    ┌────────────────────┐    │  │
│  │  │ environment        │    │ String          ▼  │    │  │
│  │  └────────────────────┘    └────────────────────┘    │  │
│  │                                                      │  │
│  │  Include Sort Key?    ● Yes    ○ No                  │  │
│  │                                                      │  │
│  │  Sort Key                  Data Type                 │  │
│  │  ┌────────────────────┐    ┌────────────────────┐    │  │
│  │  │ active             │    │ String          ▼  │    │  │
│  │  └────────────────────┘    └────────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Select Attribute Type                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Select a type                                     ▼  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│                                  [ Cancel ]  [ Create ]    │
└────────────────────────────────────────────────────────────┘
```

### 12.5 GSI Definitions for Our 10 Tables

The four GSIs referenced in the per-table sections (§1, §3, §10) and §11 — copy these values directly into the Create Index dialog:

#### `gsi_env_active` (on `cfg_environment`)

| Form Field | Value to Enter |
|------------|----------------|
| **Index Name** | `gsi_env_active` |
| **Partition Key** | `environment` |
| **Data Type** (PK) | `String` |
| **Include Sort Key?** | ● Yes |
| **Sort Key** | `active` |
| **Data Type** (SK) | `String` *(stored as `"true"` / `"false"` for sortable equality match)* |
| **Select Attribute Type** | `All` |

**Use case**: `WHERE environment = 'production' AND active = 'true'` → returns the currently-active environment config row directly.

#### `gsi_robot_status` (on `cfg_robot`)

| Form Field | Value to Enter |
|------------|----------------|
| **Index Name** | `gsi_robot_status` |
| **Partition Key** | `status` |
| **Data Type** (PK) | `String` |
| **Include Sort Key?** | ● Yes |
| **Sort Key** | `updatedAt` |
| **Data Type** (SK) | `String` |
| **Select Attribute Type** | `All` |

**Use case**: List all robots in `online` / `offline` / `maintenance` status, newest first.

#### `gsi_audit_actor` (on `cfg_audit_log`)

| Form Field | Value to Enter |
|------------|----------------|
| **Index Name** | `gsi_audit_actor` |
| **Partition Key** | `actor` |
| **Data Type** (PK) | `String` |
| **Include Sort Key?** | ● Yes |
| **Sort Key** | `timestamp` |
| **Data Type** (SK) | `String` |
| **Select Attribute Type** | `All` |

**Use case**: "Show every config change made by user X, newest first."

#### `gsi_audit_target` (on `cfg_audit_log`)

| Form Field | Value to Enter |
|------------|----------------|
| **Index Name** | `gsi_audit_target` |
| **Partition Key** | `collection` |
| **Data Type** (PK) | `String` |
| **Include Sort Key?** | ● Yes |
| **Sort Key** | `timestamp` |
| **Data Type** (SK) | `String` |
| **Select Attribute Type** | `All` |

**Use case**: "Show every change to `cfg_robot`, newest first."

### 12.6 Step-by-Step Console Walkthrough

1. **Open the table.** Catalyst Console → Cloud Scale → NoSQL → click the target table (e.g. `cfg_environment`).
2. **Open the Indexes tab** on the table's detail page.
3. **Click `+ Create Index`** (top-right).
4. **Index Name** → type the GSI name from §12.5 (e.g. `gsi_env_active`).
5. **Partition Key** → type the attribute name (e.g. `environment`).
6. **Data Type** (PK) → open dropdown → select `String` / `Number` / `Boolean` per §12.5.
7. **Include Sort Key?** → click **● Yes**.
8. **Sort Key** → type the sort attribute (e.g. `active`).
9. **Data Type** (SK) → open dropdown → select the data type per §12.5.
10. **Select Attribute Type** → open dropdown → select **`All`**.
11. Click **Create**. The GSI build runs asynchronously — the index status moves through `Creating` → `Active`.
12. Refresh the Indexes tab until status reads **Active**, then your code can query it.
13. Repeat steps 3–12 for the remaining GSIs (`gsi_robot_status`, `gsi_audit_actor`, `gsi_audit_target`).

### 12.7 Preconditions Before Clicking Create

| Check | Why it matters |
|-------|----------------|
| ✅ Target table already exists and is `Active` | Indexes can only be added to an existing table. |
| ✅ At least one item with the partition-key attribute has been inserted (or you're OK with backfill) | Catalyst will backfill existing rows into the new index. Empty tables build instantly. |
| ✅ Attribute name spelling matches your item payload exactly (case-sensitive) | A typo here means the index will silently miss every row. |
| ✅ Data Type matches what your code writes | If items store `active` as a Boolean but the index says `String`, those items will not appear in index queries. |
| ✅ You have less than 5 existing GSIs on this table | Catalyst limit is 5 GSIs per table. |

### 12.8 Querying the Index After Creation

Once the index status is **Active**, query it from the SDK using ZCQL (`SELECT ... FROM <table> USE INDEX <index_name>`):

```js
// Node.js (catalyst SDK) — query gsi_env_active
const zcql = catalystApp.zcql();
const rows = await zcql.executeZCQLQuery(
  "SELECT * FROM cfg_environment USE INDEX gsi_env_active " +
  "WHERE environment = 'production' AND active = 'true'"
);
```

REST API equivalent (`POST /baas/v1/project/{projectId}/zcql/query`):

```json
{ "query": "SELECT * FROM cfg_environment USE INDEX gsi_env_active WHERE environment = 'production' AND active = 'true'" }
```

> 💡 If you forget `USE INDEX <name>`, the query falls back to a full table scan and is rate-limited.

### 12.9 Verifying the Index Was Created Correctly

1. **Indexes tab** of the table → confirm the new row shows **Status: Active**, **Partition Key**, **Sort Key**, and projection (`All`) match §12.5.
2. **Insert a test item** that satisfies the GSI keys.
3. **Run the ZCQL query** in the Console's "Data Explorer" or your SDK code and confirm it returns the test item.
4. **Check latency** — a properly-indexed query returns in single-digit milliseconds; a 100–500 ms response usually means it scanned instead of using the index.

### 12.10 Common Errors & Fixes

| Error / Symptom | Likely Cause | Fix |
|-----------------|--------------|-----|
| `Index name already exists` | Duplicate `gsi_*` name | Pick a unique name, or drop the existing index first. |
| Index built but query returns 0 rows | Attribute spelling mismatch, or data-type mismatch between item and index | Check item JSON for exact attribute name & type; recreate the index with the correct values. |
| `Maximum number of indexes reached` | More than 5 GSIs on this table | Drop an unused index before creating a new one. |
| Index stuck in `Creating` for >10 min | Very large table backfill | Wait — for tables with millions of rows the build can take longer; check the Console for an explicit error. |
| Query is slow despite the index | Forgot `USE INDEX <name>` in ZCQL | Add `USE INDEX <name>` after the table name. |

### 12.11 Important Notes

- 🚫 **GSI keys and projection are immutable after creation** — to change any of them you must **drop and recreate** the index.
- 🔢 **Max 5 GSIs per table** (Catalyst platform limit).
- 🕒 **GSI writes are eventually consistent** — newly inserted items typically appear in index queries within a few seconds.
- 💰 **`All` projection uses more storage** than `Keys Only` / `Include`, but the read-path simplicity is worth it for our config workload.
- 📋 **Indexing is Console-only** — there is no SDK / REST endpoint to create or drop an index programmatically, mirroring the table-creation restriction in §0.

---

## 13. Naming & Type Conventions Used Across All Tables

| Convention | Rule | Why |
|------------|------|-----|
| Table names | `cfg_<entity>` snake_case | Matches `CONFIG_SCHEMA.md` collection names |
| Partition key for versioned configs | `key` (String) | Hierarchical dot-notation (e.g. `ws.production`) |
| Sort key for versioned configs | `configVersion` (Number) | Enables `ORDER BY configVersion DESC` range scans (§15 schema requirement) |
| Sort key for audit log | `timestamp` (String, ISO 8601) | ISO 8601 strings sort identically to chronological order |
| GSI naming | `gsi_<partition>_<sort>` | Self-documenting |
| Versioning fields | `configVersion`, `active`, `createdAt`, `updatedAt`, `updatedBy`, `changeReason` | Standardized across every collection per §15 |

---

## 14. Console Creation Checklist (do this once per table)

> Step-by-step, click-by-click — exactly matching the screenshot of the Catalyst Console "Create Table" dialog.

1. **Catalyst Console** → select project → **Cloud Scale** → **NoSQL**.
2. Click **"Create Table"** (top-right) — the four-section dialog opens.
3. **Section 1 — Table Name**: type the table name (from §11), e.g. `cfg_environment`.
4. **Section 2 — Primary Key**:
   - **Partition Key**: type the attribute name (from §11), e.g. `key`.
   - **Data Type** dropdown: select `String` (or `Number` per §11).
   - **Include Sort Key?** → click the **● Yes** radio button.
   - **Sort Key**: type `configVersion` (or `timestamp` for audit log).
   - **Data Type** dropdown: select `Number` (or `String` for audit log).
5. **Section 3 — Additional Sort Keys**: **leave empty** (skip — this is not where GSIs go).
6. **Section 4 — Time To Live (TTL)**:
   - 9 of 10 tables → **leave empty**.
   - `cfg_audit_log` only → enter `expiresAt` in the TTL attribute field.
7. Click **"Create"** — the table is provisioned (this step is irreversible for the primary key).
8. From the table detail page → **"Indexes"** tab → **"Create Index"**.
9. For each GSI listed in §11 / per-table section, fill in the index dialog using §12.
10. **Repeat steps 2–9** for the remaining 9 tables.
11. **Copy the auto-generated Table ID** from each table's detail page — your code needs it for `catalystApp.nosql().getTable(tableId)`.
12. Store all 10 Table IDs in your environment-config table (`cfg_environment` → `tableIds` map) so SDK code can resolve them at boot.

---

## 15. Constraints to Remember

| Constraint | Limit |
|------------|-------|
| Partition / sort key data types | String, Number, Boolean only |
| Item size (single record) | ≤ 400 KB |
| Attributes per item | No fixed limit (schema-less) |
| GSI per table | 5 (Create Index dialog only supports GSI) |
| Tables per project | See Catalyst plan |
| Table creation | **Console only** — no SDK/API |
| Index creation | **Console only** — separate "Create Index" dialog on the table detail page (§12) |
| Item operations (CRUD/query) | SDK + REST API |
| GSI key/projection changes | Immutable — drop and recreate the index to change |

---

## 16. Related Documents

- [`CONFIG_SCHEMA.md`](./CONFIG_SCHEMA.md) — Field-level business schema (source of truth for item shapes)
- [`zoho_catalyst_cloud_scale_agent_guide.md`](./zoho_catalyst_cloud_scale_agent_guide.md) — §6 NoSQL API/SDK reference
- [`CORE_LOGIC.md`](./CORE_LOGIC.md) — Application logic that consumes these tables
- `config_schema_*.json` — JSON-Schema validators for each collection
