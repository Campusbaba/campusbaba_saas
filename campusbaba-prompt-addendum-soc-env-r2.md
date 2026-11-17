# Addendum to Master Prompt v2: Separation of Concerns, Plug-and-Play Services, Strict Env, Cloudflare R2 Storage

> Append this to `campusbaba-refurbish-prompt-v2.md` (or paste it right after it). It adds a cross-cutting architecture rule that applies to **every phase**. Where it conflicts with v2, this addendum wins.

---

## A. Principle: Separation of Concerns (SoC) with Ports and Adapters

Every external capability must sit behind an **interface (port)** with swappable **adapters**. Business logic must never import a vendor SDK directly. Switching a provider must be a **config change plus one new adapter file**, never a refactor.

### A.1 Layering (API: `campusBaba_api`)
Strict, one-way dependencies: `transport (HTTP) → application (use-cases) → domain → ports ← infrastructure (adapters)`.

```
campusBaba_api/src/
  config/            # env schema, config object, feature flags (only place that reads process.env)
  domain/            # pure business rules, entities, value objects, policies (no Express, no DB, no SDKs)
    <module>/        # students, fees, attendance, exams, library, transport, hostel, batches...
  application/       # use-cases / services; orchestrate domain + ports; transaction boundaries
    <module>/
  ports/             # TypeScript interfaces only
    StoragePort.ts  SmsPort.ts  EmailPort.ts  PaymentGatewayPort.ts  CachePort.ts
    QueuePort.ts    PdfPort.ts  PushPort.ts  ClockPort.ts  IdGeneratorPort.ts  AuditPort.ts
  infrastructure/    # adapters implementing ports + persistence
    persistence/     # repositories, Postgres client, RLS tenant transaction, migrations
    storage/         # r2.adapter.ts, s3.adapter.ts, minio.adapter.ts, local-fs.adapter.ts
    sms/             # ssl-wireless.adapter.ts, bulksmsbd.adapter.ts, alpha.adapter.ts, console.adapter.ts
    payments/        # bkash.adapter.ts, nagad.adapter.ts, sslcommerz.adapter.ts, aamarpay.adapter.ts, manual.adapter.ts
    email/ cache/ queue/ pdf/ push/
  interfaces/http/   # routes, controllers (thin), middlewares, Zod DTOs, OpenAPI
  composition/       # container.ts: the ONLY place that wires ports to adapters from config
  jobs/              # queue workers (call application layer, not controllers)
```

Rules:
1. **Controllers are thin**: parse/validate (Zod) → call one use-case → map result to HTTP. No DB calls, no business logic, no SDK calls.
2. **Use-cases depend on ports, not adapters.** Inject via constructor (a simple DI container or factory in `composition/`; no heavy framework required).
3. **Repositories** hide the DB (Postgres/ORM). Domain and application code never see SQL, Prisma/Drizzle types or RLS details; the tenant-scoped transaction is provided by infrastructure.
4. **Only `config/` reads `process.env`.** Everywhere else receives typed config via injection.
5. **Adapter selection by env**, e.g. `STORAGE_DRIVER=r2|s3|minio|local`, `SMS_DRIVER=ssl_wireless|bulksmsbd|alpha|console`, `PAYMENT_DRIVERS=bkash,nagad,sslcommerz,manual`, `EMAIL_DRIVER=smtp|resend|console`, `QUEUE_DRIVER=bullmq|inline`, `CACHE_DRIVER=redis|memory`. Dev/test default to harmless drivers (`local`, `console`, `inline`, `memory`) so the app runs with **zero external accounts**.
6. **Contract tests per port**: one shared test suite that every adapter of that port must pass (e.g. StoragePort: put/get/delete/signed URL/tenant prefix). Adapters are mocked with in-memory fakes in unit tests.
7. **Per-tenant overrides**: provider credentials can be platform-level (default) or tenant-level (their own SMS/payment merchant keys), resolved through a `ProviderResolver` that returns the right adapter for `(tenant, capability)`. Tenant secrets are encrypted at rest (envelope encryption with `APP_ENCRYPTION_KEY`) and never logged.
8. **Enforce boundaries automatically**: add `dependency-cruiser` or ESLint `no-restricted-imports` so CI fails if `domain/` or `application/` imports `infrastructure/`, `express`, `pg`, `@aws-sdk/*` etc., or if anything outside `config/` touches `process.env`.
9. Same idea on the frontends: `campusBaba_ui` and `campusbaba-rms` get `src/lib/api/` (one typed API client; no scattered axios calls), `src/features/<module>/` (hooks, components, schemas per module), `src/config/env.ts` (validated public env), and UI components free of fetching logic. Share types between apps via a workspace package (`packages/shared`: DTO types, Zod schemas, permission constants, i18n keys). Consider npm workspaces/pnpm + Turborepo for the monorepo.

---

## B. Environment Management (strict, typed, documented)

1. **One validated schema per app** using Zod (extend the current `env.ts`): the process **fails fast at boot** with a readable list of missing/invalid variables. No silent defaults for secrets; defaults only for non-secret tunables.
2. Provide `.env.example` for every app, grouped and commented, with **no real values**. Never commit `.env*` (verify `.gitignore`; scan git history for leaked secrets and rotate anything found).
3. Environments: `development`, `test`, `staging`, `production` with separate files/secret stores. Production secrets come from the host's secret manager (not files). Document which variables are public (`NEXT_PUBLIC_*`) vs. server-only; a CI check must fail if a secret is referenced in client code.
4. Group variables by concern, for example:

```
# --- App ---
NODE_ENV, APP_NAME, APP_BASE_DOMAIN=campusbaba.com, API_PORT, LOG_LEVEL
# --- Tenancy ---
RESERVED_SUBDOMAINS=www,app,api,admin,rms,mail,support,status
TENANT_RESOLUTION=host            # host only; never trust x-tenant-id in production
# --- Database ---
DATABASE_URL (app role, RLS enforced), DATABASE_ADMIN_URL (migrations only), DB_POOL_MAX, DB_SSL
# --- Auth ---
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ACCESS_TTL=15m, REFRESH_TTL=30d, COOKIE_DOMAIN_MODE=host-only
APP_ENCRYPTION_KEY (32-byte, for tenant provider secrets)
# --- Cache / Queue ---
CACHE_DRIVER, REDIS_URL, QUEUE_DRIVER
# --- Storage ---
STORAGE_DRIVER=r2|s3|minio|local, STORAGE_BUCKET, STORAGE_PUBLIC_BASE_URL (optional), STORAGE_SIGNED_URL_TTL=300
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT
STORAGE_MAX_UPLOAD_MB, STORAGE_ALLOWED_MIME
# --- SMS / Email / Payments ---
SMS_DRIVER, SMS_API_KEY, SMS_SENDER_ID; EMAIL_DRIVER, EMAIL_FROM
PAYMENT_DRIVERS, BKASH_*, NAGAD_*, SSLCOMMERZ_*, AAMARPAY_* (platform billing keys; tenant keys live encrypted in DB)
# --- Observability ---
SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT
```

5. Remove the hard-coded default SuperAdmin; replace with `SUPERADMIN_BOOTSTRAP_EMAIL` / one-time bootstrap command that forces a password change.
6. `config/index.ts` exports a frozen, typed config object plus a `config.features` map (feature flags such as `library`, `transport`, `hostel`, `sms`, `onlinePayments`) so modules can be turned on/off without code changes.
7. Add a `GET /health` (liveness) and `GET /ready` (checks DB, cache, queue, storage reachability) endpoint; `/ready` reports which drivers are active (no secrets).

---

## C. Document Storage on Cloudflare (free tier): R2 via `StoragePort`

Use **Cloudflare R2** (S3-compatible object storage; has a free tier and no egress fees). **Verify current free-tier limits and pricing on Cloudflare's pricing page before launch**; do not hard-code assumptions. Design so that R2 can be swapped for S3/MinIO/local with only an env change.

### C.1 StoragePort interface (minimum)
```ts
interface StoragePort {
  putObject(key: string, body: Buffer | Readable, opts: { contentType: string; sizeBytes: number; metadata?: Record<string,string> }): Promise<StoredObject>;
  getSignedDownloadUrl(key: string, opts?: { ttlSeconds?: number; downloadName?: string }): Promise<string>;
  createSignedUploadUrl(key: string, opts: { contentType: string; maxBytes: number; ttlSeconds?: number }): Promise<{ url: string; headers: Record<string,string> }>;
  headObject(key: string): Promise<ObjectInfo | null>;
  deleteObject(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;   // tenant purge
  list(prefix: string, cursor?: string): Promise<{ items: ObjectInfo[]; next?: string }>;
}
```
Adapters: `r2.adapter.ts` (use `@aws-sdk/client-s3` + `s3-request-presigner` pointed at `https://<account>.r2.cloudflarestorage.com`, region `auto`), `s3.adapter.ts`, `minio.adapter.ts` (local dev), `local-fs.adapter.ts` (zero-setup dev/test).

### C.2 Rules
1. **Private bucket by default.** No public listing. Files are served through **short-lived signed URLs** generated after an authorization check (tenant + permission + ownership, e.g. a guardian can only fetch their own child's documents). Public bucket/CDN is allowed only for explicitly public assets (tenant logo, public notices) under a separate `public/` prefix, optionally through a Cloudflare custom domain with caching.
2. **Tenant-scoped keys, built only by a `StorageKeyBuilder`**: `tenants/{tenant_id}/{module}/{entity_id}/{uuid}-{sanitized-name}`. Callers never pass raw keys from the client. Guard against path traversal and cross-tenant keys; the adapter rejects any key not starting with the current tenant's prefix.
3. **Metadata in Postgres**: a tenant-scoped `files` table (`id, tenant_id, key, original_name, mime, size_bytes, checksum_sha256, uploaded_by, entity_type, entity_id, visibility, status[pending|ready|deleted|quarantined], created_at`) with RLS. The DB row, not the bucket listing, is the source of truth; the app never trusts client-supplied MIME or size.
4. **Upload flow**: client asks API for a signed upload URL (API checks permission, per-file size limit, MIME allowlist, tenant storage quota) → browser uploads directly to R2 → client calls `confirm` → API `headObject` verifies size/type → marks `ready`. Server-side small uploads (e.g. generated PDFs, imports) use `putObject`. Configure R2 **CORS** for tenant origins (`*.campusbaba.com` and verified custom domains).
5. **Free-tier guardrails**: per-tenant storage quota tied to the plan (`tenant_limits.storage_mb`) with usage tracked in the DB; platform-wide usage alert at 70/90% of the free allowance; client-side image compression (profile photos max about 300 KB, resize), PDF/size limits, no video hosting (link to YouTube/Meet instead), lifecycle rule to delete abandoned `pending` uploads after 24h and temp exports after 7 days, dedupe by checksum where possible.
6. **What goes where**: student/staff photos, documents (birth certificate, NID copy, transfer certificate, testimonial), payment slip images, generated PDFs (receipts, marksheets, ID cards), library digital notes, imports/exports. Sensitive personal documents (NID, birth certificate) always private with audit-logged access.
7. **Safety**: MIME sniffing (magic bytes) vs. declared type; extension allowlist; strip image EXIF (GPS) on photos; optional antivirus scan hook (ClamAV adapter behind `ScanPort`, off by default); `Content-Disposition` forced to download for non-image types; filenames sanitized.
8. **Tenant lifecycle**: export bundle for a tenant (zip of files + manifest) and verified `deletePrefix('tenants/{id}/')` on purge; report counts deleted.
9. **Portability**: keep a documented migration script `tools/storage-migrate/` that copies objects between any two StoragePort drivers (R2 ↔ S3 ↔ local) using the `files` table.
10. Frontends use one `useFileUpload` hook + `FileViewer` component that only talks to the API (never to R2 directly except via the returned signed URL).

---

## D. Other plug-and-play capabilities (same pattern as storage)

- **SmsPort**: `send(to, text, {unicode, senderId})`, `getBalance()`, `parseDeliveryReport()`; adapters per Bangladeshi gateway + `console` adapter for dev; Bangla Unicode segment math lives in the domain, not in adapters; per-tenant credit wallet in the application layer.
- **PaymentGatewayPort**: `createCheckout()`, `verifyCallback()/verifyWebhook()`, `queryTransaction()`, `refund()`; one adapter per gateway + a `manual` adapter (TrxID submission, accountant approval). Application layer owns idempotency and allocation logic.
- **EmailPort**, **PushPort**, **PdfPort** (Puppeteer/Chromium or a pure-JS renderer; must embed Noto Sans Bengali), **QueuePort** (`bullmq` or `inline` for dev), **CachePort** (`redis` or `memory`), **ClockPort** and **IdGeneratorPort** (deterministic in tests), **AuditPort**.

---

## E. Delivery requirements for this addendum

1. In **Phase 2 (architecture)** add: the layer diagram, the port catalogue, the env matrix (variable, app, secret?, default, required-in-prod), and an ADR "Ports and Adapters + R2 storage".
2. In **Phase 5 (refurbishment)** do a **strangler-style refactor**: introduce ports/adapters and the composition root first, move existing controllers' logic into use-cases module by module (tests green after each module), then swap persistence from Mongoose to Postgres repositories behind the same repository interfaces. This lets Mongo to Postgres happen without touching use-cases.
3. Acceptance checks (must pass in CI):
   - Boundary lint passes (no vendor SDK or `process.env` outside allowed folders).
   - App boots with only `local`/`console`/`memory` drivers and zero external accounts.
   - Boot fails with a clear message when a required prod variable is missing.
   - Contract tests pass for every adapter of `StoragePort`, `SmsPort`, `PaymentGatewayPort`.
   - Switching `STORAGE_DRIVER` from `local` to `r2` to `minio` requires no code changes.
   - A storage test proves tenant A cannot read, list or delete tenant B's objects, including with crafted keys and expired/forged signed URLs.
   - `.env.example` exists for all three apps and matches the Zod schemas (a script checks they stay in sync).
4. Ask me before choosing: DI approach (manual container vs. tsyringe/awilix), ORM (Prisma vs. Drizzle), monorepo tool (npm workspaces vs. pnpm/Turborepo), and PDF engine.
