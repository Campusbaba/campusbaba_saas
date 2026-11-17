# Architecture Decision Records (`DECISIONS.md`)

This document records all foundational architectural decisions for the CampusBaba SaaS refurbishment, including context, evaluated options, trade-offs, and the selected recommendation.

---

## ADR-001: Multi-Tenancy Model in PostgreSQL

- **Status**: Accepted
- **Context**: The legacy system used MongoDB Database-Per-Tenant (`tenant_<subdomain>`) with an in-memory dictionary of Mongoose connections (`TenantConnectionManager`). As tenant count grows to hundreds or thousands of schools and coaching centers, opening a dedicated connection pool per tenant exhausts database file descriptors and memory, complicates schema migrations across hundreds of databases, and makes cross-tenant platform reporting slow (`superAdminController.getDashboardStats` iterated over every tenant DB sequentially).
- **Options Considered**:
  1. **Shared Database, Shared Schema with `tenant_id uuid NOT NULL` + Row-Level Security (RLS)** (Selected)
  2. **Shared Database, Schema-Per-Tenant (`tenant_school1.*`)**
  3. **Database-Per-Tenant in PostgreSQL**
- **Trade-Offs**:
  - *Option 1 (Shared Schema + RLS)*: Single migration run updates all tenants atomically; optimal connection pooling with PgBouncer transaction mode (`SET LOCAL app.current_tenant = '<uuid>'`); sub-millisecond cross-tenant analytics for SuperAdmin. Requires discipline to ensure every tenant table has `tenant_id` + RLS enabled (enforced automatically via CI check `verify-rls.ts`).
  - *Option 2 (Schema-Per-Tenant)*: Catalog bloat in `pg_class` / `pg_attribute` beyond ~500 tenants; running 500+ DDL migrations on every release is fragile and slow; `search_path` switching complicates prepared statements.
  - *Option 3 (Database-Per-Tenant)*: Highest physical isolation, but prohibitively expensive connection/memory overhead for 100–1,000 small/medium schools and coaching batches.
- **Decision**: Use **Option 1 (Shared Database, Shared Schema + `tenant_id` + Mandatory PostgreSQL RLS)** for all standard SaaS tiers, while keeping `tenants.dedicated_db_url` in the tenant registry as an optional **Enterprise Tier** escape hatch for large government/university institutions requiring physical database isolation.

---

## ADR-002: Separation of Concerns — Hexagonal Ports & Adapters + Manual Composition Root

- **Status**: Accepted
- **Context**: Legacy controllers directly imported Mongoose models, read `process.env`, and mixed HTTP transport concerns with business rules. Adding Bangladeshi payment gateways (bKash, Nagad, SSLCommerz), SMS gateways (BulkSMSBD, Alpha SMS, SSL Wireless), and object storage (Cloudflare R2) requires plug-and-play swappability and zero-external-account local/CI execution.
- **Options Considered**:
  1. **Hexagonal Architecture (Ports & Adapters) + Manual Typed Composition Root (`src/composition/container.ts`)** (Selected)
  2. **Hexagonal Architecture + Decorator DI (`tsyringe` / `inversify`)**
  3. **Service Layer calling Vendor SDKs directly**
- **Decision**: Use **Option 1**. Every external capability (`StoragePort`, `SmsPort`, `PaymentGatewayPort`, `CachePort`, `QueuePort`, `PdfPort`, `EmailPort`, `PushPort`, `ScanPort`, `ClockPort`, `IdGeneratorPort`, `AuditPort`) is a pure TypeScript interface in `src/ports/`. Concrete adapters live in `src/infrastructure/` and are wired in `src/composition/container.ts` based on validated config in `src/config/`. Architectural boundaries are enforced by an automated CI boundary linter (`scripts/check-env-and-boundaries.ts`).

---

## ADR-003: Document Storage — Cloudflare R2 behind `StoragePort`

- **Status**: Accepted
- **Context**: Schools, madrasas, and coaching centers store student/staff photos, birth certificates, NID copies, payment slips, and generated PDFs (marksheets, admit cards, receipts). Traditional S3 charges high egress fees when thousands of students download admit cards or marksheets simultaneously on result day.
- **Options Considered**:
  1. **Cloudflare R2 (S3-compatible API) behind `StoragePort` with `local-fs` and `minio` dev/test adapters** (Selected)
  2. **AWS S3**
  3. **Database BLOB / `bytea` storage**
- **Decision**: Use **Option 1 (Cloudflare R2 via `@aws-sdk/client-s3` + presigned URLs)**. R2 provides a permanent free tier (**10 GB-month storage, 1M Class A writes/month, 10M Class B reads/month, and $0.00 egress**) on Standard storage. All objects are private by default under `tenants/{tenant_id}/{module}/{entity_id}/{uuid}-{filename}`, enforced by `StorageKeyBuilder` and tracked in the RLS-protected `files` table. Local development and CI tests use `local-fs.adapter.ts` with zero cloud credentials required.

---

## ADR-004: ORM & Migration Strategy — Drizzle ORM + Versioned SQL Migrations

- **Status**: Accepted
- **Context**: We need type-safe relational queries, first-class support for PostgreSQL-specific features (`ENABLE/FORCE ROW LEVEL SECURITY`, `CREATE POLICY`, `EXCLUDE USING gist` for timetable double-booking, partial unique indexes, `numeric(12,2)`), and fast startup without heavy binary engines.
- **Options Considered**:
  1. **Drizzle ORM + `drizzle-kit` + Versioned SQL Migrations** (Selected)
  2. **Prisma ORM**
  3. **Raw SQL (`pg`) only**
- **Decision**: Use **Option 1 (Drizzle ORM)**. Drizzle is SQL-first, has zero Rust binary overhead, maps cleanly to PostgreSQL types and RLS transaction wrappers (`tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`)`), and pairs cleanly with raw SQL DDL assertions in CI.

---

## ADR-005: Identity, Host-Only Cookies & Signed Single-Use Invitations

- **Status**: Accepted
- **Context**: The legacy app resolved tenants from a spoofable `x-tenant-id` header (P0-3), stored SuperAdmin tokens in `localStorage` (P0-7), and encoded QR registration invites as unsigned client-side Base64 (P0-8).
- **Decision**:
  1. **Tenant Resolution**: Resolve tenant strictly from the verified HTTP `Host` header in production (`<slug>.campusbaba.com` or verified custom domain), blocking reserved subdomains (`www, app, api, admin, rms, mail, support, status`).
  2. **Global Users + Tenant Memberships**: Store identity in `users` (with Argon2id / bcrypt-upgrade password hashing) and scope roles/permissions per tenant via `tenant_memberships`, `roles`, `permissions`, and `role_permissions`.
  3. **Host-Only Cookies & Token Binding**: Issue short-lived access tokens (`15m`) and rotating refresh tokens (`30d`, SHA-256 hash stored in DB) inside `httpOnly; Secure; SameSite=Lax` **host-only cookies** (no `Domain=.campusbaba.com` attribute). Access tokens embed `tenant_id`; any mismatch between `token.tenant_id` and `req.tenant.id` returns `403 Forbidden`.
  4. **Server-Issued Invitations**: Replace client `btoa` QR tokens with `POST /api/v1/auth/invitations` generating a 256-bit random token whose SHA-256 hash is stored in the `invitations` table (`tenant_id`, `email`, `role`, `target_entity_id`, `expires_at`, `used_at`, `revoked_at`).

---

## ADR-006: Monorepo Tooling (`pnpm` + Turborepo) & Bangla PDF Engine (`PdfPort`)

- **Status**: Accepted
- **Context**: Three TypeScript apps (`campusBaba_api`, `campusBaba_ui`, `campusbaba-rms`) need shared DTO schemas, RBAC permission constants, and Bangladesh localization utilities without code duplication. Additionally, client-side `jsPDF` with Helvetica corrupts Bangla conjunct ligatures (যুক্তবর্ণ).
- **Decision**:
  1. **Monorepo**: Configure `pnpm-workspace.yaml` and `turbo.json` at the repo root with `packages/shared` consumed across all apps.
  2. **PDF Engine (`PdfPort`)**: Render official documents (marksheets, tabulation sheets, admit cards, ID cards, transfer certificates, receipts) via `PdfPort` backed by an HTML template engine embedding **Noto Sans Bengali** and rendered by Headless Chromium (with a deterministic HTML/PDF buffer fallback for lightweight test environments).
