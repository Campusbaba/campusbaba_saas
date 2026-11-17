-- =============================================================================
-- Migration: 0001_initial_rls_schema.sql
-- Purpose: Complete PostgreSQL Relational Schema, Bangladesh Modules & Mandatory RLS
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- -----------------------------------------------------------------------------
-- 1. Database Roles (Non-superuser app_user with NOBYPASSRLS)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOSUPERUSER CREATEDB NOCREATEROLE BYPASSRLS LOGIN;
  END IF;
END
$$;

-- Helper function for fail-closed current tenant resolution
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- 2. PLATFORM / GLOBAL TABLES (No tenant_id RLS — Governed by Platform Admin)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name varchar(150) NOT NULL,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  legacy_mongo_id varchar(64) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  name_bn varchar(100),
  billing_cycle varchar(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  price_bdt numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (price_bdt >= 0),
  max_students integer NOT NULL DEFAULT 100 CHECK (max_students > 0),
  max_teachers integer NOT NULL DEFAULT 10 CHECK (max_teachers > 0),
  max_admins integer NOT NULL DEFAULT 3 CHECK (max_admins > 0),
  storage_limit_mb integer NOT NULL DEFAULT 500 CHECK (storage_limit_mb > 0),
  included_sms_credits integer NOT NULL DEFAULT 0 CHECK (included_sms_credits >= 0),
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(63) NOT NULL UNIQUE,
  custom_domain varchar(255) UNIQUE,
  name varchar(200) NOT NULL,
  name_bn varchar(200),
  institution_type varchar(40) NOT NULL DEFAULT 'school'
    CHECK (institution_type IN ('school', 'college', 'madrasa_alia', 'madrasa_qawmi', 'coaching', 'english_medium', 'university')),
  eiin_number varchar(20),
  board_code varchar(30),
  status varchar(30) NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'exporting', 'purged')),
  plan_id uuid REFERENCES plans(id) ON DELETE RESTRICT,
  dedicated_db_url text,
  weekend_days jsonb NOT NULL DEFAULT '["friday","saturday"]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_mongo_id varchar(64) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT NOW(),
  current_period_end timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  grace_ends_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_no varchar(50) NOT NULL UNIQUE,
  amount_bdt numeric(12,2) NOT NULL CHECK (amount_bdt >= 0),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'void')),
  due_date date NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(200) NOT NULL,
  content text NOT NULL,
  category varchar(30) NOT NULL CHECK (category IN ('general', 'academic', 'exam', 'event', 'holiday', 'urgent')),
  priority varchar(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status varchar(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  target_audiences jsonb NOT NULL DEFAULT '["all"]'::jsonb,
  target_tenant_ids jsonb NOT NULL DEFAULT '["all"]'::jsonb,
  publish_date timestamptz NOT NULL DEFAULT NOW(),
  expiry_date timestamptz,
  created_by uuid REFERENCES platform_admins(id) ON DELETE SET NULL,
  legacy_mongo_id varchar(64) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  phone_e164 varchar(20) UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  code varchar(100) PRIMARY KEY,
  module varchar(50) NOT NULL,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_rejects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug varchar(63) NOT NULL,
  collection_name varchar(100) NOT NULL,
  legacy_mongo_id varchar(64),
  raw_document jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id uuid,
  impersonated_by_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL,
  action varchar(120) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id varchar(120),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Append-only protection on audit_logs
CREATE OR REPLACE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- =============================================================================
-- 3. TENANT-SCOPED TABLES (All 37 tables enforce tenant_id + Mandatory RLS)
-- =============================================================================

-- 1. tenant_limits
CREATE TABLE IF NOT EXISTS tenant_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  max_students integer NOT NULL DEFAULT 100 CHECK (max_students > 0),
  max_teachers integer NOT NULL DEFAULT 10 CHECK (max_teachers > 0),
  max_admins integer NOT NULL DEFAULT 3 CHECK (max_admins > 0),
  storage_limit_mb integer NOT NULL DEFAULT 500 CHECK (storage_limit_mb > 0),
  sms_credit_balance integer NOT NULL DEFAULT 0 CHECK (sms_credit_balance >= 0),
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE tenant_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_limits AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 2. tenant_sequences
CREATE TABLE IF NOT EXISTS tenant_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sequence_name varchar(50) NOT NULL,
  prefix varchar(20) NOT NULL,
  padding integer NOT NULL DEFAULT 4,
  current_val bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sequence_name)
);
ALTER TABLE tenant_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_sequences AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 3. departments
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code varchar(30) NOT NULL,
  name varchar(150) NOT NULL,
  name_bn varchar(150),
  description text,
  head_staff_id uuid,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON departments AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 4. staff
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  staff_code varchar(40) NOT NULL,
  staff_type varchar(20) NOT NULL CHECK (staff_type IN ('teacher', 'employee', 'admin')),
  first_name varchar(60) NOT NULL,
  last_name varchar(60) NOT NULL,
  full_name_bn varchar(150),
  email varchar(255) NOT NULL,
  phone_e164 varchar(25) NOT NULL,
  date_of_birth date NOT NULL,
  gender varchar(15) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  nid_number varchar(30),
  qualification varchar(200),
  specialization jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience_years integer NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  position varchar(100),
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  department_name varchar(100),
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  base_salary numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (base_salary >= 0),
  payroll_model varchar(30) NOT NULL DEFAULT 'fixed' CHECK (payroll_model IN ('fixed', 'per_class', 'per_student', 'revenue_share')),
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_image_key text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on-leave')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, staff_code),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON staff AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 5. guardians
CREATE TABLE IF NOT EXISTS guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  guardian_code varchar(40) NOT NULL,
  first_name varchar(60) NOT NULL,
  last_name varchar(60) NOT NULL,
  full_name_bn varchar(150),
  email varchar(255) NOT NULL,
  phone_e164 varchar(25) NOT NULL,
  nid_number varchar(30),
  occupation varchar(120),
  relationship varchar(30) NOT NULL CHECK (relationship IN ('father', 'mother', 'guardian')),
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_image_key text,
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, guardian_code),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON guardians AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 6. academic_years
CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code varchar(30) NOT NULL,
  name varchar(100) NOT NULL,
  name_bn varchar(100),
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON academic_years AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 7. courses
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code varchar(40) NOT NULL,
  name varchar(150) NOT NULL,
  name_bn varchar(150),
  description text,
  credits integer NOT NULL DEFAULT 1 CHECK (credits >= 1),
  duration_months integer NOT NULL DEFAULT 12 CHECK (duration_months >= 1),
  track_type varchar(40) NOT NULL DEFAULT 'general_nctb'
    CHECK (track_type IN ('general_nctb', 'madrasa_alia', 'madrasa_qawmi', 'english_medium', 'coaching', 'university')),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON courses AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 8. class_sections
CREATE TABLE IF NOT EXISTS class_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE SET NULL,
  class_code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  name_bn varchar(120),
  section_name varchar(40) NOT NULL DEFAULT 'A',
  shift varchar(20) NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning', 'day', 'evening')),
  medium varchar(20) NOT NULL DEFAULT 'bangla' CHECK (medium IN ('bangla', 'english', 'english_version', 'arabic')),
  group_stream varchar(30) NOT NULL DEFAULT 'general' CHECK (group_stream IN ('general', 'science', 'humanities', 'business_studies', 'hifz', 'nazera')),
  room_number varchar(40) NOT NULL,
  capacity integer NOT NULL DEFAULT 40 CHECK (capacity >= 1),
  academic_year varchar(30) NOT NULL,
  semester varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, class_code),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE class_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON class_sections AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 9. students
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_code varchar(40) NOT NULL,
  first_name varchar(60) NOT NULL,
  last_name varchar(60) NOT NULL,
  full_name_bn varchar(150),
  email varchar(255) NOT NULL,
  phone_e164 varchar(25) NOT NULL,
  date_of_birth date NOT NULL,
  gender varchar(15) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  blood_group varchar(10),
  religion varchar(30),
  birth_reg_no varchar(40),
  nid_number varchar(30),
  quota_category varchar(40) DEFAULT 'none',
  disability_info text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  bd_geo jsonb NOT NULL DEFAULT '{}'::jsonb,
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_class_id uuid REFERENCES class_sections(id) ON DELETE SET NULL,
  enrollment_date date NOT NULL DEFAULT CURRENT_DATE,
  profile_image_key text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated', 'suspended')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_code),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON students AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 10. student_guardians
CREATE TABLE IF NOT EXISTS student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship varchar(30) NOT NULL DEFAULT 'guardian',
  is_primary boolean NOT NULL DEFAULT true,
  is_fee_payer boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, guardian_id)
);
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON student_guardians AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 11. student_enrollments
CREATE TABLE IF NOT EXISTS student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE RESTRICT,
  academic_year varchar(30) NOT NULL,
  roll_number integer,
  board_reg_no varchar(40),
  board_roll_no varchar(40),
  fourth_subject_code varchar(30),
  status varchar(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'promoted', 'transferred', 'dropped')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, class_section_id, academic_year)
);
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON student_enrollments AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 12. tenant_memberships
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_role varchar(30) NOT NULL CHECK (primary_role IN ('admin', 'employee', 'teacher', 'student', 'parent')),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  guardian_id uuid REFERENCES guardians(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id),
  CONSTRAINT chk_membership_entity_ref CHECK (
    (primary_role IN ('admin', 'employee', 'teacher') AND staff_id IS NOT NULL) OR
    (primary_role = 'student' AND student_id IS NOT NULL) OR
    (primary_role = 'parent' AND guardian_id IS NOT NULL)
  )
);
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_memberships AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 13. roles
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  name_bn varchar(100),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON roles AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 14. role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code varchar(100) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role_id, permission_code)
);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON role_permissions AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 15. invitations
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  email varchar(255) NOT NULL,
  role_code varchar(40) NOT NULL,
  target_entity_id uuid NOT NULL,
  person_name varchar(150) NOT NULL,
  token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON invitations AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 16. provider_credentials
CREATE TABLE IF NOT EXISTS provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  capability varchar(30) NOT NULL CHECK (capability IN ('sms', 'payment', 'email')),
  provider_code varchar(40) NOT NULL,
  encrypted_payload text NOT NULL,
  iv varchar(64) NOT NULL,
  auth_tag varchar(64) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, capability, provider_code)
);
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON provider_credentials AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 17. coaching_batches
CREATE TABLE IF NOT EXISTS coaching_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  batch_code varchar(40) NOT NULL,
  name varchar(150) NOT NULL,
  name_bn varchar(150),
  schedule_summary varchar(200) NOT NULL,
  capacity integer NOT NULL DEFAULT 50 CHECK (capacity >= 1),
  waitlist_count integer NOT NULL DEFAULT 0 CHECK (waitlist_count >= 0),
  fee_model varchar(20) NOT NULL DEFAULT 'monthly' CHECK (fee_model IN ('monthly', 'package', 'per_subject')),
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (monthly_fee >= 0),
  teacher_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'upcoming', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, batch_code)
);
ALTER TABLE coaching_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON coaching_batches AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 18. batch_enrollments
CREATE TABLE IF NOT EXISTS batch_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES coaching_batches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_date date NOT NULL DEFAULT CURRENT_DATE,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  is_waitlisted boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waitlisted', 'transferred', 'dropped')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, batch_id, student_id)
);
ALTER TABLE batch_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON batch_enrollments AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 19. timetable_entries
CREATE TABLE IF NOT EXISTS timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  teacher_staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  day_of_week varchar(15) NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  subject varchar(120) NOT NULL,
  room_number varchar(40) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'rescheduled')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON timetable_entries AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 20. attendance_records
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status varchar(15) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  source varchar(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'qr_card', 'biometric')),
  marked_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  marked_by_label varchar(120),
  remarks text,
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, class_section_id, attendance_date),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON attendance_records AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 21. grading_schemes (Bangladesh 5.00 GPA + 4th Subject)
CREATE TABLE IF NOT EXISTS grading_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL,
  max_gpa numeric(4,2) NOT NULL DEFAULT 5.00,
  enable_fourth_subject_bonus boolean NOT NULL DEFAULT true,
  fourth_subject_deduction numeric(4,2) NOT NULL DEFAULT 2.00,
  fail_if_any_mandatory_failed boolean NOT NULL DEFAULT true,
  grade_bands jsonb NOT NULL DEFAULT '[
    {"minPct":80,"maxPct":100,"letter":"A+","gp":5.00},
    {"minPct":70,"maxPct":79.99,"letter":"A","gp":4.00},
    {"minPct":60,"maxPct":69.99,"letter":"A-","gp":3.50},
    {"minPct":50,"maxPct":59.99,"letter":"B","gp":3.00},
    {"minPct":40,"maxPct":49.99,"letter":"C","gp":2.00},
    {"minPct":33,"maxPct":39.99,"letter":"D","gp":1.00},
    {"minPct":0,"maxPct":32.99,"letter":"F","gp":0.00}
  ]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);
ALTER TABLE grading_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_schemes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON grading_schemes AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 22. exams
CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  exam_code varchar(50) NOT NULL,
  name varchar(150) NOT NULL,
  name_bn varchar(150),
  exam_type varchar(30) NOT NULL CHECK (exam_type IN ('midterm', 'final', 'quiz', 'assignment', 'practical', 'model_test', 'admission_test')),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE RESTRICT,
  grading_scheme_id uuid REFERENCES grading_schemes(id) ON DELETE SET NULL,
  exam_date date NOT NULL,
  start_time varchar(10) NOT NULL,
  end_time varchar(10) NOT NULL,
  total_marks numeric(8,2) NOT NULL CHECK (total_marks >= 1),
  passing_marks numeric(8,2) NOT NULL CHECK (passing_marks >= 0),
  is_negative_marking boolean NOT NULL DEFAULT false,
  negative_mark_per_wrong numeric(5,2) NOT NULL DEFAULT 0.25,
  instructions text,
  status varchar(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, exam_code),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON exams AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 23. exam_marks
CREATE TABLE IF NOT EXISTS exam_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained numeric(8,2) NOT NULL CHECK (marks_obtained >= 0),
  letter_grade varchar(10),
  grade_point numeric(4,2),
  is_fourth_subject boolean NOT NULL DEFAULT false,
  remarks text,
  evaluated_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  evaluated_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluated', 'published')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, exam_id, student_id),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE exam_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_marks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON exam_marks AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 24. mcq_questions
CREATE TABLE IF NOT EXISTS mcq_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  subject varchar(100) NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL,
  correct_option_index integer NOT NULL CHECK (correct_option_index >= 0),
  marks numeric(5,2) NOT NULL DEFAULT 1.00,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE mcq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON mcq_questions AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 25. fee_heads
CREATE TABLE IF NOT EXISTS fee_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  name_bn varchar(120),
  category varchar(30) NOT NULL CHECK (category IN ('tuition', 'exam', 'library', 'transport', 'hostel', 'admission', 'other')),
  default_amount numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (default_amount >= 0),
  is_recurring boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON fee_heads AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 26. fee_invoices
CREATE TABLE IF NOT EXISTS fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_no varchar(50) NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  fee_type varchar(30) NOT NULL CHECK (fee_type IN ('tuition', 'exam', 'library', 'transport', 'hostel', 'other')),
  academic_year varchar(30) NOT NULL,
  semester varchar(40) NOT NULL,
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  waiver_amount numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (waiver_amount >= 0),
  net_amount numeric(12,2) NOT NULL CHECK (net_amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  due_date date NOT NULL,
  paid_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  remarks text,
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, invoice_no),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON fee_invoices AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 27. invoice_lines
CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  fee_head_id uuid REFERENCES fee_heads(id) ON DELETE SET NULL,
  description varchar(200) NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON invoice_lines AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 28. payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_code varchar(50) NOT NULL,
  invoice_id uuid REFERENCES fee_invoices(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  payment_method varchar(30) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank-transfer', 'online', 'mfs_manual')),
  gateway varchar(30) NOT NULL DEFAULT 'manual' CHECK (gateway IN ('manual', 'bkash', 'nagad', 'rocket', 'upay', 'sslcommerz', 'aamarpay', 'shurjopay')),
  transaction_id varchar(100),
  sender_phone varchar(25),
  slip_file_id uuid,
  verification_status varchar(20) NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending_verification', 'verified', 'rejected')),
  verified_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT NOW(),
  remarks text,
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, payment_code),
  UNIQUE (tenant_id, legacy_mongo_id)
);
-- Partial unique index preventing duplicate TrxID per tenant & gateway
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_trx
  ON payments (tenant_id, gateway, transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON payments AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 29. payment_allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  allocated_amount numeric(12,2) NOT NULL CHECK (allocated_amount > 0),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON payment_allocations AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 30. waivers
CREATE TABLE IF NOT EXISTS waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  waiver_type varchar(40) NOT NULL CHECK (waiver_type IN ('sibling', 'merit', 'freedom_fighter_quota', 'financial_aid', 'multi_subject', 'promo_code')),
  percentage numeric(5,2) CHECK (percentage >= 0 AND percentage <= 100),
  fixed_amount numeric(12,2) CHECK (fixed_amount >= 0),
  approved_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waivers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON waivers AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 31. expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  category varchar(30) NOT NULL CHECK (category IN ('salary', 'fixed', 'other')),
  subcategory varchar(100) NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description text NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method varchar(30) NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank-transfer', 'cheque')),
  transaction_id varchar(100),
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  approved_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  remarks text,
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON expenses AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 32. payroll_runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  period_month varchar(7) NOT NULL,
  payroll_model varchar(30) NOT NULL,
  classes_taken integer NOT NULL DEFAULT 0,
  active_students_count integer NOT NULL DEFAULT 0,
  gross_amount numeric(12,2) NOT NULL CHECK (gross_amount >= 0),
  deductions numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (deductions >= 0),
  net_amount numeric(12,2) NOT NULL CHECK (net_amount >= 0),
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, staff_id, period_month)
);
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON payroll_runs AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 33. notices
CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL,
  content text NOT NULL,
  category varchar(30) NOT NULL CHECK (category IN ('general', 'academic', 'exam', 'event', 'holiday', 'urgent')),
  target_audiences jsonb NOT NULL DEFAULT '["all"]'::jsonb,
  publish_date timestamptz NOT NULL DEFAULT NOW(),
  expiry_date timestamptz,
  created_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  modified_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  priority varchar(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  legacy_mongo_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_mongo_id)
);
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON notices AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 34. notice_targets
CREATE TABLE IF NOT EXISTS notice_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  notice_id uuid NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  audience_role varchar(30) NOT NULL CHECK (audience_role IN ('student', 'parent', 'teacher', 'employee', 'all')),
  class_section_id uuid REFERENCES class_sections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE notice_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_targets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON notice_targets AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 35. files (Cloudflare R2 / StoragePort Source of Truth)
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  object_key varchar(512) NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  mime_type varchar(120) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 varchar(64),
  module varchar(50) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id varchar(100) NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false,
  visibility varchar(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'deleted', 'quarantined')),
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON files AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 36. sms_logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  recipient_phone varchar(25) NOT NULL,
  message_body text NOT NULL,
  encoding varchar(15) NOT NULL CHECK (encoding IN ('GSM_7', 'UCS_2')),
  character_count integer NOT NULL,
  segment_count integer NOT NULL CHECK (segment_count >= 1),
  sender_id varchar(20) NOT NULL,
  gateway varchar(30) NOT NULL,
  gateway_message_id varchar(100),
  status varchar(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON sms_logs AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 37. library_books
CREATE TABLE IF NOT EXISTS library_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  isbn varchar(30),
  barcode varchar(50) NOT NULL,
  title varchar(200) NOT NULL,
  title_bn varchar(200),
  author varchar(150) NOT NULL,
  category varchar(80) NOT NULL,
  total_copies integer NOT NULL DEFAULT 1 CHECK (total_copies >= 0),
  available_copies integer NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, barcode)
);
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_books FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON library_books AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 38. library_loans
CREATE TABLE IF NOT EXISTS library_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES library_books(id) ON DELETE RESTRICT,
  borrower_student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  borrower_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT NOW(),
  due_date date NOT NULL,
  returned_at timestamptz,
  fine_amount numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (fine_amount >= 0),
  status varchar(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'overdue', 'lost')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE library_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_loans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON library_loans AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 39. transport_routes
CREATE TABLE IF NOT EXISTS transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  route_code varchar(40) NOT NULL,
  name varchar(150) NOT NULL,
  name_bn varchar(150),
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (monthly_fee >= 0),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, route_code)
);
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON transport_routes AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 40. transport_vehicles
CREATE TABLE IF NOT EXISTS transport_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  registration_no varchar(50) NOT NULL,
  vehicle_type varchar(40) NOT NULL DEFAULT 'bus',
  capacity integer NOT NULL DEFAULT 40 CHECK (capacity > 0),
  driver_name varchar(120) NOT NULL,
  driver_phone varchar(25) NOT NULL,
  fitness_expiry_date date,
  tax_token_expiry_date date,
  insurance_expiry_date date,
  route_id uuid REFERENCES transport_routes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, registration_no)
);
ALTER TABLE transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_vehicles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON transport_vehicles AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 41. transport_assignments
CREATE TABLE IF NOT EXISTS transport_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  stop_name varchar(120) NOT NULL,
  monthly_fee numeric(12,2) NOT NULL CHECK (monthly_fee >= 0),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id)
);
ALTER TABLE transport_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON transport_assignments AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 42. hostel_rooms
CREATE TABLE IF NOT EXISTS hostel_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  building_name varchar(100) NOT NULL,
  room_number varchar(40) NOT NULL,
  gender_policy varchar(20) NOT NULL CHECK (gender_policy IN ('male', 'female')),
  bed_capacity integer NOT NULL DEFAULT 4 CHECK (bed_capacity >= 1),
  occupied_beds integer NOT NULL DEFAULT 0 CHECK (occupied_beds >= 0),
  monthly_seat_rent numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (monthly_seat_rent >= 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, building_name, room_number)
);
ALTER TABLE hostel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_rooms FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON hostel_rooms AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 43. hostel_allocations
CREATE TABLE IF NOT EXISTS hostel_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES hostel_rooms(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bed_number varchar(20) NOT NULL,
  allocated_date date NOT NULL DEFAULT CURRENT_DATE,
  vacated_date date,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacated')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, status)
);
ALTER TABLE hostel_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON hostel_allocations AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- 44. hostel_meals
CREATE TABLE IF NOT EXISTS hostel_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  meal_date date NOT NULL,
  breakfast_on boolean NOT NULL DEFAULT true,
  lunch_on boolean NOT NULL DEFAULT true,
  dinner_on boolean NOT NULL DEFAULT true,
  per_meal_rate numeric(8,2) NOT NULL DEFAULT 60.00 CHECK (per_meal_rate >= 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, meal_date)
);
ALTER TABLE hostel_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_meals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON hostel_meals AS RESTRICTIVE FOR ALL TO app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

COMMIT;
