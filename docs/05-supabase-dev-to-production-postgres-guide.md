# CampusBaba Environment & Database Cutover Guide: Developer Mode (Supabase) $\leftrightarrow$ Production Mode (Self-Hosted VPS PostgreSQL 16 + PgBouncer)

> **Zero Vendor Lock-In Guarantee**
> CampusBaba is engineered using **100% standard PostgreSQL 16 DDL and Row-Level Security (RLS)** via Hexagonal Ports & Adapters ([src/config/env.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/config/env.ts) and [src/config/database.ts](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/config/database.ts)).
> All three `.env.local` files ([campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local), [campusbaba-rms/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusbaba-rms/.env.local), and [campusBaba_ui/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_ui/.env.local)) are pre-structured with **Mode A (Developer Mode — Supabase)** and **Mode B (Production Mode — Self-Hosted VPS)** blocks so you can switch between them by toggling comments.

---

## 1. Architecture Overview: Developer Mode vs. Production Mode

```mermaid
flowchart TB
    subgraph DevMode["🛠️ Mode A: Developer / Shared Staging Mode (Supabase Cloud)"]
        direction LR
        DevApps["Local / Vercel Apps\n• campusBaba_api (:5001)\n• campusbaba-rms (:3001)\n• campusBaba_ui (:3000)"]
        SupaPool["Supabase Supavisor Pooler\nPort 6543 (Transaction Mode)"]
        SupaDirect["Supabase Session Pooler\nPort 5432 (Migrations & DBeaver)"]
        SupaPG[("Supabase PostgreSQL 16\n(54 Tables + Mandatory RLS)")]
        DevApps -->|"DATABASE_URL"| SupaPool --> SupaPG
        DevApps -->|"DATABASE_ADMIN_URL"| SupaDirect --> SupaPG
    end

    subgraph ProdMode["🚀 Mode B: Production Mode (Self-Hosted VPS / Dedicated Server)"]
        direction LR
        ProdApps["Production Containers\n• Caddy Wildcard TLS (*.campusbaba.com)\n• campusBaba_api\n• campusbaba-rms\n• campusBaba_ui"]
        PgBouncer["Self-Hosted PgBouncer\nPort 6432 (Transaction Mode)"]
        ProdPG[("VPS PostgreSQL 16\nPort 5432 (54 Tables + Mandatory RLS)")]
        R2[("Cloudflare R2 Storage\ntenants/<subdomain>/*")]
        ProdApps -->|"DATABASE_URL [app_user]"| PgBouncer --> ProdPG
        ProdApps -->|"DATABASE_ADMIN_URL [app_admin]"| ProdPG
        ProdApps -->|"STORAGE_DRIVER=r2"| R2
    end

    DevMode ===>|"pg_dump -> pg_restore -> Swap .env"| ProdMode
```

---

## 2. Exact File-by-File Map: Where to Update What in Both Modes

There are **only 3 environment files** across the entire monorepo:

| Application | Env File Path | Local Port | Production Domain |
|---|---|---|---|
| **1. Backend API** | [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local) | `http://localhost:5001` | `https://api.campusbaba.com` |
| **2. SuperAdmin RMS** | [campusbaba-rms/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusbaba-rms/.env.local) | `http://localhost:3001` | `https://rms.campusbaba.com` |
| **3. Institution UI** | [campusBaba_ui/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_ui/.env.local) | `http://localhost:3000` | `https://<school>.campusbaba.com` |

---

## 3. Case 1: 🛠️ Developer Mode (Supabase Cloud PostgreSQL 16)

Use this mode during development and team testing so everyone connects to the shared Supabase PostgreSQL database without needing Docker on their machine.

### Step 3.1: Initialize Supabase Database (One-Time Setup)
1. Create a project at https://supabase.com (Region: `ap-southeast-1` Singapore).
2. Open **[0001_initial_rls_schema.sql](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/src/infrastructure/persistence/postgres/migrations/0001_initial_rls_schema.sql)**, copy all (`Ctrl+A`, `Ctrl+C`), paste into **Supabase Dashboard $\rightarrow$ SQL Editor**, and click **Run**.
3. Go to **Supabase Dashboard $\rightarrow$ Connect $\rightarrow$ URI** and copy your `<PROJECT_REF>` and `<DB_PASSWORD>`.

### Step 3.2: What to Update in `campusBaba_api/.env.local` (Lines 6–34)
Open **[campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L6-L34)** and ensure **Mode A** is active and your `<PROJECT_REF>` and `<DB_PASSWORD>` are filled in on **Lines 24–25**:

```dotenv
# --- Section 1 (Lines 6-14): Keep in development mode ---
NODE_ENV=development
PORT=5001
TENANT_RESOLUTION=host_or_header
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# --- Section 2 (Lines 20-27): [MODE A — ACTIVE: 🛠️ Developer Mode (Supabase)] ---
# 👉 UPDATE <PROJECT_REF> and <DB_PASSWORD> HERE:
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
DATABASE_ADMIN_URL=postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
DB_POOL_MAX=20
DB_SSL=true

# --- Section 4 (Lines 54-78): Keep local zero-cost drivers active ---
CACHE_DRIVER=memory
QUEUE_DRIVER=inline
STORAGE_DRIVER=local
SMS_DRIVER=console
```

### Step 3.3: What to Keep in `campusbaba-rms/.env.local` (Lines 6–10)
In **[campusbaba-rms/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusbaba-rms/.env.local#L6-L10)**, keep the Developer Mode block uncommented:

```dotenv
# 🛠️ Developer Mode (Local API)
NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
NEXT_PUBLIC_APP_BASE_DOMAIN=campusbaba.com
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_ENABLE_IMPERSONATION_BANNER=true
```

### Step 3.4: What to Keep in `campusBaba_ui/.env.local` (Lines 6–16)
In **[campusBaba_ui/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_ui/.env.local#L6-L16)**, keep the Developer Mode block uncommented:

```dotenv
# 🛠️ Developer Mode (Local API)
NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_BASE_DOMAIN=campusbaba.com
NEXT_PUBLIC_DEFAULT_LOCALE=bn
NEXT_PUBLIC_SUPPORTED_LOCALES=bn,en
NEXT_PUBLIC_TENANT_ID=dhakamodel

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=zmUM7efGIMk2gbtG2n1pIHoUxMPZRYliAhSUR6ArgeE
```

---

## 4. Case 2: 🚀 Production Mode (Self-Hosted VPS PostgreSQL 16 + PgBouncer + R2)

When you are ready to move from Supabase to your own VPS / Dedicated Server:

### Step 4.1: Migrate Data from Supabase to Your VPS PostgreSQL
1. Start your VPS PostgreSQL 16 + PgBouncer + Redis containers using **[infra/docker-compose.yml](file:///d:/Personal-projects/campusbaba_saas/infra/docker-compose.yml)**:
   ```bash
   cd infra
   docker compose up -d postgres pgbouncer redis
   ```
2. Dump your `public` schema data from Supabase (Port `5432`) and restore it into your VPS PostgreSQL (`Port 5432`):
   ```bash
   # 1. Export from Supabase:
   pg_dump "postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
     --schema=public --data-only --no-owner --no-privileges --format=custom \
     --file=supabase_data_cutover.dump

   # 2. Restore into VPS PostgreSQL:
   pg_restore --dbname="postgresql://app_admin:admin_pass_change_me@localhost:5432/campusbaba" \
     --data-only --no-owner --disable-triggers supabase_data_cutover.dump
   ```

### Step 4.2: What to Update in `campusBaba_api/.env.local` for Production
Open **[campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local)** and make these exact changes per section:

1. **Section 1 (Lines 7–14) — Switch to `production` and strict `host` resolution**:
   ```dotenv
   NODE_ENV=production
   PORT=5001
   APP_NAME=CampusBaba
   APP_BASE_DOMAIN=campusbaba.com
   TENANT_RESOLUTION=host
   CORS_ALLOWED_ORIGINS=https://campusbaba.com,https://rms.campusbaba.com
   ```
2. **Section 2 (Lines 24–34) — Comment out Mode A (Supabase) and Uncomment Mode B (VPS PostgreSQL + PgBouncer)**:
   ```dotenv
   # [MODE A — COMMENTED OUT]
   # DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   # DATABASE_ADMIN_URL=postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   # DB_POOL_MAX=20
   # DB_SSL=true

   # [MODE B — ACTIVE: 🚀 Production VPS PostgreSQL 16 + PgBouncer]
   DATABASE_URL=postgresql://app_user:app_pass@localhost:6432/campusbaba
   DATABASE_ADMIN_URL=postgresql://app_admin:admin_pass_change_me@localhost:5432/campusbaba
   DB_POOL_MAX=25
   DB_SSL=false
   ```
3. **Section 3 (Lines 39–50) — Replace Dev Secrets with Strong Production Secrets**:
   ```dotenv
   JWT_SECRET=<64-char-random-hex-secret>
   JWT_ACCESS_SECRET=<64-char-random-hex-access-secret>
   JWT_REFRESH_SECRET=<64-char-random-hex-refresh-secret>
   APP_ENCRYPTION_KEY=<64-char-random-hex-encryption-key>
   SUPERADMIN_BOOTSTRAP_EMAIL=owner@campusbaba.com
   SUPERADMIN_BOOTSTRAP_TOKEN=<strong-initial-password-min-12-chars>
   ```
4. **Section 4 (Lines 55–85) — Switch Drivers to `redis`, `bullmq`, `r2`, and Live Gateways**:
   ```dotenv
   CACHE_DRIVER=redis
   REDIS_URL=redis://localhost:6379
   QUEUE_DRIVER=bullmq

   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=<your-cloudflare-account-id>
   R2_ACCESS_KEY_ID=<your-r2-access-key-id>
   R2_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
   R2_BUCKET=campusbaba-prod-files

   SMS_DRIVER=bulksmsbd
   SMS_API_KEY=<your-bulksmsbd-api-key>
   SMS_SENDER_ID=CAMPUSBABA
   ```

### Step 4.3: What to Update in `campusbaba-rms/.env.local` for Production
Open **[campusbaba-rms/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusbaba-rms/.env.local#L12-L14)**, comment out the `localhost` lines, and uncomment the Production block:

```dotenv
# 🛠️ Developer Mode (Commented out)
# NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1

# 🚀 Production Mode (Active)
NEXT_PUBLIC_API_URL=https://api.campusbaba.com/api/v1
NEXT_PUBLIC_APP_BASE_DOMAIN=campusbaba.com
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_ENABLE_IMPERSONATION_BANNER=true
```

### Step 4.4: What to Update in `campusBaba_ui/.env.local` for Production
Open **[campusBaba_ui/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_ui/.env.local#L18-L21)**, comment out the `localhost` lines, and uncomment the Production block:

```dotenv
# 🛠️ Developer Mode (Commented out)
# NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
# NEXT_PUBLIC_APP_URL=http://localhost:3000
# NEXTAUTH_URL=http://localhost:3000

# 🚀 Production Mode (Active)
NEXT_PUBLIC_API_URL=https://api.campusbaba.com/api/v1
NEXT_PUBLIC_APP_URL=https://app.campusbaba.com
NEXT_PUBLIC_APP_BASE_DOMAIN=campusbaba.com
NEXT_PUBLIC_DEFAULT_LOCALE=bn
NEXT_PUBLIC_SUPPORTED_LOCALES=bn,en
NEXTAUTH_URL=https://app.campusbaba.com
NEXTAUTH_SECRET=<64-char-random-hex-secret>
```

---

## 5. Quick Reference Summary Table (What Changes Between Modes)

| File & Line Range | Variable | 🛠️ Developer Mode (Supabase) | 🚀 Production Mode (Self-Hosted VPS) |
|---|---|---|---|
| [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L7-L14) | `NODE_ENV` | `development` | `production` |
| [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L13) | `TENANT_RESOLUTION` | `host_or_header` | `host` |
| [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L24-L34) | `DATABASE_URL` | Supabase Pooler (`:6543`) | Local PgBouncer (`:6432` as `app_user`) |
| [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L25-L34) | `DATABASE_ADMIN_URL` | Supabase Direct (`:5432`) | Local Postgres (`:5432` as `app_admin`) |
| [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L27-L34) | `DB_SSL` | `true` | `false` (on internal Docker bridge) |
| [campusBaba_api/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_api/.env.local#L55-L60) | `CACHE_DRIVER` / `STORAGE_DRIVER` | `memory` / `local` | `redis` / `r2` |
| [campusbaba-rms/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusbaba-rms/.env.local#L7-L14) | `NEXT_PUBLIC_API_URL` | `http://localhost:5001/api/v1` | `https://api.campusbaba.com/api/v1` |
| [campusBaba_ui/.env.local](file:///d:/Personal-projects/campusbaba_saas/campusBaba_ui/.env.local#L7-L21) | `NEXT_PUBLIC_API_URL` | `http://localhost:5001/api/v1` | `https://api.campusbaba.com/api/v1` |
