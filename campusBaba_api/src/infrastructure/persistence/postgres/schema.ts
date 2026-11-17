/**
 * Drizzle ORM / PostgreSQL Relational Schema Definition
 * Covers Platform SaaS tables, Identity/RBAC, Core Academic/Finance tables,
 * and Bangladesh Modules (Coaching Batches, 5.00 GPA Grading, Library, Transport, Hostel, SMS, R2 Files).
 */

export interface TenantScopedRow {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PLATFORM_TABLES = [
  "platform_admins",
  "plans",
  "tenants",
  "subscriptions",
  "platform_invoices",
  "platform_notices",
  "users",
  "permissions",
  "migration_rejects",
  "audit_logs", // Global + tenant-optional append-only audit log
] as const;

export const TENANT_RLS_TABLES = [
  "tenant_limits",
  "tenant_sequences",
  "tenant_memberships",
  "roles",
  "role_permissions",
  "invitations",
  "provider_credentials",
  "departments",
  "staff",
  "guardians",
  "students",
  "student_guardians",
  "academic_years",
  "courses",
  "class_sections",
  "student_enrollments",
  "coaching_batches",
  "batch_enrollments",
  "timetable_entries",
  "attendance_records",
  "grading_schemes",
  "exams",
  "exam_marks",
  "mcq_questions",
  "fee_heads",
  "fee_invoices",
  "invoice_lines",
  "payments",
  "payment_allocations",
  "waivers",
  "expenses",
  "payroll_runs",
  "notices",
  "notice_targets",
  "files",
  "sms_logs",
  "library_books",
  "library_loans",
  "transport_routes",
  "transport_vehicles",
  "transport_assignments",
  "hostel_rooms",
  "hostel_allocations",
  "hostel_meals",
] as const;

export type TenantRlsTableName = (typeof TENANT_RLS_TABLES)[number];
export type PlatformTableName = (typeof PLATFORM_TABLES)[number];
