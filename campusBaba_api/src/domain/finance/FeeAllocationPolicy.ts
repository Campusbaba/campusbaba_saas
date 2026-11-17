/**
 * Pure Domain: Fee Allocation, Waivers, Coaching Pro-Rata & Paisa-Exact Arithmetic
 * - Uses integer paisa (1 BDT = 100 paisa) internally to prevent floating-point drift.
 * - Allocates payments across invoices in oldest-due-date order (FIFO).
 * - Calculates pro-rated mid-month coaching batch fees and teacher revenue-share payroll.
 */

export interface OpenInvoiceObligation {
  invoiceId: string;
  dueDate: Date | string;
  netAmount: number;
  paidAmount: number;
}

export interface InvoiceAllocationResult {
  invoiceId: string;
  allocatedAmount: number;
  newPaidAmount: number;
  newStatus: "pending" | "partial" | "paid";
}

export function toPaisa(bdt: number): number {
  return Math.round(Number(bdt) * 100);
}

export function fromPaisa(paisa: number): number {
  return Number((paisa / 100).toFixed(2));
}

/**
 * Allocates a payment amount across one or more open invoices in oldest-due-first order.
 */
export function allocatePaymentOldestDueFirst(
  paymentAmountBdt: number,
  openInvoices: OpenInvoiceObligation[]
): {
  allocations: InvoiceAllocationResult[];
  unallocatedAdvanceBdt: number;
} {
  let remainingPaisa = toPaisa(paymentAmountBdt);
  if (remainingPaisa <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const sorted = [...openInvoices].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  const allocations: InvoiceAllocationResult[] = [];

  for (const inv of sorted) {
    if (remainingPaisa <= 0) break;
    const netPaisa = toPaisa(inv.netAmount);
    const paidPaisa = toPaisa(inv.paidAmount);
    const duePaisa = Math.max(0, netPaisa - paidPaisa);
    if (duePaisa === 0) continue;

    const allocPaisa = Math.min(remainingPaisa, duePaisa);
    const newPaidPaisa = paidPaisa + allocPaisa;
    remainingPaisa -= allocPaisa;

    allocations.push({
      invoiceId: inv.invoiceId,
      allocatedAmount: fromPaisa(allocPaisa),
      newPaidAmount: fromPaisa(newPaidPaisa),
      newStatus: newPaidPaisa >= netPaisa ? "paid" : "partial",
    });
  }

  return {
    allocations,
    unallocatedAdvanceBdt: fromPaisa(remainingPaisa),
  };
}

/**
 * Calculates pro-rated coaching batch fee when a student joins mid-month.
 */
export function calculateProRatedCoachingFee(params: {
  monthlyFeeBdt: number;
  joinDate: Date | string;
  siblingDiscountPct?: number;
  multiSubjectDiscountPct?: number;
}): {
  daysInMonth: number;
  billableDays: number;
  proRatedBaseBdt: number;
  discountBdt: number;
  netPayableBdt: number;
} {
  const d = typeof params.joinDate === "string" ? new Date(params.joinDate) : params.joinDate;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0..11
  const dayOfMonth = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const billableDays = Math.max(1, daysInMonth - dayOfMonth + 1);

  const basePaisa = Math.round(
    (toPaisa(params.monthlyFeeBdt) * billableDays) / daysInMonth
  );

  const totalDiscountPct = Math.min(
    100,
    Math.max(0, (params.siblingDiscountPct ?? 0) + (params.multiSubjectDiscountPct ?? 0))
  );
  const discountPaisa = Math.round((basePaisa * totalDiscountPct) / 100);
  const netPaisa = Math.max(0, basePaisa - discountPaisa);

  return {
    daysInMonth,
    billableDays,
    proRatedBaseBdt: fromPaisa(basePaisa),
    discountBdt: fromPaisa(discountPaisa),
    netPayableBdt: fromPaisa(netPaisa),
  };
}

/**
 * Calculates teacher payroll across all 4 Bangladeshi school/coaching models:
 * - fixed: monthly base salary
 * - per_class: ratePerClass * classesTaken
 * - per_student: ratePerStudent * activeStudentsCount
 * - revenue_share: (collectedBatchRevenue * sharePct) / 100
 */
export function calculateTeacherPayroll(params: {
  model: "fixed" | "per_class" | "per_student" | "revenue_share";
  baseSalaryBdt?: number;
  ratePerClassBdt?: number;
  classesTaken?: number;
  ratePerStudentBdt?: number;
  activeStudentsCount?: number;
  collectedRevenueBdt?: number;
  revenueSharePct?: number;
  deductionsBdt?: number;
}): { grossAmountBdt: number; deductionsBdt: number; netAmountBdt: number } {
  let grossPaisa = 0;

  switch (params.model) {
    case "fixed":
      grossPaisa = toPaisa(params.baseSalaryBdt ?? 0);
      break;
    case "per_class":
      grossPaisa = toPaisa(params.ratePerClassBdt ?? 0) * (params.classesTaken ?? 0);
      break;
    case "per_student":
      grossPaisa =
        toPaisa(params.ratePerStudentBdt ?? 0) * (params.activeStudentsCount ?? 0);
      break;
    case "revenue_share":
      grossPaisa = Math.round(
        (toPaisa(params.collectedRevenueBdt ?? 0) * (params.revenueSharePct ?? 0)) / 100
      );
      break;
  }

  const deductionsPaisa = toPaisa(params.deductionsBdt ?? 0);
  const netPaisa = Math.max(0, grossPaisa - deductionsPaisa);

  return {
    grossAmountBdt: fromPaisa(grossPaisa),
    deductionsBdt: fromPaisa(deductionsPaisa),
    netAmountBdt: fromPaisa(netPaisa),
  };
}
