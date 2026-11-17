import crypto from "crypto";
import { toPaisa, fromPaisa } from "../../campusBaba_api/src/domain/finance/FeeAllocationPolicy";

export interface LegacyMongoTenantSource {
  tenant: {
    _id: string;
    name: string;
    subdomain: string;
    billingPlan?: string;
    subscriptionStatus?: string;
    maxStudents?: number;
    maxTeachers?: number;
    maxAdmins?: number;
  };
  students: Record<string, any>[];
  teachers: Record<string, any>[];
  employees: Record<string, any>[];
  parents: Record<string, any>[];
  courses: Record<string, any>[];
  classRooms: Record<string, any>[];
  payments: Record<string, any>[];
  expenses: Record<string, any>[];
  exams: Record<string, any>[];
  examMarks: Record<string, any>[];
}

export interface MigrationRejectRow {
  id: string;
  tenant_slug: string;
  collection_name: string;
  legacy_mongo_id: string;
  raw_document: Record<string, any>;
  reason: string;
}

export interface ReconciliationReport {
  tenantSlug: string;
  tenantUuid: string;
  dryRun: boolean;
  counts: {
    collection: string;
    sourceCount: number;
    migratedCount: number;
    rejectedCount: number;
    reconciled: boolean;
  }[];
  financials: {
    mongoPaidPaymentsPaisa: number;
    pgPaidInvoicesPaisa: number;
    paymentsMatchToPaisa: boolean;
    mongoPaidExpensesPaisa: number;
    pgPaidExpensesPaisa: number;
    expensesMatchToPaisa: boolean;
  };
  referentialIntegrityClean: boolean;
  rejects: MigrationRejectRow[];
  passed: boolean;
}

/**
 * Deterministic ObjectId -> UUIDv5-style mapper so re-running ETL produces
 * the exact same UUIDs and is 100% idempotent.
 */
export function deterministicUuidFromMongoId(
  tenantSlug: string,
  collection: string,
  mongoId: string
): string {
  const hash = crypto
    .createHash("sha256")
    .update(`campusbaba:${tenantSlug}:${collection}:${mongoId}`)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant 10
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Idempotent, Resumable MongoDB -> PostgreSQL ETL & Paisa-Exact Reconciliation Engine
 */
export function runMongoToPostgresEtlForTenant(
  source: LegacyMongoTenantSource,
  opts: { dryRun?: boolean } = {}
): {
  migratedTables: Record<string, Record<string, any>[]>;
  report: ReconciliationReport;
} {
  const dryRun = opts.dryRun ?? false;
  const slug = source.tenant.subdomain.toLowerCase().trim();
  const tenantUuid = deterministicUuidFromMongoId(slug, "tenants", source.tenant._id);

  const rejects: MigrationRejectRow[] = [];
  const studentIdMap = new Map<string, string>(); // mongo _id or studentId -> pg uuid
  const courseIdMap = new Map<string, string>();
  const examIdMap = new Map<string, string>();
  const staffIdMap = new Map<string, string>();

  const pgStudents: Record<string, any>[] = [];
  const pgStaff: Record<string, any>[] = [];
  const pgGuardians: Record<string, any>[] = [];
  const pgStudentGuardians: Record<string, any>[] = [];
  const pgCourses: Record<string, any>[] = [];
  const pgInvoices: Record<string, any>[] = [];
  const pgPayments: Record<string, any>[] = [];
  const pgExpenses: Record<string, any>[] = [];
  const pgExams: Record<string, any>[] = [];
  const pgExamMarks: Record<string, any>[] = [];

  // 1. Migrate Parents -> Guardians
  const parentIdMap = new Map<string, string>();
  for (const p of source.parents) {
    if (!p._id || !p.email) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "parents",
        legacy_mongo_id: String(p._id || ""),
        raw_document: p,
        reason: "Missing _id or email on parent document",
      });
      continue;
    }
    const uuid = deterministicUuidFromMongoId(slug, "guardians", String(p._id));
    parentIdMap.set(String(p._id), uuid);
    if (p.parentId) parentIdMap.set(String(p.parentId), uuid);
    pgGuardians.push({
      id: uuid,
      tenant_id: tenantUuid,
      guardian_code: p.parentId || `PAR-${pgGuardians.length + 1}`,
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email,
      phone_e164: p.phone,
      relationship: p.relationship || "guardian",
      legacy_mongo_id: String(p._id),
    });
  }

  // 2. Migrate Courses
  for (const c of source.courses) {
    if (!c._id || !c.code) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "courses",
        legacy_mongo_id: String(c._id || ""),
        raw_document: c,
        reason: "Missing _id or course code",
      });
      continue;
    }
    const uuid = deterministicUuidFromMongoId(slug, "courses", String(c._id));
    courseIdMap.set(String(c._id), uuid);
    courseIdMap.set(String(c.code), uuid);
    pgCourses.push({
      id: uuid,
      tenant_id: tenantUuid,
      code: c.code,
      name: c.name,
      credits: Number(c.credits || 1),
      duration_months: Number(c.duration || 12),
      legacy_mongo_id: String(c._id),
    });
  }

  // 3. Migrate Students + Student Guardians
  for (const s of source.students) {
    if (!s._id || !s.email) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "students",
        legacy_mongo_id: String(s._id || ""),
        raw_document: s,
        reason: "Missing _id or email on student document",
      });
      continue;
    }
    const uuid = deterministicUuidFromMongoId(slug, "students", String(s._id));
    studentIdMap.set(String(s._id), uuid);
    if (s.studentId) studentIdMap.set(String(s.studentId), uuid);

    pgStudents.push({
      id: uuid,
      tenant_id: tenantUuid,
      student_code: s.studentId || `STU-${pgStudents.length + 1}`,
      first_name: s.firstName,
      last_name: s.lastName,
      email: s.email,
      phone_e164: s.phone,
      status: s.status || "active",
      legacy_mongo_id: String(s._id),
    });

    if (s.parentId) {
      const guardianUuid = parentIdMap.get(String(s.parentId));
      if (guardianUuid) {
        pgStudentGuardians.push({
          id: deterministicUuidFromMongoId(
            slug,
            "student_guardians",
            `${s._id}:${s.parentId}`
          ),
          tenant_id: tenantUuid,
          student_id: uuid,
          guardian_id: guardianUuid,
          is_primary: true,
          is_fee_payer: true,
        });
      }
    }
  }

  // 4. Migrate Teachers & Employees -> Unified Staff
  for (const t of source.teachers) {
    if (!t._id || !t.email) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "teachers",
        legacy_mongo_id: String(t._id || ""),
        raw_document: t,
        reason: "Missing _id or email on teacher",
      });
      continue;
    }
    const uuid = deterministicUuidFromMongoId(slug, "staff_teacher", String(t._id));
    staffIdMap.set(String(t._id), uuid);
    if (t.teacherId) staffIdMap.set(String(t.teacherId), uuid);
    pgStaff.push({
      id: uuid,
      tenant_id: tenantUuid,
      staff_code: t.teacherId || `TCH-${pgStaff.length + 1}`,
      staff_type: "teacher",
      first_name: t.firstName,
      last_name: t.lastName,
      email: t.email,
      base_salary: fromPaisa(toPaisa(t.salary || 0)),
      legacy_mongo_id: String(t._id),
    });
  }

  for (const emp of source.employees) {
    if (!emp._id || !emp.email) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "employees",
        legacy_mongo_id: String(emp._id || ""),
        raw_document: emp,
        reason: "Missing _id or email on employee",
      });
      continue;
    }
    const uuid = deterministicUuidFromMongoId(slug, "staff_employee", String(emp._id));
    staffIdMap.set(String(emp._id), uuid);
    if (emp.employeeId) staffIdMap.set(String(emp.employeeId), uuid);
    pgStaff.push({
      id: uuid,
      tenant_id: tenantUuid,
      staff_code: emp.employeeId || `EMP-${pgStaff.length + 1}`,
      staff_type: "employee",
      first_name: emp.firstName,
      last_name: emp.lastName,
      email: emp.email,
      base_salary: fromPaisa(toPaisa(emp.salary || 0)),
      legacy_mongo_id: String(emp._id),
    });
  }

  // 5. Migrate Payments -> Fee Invoices + Payments (Paisa-exact)
  for (const pay of source.payments) {
    const studentUuid = studentIdMap.get(String(pay.studentId));
    if (!pay._id || !studentUuid || Number(pay.amount) < 0) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "payments",
        legacy_mongo_id: String(pay._id || ""),
        raw_document: pay,
        reason: !studentUuid
          ? `Unresolvable studentId reference '${pay.studentId}'`
          : "Invalid payment document",
      });
      continue;
    }

    const invoiceUuid = deterministicUuidFromMongoId(slug, "fee_invoices", String(pay._id));
    const exactAmount = fromPaisa(toPaisa(pay.amount));
    const isPaid = pay.paymentStatus === "paid";

    pgInvoices.push({
      id: invoiceUuid,
      tenant_id: tenantUuid,
      invoice_no: pay.paymentId || `INV-${String(pay._id).slice(-8).toUpperCase()}`,
      student_id: studentUuid,
      course_id: courseIdMap.get(String(pay.courseId)) || null,
      fee_type: pay.paymentType || "tuition",
      subtotal_amount: exactAmount,
      net_amount: exactAmount,
      paid_amount: isPaid ? exactAmount : 0,
      status: pay.paymentStatus || "pending",
      legacy_mongo_id: String(pay._id),
    });

    if (isPaid) {
      pgPayments.push({
        id: deterministicUuidFromMongoId(slug, "payments", String(pay._id)),
        tenant_id: tenantUuid,
        payment_code: pay.paymentId || `PAY-${String(pay._id).slice(-8).toUpperCase()}`,
        invoice_id: invoiceUuid,
        student_id: studentUuid,
        amount: exactAmount,
        payment_method: pay.paymentMethod || "cash",
        gateway: "manual",
        transaction_id:
          pay.transactionId && String(pay.transactionId).trim() !== ""
            ? String(pay.transactionId).trim()
            : null,
        verification_status: "verified",
        legacy_mongo_id: String(pay._id),
      });
    }
  }

  // 6. Migrate Expenses (Paisa-exact + resolve string/ObjectId employeeId)
  for (const exp of source.expenses) {
    if (!exp._id || Number(exp.amount) < 0) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "expenses",
        legacy_mongo_id: String(exp._id || ""),
        raw_document: exp,
        reason: "Invalid expense document",
      });
      continue;
    }
    const exactAmount = fromPaisa(toPaisa(exp.amount));
    pgExpenses.push({
      id: deterministicUuidFromMongoId(slug, "expenses", String(exp._id)),
      tenant_id: tenantUuid,
      category: exp.category || "other",
      subcategory: exp.subcategory || "general",
      amount: exactAmount,
      description: exp.description || "",
      status: exp.status || "pending",
      staff_id: exp.employeeId ? staffIdMap.get(String(exp.employeeId)) || null : null,
      approved_by_staff_id: exp.approvedBy
        ? staffIdMap.get(String(exp.approvedBy)) || null
        : null,
      legacy_mongo_id: String(exp._id),
    });
  }

  // 7. Migrate Exams & ExamMarks (Resolving both _id and custom examId/studentId strings — Fixes DQ-1)
  for (const ex of source.exams) {
    if (!ex._id) continue;
    const uuid = deterministicUuidFromMongoId(slug, "exams", String(ex._id));
    examIdMap.set(String(ex._id), uuid);
    if (ex.examId) examIdMap.set(String(ex.examId), uuid);
    pgExams.push({
      id: uuid,
      tenant_id: tenantUuid,
      exam_code: ex.examId || `EXM-${pgExams.length + 1}`,
      name: ex.name,
      exam_type: ex.examType || "midterm",
      total_marks: Number(ex.totalMarks || 100),
      passing_marks: Number(ex.passingMarks || 33),
      status: ex.status || "scheduled",
      legacy_mongo_id: String(ex._id),
    });
  }

  for (const em of source.examMarks) {
    const examUuid = examIdMap.get(String(em.examId));
    const studentUuid = studentIdMap.get(String(em.studentId));
    if (!em._id || !examUuid || !studentUuid) {
      rejects.push({
        id: crypto.randomUUID(),
        tenant_slug: slug,
        collection_name: "examMarks",
        legacy_mongo_id: String(em._id || ""),
        raw_document: em,
        reason: "Unresolvable examId or studentId on ExamMark",
      });
      continue;
    }
    pgExamMarks.push({
      id: deterministicUuidFromMongoId(slug, "exam_marks", String(em._id)),
      tenant_id: tenantUuid,
      exam_id: examUuid,
      student_id: studentUuid,
      marks_obtained: Number(em.marksObtained || 0),
      letter_grade: em.grade || null,
      evaluated_by_staff_id: em.evaluatedBy
        ? staffIdMap.get(String(em.evaluatedBy)) || null
        : null,
      status: em.status || "evaluated",
      legacy_mongo_id: String(em._id),
    });
  }

  // 8. Reconciliation Checks
  const countCheck = (
    name: string,
    srcLen: number,
    migLen: number
  ) => {
    const rejLen = rejects.filter((r) => r.collection_name === name).length;
    return {
      collection: name,
      sourceCount: srcLen,
      migratedCount: migLen,
      rejectedCount: rejLen,
      reconciled: srcLen === migLen + rejLen,
    };
  };

  const counts = [
    countCheck("parents", source.parents.length, pgGuardians.length),
    countCheck("courses", source.courses.length, pgCourses.length),
    countCheck("students", source.students.length, pgStudents.length),
    countCheck(
      "teachers",
      source.teachers.length,
      pgStaff.filter((s) => s.staff_type === "teacher").length
    ),
    countCheck(
      "employees",
      source.employees.length,
      pgStaff.filter((s) => s.staff_type === "employee").length
    ),
    countCheck("payments", source.payments.length, pgInvoices.length),
    countCheck("expenses", source.expenses.length, pgExpenses.length),
    countCheck("exams", source.exams.length, pgExams.length),
    countCheck("examMarks", source.examMarks.length, pgExamMarks.length),
  ];

  // Financial Paisa Parity (excluding rejected rows)
  const rejectedPaymentIds = new Set(
    rejects.filter((r) => r.collection_name === "payments").map((r) => r.legacy_mongo_id)
  );
  const mongoPaidPaymentsPaisa = source.payments
    .filter((p) => !rejectedPaymentIds.has(String(p._id)) && p.paymentStatus === "paid")
    .reduce((sum, p) => sum + toPaisa(p.amount), 0);

  const pgPaidInvoicesPaisa = pgInvoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + toPaisa(i.paid_amount), 0);

  const rejectedExpenseIds = new Set(
    rejects.filter((r) => r.collection_name === "expenses").map((r) => r.legacy_mongo_id)
  );
  const mongoPaidExpensesPaisa = source.expenses
    .filter((e) => !rejectedExpenseIds.has(String(e._id)) && e.status === "paid")
    .reduce((sum, e) => sum + toPaisa(e.amount), 0);

  const pgPaidExpensesPaisa = pgExpenses
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + toPaisa(e.amount), 0);

  const studentUuidSet = new Set(pgStudents.map((s) => s.id));
  const examUuidSet = new Set(pgExams.map((e) => e.id));
  const referentialIntegrityClean =
    pgInvoices.every((i) => studentUuidSet.has(i.student_id)) &&
    pgExamMarks.every(
      (m) => studentUuidSet.has(m.student_id) && examUuidSet.has(m.exam_id)
    );

  const paymentsMatchToPaisa = mongoPaidPaymentsPaisa === pgPaidInvoicesPaisa;
  const expensesMatchToPaisa = mongoPaidExpensesPaisa === pgPaidExpensesPaisa;
  const allCountsReconciled = counts.every((c) => c.reconciled);

  const report: ReconciliationReport = {
    tenantSlug: slug,
    tenantUuid,
    dryRun,
    counts,
    financials: {
      mongoPaidPaymentsPaisa,
      pgPaidInvoicesPaisa,
      paymentsMatchToPaisa,
      mongoPaidExpensesPaisa,
      pgPaidExpensesPaisa,
      expensesMatchToPaisa,
    },
    referentialIntegrityClean,
    rejects,
    passed:
      allCountsReconciled &&
      paymentsMatchToPaisa &&
      expensesMatchToPaisa &&
      referentialIntegrityClean,
  };

  return {
    migratedTables: dryRun
      ? {}
      : {
          guardians: pgGuardians,
          courses: pgCourses,
          students: pgStudents,
          student_guardians: pgStudentGuardians,
          staff: pgStaff,
          fee_invoices: pgInvoices,
          payments: pgPayments,
          expenses: pgExpenses,
          exams: pgExams,
          exam_marks: pgExamMarks,
        },
    report,
  };
}
