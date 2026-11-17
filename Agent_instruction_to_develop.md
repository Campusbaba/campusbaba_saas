# AGENT_BRIEF.md: CampusBaba SaaS Refurbishment

> Put this file at the monorepo root. Read it fully before doing anything. Follow the phases in order. **Stop at every GATE and wait for my approval.** Do not modify code until Phase 1 is approved.

## 1. Mission

Evolve the existing **CampusBaba SaaS** (Express + Mongoose, Next.js, MongoDB database-per-tenant) into a:
1. **PostgreSQL-based**, relational platform,
2. **Fully multi-tenant, subdomain-based** SaaS (`school1.campusbaba.com`) with provable isolation,
3. **Bangladesh-ready** product for schools, colleges, madrasas and coaching batches,
4. **Separation-of-Concerns (ports and adapters)** codebase where every external service is plug and play via env config,
5. Using **Cloudflare R2 (free tier)** for document storage.

Preserve working UX and API shapes where possible. Do not rewrite unrelated code.

## 2. Current System (verify in code, report deviations)

- `campusBaba_api`: Express 4, Mongoose 8, TypeScript, Zod, JWT, bcryptjs, `/api/v1`.
- `campusBaba_ui`: Next.js 16, NextAuth v4, TanStack Query/Table, Tailwind v4, Recharts, i18next (en/bn), jsPDF, XLSX, QRCode. Roles: admin, employee, teacher, student, parent.
- `campusbaba-rms`: Next.js 16 SuperAdmin console (provision tenants, quotas, suspend/activate, global notices, billing, audit log).
- Tenancy: master DB `schooler` (SuperAdmin, Tenant, GlobalNotice) + one MongoDB database per tenant (`tenant_<subdomain>`). `tenantResolver` + `TenantConnectionManager` + `AsyncLocalStorage` + ES6 Proxy in `models/index.ts`.
- 16 tenant collections: Counter, User, Student, Teacher, Parent, Employee, Department, Course, ClassRoom, Attendance, Routine, Exam, ExamMark, Payment, Expense, Notice.

## 3. P0 Defects (fix and cover each with a test)

1. `/api/v1/superadmin/*` has **no auth middleware**. Add JWT + `superadmin` guard + rate limit + audit log.
2. Tenant routes have **no backend JWT/RBAC** (only frontend `withAuth`). Add `authenticate` + `authorize(permission)` on every route.
3. Tenant comes from a spoofable **`x-tenant-id` header**. Derive from verified `Host` only; JWT must carry `tenant_id` and be rejected on other hosts.
4. **Hard-coded default SuperAdmin** (`admin@campusbaba.com` / `password123`). Remove; use a one-time bootstrap command with forced password change.
5. Reports/dashboard filter `{ status: "paid" }` but field is `paymentStatus`. Fix and audit all aggregates for similar mismatches.
6. `deleteTenant` leaves the tenant database. Replace with suspend → export → retention → verified purge.
7. Tokens in `localStorage` (RMS). Use httpOnly Secure SameSite cookies + refresh rotation + revoke.
8. Registration QR token is unsigned Base64. Replace with server-issued, signed, single-use, tenant-bound invite tokens (hash stored, expiry, revoke).
9. Quota checks (`maxStudents`, etc.) are racy. Enforce atomically.
10. CORS: use a tenant-aware allowlist (`*.campusbaba.com` + verified custom domains).
11. Plan prices hard-coded in RMS UI. Move to a `plans` table.

## 4. Architecture Rules (apply to every phase)

### 4.1 Tenancy (PostgreSQL)
- Recommended: **one database, shared schema, `tenant_id uuid NOT NULL` on every tenant-owned table, enforced by Row-Level Security.** Record the decision as an ADR and briefly compare schema-per-tenant and DB-per-tenant (keep DB-per-tenant as an optional enterprise tier).
- Per request: resolve tenant from Host (Redis-cached) → open transaction → `SET LOCAL app.current_tenant = '<uuid>'` → keep the transaction client in `AsyncLocalStorage` → commit/rollback at response end. Must work with PgBouncer transaction mode.
- RLS policy on every tenant table with `USING` and `WITH CHECK` on `tenant_id = current_setting('app.current_tenant', true)::uuid`. A missing setting returns zero rows.
- App DB role: not superuser, **no BYPASSRLS**. Separate admin role for migrations/platform jobs.
- Unique constraints are per tenant, e.g. `UNIQUE (tenant_id, student_code)`.
- CI fails if a table lacks `tenant_id` + RLS policy.
- Handle: apex site, `admin.`/`rms.` host, reserved slug blocklist (`www, app, api, admin, rms, mail, support, status`), unknown slug (branded 404), suspended tenant, verified custom domains with automatic TLS. Wildcard DNS/TLS config in `infra/`.
- Identity: global `users` + `tenant_memberships`; host-only cookies (never `Domain=.campusbaba.com`); RBAC via `roles`, `permissions`, `role_permissions` (tenant-custom roles allowed).
- Per-tenant: storage prefix, Redis prefix, rate limits, SMS credits, feature flags, plan limits, audit logs, data export and verified deletion.

### 4.2 Separation of Concerns (ports and adapters)
Dependency direction: `interfaces/http → application → domain → ports ← infrastructure`.

```
campusBaba_api/src/
  config/          # only place that reads process.env (Zod-validated, fail fast)
  domain/          # pure rules, no Express/DB/SDKs
  application/     # use-cases, transaction boundaries
  ports/           # interfaces: Storage, Sms, Email, PaymentGateway, Cache, Queue, Pdf, Push, Clock, IdGenerator, Audit
  infrastructure/  # persistence (repositories, RLS tx), storage, sms, payments, email, cache, queue, pdf adapters
  interfaces/http/ # thin controllers, routes, middlewares, Zod DTOs, OpenAPI
  composition/     # container: only place wiring ports to adapters from config
  jobs/            # queue workers calling application layer
```
- Controllers: validate → call one use-case → map response. No DB or SDK code.
- Vendor SDKs only inside `infrastructure/`. Enforce with `dependency-cruiser` or ESLint `no-restricted-imports`; CI fails on violations and on `process.env` outside `config/`.
- Driver selection via env: `STORAGE_DRIVER=r2|s3|minio|local`, `SMS_DRIVER`, `PAYMENT_DRIVERS`, `EMAIL_DRIVER`, `QUEUE_DRIVER=bullmq|inline`, `CACHE_DRIVER=redis|memory`. Dev/test defaults (`local`, `console`, `inline`, `memory`) must run with **zero external accounts**.
- Per-tenant provider overrides (own SMS/payment keys) via a `ProviderResolver`; secrets encrypted at rest with `APP_ENCRYPTION_KEY`, never logged.
- One shared **contract test suite per port**, run against every adapter.
- Frontends: single typed API client (`src/lib/api/`), feature folders (`src/features/<module>/`), validated `src/config/env.ts`, shared package `packages/shared` (DTO types, Zod schemas, permission constants, i18n keys).
- Migration order: introduce ports/composition root and move logic into use-cases module by module **first**, then swap Mongoose for Postgres repositories behind the same repository interfaces.

### 4.3 Environment management
- One Zod schema per app; boot fails with a readable list of missing/invalid vars. No silent defaults for secrets.
- Commit `.env.example` for every app (no real values, grouped, commented); never commit `.env*`; scan git history for leaked secrets and rotate any found. CI checks that `.env.example` matches the Zod schema and that no secret is used in client code.
- Variable groups: App, Tenancy (`APP_BASE_DOMAIN`, `RESERVED_SUBDOMAINS`), Database (`DATABASE_URL` app role, `DATABASE_ADMIN_URL` migrations), Auth (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, TTLs, `APP_ENCRYPTION_KEY`), Cache/Queue, Storage, SMS/Email/Payments, Observability (`SENTRY_DSN`, OTEL).
- `config.features` flags (`library`, `transport`, `hostel`, `sms`, `onlinePayments`, ...).
- `GET /health` (liveness) and `GET /ready` (DB, cache, queue, storage reachability; shows active drivers, no secrets).

### 4.4 Document storage: Cloudflare R2 behind `StoragePort`
- Methods: `putObject`, `getSignedDownloadUrl`, `createSignedUploadUrl`, `headObject`, `deleteObject`, `deletePrefix`, `list`. Adapters: `r2` (S3 API via `@aws-sdk/client-s3`, endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`), `s3`, `minio` (dev), `local-fs` (zero-setup).
- **Private bucket**, access only through short-lived signed URLs after tenant + permission + ownership checks. Public assets only under a separate `public/` prefix.
- Keys built only by `StorageKeyBuilder`: `tenants/{tenant_id}/{module}/{entity_id}/{uuid}-{sanitized-name}`. Adapter rejects keys outside the current tenant's prefix.
- Tenant-scoped `files` table (RLS) is the source of truth: `key, original_name, mime, size_bytes, checksum_sha256, uploaded_by, entity_type, entity_id, visibility, status[pending|ready|deleted|quarantined]`.
- Upload flow: request signed URL (checks permission, size limit, MIME allowlist, tenant quota) → browser uploads to R2 → `confirm` → API `headObject` verifies → `ready`. Configure R2 CORS for tenant origins.
- Free-tier guardrails: per-tenant storage quota via plan limits, platform usage alerts at 70/90%, client-side image compression, size/MIME limits, no video hosting, lifecycle cleanup (pending uploads 24h, temp exports 7d). **Verify current R2 free-tier limits on Cloudflare's pricing page; do not assume.**
- Safety: magic-byte MIME check, extension allowlist, strip EXIF, optional `ScanPort` antivirus hook, forced download for non-images, audit-logged access to sensitive docs (NID, birth certificate).
- Tenant export (zip + manifest) and verified `deletePrefix` on purge. Provide `tools/storage-migrate/` to copy between drivers.

## 5. Phases

### Phase 1: Audit (read-only) → GATE 1
- Verify section 2; list deviations. Confirm each P0 defect with file/line evidence.
- Write `docs/00-audit.md`: architecture diagram (Mermaid), per-collection fields, route inventory, all `$lookup`/aggregations, dependencies on the Proxy/ALS pattern, data-quality risks, keep/redesign/drop feature matrix.
- Ask me: number of live tenants, production data volume, hosting target, SMS/payment budget, launch priority of modules, DI/ORM/monorepo/PDF choices.

### Phase 2: Architecture → GATE 2
- `docs/01-architecture.md` + ADRs: tenancy model, layer diagram, port catalogue, env matrix (variable, app, secret?, default, required-in-prod), auth/tenant-resolution flows, R2 storage design, SaaS billing design.
- SaaS layer: `plans`, `subscriptions`, platform `invoices`, usage metering, 14-day trial, grace period, auto-suspend, dunning. Provisioning becomes one idempotent transaction (tenant + roles + templates + owner membership); no DB creation. RMS gets DB-backed audit log and audited, time-boxed impersonation.

### Phase 3: Schema and mapping → GATE 3
- Choose ORM/migration tool (recommend Prisma or Drizzle; justify). Versioned, reversible migrations run in CI.
- Conventions: UUID PKs (v7 preferred), `tenant_id`, timestamps, soft delete where needed, `numeric(12,2)` money, UTC storage (display `Asia/Dhaka`), E.164 phones, bilingual `name`/`name_bn`, CHECKs, partial unique indexes, FK indexes, append-only `audit_logs`.
- Deliver ERD (Mermaid), DDL, RLS policies, and the Mongo→Postgres mapping. Minimum mapping decisions:
  - `User` polymorphic `referenceId` → global `users` + `tenant_memberships` + explicit FKs (`student_id/teacher_id/employee_id/guardian_id`) with a CHECK.
  - `Student.parentId` → `student_guardians` (many-to-many, primary, fee payer); add `student_enrollments`.
  - `Teacher/Employee` → staff model; admin/principal become roles.
  - `ClassRoom` → `classes`, `sections`, `batches`, `rooms`, `academic_years`, `terms`; computed enrollment counts.
  - `Routine` → `timetable_entries` with exclusion constraints against double-booking.
  - `Exam/ExamMark` → `exams`, `exam_subjects`, `exam_marks`, configurable `grading_schemes` + `grade_bands`.
  - `Payment` → `fee_heads`, `fee_structures`, `fee_invoices`, `invoice_lines`, `payments`, `payment_allocations`, `gateway_transactions`, `waivers`, `receipts`; unique `(tenant_id, gateway, transaction_id)`.
  - `Expense` → `expenses`, categories, approval workflow, `payroll_runs`/`payslips`.
  - `Notice` → `notices` + `notice_targets` (no polymorphic refs). `GlobalNotice` → `platform_notices` + targets.
  - `Counter` (`STU-0001`) → `tenant_sequences` with row locking; configurable per-tenant prefix/format.
  - Master `SuperAdmin` → `platform_admins` (MFA-capable); `Tenant` → `tenants` + `plans` + `tenant_limits`.
  - Add `files` (storage metadata), `sms_logs`, `audit_logs`, `invitations`, `provider_credentials` (encrypted).
- ETL in `tools/migrate-mongo-to-pg/`: idempotent, resumable, batched, dry-run, `legacy_mongo_id` columns, ObjectId→UUID map, `migration_rejects` table (never silently drop), each `tenant_<subdomain>` DB → one `tenants` row.
- Reconciliation: row counts, referential integrity, **fee/payment/expense totals to the paisa**, spot checks. Rewrite `$lookup` reports as SQL views/CTEs and compare outputs with old results on migrated data.
- Cutover runbook: freeze writes → final delta → verify → switch → Mongo read-only for N days → decommission. Remove Mongoose only after verification.

### Phase 4: Bangladesh modules (each behind a per-tenant feature flag; tables, API, bn/en UI, permissions, reports, import/export, tests)
1. **Localization:** full bn/en with a CI missing-key check, Bangla numerals option, Noto Sans Bengali, correct Bangla in PDFs, `৳` with lakh/crore grouping, amount in words, Bangla/Hijri dates, Friday/Saturday weekend config, editable holiday calendar, Division→District→Upazila→Union→Village seed data, birth-registration/NID/religion/blood-group/quota/disability fields.
2. **Coaching/batches:** batches with schedule/capacity/waitlist/demo class, admission test → batch placement, batch transfer, pro-rated mid-month fees, monthly or package fees, sibling/multi-subject discounts, promo codes, QR/ID-card attendance, optional biometric adapter, online MCQ exams (auto-grade, negative marking, question bank), model tests with ranking, OMR/CSV import, teacher payroll models (fixed/per-class/per-student/revenue share), admission lead CRM.
3. **Academics:** configurable NCTB-aligned class/subject templates (do not hard-code), groups, shifts, mediums, honours/degree/masters, madrasa tracks (Dakhil/Alim/Fazil/Kamil, Hifz/Nazera), O/A-Level; configurable grading incl. **5.00 GPA** (A+ 5.00, A 4.00, A- 3.50, B 3.00, C 2.00, D 1.00, F 0.00), fail-in-any-subject and 4th-subject rules, merit positions, marksheets, tabulation sheets, transcripts; board registration/form fill-up tracking and exports (**verify board formats; do not guess**); stipend/scholarship tracking.
4. **Library:** catalogue (ISBN/barcode/QR), copies, issue/return/renew, limits per role, fines, reservations, lost/damaged, digital library, reports.
5. **Transport:** routes, stops, vehicles (expiry alerts for fitness/registration/insurance/tax token), drivers, assignments, stop/distance-based fees linked to invoices, optional GPS, boarding SMS to guardians, fuel/maintenance log.
6. **Hostel:** hostels/rooms/beds, allocation/transfer/vacate, fees, mess (meal on/off, per-meal rate, bazar log), visitor log, in/out register with late-entry alerts, inventory.
7. **Payments:** adapters for bKash, Nagad, Rocket, Upay, SSLCommerz, aamarPay, ShurjoPay + **manual Send-Money TrxID flow with accountant verification**, bank slip upload, cash receipts (58/80mm thermal + A4); idempotent signed webhooks, reconciliation job, duplicate-TrxID protection, partial/advance payments, oldest-due allocation, refunds, waivers; per-tenant encrypted merchant keys; configurable "paid → activate student" rule; keep invoice print/PDF/WhatsApp and add SMS share + QR-verifiable receipts.
8. **SMS-first communication:** gateway adapters (SSL Wireless, BulkSMSBD, Alpha SMS), Bangla Unicode segment counting (70 vs 160 chars), sender-ID rules (**verify BTRC rules**), per-tenant credit wallet, delivery reports with retry/fallback, bn/en templates; automated alerts for absence, late, fee due, payment confirmed, result published, exam schedule, transport boarding, hostel exit, emergency, birthdays.
9. **Guardian/student experience:** mobile-first PWA, low-bandwidth friendly, mobile + OTP login (rate limits, anti SMS-pumping), multi-child switcher.
10. **Documents/imports:** background-generated PDFs (ID cards with QR, admit cards, seat plans, marksheets, testimonials, transfer certificates, receipts, salary slips); Excel/CSV import/export with validation reports.
11. **Evaluate only, do not build without approval:** alumni/donations, canteen POS/wallet, uniform/book store, school banking, online admission portal, gate pass, health room, sports/scouts, PTM scheduler, TV notice board, SMS result lookup, EMIS-style export, offline desktop sync.

### Phase 5: Refurbishment (strangler style)
- Introduce ports/composition root → move logic to use-cases module by module (tests green each step) → swap persistence to Postgres repositories.
- API: `/api/v1`, OpenAPI from Zod, consistent error envelope, pagination, idempotency keys for payments/SMS, per-tenant + per-IP rate limits, request IDs, structured logs with `tenant_id`.
- Security: Argon2id (rehash bcrypt on login), refresh rotation, optional 2FA for admins/accountants, signed file URLs, OWASP Top 10 review, audit log for sensitive actions (fee/mark edits, role changes, impersonation). Student data includes minors: consent records, field-level access, per-person and per-tenant export/delete; confirm Bangladeshi data-protection obligations with a local lawyer, flag assumptions.
- Performance: p95 < 300 ms for common reads, no N+1, summary tables/materialized views for dashboards, PgBouncer, later partition `attendance_records`/`sms_logs`/`audit_logs`; load test 1,000 tenants / 500k students.
- Frontend: tenant-branded theme, permission-driven navigation, fast keyboard-friendly bulk grids, Bangla-first typography, accessibility pass.
- Jobs (Redis + BullMQ): SMS, PDFs, reminders, nightly dues, expiry alerts, webhook retries, backup verification.
- DevOps: Docker Compose (Postgres, Redis, MinIO, mail catcher, `*.localhost` tenants), CI (lint, types, unit, Postgres integration, tenant-isolation, migration up/down, boundary lint, env sync), staging/prod, IaC, expand→migrate→contract migrations, PITR backups + tested restore.
- Seeds: per-type demo tenants (school, college, coaching, madrasa) through the same migrations; remove the faker-only seeder.

### Phase 6: Docs and handover → final GATE
`docs/`: audit, architecture + ADRs, ERD/schema, migration runbook, tenant onboarding guide, API reference, module guides, security checklist, ops runbook, prioritized roadmap with estimates.

## 6. Acceptance Criteria (must pass in CI)

- [ ] Tenant-isolation suite: two tenants, no cross-leak via API, queries, files, cache, jobs, search or reports, including forged `x-tenant-id` and tokens from another tenant.
- [ ] CI fails if a table lacks `tenant_id` + RLS.
- [ ] All 11 P0 defects fixed with tests.
- [ ] App boots with only `local`/`console`/`memory` drivers and no external accounts; boot fails clearly when a required prod var is missing.
- [ ] Boundary lint passes (no vendor SDK or `process.env` outside allowed folders).
- [ ] Contract tests pass for every adapter of Storage, SMS and PaymentGateway ports.
- [ ] Switching `STORAGE_DRIVER` between `local`, `minio`, `r2` needs no code change; tenant A cannot read/list/delete tenant B objects, including crafted keys and forged/expired signed URLs.
- [ ] `.env.example` exists for all three apps and matches Zod schemas.
- [ ] Migration reconciliation: counts match, referential integrity clean, money totals equal to the paisa.
- [ ] Coverage ≥ 80% on finance, grading, auth and tenant-isolation code.

## 7. Working Rules

- One phase at a time; summarize results and open questions at each GATE; wait for approval.
- Small, reviewable commits and PRs; never rewrite unrelated code.
- Never run destructive commands on a real database; use local/staging containers only.
- No hard-coded secrets, tenant IDs, curricula or institute-specific logic; everything is configurable per tenant.
- If unsure about a Bangladeshi regulation, board rule, grading rule or payment/SMS API detail, **say so and tell me what to verify. Do not guess.**
- Record every significant decision in `docs/DECISIONS.md` (ADR style) with trade-offs and one recommendation.
- End each phase with: done / pending / risks / next step.

## 8. First Action

Start **Phase 1 only**: read the repo, confirm or correct section 2, list the P0 defects with file/line evidence, write `docs/00-audit.md`, and ask the clarifying questions in Phase 1. Do not modify code yet.