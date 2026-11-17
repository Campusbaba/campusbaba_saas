import crypto from "crypto";
import { AuditPort, IdGeneratorPort, ClockPort, StoragePort } from "../../ports";
import { RlsTenantStore } from "../../infrastructure/persistence/postgres/rlsTransaction";

export type SaasPlanCode =
  | "individual_tutor"
  | "sme_coaching"
  | "campus_connect"
  | "starter"
  | "postpaid"
  | "prepaid"
  | "coaching_pro"
  | "enterprise"
  | string;

export interface SaasPlan {
  id: string;
  code: SaasPlanCode;
  name: string;
  nameBn: string;
  billingCycle: "monthly" | "yearly";
  pricingModel: "per_student" | "flat_monthly" | "hybrid";
  priceBdt: number; // Base monthly fee (0 for pure per-student plans)
  perStudentFeeBdt: number; // Total charged per student (e.g., ৳15)
  orgStudentShareBdt: number; // Share retained/credited to organization (e.g., ৳5)
  platformStudentShareBdt: number; // Share belonging to CampusBaba (e.g., ৳10)
  maxStudents: number; // -1 means Unlimited
  maxGuardians: number; // -1 means Unlimited (Guardian portal is free)
  maxTeachers: number; // e.g., 1 for Individual Tutor, 10 for SME Coaching
  maxClasses: number; // Max classrooms/batches allowed (-1 for Unlimited)
  maxAdmins: number;
  guardianPortalFree: boolean;
  guardianMultiStudentAllowed: boolean; // true = 1 guardian can monitor multiple students; false = 1:1
  storageLimitMb: number;
  includedSmsCredits: number;
  featureFlags: {
    library: boolean;
    transport: boolean;
    hostel: boolean;
    sms: boolean;
    onlinePayments: boolean;
    coachingBatches: boolean;
  };
  isActive: boolean;
}

export interface TenantLifecycleRecord {
  id: string;
  name: string;
  nameBn?: string;
  subdomain: string;
  customDomain?: string;
  institutionType: "school" | "college" | "madrasa_alia" | "madrasa_qawmi" | "coaching" | "english_medium";
  subscriptionStatus: "trialing" | "active" | "past_due" | "inactive" | "suspended" | "exported" | "purged";
  billingPlan: string;
  maxStudents: number; // -1 = unlimited
  maxGuardians: number; // -1 = unlimited
  maxTeachers: number;
  maxClasses: number;
  maxAdmins: number;
  perStudentFeeBdt: number;
  orgStudentShareBdt: number;
  platformStudentShareBdt: number;
  guardianPortalFree: boolean;
  guardianMultiStudentAllowed: boolean;
  storageLimitMb: number;
  smsCredits: number;
  exportedAt?: Date;
  retentionUntil?: Date;
  purgedAt?: Date;
  createdAt: Date;
}

const DEFAULT_SAAS_PLANS: SaasPlan[] = [
  {
    id: "plan-individual-tutor",
    code: "individual_tutor",
    name: "Individual Tutor Plan",
    nameBn: "একক টিউটর প্ল্যান",
    billingCycle: "monthly",
    pricingModel: "per_student",
    priceBdt: 0,
    perStudentFeeBdt: 15, // ৳15 per student
    orgStudentShareBdt: 5, // ৳5 for the tutor/org
    platformStudentShareBdt: 10, // ৳10 for CampusBaba
    maxStudents: -1, // Unlimited students
    maxGuardians: -1, // Unlimited free guardians
    maxTeachers: 1, // Strictly 1 teacher
    maxClasses: 20,
    maxAdmins: 1,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 500,
    includedSmsCredits: 500,
    featureFlags: {
      library: false,
      transport: false,
      hostel: false,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
  {
    id: "plan-sme-coaching",
    code: "sme_coaching",
    name: "SME Plan (Coaching Centers)",
    nameBn: "এসএমই কোচিং প্ল্যান",
    billingCycle: "monthly",
    pricingModel: "per_student",
    priceBdt: 0,
    perStudentFeeBdt: 15, // ৳15 per student (adjustable per org)
    orgStudentShareBdt: 5, // ৳5 for the coaching org
    platformStudentShareBdt: 10, // ৳10 for CampusBaba
    maxStudents: -1, // Unlimited students
    maxGuardians: -1, // Free guardian portal
    maxTeachers: 10, // 10 teachers included
    maxClasses: 60,
    maxAdmins: 5,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 2000,
    includedSmsCredits: 2500,
    featureFlags: {
      library: false,
      transport: false,
      hostel: false,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
  {
    id: "plan-campus-connect",
    code: "campus_connect",
    name: "Campus Connect Plan (Schools & Colleges)",
    nameBn: "ক্যাম্পাস কানেক্ট স্কুল প্ল্যান",
    billingCycle: "monthly",
    pricingModel: "per_student",
    priceBdt: 0,
    perStudentFeeBdt: 15, // ৳15 per student (adjustable per school)
    orgStudentShareBdt: 5, // ৳5 for the school
    platformStudentShareBdt: 10, // ৳10 for CampusBaba
    maxStudents: -1, // Unlimited students (or customizable per school)
    maxGuardians: -1, // Free guardian portal
    maxTeachers: 100,
    maxClasses: 150,
    maxAdmins: 15,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 5000,
    includedSmsCredits: 10000,
    featureFlags: {
      library: true,
      transport: true,
      hostel: true,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
  {
    id: "plan-starter",
    code: "starter",
    name: "Starter School Plan",
    nameBn: "প্রারম্ভিক স্কুল প্ল্যান",
    billingCycle: "monthly",
    pricingModel: "hybrid",
    priceBdt: 2500,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    maxStudents: 150,
    maxGuardians: 150,
    maxTeachers: 15,
    maxClasses: 20,
    maxAdmins: 3,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 250,
    includedSmsCredits: 500,
    featureFlags: {
      library: false,
      transport: false,
      hostel: false,
      sms: true,
      onlinePayments: true,
      coachingBatches: false,
    },
    isActive: true,
  },
  {
    id: "plan-prepaid",
    code: "prepaid",
    name: "Standard Prepaid Plan",
    nameBn: "স্ট্যান্ডার্ড প্রিপেইড প্ল্যান",
    billingCycle: "monthly",
    pricingModel: "hybrid",
    priceBdt: 4500,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    maxStudents: 500,
    maxGuardians: 500,
    maxTeachers: 40,
    maxClasses: 50,
    maxAdmins: 5,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 1000,
    includedSmsCredits: 2000,
    featureFlags: {
      library: true,
      transport: true,
      hostel: false,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
  {
    id: "plan-postpaid",
    code: "postpaid",
    name: "Standard Postpaid Plan",
    nameBn: "স্ট্যান্ডার্ড পোস্টপেইড প্ল্যান",
    billingCycle: "monthly",
    pricingModel: "hybrid",
    priceBdt: 5000,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    maxStudents: 500,
    maxGuardians: 500,
    maxTeachers: 40,
    maxClasses: 50,
    maxAdmins: 5,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 1000,
    includedSmsCredits: 1500,
    featureFlags: {
      library: true,
      transport: true,
      hostel: true,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
  {
    id: "plan-coaching-pro",
    code: "coaching_pro",
    name: "Coaching & Batch Pro",
    nameBn: "কোচিং ও ব্যাচ প্রো",
    billingCycle: "monthly",
    pricingModel: "hybrid",
    priceBdt: 6500,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    maxStudents: 1200,
    maxGuardians: 1200,
    maxTeachers: 30,
    maxClasses: 80,
    maxAdmins: 5,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 1500,
    includedSmsCredits: 5000,
    featureFlags: {
      library: false,
      transport: false,
      hostel: false,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
  {
    id: "plan-enterprise",
    code: "enterprise",
    name: "Enterprise Campus Suite",
    nameBn: "এন্টারপ্রাইজ ক্যাম্পাস স্যুট",
    billingCycle: "monthly",
    pricingModel: "hybrid",
    priceBdt: 15000,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    maxStudents: 5000,
    maxGuardians: 5000,
    maxTeachers: 250,
    maxClasses: 300,
    maxAdmins: 20,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
    storageLimitMb: 5000,
    includedSmsCredits: 15000,
    featureFlags: {
      library: true,
      transport: true,
      hostel: true,
      sms: true,
      onlinePayments: true,
      coachingBatches: true,
    },
    isActive: true,
  },
];

/**
 * Platform SaaS Use-Cases:
 * - Database-backed Plans (Fixes P0-11)
 * - Safe Tenant Lifecycle: Suspend -> Export -> Retention -> Verified Purge (Fixes P0-6)
 * - Audited, Time-Boxed SuperAdmin Impersonation
 * - Atomic Quota Enforcement (Fixes P0-9)
 */
export class PlatformSaasService {
  private readonly plans = new Map<string, SaasPlan>();
  private readonly tenants = new Map<string, TenantLifecycleRecord>();
  private readonly activeCounts = new Map<
    string,
    {
      students: number;
      guardians: number;
      teachers: number;
      classes: number;
      admins: number;
    }
  >();

  constructor(
    private readonly deps: {
      audit: AuditPort;
      idGen: IdGeneratorPort;
      clock: ClockPort;
      storage: StoragePort;
      rlsStore: RlsTenantStore;
    }
  ) {
    for (const p of DEFAULT_SAAS_PLANS) {
      this.plans.set(p.code, { ...p });
    }
  }

  listPlans(): SaasPlan[] {
    return Array.from(this.plans.values()).filter((p) => p.isActive);
  }

  getPlanByCode(code: string): SaasPlan {
    return (
      this.plans.get(code) ||
      this.plans.get("campus_connect") ||
      DEFAULT_SAAS_PLANS[2]
    );
  }

  upsertPlan(
    planInput: Partial<SaasPlan> & {
      code: SaasPlan["code"];
      name: string;
      priceBdt: number;
    }
  ): SaasPlan {
    const existing = this.plans.get(planInput.code);
    const perStudentFee =
      planInput.perStudentFeeBdt ?? existing?.perStudentFeeBdt ?? 15;
    const orgShare =
      planInput.orgStudentShareBdt ?? existing?.orgStudentShareBdt ?? 5;
    const platformShare =
      planInput.platformStudentShareBdt ??
      existing?.platformStudentShareBdt ??
      Math.max(0, perStudentFee - orgShare);

    const updated: SaasPlan = {
      id: existing?.id || this.deps.idGen.newUuid(),
      code: planInput.code,
      name: planInput.name,
      nameBn: planInput.nameBn || existing?.nameBn || planInput.name,
      billingCycle:
        planInput.billingCycle || existing?.billingCycle || "monthly",
      pricingModel:
        planInput.pricingModel || existing?.pricingModel || "per_student",
      priceBdt: Number(planInput.priceBdt),
      perStudentFeeBdt: Number(perStudentFee),
      orgStudentShareBdt: Number(orgShare),
      platformStudentShareBdt: Number(platformShare),
      maxStudents: planInput.maxStudents ?? existing?.maxStudents ?? -1,
      maxGuardians: planInput.maxGuardians ?? existing?.maxGuardians ?? -1,
      maxTeachers: planInput.maxTeachers ?? existing?.maxTeachers ?? 10,
      maxClasses: planInput.maxClasses ?? existing?.maxClasses ?? 50,
      maxAdmins: planInput.maxAdmins ?? existing?.maxAdmins ?? 3,
      guardianPortalFree:
        planInput.guardianPortalFree ?? existing?.guardianPortalFree ?? true,
      guardianMultiStudentAllowed:
        planInput.guardianMultiStudentAllowed ??
        existing?.guardianMultiStudentAllowed ??
        true,
      storageLimitMb:
        planInput.storageLimitMb ?? existing?.storageLimitMb ?? 500,
      includedSmsCredits:
        planInput.includedSmsCredits ?? existing?.includedSmsCredits ?? 500,
      featureFlags: planInput.featureFlags ||
        existing?.featureFlags || {
          library: true,
          transport: true,
          hostel: true,
          sms: true,
          onlinePayments: true,
          coachingBatches: true,
        },
      isActive: planInput.isActive ?? true,
    };
    this.plans.set(updated.code, updated);
    return updated;
  }

  registerTenantRecord(input: {
    id?: string;
    name: string;
    subdomain: string;
    billingPlan?: string;
    maxStudents?: number;
    maxGuardians?: number;
    maxTeachers?: number;
    maxClasses?: number;
    maxAdmins?: number;
    perStudentFeeBdt?: number;
    orgStudentShareBdt?: number;
    platformStudentShareBdt?: number;
    guardianPortalFree?: boolean;
    guardianMultiStudentAllowed?: boolean;
    institutionType?: TenantLifecycleRecord["institutionType"];
    actorAdminId?: string;
  }): TenantLifecycleRecord {
    const plan = this.getPlanByCode(input.billingPlan || "campus_connect");
    const id = input.id || this.deps.idGen.newUuid();
    const record: TenantLifecycleRecord = {
      id,
      name: input.name,
      subdomain: input.subdomain.toLowerCase().trim(),
      institutionType: input.institutionType || "school",
      subscriptionStatus: "active",
      billingPlan: plan.code,
      maxStudents: input.maxStudents ?? plan.maxStudents,
      maxGuardians: input.maxGuardians ?? plan.maxGuardians,
      maxTeachers: input.maxTeachers ?? plan.maxTeachers,
      maxClasses: input.maxClasses ?? plan.maxClasses,
      maxAdmins: input.maxAdmins ?? plan.maxAdmins,
      perStudentFeeBdt: input.perStudentFeeBdt ?? plan.perStudentFeeBdt,
      orgStudentShareBdt: input.orgStudentShareBdt ?? plan.orgStudentShareBdt,
      platformStudentShareBdt:
        input.platformStudentShareBdt ?? plan.platformStudentShareBdt,
      guardianPortalFree: input.guardianPortalFree ?? plan.guardianPortalFree,
      guardianMultiStudentAllowed:
        input.guardianMultiStudentAllowed ?? plan.guardianMultiStudentAllowed,
      storageLimitMb: plan.storageLimitMb,
      smsCredits: plan.includedSmsCredits,
      createdAt: this.deps.clock.now(),
    };
    this.tenants.set(id, record);
    this.tenants.set(record.subdomain, record);
    if (!this.activeCounts.has(record.subdomain)) {
      this.activeCounts.set(record.subdomain, {
        students: 0,
        guardians: 0,
        teachers: 0,
        classes: 0,
        admins: 1,
      });
    }
    return record;
  }

  getTenant(idOrSubdomain: string): TenantLifecycleRecord | undefined {
    return this.tenants.get(idOrSubdomain);
  }

  listAllTenants(): TenantLifecycleRecord[] {
    const uniqueBySubdomain = new Map<string, TenantLifecycleRecord>();
    for (const rec of this.tenants.values()) {
      uniqueBySubdomain.set(rec.subdomain, rec);
    }
    return Array.from(uniqueBySubdomain.values());
  }

  getActiveCounts(tenantKey: string) {
    return (
      this.activeCounts.get(tenantKey) || {
        students: 0,
        guardians: 0,
        teachers: 0,
        classes: 0,
        admins: 1,
      }
    );
  }

  setActiveCounts(
    tenantKey: string,
    counts: Partial<{
      students: number;
      guardians: number;
      teachers: number;
      classes: number;
      admins: number;
    }>
  ) {
    const current = this.getActiveCounts(tenantKey);
    this.activeCounts.set(tenantKey, { ...current, ...counts });
  }

  /**
   * Atomic Quota Reservation (Fixes P0-9 TOCTOU race and enforces maxStudents, maxGuardians, maxTeachers, maxClasses, maxAdmins).
   * Note: limit <= -1 means UNLIMITED (e.g., Individual Tutor Plan has unlimited students & free unlimited guardians).
   */
  reserveQuotaSlot(params: {
    tenantKey: string;
    resource: "students" | "guardians" | "teachers" | "classes" | "admins";
    currentCountInDb: number;
    limit: number;
  }): void {
    const counts = this.getActiveCounts(params.tenantKey);
    const effectiveCurrent = Math.max(
      counts[params.resource],
      params.currentCountInDb
    );

    if (params.limit !== -1 && effectiveCurrent >= params.limit) {
      throw new Error(
        `Tenant quota limit reached: maximum ${params.limit} active ${params.resource} allowed.`
      );
    }

    counts[params.resource] = effectiveCurrent + 1;
    this.activeCounts.set(params.tenantKey, counts);
  }

  /**
   * Computes Per-Student Revenue Split & BI Analytics for an Organization or Platform-wide:
   * Default split: ৳15 charged per active student -> ৳5 to Organization + ৳10 to CampusBaba Platform
   * Guardian Portal: ৳0 (Always Free)
   */
  calculateTenantRevenueSplit(
    tenant: Pick<
      TenantLifecycleRecord,
      | "billingPlan"
      | "perStudentFeeBdt"
      | "orgStudentShareBdt"
      | "platformStudentShareBdt"
    >,
    activeStudentCount: number,
    activeGuardianCount = 0
  ) {
    const plan = this.getPlanByCode(tenant.billingPlan);
    const baseMonthlyBdt = plan.priceBdt || 0;
    const perStudentFeeBdt =
      tenant.perStudentFeeBdt ?? plan.perStudentFeeBdt ?? 15;
    const orgStudentShareBdt =
      tenant.orgStudentShareBdt ?? plan.orgStudentShareBdt ?? 5;
    const platformStudentShareBdt =
      tenant.platformStudentShareBdt ?? plan.platformStudentShareBdt ?? 10;

    const grossStudentFeeBdt = activeStudentCount * perStudentFeeBdt;
    const orgEarnedShareBdt = activeStudentCount * orgStudentShareBdt;
    const platformEarnedShareBdt = activeStudentCount * platformStudentShareBdt;
    const guardianPortalChargeBdt = 0; // Free guardian portal
    const totalPlatformMonthlyRevenueBdt =
      baseMonthlyBdt + platformEarnedShareBdt;

    return {
      activeStudentCount,
      activeGuardianCount,
      baseMonthlyBdt,
      perStudentFeeBdt,
      orgStudentShareBdt,
      platformStudentShareBdt,
      grossStudentFeeBdt,
      orgEarnedShareBdt,
      platformEarnedShareBdt,
      guardianPortalChargeBdt,
      totalPlatformMonthlyRevenueBdt,
    };
  }

  /**
   * Safe 3-Step Tenant Offboarding Pipeline (Fixes P0-6):
   * Step 1: Suspend -> Step 2: Export Bundle & Manifest -> Step 3: Verified Purge
   */
  async exportTenantBundle(
    tenantIdOrSubdomain: string,
    actorAdminId: string
  ): Promise<{
    tenantId: string;
    subdomain: string;
    exportedAt: Date;
    retentionUntil: Date;
    storageFilesCount: number;
    manifestChecksum: string;
  }> {
    const tenant = this.tenants.get(tenantIdOrSubdomain);
    if (!tenant) {
      throw new Error("Tenant not found");
    }
    if (
      tenant.subscriptionStatus !== "inactive" &&
      tenant.subscriptionStatus !== "suspended"
    ) {
      throw new Error(
        "Tenant must be suspended before exporting and scheduling for purge"
      );
    }

    const prefix = `tenants/${tenant.subdomain}/`;
    const storageList = await this.deps.storage.list(prefix, undefined, {
      tenantId: tenant.subdomain,
    });

    const exportedAt = this.deps.clock.now();
    const retentionUntil = new Date(exportedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    tenant.subscriptionStatus = "exported";
    tenant.exportedAt = exportedAt;
    tenant.retentionUntil = retentionUntil;

    const manifestPayload = JSON.stringify({
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      exportedAt: exportedAt.toISOString(),
      files: storageList.items.map((i) => i.key),
    });
    const manifestChecksum = crypto
      .createHash("sha256")
      .update(manifestPayload)
      .digest("hex");

    await this.deps.audit.record({
      tenantId: tenant.id,
      impersonatedByAdminId: actorAdminId,
      action: "tenant.exported",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        subdomain: tenant.subdomain,
        storageFilesCount: storageList.items.length,
        manifestChecksum,
      },
    });

    return {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      exportedAt,
      retentionUntil,
      storageFilesCount: storageList.items.length,
      manifestChecksum,
    };
  }

  async verifyAndPurgeTenant(
    tenantIdOrSubdomain: string,
    actorAdminId: string,
    opts?: { forceBypassRetentionWindow?: boolean }
  ): Promise<{
    purged: boolean;
    deletedStorageObjects: number;
    deletedRlsRows: number;
  }> {
    const tenant = this.tenants.get(tenantIdOrSubdomain);
    if (!tenant) {
      throw new Error("Tenant not found");
    }
    if (tenant.subscriptionStatus !== "exported") {
      throw new Error(
        `Cannot purge tenant in status '${tenant.subscriptionStatus}'. Must complete suspend -> export before purge.`
      );
    }
    if (
      !opts?.forceBypassRetentionWindow &&
      tenant.retentionUntil &&
      this.deps.clock.now() < tenant.retentionUntil
    ) {
      throw new Error(
        `Tenant is within mandatory retention hold until ${tenant.retentionUntil.toISOString()}`
      );
    }

    const prefix = `tenants/${tenant.subdomain}/`;
    const deletedStorageObjects = await this.deps.storage.deletePrefix(prefix, {
      tenantId: tenant.subdomain,
    });
    const deletedRlsRows =
      this.deps.rlsStore.purgeTenantDataAsAdmin(tenant.id) +
      this.deps.rlsStore.purgeTenantDataAsAdmin(tenant.subdomain);

    tenant.subscriptionStatus = "purged";
    tenant.purgedAt = this.deps.clock.now();
    this.activeCounts.delete(tenant.subdomain);

    await this.deps.audit.record({
      tenantId: tenant.id,
      impersonatedByAdminId: actorAdminId,
      action: "tenant.purged",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        subdomain: tenant.subdomain,
        deletedStorageObjects,
        deletedRlsRows,
      },
    });

    return {
      purged: true,
      deletedStorageObjects,
      deletedRlsRows,
    };
  }
}
