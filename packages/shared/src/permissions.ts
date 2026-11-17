/**
 * Fine-Grained Role-Based & Permission-Based Access Control Matrix (RBAC)
 * Used across campusBaba_api, campusBaba_ui, and campusbaba-rms.
 */

export const PERMISSIONS = {
  // Platform / SuperAdmin
  PLATFORM_TENANTS_MANAGE: "platform:tenants:manage",
  PLATFORM_PLANS_MANAGE: "platform:plans:manage",
  PLATFORM_NOTICES_MANAGE: "platform:notices:manage",
  PLATFORM_AUDIT_READ: "platform:audit:read",
  PLATFORM_IMPERSONATE: "platform:impersonate",

  // Tenant User & Staff Management
  USERS_INVITE: "users:invite",
  USERS_MANAGE: "users:manage",
  STUDENTS_READ: "students:read",
  STUDENTS_WRITE: "students:write",
  STUDENTS_DELETE: "students:delete",
  TEACHERS_READ: "teachers:read",
  TEACHERS_WRITE: "teachers:write",
  TEACHERS_DELETE: "teachers:delete",
  EMPLOYEES_READ: "employees:read",
  EMPLOYEES_WRITE: "employees:write",
  EMPLOYEES_DELETE: "employees:delete",
  PARENTS_READ: "parents:read",
  PARENTS_WRITE: "parents:write",
  PARENTS_DELETE: "parents:delete",

  // Academics, Classrooms, Routines, Attendance
  ACADEMICS_READ: "academics:read",
  ACADEMICS_WRITE: "academics:write",
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_MARK: "attendance:mark",
  BATCHES_READ: "batches:read",
  BATCHES_WRITE: "batches:write",

  // Exams & Marks
  EXAMS_READ: "exams:read",
  EXAMS_WRITE: "exams:write",
  MARKS_READ: "marks:read",
  MARKS_EVALUATE: "marks:evaluate",
  MARKS_PUBLISH: "marks:publish",

  // Finance (Payments, Invoices, Waivers, Expenses, Reports)
  PAYMENTS_READ: "payments:read",
  PAYMENTS_WRITE: "payments:write",
  PAYMENTS_VERIFY_TRX: "payments:verify_trx",
  EXPENSES_READ: "expenses:read",
  EXPENSES_WRITE: "expenses:write",
  EXPENSES_APPROVE: "expenses:approve",
  REPORTS_FINANCIAL_READ: "reports:financial:read",

  // Notices & SMS
  NOTICES_READ: "notices:read",
  NOTICES_WRITE: "notices:write",
  SMS_SEND: "sms:send",

  // Campus Operations (Library, Transport, Hostel, Files)
  LIBRARY_READ: "library:read",
  LIBRARY_WRITE: "library:write",
  TRANSPORT_READ: "transport:read",
  TRANSPORT_WRITE: "transport:write",
  HOSTEL_READ: "hostel:read",
  HOSTEL_WRITE: "hostel:write",
  FILES_UPLOAD: "files:upload",
  FILES_READ: "files:read",
  FILES_SENSITIVE_READ: "files:sensitive:read",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type TenantRoleCode =
  | "admin"
  | "employee"
  | "teacher"
  | "student"
  | "parent";

export const DEFAULT_ROLE_PERMISSIONS: Record<TenantRoleCode, PermissionCode[]> = {
  admin: Object.values(PERMISSIONS).filter((p) => !p.startsWith("platform:")),
  employee: [
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_WRITE,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.EMPLOYEES_READ,
    PERMISSIONS.PARENTS_READ,
    PERMISSIONS.PARENTS_WRITE,
    PERMISSIONS.ACADEMICS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.BATCHES_READ,
    PERMISSIONS.BATCHES_WRITE,
    PERMISSIONS.EXAMS_READ,
    PERMISSIONS.MARKS_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_WRITE,
    PERMISSIONS.PAYMENTS_VERIFY_TRX,
    PERMISSIONS.EXPENSES_READ,
    PERMISSIONS.EXPENSES_WRITE,
    PERMISSIONS.NOTICES_READ,
    PERMISSIONS.NOTICES_WRITE,
    PERMISSIONS.LIBRARY_READ,
    PERMISSIONS.LIBRARY_WRITE,
    PERMISSIONS.TRANSPORT_READ,
    PERMISSIONS.TRANSPORT_WRITE,
    PERMISSIONS.HOSTEL_READ,
    PERMISSIONS.HOSTEL_WRITE,
    PERMISSIONS.FILES_UPLOAD,
    PERMISSIONS.FILES_READ,
  ],
  teacher: [
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.ACADEMICS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.BATCHES_READ,
    PERMISSIONS.EXAMS_READ,
    PERMISSIONS.EXAMS_WRITE,
    PERMISSIONS.MARKS_READ,
    PERMISSIONS.MARKS_EVALUATE,
    PERMISSIONS.NOTICES_READ,
    PERMISSIONS.NOTICES_WRITE,
    PERMISSIONS.LIBRARY_READ,
    PERMISSIONS.FILES_UPLOAD,
    PERMISSIONS.FILES_READ,
  ],
  student: [
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.ACADEMICS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.BATCHES_READ,
    PERMISSIONS.EXAMS_READ,
    PERMISSIONS.MARKS_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.NOTICES_READ,
    PERMISSIONS.LIBRARY_READ,
    PERMISSIONS.TRANSPORT_READ,
    PERMISSIONS.HOSTEL_READ,
    PERMISSIONS.FILES_READ,
  ],
  parent: [
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.PARENTS_READ,
    PERMISSIONS.ACADEMICS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.BATCHES_READ,
    PERMISSIONS.EXAMS_READ,
    PERMISSIONS.MARKS_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.NOTICES_READ,
    PERMISSIONS.TRANSPORT_READ,
    PERMISSIONS.HOSTEL_READ,
    PERMISSIONS.FILES_READ,
  ],
};

export function roleHasPermission(
  role: string,
  permission: PermissionCode,
  customPermissions?: string[]
): boolean {
  if (role === "superadmin") return true;
  if (customPermissions && customPermissions.includes(permission)) return true;
  const defaults = DEFAULT_ROLE_PERMISSIONS[role as TenantRoleCode];
  return defaults ? defaults.includes(permission) : false;
}
