# Phase 6: Operations Runbook, Onboarding Guide, Security Checklist & Roadmap (`03-handover-and-runbooks.md`)

> **Status**: Complete Handover & Operations Documentation
> **Companion Documents**:
> - [00-audit.md](file:///d:/Personal-projects/campusbaba_saas/docs/00-audit.md) — Phase 1 Codebase Audit & P0 Evidence
> - [01-architecture.md](file:///d:/Personal-projects/campusbaba_saas/docs/01-architecture.md) — Phase 2 Hexagonal Architecture, RLS, R2 Storage & Env Matrix
> - [DECISIONS.md](file:///d:/Personal-projects/campusbaba_saas/docs/DECISIONS.md) — Architecture Decision Records (ADR-001 through ADR-006)
> - [02-schema-and-mapping.md](file:///d:/Personal-projects/campusbaba_saas/docs/02-schema-and-mapping.md) — Phase 3 PostgreSQL ERD, RLS DDL & Mongo-to-Postgres ETL

---

## 1. Tenant Onboarding & Lifecycle Runbook

### 1.1 Provisioning a New School, College, Madrasa, or Coaching Center
1. **Via SuperAdmin RMS Portal (`https://rms.campusbaba.com/dashboard/provision`)**:
   - Authenticate as SuperAdmin (`POST /api/v1/superadmin/login` $\rightarrow$ issues `httpOnly; Secure; SameSite=Lax` cookie).
   - Provide Institution Name (English & Bangla), Subdomain slug (e.g., `dhakamodel`), Institution Type (`school`, `college`, `madrasa_alia`, `madrasa_qawmi`, `coaching`, `english_medium`), Billing Plan (`starter`, `prepaid`, `postpaid`, `coaching_pro`, `enterprise`), and Initial Owner credentials.
2. **Wildcard DNS & Custom Domain Setup**:
   - Wildcard DNS `*.campusbaba.com` routes automatically through [infra/Caddyfile](file:///d:/Personal-projects/campusbaba_saas/infra/Caddyfile) with On-Demand TLS.
   - To attach a custom domain (e.g., `portal.dhakamodel.edu.bd`), ask the institution to add a `CNAME` pointing to `cname.campusbaba.com`, set `tenants.custom_domain`, and Caddy automatically provisions a Let's Encrypt TLS certificate after verifying `GET /health`.
3. **Onboarding Staff, Teachers, Students & Guardians via Signed QR Invitations**:
   - School Admin opens **Register User** on `/admin/dashboard` $\rightarrow$ selects Role & Profile $\rightarrow$ calls `POST /api/v1/auth/invitations`.
   - Backend generates a signed, single-use, tenant-bound invitation token (`invitations.token_hash`, 24h expiry).
   - User scans the QR code or opens `/register/[token]` on their institution's subdomain and sets their password (`POST /api/v1/auth/register`).

### 1.2 Safe Tenant Offboarding & Verified Purge Runbook (P0-6)
Never delete an active tenant directly. Follow the 3-step verified offboarding sequence:
1. **Step 1 — Suspend**: `POST /api/v1/superadmin/tenants/:id/suspend` (immediately blocks tenant mutations/logins in `tenantResolver`).
2. **Step 2 — Export & Retention Hold**: `POST /api/v1/superadmin/tenants/:id/export` (generates SHA-256 manifest of all tenant data and R2 objects under `tenants/{subdomain}/` and starts a 14-day retention hold).
3. **Step 3 — Verified Purge**: `DELETE /api/v1/superadmin/tenants/:id` (purges all objects under `tenants/{subdomain}/` via `StoragePort.deletePrefix`, purges RLS rows, evicts database connections, and writes an immutable `tenant.purged` entry to `audit_logs`).

---

## 2. Bangladesh Modules Guide & Verification Notes

| Module | Endpoints / Files | Capabilities & Regulatory Verification Notes |
| :--- | :--- | :--- |
| **1. Localization (`en`/`bn`)** | [bd-localization.ts](file:///d:/Personal-projects/campusbaba_saas/packages/shared/src/bd-localization.ts) | Bangla numerals (`০-৯`), South Asian Lakh/Crore currency (`৳১২,৩৪,৫৬৭.৫০`), amount-in-words in Bangla & English (`One Lakh Twenty Five Thousand Five Hundred Taka Only`), Revised Bangla Calendar (`বঙ্গাব্দ`), and Division $\rightarrow$ District $\rightarrow$ Upazila hierarchy. |
| **2. Academics & 5.00 GPA** | [BangladeshGradingPolicy.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/domain/grading/BangladeshGradingPolicy.ts)<br>`POST /api/v1/bd/academics/gpa-tabulation`<br>`POST /api/v1/bd/academics/marksheet-pdf` | Configurable NCTB/Madrasa 5.00 GPA scale (`A+` 5.00, `A` 4.00, `A-` 3.50, `B` 3.00, `C` 2.00, `D` 1.00, `F` 0.00), fail-in-any-mandatory-subject rule, optional **4th-subject bonus** ($\max(0, \text{GP}_{4\text{th}} - 2.00)$), merit position ranking with tie-breakers, and Noto Sans Bengali PDF marksheets.<br>⚠️ *Verification Note*: Before exporting official eSIF/eFF CSVs for Dhaka/Education Boards, verify the current year's board column layout from the respective Education Board portal. |
| **3. Coaching & Batches** | [BangladeshModulesService.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/application/services/BangladeshModulesService.ts)<br>`POST /api/v1/bd/batches`<br>`POST /api/v1/bd/batches/:batchId/enroll`<br>`POST /api/v1/bd/exams/mcq/evaluate` | Batch capacity enforcement with automatic waitlist overflow, mid-month pro-rated fee calculation with sibling/multi-subject discounts, MCQ auto-grading with configurable negative marking (e.g., `-0.25` per wrong answer), and 4 teacher payroll models (`fixed`, `per_class`, `per_student`, `revenue_share`). |
| **4. Bangladeshi Payments** | [payment.adapters.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/infrastructure/payments/payment.adapters.ts)<br>`POST /api/v1/bd/mfs-payments/submit`<br>`POST /api/v1/bd/mfs-payments/:paymentId/verify` | Supports **Manual Send-Money TrxID** (`bKash`, `Nagad`, `Rocket`, `Upay`) with duplicate `(tenant_id, gateway, transaction_id)` protection, accountant approval workflow, oldest-due-first (`FIFO`) invoice allocation, and plug-and-play adapters for `SSLCommerz`, `bKash`, `Nagad`, and `aamarPay`. |
| **5. BTRC-Compliant SMS** | [BtrcSmsPolicy.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/domain/sms/BtrcSmsPolicy.ts)<br>`POST /api/v1/bd/sms/send` | Automatic GSM-7 (`160`/`153` chars) vs. Bangla Unicode UCS-2 (`70`/`67` chars) segment calculation, BTRC 11-character alphanumeric masking Sender ID validation, 09:00–21:00 `Asia/Dhaka` promotional window enforcement, and per-tenant SMS credit deduction. |
| **6. Cloudflare R2 Storage** | [FileStorageService.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/application/services/FileStorageService.ts)<br>`POST /api/v1/bd/files/upload-url`<br>`POST /api/v1/bd/files/upload-direct`<br>`GET /api/v1/bd/files/:id/download-url` | Private bucket by default (`tenants/{tenant_id}/{module}/{entity_id}/{uuid}-{filename}`), R2 free-tier guardrails (10 GB / 1M Class A / 10M Class B, 70%/90% alerts, per-tenant MB quota, 300 KB photo cap, no video hosting), magic-byte MIME check, JPEG EXIF stripping, and audit-logged access to sensitive documents (`nid`, `birth_certificate`). |
| **7. Library, Transport & Hostel**| `POST /api/v1/bd/library/books`<br>`POST /api/v1/bd/library/loans`<br>`POST /api/v1/bd/transport/routes`<br>`POST /api/v1/bd/hostel/allocations` | Barcode/ISBN book catalogue & loan tracking, transport routes/stops & vehicle expiry tracking, and gender-segregated hostel room/bed allocation & mess meal tracking. |

---

## 3. Security & Compliance Checklist (OWASP & Minor Data Protection)

- [x] **Row-Level Security (RLS) Enforced**: All 44 tenant tables in [0001_initial_rls_schema.sql](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/infrastructure/persistence/postgres/migrations/0001_initial_rls_schema.sql) have `tenant_id uuid NOT NULL`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a restrictive `USING / WITH CHECK` policy verified in CI by `npm run verify:rls`.
- [x] **All 11 P0 Defects Remediated & Tested**: Verified by automated regression tests in [tests/run-all-tests.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/tests/run-all-tests.ts).
- [x] **Hexagonal Boundary & Secret Hygiene**: Verified in CI by `npm run verify:boundaries` ([scripts/check-env-and-boundaries.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/scripts/check-env-and-boundaries.ts)).
- [x] **Student / Minor Data Privacy**:
  - JPEG EXIF/GPS metadata is stripped automatically upon upload (`stripJpegExif`).
  - Sensitive personal documents (`nid`, `birth_certificate`, `transfer_certificate`, `medical_record`) are strictly private and every download URL request is recorded in the append-only `audit_logs` table.
  - *Legal Advisory*: Before commercial launch in Bangladesh, have local legal counsel review institutional data processing agreements under the **Cyber Security Act / Digital Data Protection guidelines of Bangladesh** regarding guardian consent for minor students.

---

## 4. Operations Commands & CI Pipeline Reference

```bash
# 1. Start local infrastructure (PostgreSQL 16 + PgBouncer + Redis 7 + MinIO + Mailpit + Caddy)
docker compose -f infra/docker-compose.yml up -d

# 2. Run all CI gates & automated test suites (RLS DDL check + Boundary/Env check + 27-test suite)
cd campusBaba_api
npm run verify:all

# 3. Build TypeScript API
npm run build
```

---

## 5. Prioritized Post-Cutover Roadmap & Estimates

| Priority | Milestone | Effort Estimate | Notes |
| :---: | :--- | :---: | :--- |
| **P1** | **VPS Staging Deployment & Load Testing (1,000 Tenants / 500k Students)** | 1–2 Weeks | Deploy Docker Compose + PgBouncer + Caddy + Cloudflare R2 bucket; run k6 load tests targeting p95 < 300ms. |
| **P1** | **Live MFS Merchant Production Credentials (bKash / Nagad / SSLCommerz) & BTRC Masking Sender ID Registration** | 1–2 Weeks | Obtain BTRC masking Sender ID approval (corporate trade license + letterhead) and plug merchant keys into `provider_credentials`. |
| **P2** | **Guardian Mobile PWA & OTP Login Rollout** | 2 Weeks | Enable service-worker offline caching for routines/notices and SMS OTP login with rate-limiting. |
| **P3** | **Phase 4 Section 11 Optional Modules (Subject to Approval)** | 3–4 Weeks | Online admission portal, gate pass QR scanner, canteen POS/wallet, alumni/waqf donations, and TV notice board. |
