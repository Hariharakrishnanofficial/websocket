# Zoho Catalyst Cloud Scale — Agent Learning Guide
> **Source**: Extracted directly from https://docs.catalyst.zoho.com/en/cloud-scale/  
> **Purpose**: Structured reference for AI agents building large-scale applications on Zoho Catalyst  
> **Data integrity**: All facts, URLs, API signatures, and parameter names are taken verbatim from official documentation. No assumptions or hallucinations.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture & Environments](#2-architecture--environments)
3. [Developer Tools](#3-developer-tools)
4. [Component Map — Quick Reference](#4-component-map--quick-reference)
5. [STORAGE: Data Store](#5-storage-data-store)
6. [STORAGE: NoSQL](#6-storage-nosql)
7. [STORAGE: ZCQL (Query Language)](#7-storage-zcql-query-language)
8. [STORAGE: File Store](#8-storage-file-store)
9. [STORAGE: Stratus (Object Storage)](#9-storage-stratus-object-storage)
10. [STORAGE: Cache](#10-storage-cache)
11. [STORAGE: Search Integration](#11-storage-search-integration)
12. [SECURITY & IDENTITY: Authentication](#12-security--identity-authentication)
13. [SECURITY & IDENTITY: API Gateway](#13-security--identity-api-gateway)
14. [SECURITY & IDENTITY: Connections](#14-security--identity-connections)
15. [TRIGGERS: Cron](#15-triggers-cron)
16. [TRIGGERS: Event Listeners](#16-triggers-event-listeners)
17. [NOTIFY: Mail](#17-notify-mail)
18. [NOTIFY: Push Notifications](#18-notify-push-notifications)
19. [HOST & MANAGE: Web Client Hosting](#19-host--manage-web-client-hosting)
20. [HOST & MANAGE: Mobile Device Management (MDM)](#20-host--manage-mobile-device-management-mdm)
21. [HOST & MANAGE: Domain Mappings](#21-host--manage-domain-mappings)
22. [Deployment & Billing](#22-deployment--billing)
23. [CodeLib (Pre-built Microservices)](#23-codelib-pre-built-microservices)
24. [Data Store — Full API Reference](#24-data-store--full-api-reference)
25. [OLAP Database — Full Reference](#25-olap-database--full-reference)
26. [Large-Scale Application Architecture Patterns](#26-large-scale-application-architecture-patterns)
27. [Cross-Component Use Case Flows](#27-cross-component-use-case-flows)
28. [All Official Documentation Links](#28-all-official-documentation-links)

---

## 1. Platform Overview

**Zoho Catalyst Cloud Scale** is a Backend-as-a-Service (BaaS) platform that provides end-to-end solutions for application storage, security, integration, and deployment at scale.

**Core promise**: Auto-scaling infrastructure. Catalyst Cloud Scale automatically allocates required resources during high traffic and kills instances when not utilized. No manual infrastructure management is required.

**Console URL**: https://console.catalyst.zoho.com

**Key capabilities**:
- Cloud-based relational database (Data Store)
- NoSQL database
- Object storage (Stratus)
- File storage
- In-memory cache
- Full-text search
- Multi-type user authentication
- API management gateway
- OAuth connection management
- Cron job scheduling
- Event-driven automation
- Email sending
- Push notifications (Android, iOS, Web)
- Web app hosting with versioning
- Mobile app hosting (Android, iOS, Flutter)
- Custom domain mapping with free SSL

**Data centers**: US, EU, AU, IN, CA  
**Note**: Push Notifications and Mobile Device Management are NOT available in EU, AU, IN, or CA data centers.

---

## 2. Architecture & Environments

### Two Environments

| Environment | Purpose | Cost |
|---|---|---|
| **Development (Sandbox)** | Build, test, iterate | All components free |
| **Production** | Live user traffic | Paid based on usage |

**Development environment limits** (examples):
- Data Store: up to 5,000 records per table, 25,000 records per project
- Data Store: up to 100 columns per table (can request increase via support@zohocatalyst.com)

**Deployment flow**:  
`Local development (CLI)` → `Development console (sandbox)` → `Production deployment`

**Initial deployment doc**: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/initial-deployment/

---

## 3. Developer Tools

### Catalyst CLI
- **Purpose**: Initialize, develop, test, and deploy projects locally
- **Key commands**:
  - `catalyst serve` — test client components locally
  - `catalyst functions:shell` — debug and test functions
  - Import/export Data Store via CLI
- **Docs**: https://docs.catalyst.zoho.com/en/cli/v1/cli-command-reference/
- **Login docs**: https://docs.catalyst.zoho.com/en/cli/v1/login/login-from-cli/
- **Install docs**: https://docs.catalyst.zoho.com/en/getting-started/installing-catalyst-cli/

### Server-Side SDKs
All support Data Store, File Store, Cache, Auth, ZCQL, Cron, Event Listeners, Mail, and more.

| SDK | Docs URL |
|---|---|
| Java SDK v1 | https://docs.catalyst.zoho.com/en/sdk/java/v1/overview/ |
| Node.js SDK v2 | https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/overview/ |
| Python SDK v1 | https://docs.catalyst.zoho.com/en/sdk/python/v1/overview/ |

### Client-Side SDKs

| SDK | Docs URL |
|---|---|
| Web SDK v4 | https://docs.catalyst.zoho.com/en/sdk/web/v4/overview/ |
| Android SDK v2 | https://docs.catalyst.zoho.com/en/sdk/android/v2/overview/ |
| iOS SDK v2 | https://docs.catalyst.zoho.com/en/sdk/ios/v2/overview/ |
| Flutter SDK v2 | https://docs.catalyst.zoho.com/en/sdk/flutter/v2/overview/ |

### REST API
- **Overview**: https://docs.catalyst.zoho.com/en/api/introduction/overview-and-prerequisites/#OverviewandPrerequisites
- **Base URL pattern**: `{api-domain}/baas/v1/project/{project_id}/...`
- **Authorization header**: `Zoho-oauthtoken {oauth_token}`
- **Optional headers**: `CATALYST-ORG: {org_id}`, `Environment: Development`

### Utilities

| Tool | URL |
|---|---|
| VS Code Extension | https://docs.catalyst.zoho.com/en/catalyst-extensions/vs-code-extension/introduction/ |
| Maven Tools | https://docs.catalyst.zoho.com/en/tools/maven-tools/introduction/ |
| OpenAI Integration | https://docs.catalyst.zoho.com/en/integrations/openai-integration/introduction/ |

---

## 4. Component Map — Quick Reference

```
Catalyst Cloud Scale
├── STORAGE
│   ├── Data Store        → Relational DB (OLTP + OLAP)
│   ├── NoSQL             → Non-relational DB
│   ├── Stratus           → Object/blob storage (S3-like)
│   ├── File Store        → File/folder cloud storage
│   ├── Cache             → In-memory ephemeral storage
│   ├── Search            → Full-text search on Data Store
│   └── ZCQL              → Query language + console
│
├── SECURITY & IDENTITY
│   ├── Authentication    → User auth (hosted/embedded/3rd-party)
│   ├── API Gateway       → API management, endpoint security
│   └── Connections       → OAuth token management for integrations
│
├── TRIGGERS
│   ├── Cron              → Scheduled job execution
│   └── Event Listeners   → Event-driven function execution
│
├── NOTIFY
│   ├── Mail              → Email sending (SMTP/custom domain)
│   └── Push Notifications→ Android/iOS/Web push
│
└── HOST & MANAGE
    ├── Web Client Hosting → Frontend hosting with versioning
    ├── MDM               → Android/iOS/Flutter app hosting
    └── Domain Mappings   → Custom domains + free SSL
```

---

## 5. STORAGE: Data Store

**Purpose**: Cloud-based relational database management system (RDBMS) for persistent application data.

**Doc**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/introduction/  
**LLM-full doc**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/llms-full.md

### Key Features
- Create/manage tables and columns from console without writing queries
- Execute ZCQL queries for advanced data operations
- Built-in OLAP database for analytical queries
- Bulk Read, Bulk Write, Bulk Delete operations
- Scopes and permissions per table per user role
- Full-text search on indexed columns via Catalyst Search
- HIPAA and GDPR compliant storage
- PII/ePHI column validator support
- Metrics: Table Count and Row Count history via DevOps

### Tables

**Create table**: Docs → https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/tables/
- Table name: alphanumeric + underscore only, no whitespace, no special chars, cannot start with numeric
- Each table gets an auto-generated **Table ID** (used in API/SDK calls)
- Operations: Create, Update (rename), Truncate (delete rows, keep schema), Delete

**Default columns** (auto-created on every new table):

| Column | Data Type | Notes |
|---|---|---|
| ROWID | BigInt | Primary key, auto-generated, read-only |
| CREATORID | BigInt | Catalyst account user ID, read-only |
| CREATEDTIME | DateTime | Auto-set on insert |
| MODIFIEDTIME | DateTime | Auto-updated on change |

### Columns

**Supported data types**:

| Type | Max Length / Notes |
|---|---|
| Text | 10,000 chars |
| Var Char | 255 chars (configurable Max Length) |
| Date | YYYY-MM-DD |
| DateTime | YYYY-MM-DD HH:MM:SS |
| Int | 4-byte, 10 digits |
| Double | 17 digits incl. decimal |
| Boolean | true / false |
| BigInt | 8-byte, 19 digits |
| Foreign Key | References ROWID of another table |
| Encrypted text | 10,000 chars, encrypted at rest |

**Column constraints/validators**:
- **Search Index**: Enables full-text search on the column (not available for Text type)
- **IsUnique**: Prevents duplicate values; cannot be changed after column creation
- **IsMandatory**: Column cannot be left blank
- **PII/ePHI**: Marks sensitive data; activities logged in Audit Logs

**Foreign Key** extra fields:
- `Parent Table`: The table whose ROWID is referenced
- `On Delete`: `Null` (set FK to null) or `Cascade` (delete FK row)

**Dev env limit**: 100 columns per table (request increase at support@zohocatalyst.com)

### Scopes and Permissions

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/scopes-and-permissions/

**Table Scopes** (per user role):
- `Global` — all users can access table data
- `Org` — only users of same organization
- `User` — only the data owner

**Table Permissions** (per user role):
- `Select` — read rows
- `Update` — modify rows
- `Insert` — add new rows
- `Delete` — delete rows and the table

### Records

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/records/  
- ROWID, CREATORID, CREATEDTIME, MODIFIEDTIME are auto-populated
- Foreign Key columns require the ROWID of the parent table record as value
- Search for records by indexed column values only

### Bulk Operations

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/bulk-operations/

| Operation | Method | Notes |
|---|---|---|
| Bulk Read | API or CLI | Generates CSV file of results |
| Bulk Write | API | Reads from Stratus bucket CSV, writes to table |
| Bulk Delete | API or SDK | Max 200 rows per call |

**CLI import/export**: https://docs.catalyst.zoho.com/en/cli/v1/export-and-import-projects/introduction/  
**Bulk Read API**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/bulk-read-rows/create-bulk-read-job/  
**Bulk Write API**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/bulk-write-rows/create-bulk-write-job/  
**Bulk Delete API**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/bulk-delete-rows/

### SDK References for Data Store

| SDK | Link |
|---|---|
| Java | https://docs.catalyst.zoho.com/en/sdk/java/v1/cloud-scale/data-store/get-table-meta/ |
| Node.js | https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/data-store/get-component-instance/ |
| Python | https://docs.catalyst.zoho.com/en/sdk/python/v1/cloud-scale/data-store/get-component-instance/ |
| Web | https://docs.catalyst.zoho.com/en/sdk/web/v4/cloud-scale/data-store/get-component-instance/ |

---

## 6. STORAGE: NoSQL

**Purpose**: Non-relational database for unstructured or semi-structured data.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/introduction/

### Sections
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/introduction/
- Benefits: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/benefits/
- Components: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/components/
- Create and Manage Tables: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/create-manage-tables/
- Indexing Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/indexing/introduction/
- Create and Manage Indexes: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/indexing/create-manage-indexes/
- Working with Data Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/working-with-data/introduction/
- Add and Manage Data: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/working-with-data/add-manage-data/
- Query Search: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/query-search/
- Third-Party Migration: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/third-party-migration/

---

## 7. STORAGE: ZCQL (Query Language)

**Purpose**: Catalyst's proprietary SQL-like query language for the Data Store.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/introduction/

### Supported Operations

| Operation | Docs |
|---|---|
| SELECT | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/select/ |
| INSERT | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/insert/ |
| UPDATE | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/update/ |
| DELETE | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/delete/ |
| WHERE | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/where/ |
| HAVING | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/having/ |
| JOIN | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/joins/ |
| GROUP BY / ORDER BY | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/groupby-orderby/ |
| LIMIT | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/limit/ |
| ZCQL Functions | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/zcql-functions/ |
| V2 Syntax & Exceptions | https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/syntax-exceptions/ |

### ZCQL Console
- **Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/zcql-console/
- Features: code-completion, code saver, ZCQL explorer, reuse saved queries
- Can execute on **primary Data Store** OR **OLAP DB** (toggle in console)

### Execute ZCQL via SDK

| SDK | Link |
|---|---|
| Java | https://docs.catalyst.zoho.com/en/sdk/java/v1/cloud-scale/zcql/execute-zcql-query/ |
| Node.js | https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/zcql/get-component-instance/ |
| Python | https://docs.catalyst.zoho.com/en/sdk/python/v1/cloud-scale/zcql/get-component-instance/ |
| Web | https://docs.catalyst.zoho.com/en/sdk/web/v4/cloud-scale/zcql/get-component-instance/ |
| Android | https://docs.catalyst.zoho.com/en/sdk/android/v2/cloud-scale/zcql/execute-zcql-query/ |
| iOS | https://docs.catalyst.zoho.com/en/sdk/ios/v2/cloud-scale/zcql/execute-zcql-query/ |
| Flutter | https://docs.catalyst.zoho.com/en/sdk/flutter/v2/cloud-scale/zcql/execute-zcql-query/ |

**ZCQL REST API**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/zcql/execute-zcql-query/#ExecuteZCQLQuery

---

## 8. STORAGE: File Store

**Purpose**: Secure cloud storage for application files in folders. Shared file system access.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/introduction/

### Sections
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/introduction/
- Key Features: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/key-features/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/implementation/

**Use case**: Store and retrieve files like images, documents, application data files. HIPAA and GDPR compliant.

---

## 9. STORAGE: Stratus (Object Storage)

**Purpose**: Cloud object storage in buckets — similar to Amazon S3 or Google Cloud Storage.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/introduction/ |
| Create a Bucket | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/buckets/create-bucket/ |
| Delete a Bucket | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/buckets/delete-bucket/ |
| Objects Overview | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/introduction/ |
| Upload Object | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/upload-object/ |
| Manage Object | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/manage-object/manage-stored-object/ |
| Download Object | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/manage-object/download-object/ |
| Delete Object | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/manage-object/delete-object/ |
| Permissions | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-permissions/ |
| General Settings | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/general-settings/ |
| Event Listener Triggers | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/event-triggers/ |
| Bucket CORS | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/bucket-cors/ |
| Migrate from S3 | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/third-party-migration/migrate-s3/ |
| Migrate from GCP | https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/third-party-migration/gcp/ |

**Note**: Stratus buckets are used as source/destination for Data Store Bulk Write operations.

---

## 10. STORAGE: Cache

**Purpose**: Fully-managed in-memory cache for ephemeral/real-time data.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/introduction/ |
| Key Concepts | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/key-concepts/ |
| Architecture | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/architecture/ |
| Lifecycle | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/lifecycle/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/benefits/ |
| Use Cases | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/use-cases/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/implementation/ |

**Use case**: Store frequently accessed data (session tokens, rate limits, temporary computation results) for fast retrieval without hitting the database.

---

## 11. STORAGE: Search Integration

**Purpose**: Full-text search on indexed columns of the Data Store.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/introduction/ |
| Key Concepts | https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/key-concepts/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/benefits/ |
| Use Cases | https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/use-cases/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/implementation/ |

**Prerequisite**: The `Search Index` constraint must be enabled on the column in Data Store for it to be searchable.

---

## 12. SECURITY & IDENTITY: Authentication

**Purpose**: Secure end-user authentication, user account management, and access control.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/introduction/

### Authentication Types

#### 1. Native Catalyst Authentication

**Hosted Authentication Type**
- Catalyst manages the entire auth UI (login/signup pages)
- Docs: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/hosted-authentication-type/introduction/
- Configure: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/hosted-authentication-type/configure-hosted-authentication/
- Edit: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/hosted-authentication-type/edit-hosted-authentication/

**Embedded Authentication Type**
- Auth UI is embedded in your own app
- Docs: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/embedded-authentication/introduction/
- Scripts: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/embedded-authentication/scripts-for-embedded/
- Setup: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/embedded-authentication/setup-embedded-auth/
- Styling: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/embedded-authentication/styling-embedded-auth/
- Stylesheet Reference: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/embedded-authentication/reference-stylesheet-embedded/

#### 2. Third-Party Authentication
- Docs: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/third-party-authentication/introduction/
- Workflow: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/third-party-authentication/workflow/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/third-party-authentication/implementation/

#### 3. Multiple Auth Types
Manage multiple auth types in one app: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/authentication-types/

### Authentication Sub-Features

| Feature | URL |
|---|---|
| Public Signup | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/public-signup/ |
| Social Logins | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/social-logins/introduction/ |
| Configure Social Logins | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/social-logins/configuring-social-logins/ |
| Modify Social Logins | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/social-logins/modifying-social-logins/ |
| User Management | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/introduction/ |
| Users | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/users/introduction/ |
| Roles | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/roles/introduction/ |
| Roles Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/roles/implementation/ |
| Whitelisting | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/whitelisting/introduction/ |
| Custom User Validation | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/whitelisting/custom-user-validation/introduction/ |
| Authorized Domains | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/whitelisting/authorized-domains/introduction/ |
| Email Templates | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/email-templates/introduction/ |
| Customize Email Templates | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/email-templates/customizing-email-templates/ |
| Cross Domain Access | https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/cross-domain-access/ |

---

## 13. SECURITY & IDENTITY: API Gateway

**Purpose**: Create and manage APIs for function endpoints and web client endpoints.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/introduction/ |
| Key Concepts | https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/key-concepts/ |
| Architecture | https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/architecture/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/benefits/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/implementation/ |

**Capabilities**: Define custom APIs, secure all endpoints, perform advanced API management.

---

## 14. SECURITY & IDENTITY: Connections

**Purpose**: Automatic OAuth token handler for integrations with Zoho and third-party services.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/introduction/ |
| Connect to Default Service | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/establish-default-connection/ |
| Connect to Custom Service | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/establish-custom-connection/ |
| Use in Signals | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/connections-signals/ |
| Manage Custom Services | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/manage-custom-services/ |
| Manage Connections | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/manage-connections/ |
| Use Cases | https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/usecases/ |

**How it works**: Catalyst handles all token operations (obtain, refresh, revoke) automatically. The developer only writes business logic.

---

## 15. TRIGGERS: Cron

**Purpose**: Automated job scheduler to execute routine tasks at specific schedules or intervals.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/introduction/ |
| Key Concepts | https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/key-concepts/ |
| Architecture | https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/architecture/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/benefits/ |
| Use Cases | https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/use-cases/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/implementation/ |

**Alert on failure**: Use Application Alerts to send email notifications on Cron failures.

---

## 16. TRIGGERS: Event Listeners

**Purpose**: Event bus service that listens for specific events and executes logic automatically.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/introduction/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/benefits/ |
| Use Cases | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/use-cases/ |
| Terminology | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/terminology/ |
| Component Event Listeners | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/component-event-listeners/ |
| Custom Event Listeners | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/custom-event-listeners/ |
| Zoho Event Listeners | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/zoho-event-listeners/ |
| Queued Events | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/queued-events/ |
| Processed Events | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/processed-events/ |
| Working with Rules | https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/working-with-rules/ |

### Three Listener Types
1. **Component Event Listener** — triggered by Catalyst component events (e.g., File Store upload, Stratus object upload)
2. **Custom Event Listener** — triggered by custom events you define in your app code
3. **Zoho Event Listener** — triggered by events from other Zoho products

**Note**: Stratus supports Event Listener Triggers for bucket operations (https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/event-triggers/).

---

## 17. NOTIFY: Mail

**Purpose**: Send emails from within your application using Catalyst's built-in email client.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/introduction/ |
| Email Configuration | https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/email-configuration/ |
| SMTP Configuration | https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/smtp-configuration/ |
| Domains | https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/domains/ |
| Send Emails | https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/send-emails/ |

**Capabilities**: Configure public/private domain email, external SMTP clients, send emails from app code.

---

## 18. NOTIFY: Push Notifications

**Purpose**: Integrate push notifications for Android, iOS, and web apps.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/introduction/

**⚠️ Restriction**: NOT available for EU, AU, IN, or CA data centers.

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/introduction/ |
| Architecture | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/architecture/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/benefits/ |
| Use Cases | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/use-cases/ |
| iOS Push Notifications | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/ios/ |
| Android Push Notifications | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/android/ |
| Web Push Notifications | https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/web/ |

---

## 19. HOST & MANAGE: Web Client Hosting

**Purpose**: Host web client applications built on any front-end framework, with version management.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/introduction/ |
| Key Concepts | https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/key-concepts/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/benefits/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/implementation/ |

**Capabilities**: Host different versions, upgrade to newer version, roll back to older version.

---

## 20. HOST & MANAGE: Mobile Device Management (MDM)

**Purpose**: Host and manage Android, iOS, and Flutter apps. Invite users to access apps.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/introduction/

**⚠️ Restriction**: NOT available for EU, AU, IN, or CA data centers.

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/introduction/ |
| Key Concepts | https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/key-concepts/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/benefits/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/implementation/ |

---

## 21. HOST & MANAGE: Domain Mappings

**Purpose**: Map custom domains to Catalyst apps; Catalyst provides free Group SSL certificates.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/introduction/

### Sections

| Topic | URL |
|---|---|
| Introduction | https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/introduction/ |
| Architecture | https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/architecture/ |
| Benefits | https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/benefits/ |
| Implementation | https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/implementation/ |

**SSL**: Catalyst provides Group SSL certificates for all mapped domains, **free of cost**.

---

## 22. Deployment & Billing

**Environments doc**: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/introduction/  
**Development env**: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/development-environment/  
**Production env**: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/production-environment/  
**Initial deployment**: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/initial-deployment/  
**Billing**: https://docs.catalyst.zoho.com/en/deployment-and-billing/billing/introduction/

**Important**: Set up billing/payment method before deploying to production.

**Production URL**: After deployment, production functions and web apps get unique production URLs which can be mapped to custom domains via Domain Mappings.

---

## 23. CodeLib (Pre-built Microservices)

**Purpose**: Ready-made, independent microservices that can be installed directly into your app.

**Docs**: https://docs.catalyst.zoho.com/en/codelib/introduction/

**Use case**: Skip boilerplate — install a pre-packaged CodeLib solution and leverage its functionality immediately.

---

## 24. Data Store — Full API Reference

**Base URL pattern**: `{api-domain}/baas/v1/project/{project_id}/table/{tableIdentifier}/...`

### Insert a New Row
- **Method**: `POST`
- **URL**: `{api-domain}/baas/v1/project/{project_id}/table/{tableIdentifier}/row`
- **Scope**: `ZohoCatalyst.tables.rows.CREATE`
- **Body**: JSON array with column name/value pairs
- **Full docs**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/insert-new-row/

```bash
curl -X POST \
https://api.catalyst.zoho.com/baas/v1/project/4000000006007/table/EmpDetails/row \
-H "Authorization: Zoho-oauthtoken {token}" \
-H "Content-Type:application/json" \
-d '[{"Department_ID":"IT678","Department_Name":"Marketing","Employee_Name":"Robert Page"}]'
```

### Get All Rows (with pagination)
- **Method**: `GET`
- **URL**: `{api-domain}/baas/v1/project/{project_id}/table/{tableIdentifier}/row?next_token={token}&max_rows={n}`
- **Scope**: `ZohoCatalyst.tables.rows.READ`
- **Pagination**: Use `next_token` from response for subsequent calls; `max_rows` defaults to 200
- **Full docs**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/get-all-rows/

### Update a Row
- **Method**: `PUT`
- **URL**: `{api-domain}/baas/v1/project/{project_id}/table/{tableIdentifier}/row`
- **Scope**: `ZohoCatalyst.tables.rows.UPDATE`
- **Body**: JSON array with column name/value pairs + `"ROWID": {row_id}`
- **Full docs**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/update-row/

### Delete a Row
- **Method**: `DELETE`
- **URL**: `{api-domain}/baas/v1/project/{project_id}/table/{tableIdentifier}/row/{row_id}`
- **Scope**: `ZohoCatalyst.tables.rows.DELETE`
- **Full docs**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/delete-row/

### Get Table Metadata
- **Method**: `GET`
- **URL**: `{api-domain}/baas/v1/project/{project_id}/table/{tableIdentifier}`
- **Scope**: `ZohoCatalyst.tables.READ`
- **Full docs**: https://docs.catalyst.zoho.com/en/api/code-reference/cloud-scale/data-store/get-table-metadata/

---

## 25. OLAP Database — Full Reference

**Purpose**: Proprietary OLAP (Online Analytical Processing) database, secondary to the primary Data Store. Optimized exclusively for analytical read queries.

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/introduction/

### Key Facts
- **Read-only**: No CREATE, UPDATE, DELETE — only SELECT operations
- **Auto-sync**: Near real-time sync from primary Data Store (triggered by updates, not scheduled)
- **Enabled per project**: Affects all tables in the project
- **Platform-managed**: No setup or management required after enabling
- **High concurrency**: Instant results on any dataset size

### Primary Data Store vs OLAP Database

| Aspect | Primary Data Store (OLTP) | OLAP Database |
|---|---|---|
| Optimized for | All CRUD transactions equally | Read/analytical queries |
| Write support | Full (INSERT, UPDATE, DELETE) | Not supported |
| Query type | Transactional | Analytical |
| Data model | Row-oriented | Columnar/multidimensional |
| Use when | Normal app transactions | Aggregation, dashboards, BI |

### Enable / Disable OLAP

**Enable**:
1. Navigate to Data Store → click **OLAP Database** tab
2. Click **Enable** → confirm

**Disable**:
1. From **OLAP Database** tab → click ellipsis → **Disable** → confirm

**Docs**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/enable-and-query/

### OLAP Operations in ZCQL

**Key Features doc**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/key-features/  
**Operations guide**: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/olap-operations-guide/

#### Roll-Up (quarter → year)
```sql
SELECT region, year, Sum(amount) FROM sales_fact GROUP BY region, year ORDER BY region
```

#### Drill-Down (year → quarter detail)
```sql
SELECT region, year, quarter, Sum(amount) FROM sales_fact GROUP BY region, year, quarter ORDER BY region, quarter
```

#### Slice (single dimension filter)
```sql
SELECT region, Avg(amount) FROM sales_fact WHERE quarter = 'Q1' GROUP BY region ORDER BY region
```

#### Dice (multi-dimension filter)
```sql
SELECT region, Count(sale_id) FROM sales_fact WHERE product = 'Laptop' AND region IN ('East', 'West') AND quarter IN ('Q1', 'Q2') AND year = 2024 GROUP BY region ORDER BY region
```

### Execute OLAP Queries

- Via ZCQL Console: Select **OLAP DB** next to *Execute on*
- Via SDK: Same as ZCQL queries, refer to ZCQL SDK docs with OLAP target

---

## 26. Large-Scale Application Architecture Patterns

The following patterns are documented use cases from Zoho Catalyst official docs:

### Pattern 1: Event-Driven Data Pipeline
```
CSV File Upload to File Store
  → Event Listener (component event: file upload)
  → Serverless Function (parse CSV, transform data)
  → Bulk Write to Data Store
  → Mail / Push Notification to users
```

### Pattern 2: Scheduled Background Jobs
```
Cron (configurable schedule)
  → Serverless Function (business logic)
  → Read/Write Data Store via ZCQL
  → Send Mail or Push Notification
  → (Optional) Update Stratus bucket
```

### Pattern 3: Secure Multi-Tenant App
```
Authentication (Hosted or Embedded)
  → Roles (App Admin, User, etc.)
  → Data Store Table Permissions (per role: Select/Insert/Update/Delete)
  → Data Store Table Scopes (Global/Org/User)
  → API Gateway (secure all endpoints)
```

### Pattern 4: Real-Time Analytics Dashboard
```
Data Store (primary DB: all CRUD operations)
  → OLAP Database (auto-synced, near real-time)
  → ZCQL analytical queries (Avg, Sum, Count, GROUP BY)
  → Web Client Hosting (front-end dashboard)
  → Domain Mappings (custom URL + free SSL)
```

### Pattern 5: Third-Party Service Integration
```
Connections (OAuth token managed by Catalyst)
  → Serverless Function (use connection in code)
  → Call third-party API (Zoho CRM, Slack, etc.)
  → Store results in Data Store
```

### Pattern 6: Mobile + Web App with Auth
```
Authentication → Social Logins + Native Auth
MDM (host Android/iOS/Flutter app)       ← mobile users
Web Client Hosting (host web app)         ← web users
Domain Mappings (custom domain + SSL)
```

---

## 27. Cross-Component Use Case Flows

### Customer Engagement System
**Components**: Event Listeners → Data Store → Mail → Push Notifications → Cron  
**Flow**: CSV upload → Event Listener → bulk write to Data Store → Cron schedules periodic emails/push notifications to customers

### Recruitment Application
**Components**: Authentication → Email Templates → API Gateway → Cron → Push Notifications → Mail → Data Store → Event Listeners → Roles → MDM → Web Client Hosting  
**Flow**: Auth invites candidates → API Gateway secures endpoints → Data Store stores candidate info → Cron/Mail/Push alerts for assessments → Event Listener on failure → Roles revoke failed candidates

### Healthcare Drug Information App
**Components**: Data Store → Search → ZCQL → File Store → Cron  
**Flow**: Data Store holds drug info → Search + ZCQL for queries → File Store for drug images → Cron periodically updates data

### E-Commerce / Analytics
**Components**: Data Store → OLAP Database → ZCQL → Web Client Hosting → Domain Mappings  
**Flow**: Transactions write to Data Store → OLAP auto-syncs → Analytical ZCQL queries for reports → Hosted dashboard on custom domain

---

## 28. All Official Documentation Links

### Getting Started
- Cloud Scale Home: https://docs.catalyst.zoho.com/en/cloud-scale/
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/getting-started/introduction/
- Components: https://docs.catalyst.zoho.com/en/cloud-scale/getting-started/components-of-cloud-scale/
- Benefits: https://docs.catalyst.zoho.com/en/cloud-scale/getting-started/benefits/
- Use Cases: https://docs.catalyst.zoho.com/en/cloud-scale/getting-started/use-cases/
- Quick Start Guide: https://docs.catalyst.zoho.com/en/cloud-scale/getting-started/quick-start-guide/
- LLM-full Getting Started: https://docs.catalyst.zoho.com/en/cloud-scale/getting-started/llms-full.md

### Data Store
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/introduction/
- Tables: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/tables/
- Columns: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/columns/
- Scopes and Permissions: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/scopes-and-permissions/
- Records: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/records/
- Bulk Operations: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/bulk-operations/
- OLAP Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/introduction/
- OLAP Key Features: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/key-features/
- OLAP Operations Guide: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/olap-operations-guide/
- OLAP Enable & Query: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/enable-and-query/
- LLM-full Data Store: https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/llms-full.md

### NoSQL
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/introduction/
- Benefits: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/benefits/
- Components: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/components/
- Create/Manage Tables: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/create-manage-tables/
- Indexing: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/indexing/introduction/
- Working with Data: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/working-with-data/introduction/
- Query Search: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/query-search/
- Third-Party Migration: https://docs.catalyst.zoho.com/en/cloud-scale/help/nosql/third-party-migration/

### ZCQL
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/introduction/
- SELECT: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/select/
- INSERT: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/insert/
- UPDATE: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/update/
- DELETE: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/delete/
- WHERE: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/where/
- HAVING: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/having/
- JOIN: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/joins/
- GROUP BY / ORDER BY: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/groupby-orderby/
- LIMIT: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/limit/
- ZCQL Functions: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/zcql-functions/
- V2 Syntax: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/syntax-exceptions/
- ZCQL Console: https://docs.catalyst.zoho.com/en/cloud-scale/help/zcql/zcql-console/

### File Store
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/introduction/
- Key Features: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/key-features/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/file-store/implementation/

### Stratus
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/introduction/
- Buckets: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/buckets/name-bucket/
- Create Bucket: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/buckets/create-bucket/
- Objects: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/introduction/
- Upload Object: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/objects/upload-object/
- Permissions: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-permissions/
- General Settings: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/general-settings/
- Event Triggers: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/event-triggers/
- CORS: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/stratus-config/bucket-cors/
- Migrate S3: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/third-party-migration/migrate-s3/
- Migrate GCP: https://docs.catalyst.zoho.com/en/cloud-scale/help/stratus/third-party-migration/gcp/

### Cache
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/introduction/
- Key Concepts: https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/key-concepts/
- Architecture: https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/architecture/
- Lifecycle: https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/lifecycle/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/cache/implementation/

### Search
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/introduction/
- Key Concepts: https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/key-concepts/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/search-integration/implementation/

### Authentication
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/introduction/
- Hosted Auth: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/hosted-authentication-type/introduction/
- Embedded Auth: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/native-catalyst-authentication/embedded-authentication/introduction/
- Third-Party Auth: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/third-party-authentication/introduction/
- Public Signup: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/public-signup/
- Social Logins: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/social-logins/introduction/
- Users: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/users/introduction/
- Roles: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/user-management/roles/introduction/
- Whitelisting: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/whitelisting/introduction/
- Email Templates: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/email-templates/introduction/
- Cross Domain Access: https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/cross-domain-access/

### API Gateway
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/introduction/
- Key Concepts: https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/key-concepts/
- Architecture: https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/architecture/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/api-gateway/implementation/

### Connections
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/introduction/
- Default Connection: https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/establish-default-connection/
- Custom Connection: https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/establish-custom-connection/
- Use Cases: https://docs.catalyst.zoho.com/en/cloud-scale/help/connections/usecases/

### Cron
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/introduction/
- Key Concepts: https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/key-concepts/
- Architecture: https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/architecture/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/cron/implementation/

### Event Listeners
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/introduction/
- Component Events: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/component-event-listeners/
- Custom Events: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/custom-event-listeners/
- Zoho Events: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/zoho-event-listeners/
- Queued Events: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/queued-events/
- Processed Events: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/processed-events/
- Working with Rules: https://docs.catalyst.zoho.com/en/cloud-scale/help/event-listeners/working-with-rules/

### Mail
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/introduction/
- Email Configuration: https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/email-configuration/
- SMTP Configuration: https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/smtp-configuration/
- Domains: https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/domains/
- Send Emails: https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/send-emails/

### Push Notifications
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/introduction/
- iOS: https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/ios/
- Android: https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/android/
- Web: https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/web/

### Web Client Hosting
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/introduction/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/web-client-hosting/implementation/

### Mobile Device Management
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/introduction/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/mobile-device-management/implementation/

### Domain Mappings
- Introduction: https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/introduction/
- Architecture: https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/architecture/
- Implementation: https://docs.catalyst.zoho.com/en/cloud-scale/help/domain-mappings/implementation/

### Deployment & Billing
- Environments: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/introduction/
- Initial Deployment: https://docs.catalyst.zoho.com/en/deployment-and-billing/environments/initial-deployment/
- Billing: https://docs.catalyst.zoho.com/en/deployment-and-billing/billing/introduction/

### Other Services
- Catalyst Serverless: https://docs.catalyst.zoho.com/en/serverless/getting-started/introduction/
- Catalyst Zia Services (AI/ML): https://docs.catalyst.zoho.com/en/zia-services/getting-started/introduction/
- Catalyst DevOps: https://docs.catalyst.zoho.com/en/devops/getting-started/introduction/
- DevOps Metrics: https://docs.catalyst.zoho.com/en/devops/help/metrics/introduction/
- DevOps Automation Testing: https://docs.catalyst.zoho.com/en/devops/help/automation-testing/introduction/
- CodeLib: https://docs.catalyst.zoho.com/en/codelib/introduction/
- Tutorials: https://docs.catalyst.zoho.com/en/tutorials/
- FAQ (Cloud Scale): https://docs.catalyst.zoho.com/en/faq/cloud-scale/
- Release Notes: https://docs.catalyst.zoho.com/en/release-notes/all/?service=cloud-scale

### Community & Support
- Community Forum: https://forums.catalyst.zoho.com/portal/en/community/recent
- GitHub: https://github.com/catalystbyzoho
- Blog: https://catalyst.zoho.com/blog/
- Stack Overflow: https://stackoverflow.com/questions/tagged/catalystbyzoho
- Support Email: support@zohocatalyst.com

---

*Document built from: https://docs.catalyst.zoho.com/en/cloud-scale/ — June 2026*  
*All links, API signatures, and technical facts are sourced directly from official documentation.*
