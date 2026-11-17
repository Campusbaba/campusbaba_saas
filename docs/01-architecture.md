# Phase 2: Target System Architecture (`01-architecture.md`)

> **Status**: Approved Architecture Specification
> **Scope**: Multi-tenant PostgreSQL + RLS architecture, Hexagonal Ports & Adapters layering, Port Catalogue, Environment Matrix, Auth & Tenant Resolution pipelines, Cloudflare R2 Document Storage design, and SaaS Platform Billing & Lifecycle layer.

---

## 1. High-Level Target Architecture

```mermaid
flowchart TB
    subgraph Edge["DNS, TLS & Edge Layer"]
        WildcardDNS["Wildcard DNS (*.campusbaba.com)\n+ Verified Custom Domains"]
        ReverseProxy["Caddy / Nginx Reverse Proxy\nOn-Demand TLS + Rate Limiting"]
    end

    subgraph Clients["Frontend Applications (Next.js 16 / React 19)"]
        TenantUI["campusBaba_ui\n(school1.campusbaba.com)\nAdmin, Staff, Teacher, Student, Guardian"]
        RMSUI["campusbaba-rms\n(rms.campusbaba.com)\nSuperAdmin Console"]
    end

    subgraph API["campusBaba_api (Hexagonal / Ports & Adapters)"]
        HTTP["interfaces/http\nRoutes, Thin Controllers, Middlewares,\nZod DTOs, OpenAPI, Host Tenant Resolver"]
        App["application\nUse-Cases, Transaction Boundaries,\nQuota Enforcement, RBAC Checks"]
        Domain["domain\nPure Entities, Value Objects, BD 5.00 GPA,\nFee Allocation, BTRC SMS Math, Key Builder"]
        Ports["ports\nStoragePort, SmsPort, PaymentGatewayPort,\nCachePort, QueuePort, PdfPort, AuditPort..."]
        Infra["infrastructure\nDrizzle/Postgres RLS, R2/S3/Local Storage,\nSSLCommerz/bKash/Manual Pay, BulkSMSBD..."]
        Comp["composition/container.ts\nTyped DI Wiring from Validated Config"]
    end

    subgraph BackingServices["Backing Infrastructure"]
        PgBouncer["PgBouncer (Transaction Mode)"]
        Postgres[("PostgreSQL 16\nShared Schema + tenant_id + RLS\n(app_user NOBYPASSRLS / app_admin)")]
        Redis[("Redis 7\nTenant Cache, Rate Limits,\nBullMQ Job Queues")]
        R2[("Cloudflare R2 / MinIO / Local FS\nPrivate Bucket: tenants/{tenant_id}/...")]
    end

    WildcardDNS --> ReverseProxy
    ReverseProxy --> TenantUI
    ReverseProxy --> RMSUI
    ReverseProxy --> HTTP

    TenantUI -->|"Host-Only httpOnly Cookie\n+ CSRF / Bearer"| HTTP
    RMSUI -->|"Host-Only httpOnly Cookie"| HTTP

    HTTP --> App --> Domain
    App --> Ports
    Infra -.->|"implements"| Ports
    Comp -->|"wires"| HTTP & App & Infra

    Infra --> PgBouncer --> Postgres
    Infra --> Redis
    Infra --> R2
```

---

## 2. Multi-Tenant PostgreSQL & Row-Level Security (RLS) Pipeline

### 2.1 Shared Database, Shared Schema + `tenant_id` with Enforced RLS
Every tenant-owned table includes `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT` and enforces PostgreSQL Row-Level Security:

```sql
-- Executed for every tenant-scoped table:
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON <table_name>
  AS RESTRICTIVE
  FOR ALL
  TO app_user
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
```

- **Fail-Closed Default**: `current_setting('app.current_tenant', true)` returns `''` or `NULL` when not set; `NULLIF(..., '')::uuid` evaluates to `NULL`, and `tenant_id = NULL` is always `UNKNOWN` (`false`) in SQL. Any query executed without an active tenant context returns **zero rows** and rejects inserts/updates.
- **Database Role Separation**:
  - `app_user` (`DATABASE_URL`): Standard role with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`. Used by the running API and worker processes.
  - `app_admin` (`DATABASE_ADMIN_URL`): Privileged role used exclusively by CI/CD migrations, platform cross-tenant jobs, and verified tenant purge jobs.

### 2.2 Per-Request Transaction & PgBouncer Compatibility

```mermaid
sequenceDiagram
    autonumber
    participant Req as Incoming HTTP Request
    participant HostMW as tenantResolver Middleware
    participant Cache as CachePort (Redis / Memory)
    participant DB as PostgreSQL (via PgBouncer Tx Mode)
    participant ALS as AsyncLocalStorage (RequestContext)
    participant UC as Application Use-Case

    Req->>HostMW: Host: dhakapublic.campusbaba.com
    HostMW->>HostMW: Validate Host against Reserved Slugs\n(www, app, api, admin, rms, mail, support, status)
    HostMW->>Cache: Lookup tenant by subdomain / custom_domain
    alt Cache Miss
        HostMW->>DB: SELECT id, slug, status, plan_id FROM tenants WHERE slug = $1
        DB-->>Cache: Cache tenant metadata (TTL 5m)
    end
    alt Tenant Not Found
        HostMW-->>Req: 404 Branded Tenant Not Found
    else Tenant Suspended / Cancelled
        HostMW-->>Req: 403 Tenant Suspended (Grace Period Expired)
    else Tenant Active / Trial / Past-Due (In Grace)
        HostMW->>DB: BEGIN
        HostMW->>DB: SELECT set_config('app.current_tenant', '<tenant_uuid>', true)
        HostMW->>ALS: Run request inside ALS({ tenantId, txClient, requestId, actorId })
        ALS->>UC: Execute Use-Case Queries (RLS automatically enforced)
        alt Success (2xx / 3xx)
            HostMW->>DB: COMMIT
        else Error (4xx / 5xx / Uncaught)
            HostMW->>DB: ROLLBACK
        end
        HostMW-->>Req: HTTP Response
    end
```

---

## 3. Separation of Concerns (Hexagonal Ports & Adapters)

### 3.1 Strict One-Way Dependency Rule
`interfaces/http` $\rightarrow$ `application` $\rightarrow$ `domain` $\rightarrow$ `ports` $\leftarrow$ `infrastructure` (wired exclusively in `composition/container.ts`).

| Layer | Folder | Allowed Imports | Forbidden Imports (Enforced in CI) |
| :--- | :--- | :--- | :--- |
| **Config** | `src/config/` | `zod`, `dotenv`, Node `process.env` | Any internal app layer |
| **Domain** | `src/domain/` | Pure TS utilities, other `domain/` files | `process.env`, `express`, `drizzle-orm`, `pg`, `mongoose`, `@aws-sdk/*`, `axios`, `ioredis`, `bullmq` |
| **Ports** | `src/ports/` | `src/domain/` types, Node `stream` | Vendor SDKs, Express, ORM, `process.env` |
| **Application** | `src/application/` | `src/domain/`, `src/ports/` | `express`, `drizzle-orm`, `pg`, `mongoose`, `@aws-sdk/*`, `process.env`, `src/infrastructure/` |
| **Infrastructure** | `src/infrastructure/` | `src/ports/`, `src/domain/`, `src/config/`, Vendor SDKs, DB drivers | `src/interfaces/http/`, `process.env` (must receive typed config) |
| **Interfaces (HTTP)**| `src/interfaces/http/`| `express`, `zod`, `src/application/`, `src/domain/`, `src/ports/` | Direct DB models/queries, Vendor SDKs, `process.env` |
| **Composition** | `src/composition/` | All layers (wires concrete adapters to ports) | `process.env` (reads from `src/config/`) |

### 3.2 Complete Port Catalogue

| Port Interface | File | Methods | Concrete Adapters (`infrastructure/`) |
| :--- | :--- | :--- | :--- |
| **`StoragePort`** | `src/ports/StoragePort.ts` | `putObject`, `getSignedDownloadUrl`, `createSignedUploadUrl`, `headObject`, `deleteObject`, `deletePrefix`, `list` | `r2.adapter.ts`, `s3.adapter.ts`, `minio.adapter.ts`, `local-fs.adapter.ts` |
| **`SmsPort`** | `src/ports/SmsPort.ts` | `send`, `getBalance`, `parseDeliveryReport` | `bulksmsbd.adapter.ts`, `alpha.adapter.ts`, `ssl-wireless.adapter.ts`, `console.adapter.ts` |
| **`PaymentGatewayPort`**| `src/ports/PaymentGatewayPort.ts` | `createCheckout`, `verifyWebhook`, `queryTransaction`, `refund` | `manual.adapter.ts`, `sslcommerz.adapter.ts`, `bkash.adapter.ts`, `nagad.adapter.ts`, `aamarpay.adapter.ts` |
| **`EmailPort`** | `src/ports/EmailPort.ts` | `sendEmail` | `smtp.adapter.ts`, `resend.adapter.ts`, `console.adapter.ts` |
| **`CachePort`** | `src/ports/CachePort.ts` | `get`, `set`, `del`, `delPrefix`, `incrWithTtl` | `redis.adapter.ts`, `memory.adapter.ts` |
| **`QueuePort`** | `src/ports/QueuePort.ts` | `enqueue`, `registerWorker`, `getStats` | `bullmq.adapter.ts`, `inline.adapter.ts` |
| **`PdfPort`** | `src/ports/PdfPort.ts` | `renderHtmlToPdf`, `renderReceiptPdf`, `renderMarksheetPdf`, `renderIdCardPdf` | `chromium-pdf.adapter.ts` (with fallback HTML/PDF renderer for zero-setup environments) |
| **`PushPort`** | `src/ports/PushPort.ts` | `sendPushNotification` | `webpush.adapter.ts`, `console.adapter.ts` |
| **`ScanPort`** | `src/ports/ScanPort.ts` | `scanBuffer` | `noop-scan.adapter.ts`, `clamav.adapter.ts` |
| **`ClockPort`** | `src/ports/ClockPort.ts` | `now`, `todayDhaka` | `system-clock.adapter.ts`, `fixed-clock.adapter.ts` (for deterministic tests) |
| **`IdGeneratorPort`** | `src/ports/IdGeneratorPort.ts` | `newUuid`, `newToken` | `uuidv7.adapter.ts`, `deterministic-id.adapter.ts` |
| **`AuditPort`** | `src/ports/AuditPort.ts` | `record`, `query` | `db-audit.adapter.ts`, `memory-audit.adapter.ts` |

### 3.3 Per-Tenant `ProviderResolver` & Envelope Encryption
- Tenants on higher plans or with their own merchant accounts can store custom SMS (`bulksmsbd`, `ssl_wireless`, `alpha`) or Payment (`bkash`, `nagad`, `sslcommerz`, `aamarpay`) credentials in the `provider_credentials` table.
- Secrets are encrypted before database persistence using **AES-256-GCM** envelope encryption keyed by `APP_ENCRYPTION_KEY` (32-byte key), storing `iv`, `auth_tag`, and `ciphertext`.
- `ProviderResolver` checks for an active tenant-specific credential first; if none exists, it falls back to the platform-level adapter configured in `src/config/`.

---

## 4. Environment Variable Matrix

Every application validates its environment variables at boot using Zod. Missing or invalid variables in production terminate startup with a human-readable table of errors.

| Variable Name | App(s) | Secret? | Dev/Test Default | Required in Prod? | Purpose |
| :--- | :--- | :---: | :--- | :---: | :--- |
| `NODE_ENV` | API, UI, RMS | No | `"development"` | Yes | Runtime environment (`development`, `test`, `staging`, `production`) |
| `APP_NAME` | API | No | `"CampusBaba"` | No | Application display name |
| `APP_BASE_DOMAIN` | API, UI, RMS | No | `"campusbaba.com"` | Yes | Base domain for subdomain resolution |
| `PORT` | API | No | `5001` | Yes | HTTP listen port |
| `LOG_LEVEL` | API | No | `"info"` | No | Structured log level (`debug`, `info`, `warn`, `error`) |
| `RESERVED_SUBDOMAINS` | API | No | `"www,app,api,admin,rms,mail,support,status"` | Yes | Blocked tenant slugs |
| `TENANT_RESOLUTION` | API | No | `"host_or_header"` (dev) | Yes (`"host"` only) | Prevents `x-tenant-id` spoofing in production (P0-3) |
| `CORS_ALLOWED_ORIGINS` | API | No | `"http://localhost:3000,http://localhost:3001"` | Yes | Explicit allowed origins alongside `*.APP_BASE_DOMAIN` |
| `DATABASE_URL` | API | **Yes** | `"postgresql://app_user:app_pass@localhost:5432/campusbaba"` | Yes | RLS-enforced `app_user` connection string |
| `DATABASE_ADMIN_URL` | API | **Yes** | `"postgresql://app_admin:admin_pass@localhost:5432/campusbaba"` | Yes | Migration & platform admin connection string |
| `DB_POOL_MAX` | API | No | `20` | No | Maximum PostgreSQL pool connections |
| `DB_SSL` | API | No | `false` | Yes (`true`) | Enforce TLS on PostgreSQL connections |
| `MONGODB_URI` | API | **Yes** | `"mongodb://localhost:27017/schooler"` | Legacy / Migration | Retained during strangler migration & ETL |
| `JWT_SECRET` / `JWT_ACCESS_SECRET` | API | **Yes** | Dev-only fallback | **Yes (min 32 chars)**| Access token signing secret |
| `JWT_REFRESH_SECRET` | API | **Yes** | Dev-only fallback | **Yes (min 32 chars)**| Refresh token signing secret |
| `ACCESS_TTL` / `JWT_EXPIRES_IN` | API | No | `"15m"` | No | Access token TTL |
| `REFRESH_TTL` | API | No | `"30d"` | No | Refresh token TTL |
| `COOKIE_DOMAIN_MODE` | API | No | `"host-only"` | Yes (`"host-only"`) | Ensures cookies never use `.campusbaba.com` |
| `APP_ENCRYPTION_KEY` | API | **Yes** | 64-char hex dev key | **Yes (32-byte hex)** | AES-256-GCM key for `provider_credentials` |
| `SUPERADMIN_BOOTSTRAP_EMAIL` | API | No | `""` | Optional | One-time SuperAdmin bootstrap email (replaces hardcoded P0-4) |
| `SUPERADMIN_BOOTSTRAP_TOKEN` | API | **Yes** | `""` | Optional | One-time bootstrap token for initial SuperAdmin setup |
| `CACHE_DRIVER` | API | No | `"memory"` | Yes (`"redis"`) | `redis` or `memory` |
| `REDIS_URL` | API | **Yes** | `"redis://localhost:6379"` | When `redis` active | Redis connection string |
| `QUEUE_DRIVER` | API | No | `"inline"` | Yes (`"bullmq"`) | `bullmq` or `inline` |
| `STORAGE_DRIVER` | API | No | `"local"` | Yes (`"r2"`) | `r2`, `s3`, `minio`, or `local` |
| `STORAGE_BUCKET` | API | No | `"campusbaba-files"` | Yes | Bucket name |
| `STORAGE_LOCAL_DIR` | API | No | `"./.storage"` | No | Local filesystem storage root when `STORAGE_DRIVER=local` |
| `STORAGE_SIGNED_URL_TTL` | API | No | `300` | No | Presigned URL lifetime in seconds (default 5 min) |
| `STORAGE_MAX_UPLOAD_MB` | API | No | `10` | No | Maximum single file upload size in MB |
| `STORAGE_ALLOWED_MIME` | API | No | `"image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"` | No | Allowed MIME types |
| `R2_ACCOUNT_ID` | API | No | `""` | When `STORAGE_DRIVER=r2` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | API | **Yes** | `""` | When `STORAGE_DRIVER=r2` | R2 S3 API access key |
| `R2_SECRET_ACCESS_KEY` | API | **Yes** | `""` | When `STORAGE_DRIVER=r2` | R2 S3 API secret key |
| `R2_ENDPOINT` | API | No | `""` | When `STORAGE_DRIVER=r2` | `https://<account>.r2.cloudflarestorage.com` |
| `SMS_DRIVER` | API | No | `"console"` | Yes | `ssl_wireless`, `bulksmsbd`, `alpha`, or `console` |
| `SMS_API_KEY` | API | **Yes** | `""` | When live SMS active | Platform SMS gateway API key |
| `SMS_SENDER_ID` | API | No | `"CAMPUSBABA"` | When live SMS active | Max 11-char BTRC masking sender ID or non-masking number |
| `EMAIL_DRIVER` | API | No | `"console"` | Yes | `smtp`, `resend`, or `console` |
| `EMAIL_FROM` | API | No | `"no-reply@campusbaba.com"` | Yes | Default sender address |
| `PAYMENT_DRIVERS` | API | No | `"manual"` | Yes | Comma-separated active drivers (`manual,sslcommerz,bkash,nagad,aamarpay`) |
| `SENTRY_DSN` | API, UI, RMS | No | `""` | No | Error tracking DSN |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | API | No | `""` | No | OpenTelemetry collector endpoint |
| `NEXT_PUBLIC_API_URL` | UI, RMS | No | `"http://localhost:5001/api/v1"` | Yes | Backend API base URL |
| `NEXT_PUBLIC_APP_URL` | UI, RMS | No | `"http://localhost:3000"` | Yes | Public portal origin |
| `NEXT_PUBLIC_BASE_DOMAIN`| UI, RMS | No | `"campusbaba.com"` | Yes | Base domain for client host parsing |
| `NEXT_PUBLIC_TENANT_ID` | UI | No | `""` | No (Dev only) | Optional dev-mode tenant override |
| `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` | UI | No | `"false"` | No (`"false"`) | Controls visibility of demo login table (P0-4) |
| `NEXTAUTH_SECRET` | UI | **Yes** | Dev-only fallback | **Yes** | NextAuth encryption secret |
| `NEXTAUTH_URL` | UI | No | `"http://localhost:3000"` | Yes | NextAuth canonical URL |

---

## 5. Cloudflare R2 Document Storage Architecture

### 5.1 Verified Cloudflare R2 Free-Tier Limits & Guardrails
Per Cloudflare's official R2 pricing specification (Standard Storage Class):
- **Free Storage**: **10 GB-month / month** ($0.015/GB-month beyond 10 GB)
- **Free Class A Operations** (`PutObject`, `CopyObject`, `ListObjects`, `CreateMultipartUpload`): **1,000,000 requests / month** ($4.50/million beyond 1M)
- **Free Class B Operations** (`GetObject`, `HeadObject`): **10,000,000 requests / month** ($0.36/million beyond 10M)
- **Egress Bandwidth**: **$0.00 / GB** (unlimited free egress)

**Platform Guardrails Enforced in Code**:
1. **Per-Tenant Storage Quotas**: Every plan defines `storage_limit_mb` (e.g., Basic: 250 MB, Standard: 500 MB, Enterprise: 5,000 MB). Before issuing a presigned upload URL, the application sums `SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE tenant_id = $1 AND status IN ('pending', 'ready')` and rejects uploads that would exceed the tenant's quota.
2. **Free-Tier Platform Alerts**: Platform metrics track total storage across all tenants against the 10 GB (10,240 MB) free-tier cap and emit warnings at **70% (7.0 GB)** and **90% (9.0 GB)**.
3. **Class A Operation Conservation**: Never use bucket `ListObjects` in normal user flows; the PostgreSQL `files` table is the single source of truth.
4. **File Size & Type Restrictions**: Profile photos capped at 300 KB (client-compressed WebP/JPEG), documents capped at `STORAGE_MAX_UPLOAD_MB` (10 MB default), video MIME types (`video/*`) strictly blocked.
5. **Lifecycle Cleanup Job**: Nightly worker deletes `pending` uploads older than 24 hours and temporary exports older than 7 days.

### 5.2 Key Isolation & Upload/Download Flow
- **`StorageKeyBuilder`**: Deterministically generates keys formatted as:
  `tenants/{tenant_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}`
  - Rejects `..`, leading `/`, null bytes, or any prefix not matching the active `tenant_id`.
- **Two-Phase Upload Flow**:
  1. `POST /api/v1/files/upload-url` $\rightarrow$ Validates RBAC, MIME allowlist, file size limit, and tenant storage quota $\rightarrow$ inserts `files` row with `status = 'pending'` $\rightarrow$ returns presigned PUT URL from `StoragePort.createSignedUploadUrl`.
  2. Client uploads bytes directly to storage.
  3. `POST /api/v1/files/:id/confirm` $\rightarrow$ Calls `StoragePort.headObject(key)` (and magic-byte verifier for local/direct uploads) $\rightarrow$ verifies actual byte size and MIME $\rightarrow$ transitions `files.status = 'ready'`.
- **Authorized Download Flow**:
  - `GET /api/v1/files/:id/download-url` $\rightarrow$ Verifies tenant RLS, user role/ownership (e.g., guardian can only access their own child's files), logs an entry in `audit_logs` if the document is sensitive (`nid`, `birth_certificate`, `transfer_certificate`), and returns a 300-second presigned GET URL with `Content-Disposition: attachment` forced for non-image MIME types.

---

## 6. SaaS Platform Billing, Provisioning & Impersonation

1. **Database-Backed Plans & Subscriptions**:
   - `plans` table replaces hardcoded RMS UI rates (P0-11): stores `code` (`starter`, `standard`, `coaching_pro`, `enterprise`), `name`, `name_bn`, `billing_cycle` (`monthly`, `yearly`), `price_bdt` (`numeric(12,2)`), `max_students`, `max_teachers`, `max_admins`, `storage_limit_mb`, `included_sms_credits`, and `feature_flags` (`jsonb`).
   - `subscriptions` table tracks tenant subscription lifecycle: `trialing` (14-day default) $\rightarrow$ `active` $\rightarrow$ `past_due` (7-day grace period with banner warning) $\rightarrow$ `suspended` (blocks tenant mutations/logins via `tenantResolver`) $\rightarrow$ `cancelled`.
2. **Single-Transaction Tenant Provisioning**:
   - Provisioning a new institution in PostgreSQL no longer creates a new database. Instead, it executes **one idempotent database transaction**:
     1. Inserts row in `tenants` (`slug`, `name`, `institution_type`, `status = 'trialing'`).
     2. Inserts `subscriptions` (14-day trial) and `tenant_limits` copied from the selected `plan`.
     3. Seeds default RBAC `roles` (`admin`, `principal`, `accountant`, `teacher`, `librarian`, `hostel_warden`, `transport_manager`, `student`, `guardian`) and `role_permissions`.
     4. Seeds default Bangladesh grading scheme (`GPA 5.00`) and sequence counters (`STU`, `TCH`, `EMP`, `GRD`, `INV`, `RCP`).
     5. Upserts the initial owner in `users`, links `tenant_memberships` (`role = 'admin'`), and creates the initial `staff` profile.
     6. Records `"tenant.provisioned"` in `audit_logs`.
3. **Safe Tenant Deletion Lifecycle (Fixes P0-6)**:
   - `suspend` $\rightarrow$ `export` (generates JSON/CSV data archive + storage manifest) $\rightarrow$ `retention` hold $\rightarrow$ `purge` (verified deletion of `tenants/{id}/` prefix in `StoragePort` + cascading purge in PostgreSQL, logged in platform `audit_logs`).
4. **Audited, Time-Boxed SuperAdmin Impersonation**:
   - SuperAdmin requests impersonation for a specific tenant with a mandatory `reason` $\rightarrow$ issues a 15-minute JWT carrying `{ sub: adminUserId, tenantId, impersonatedBy: superAdminId, isImpersonating: true }` $\rightarrow$ every action taken under that token logs `impersonated_by` in `audit_logs`.
