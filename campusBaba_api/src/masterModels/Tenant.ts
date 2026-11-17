import { container } from "../composition/container";

export interface ITenant {
  id: string;
  _id: string;
  name: string;
  subdomain: string;
  subscriptionStatus: "active" | "inactive" | "past_due" | "suspended" | "exported" | "purged" | "trialing";
  billingPlan: string;
  maxStudents: number;
  maxGuardians: number;
  maxTeachers: number;
  maxClasses: number;
  maxAdmins: number;
  perStudentFeeBdt: number;
  orgStudentShareBdt: number;
  platformStudentShareBdt: number;
  guardianPortalFree: boolean;
  guardianMultiStudentAllowed: boolean;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<ITenant>;
}

function wrapTenantRecord(rec: any): ITenant {
  return {
    ...rec,
    id: rec.id,
    _id: rec.id,
    updatedAt: new Date(),
    async save() {
      return this;
    },
  };
}

export const Tenant = {
  async findOne(filter: { subdomain?: string }): Promise<ITenant | null> {
    if (!filter.subdomain) return null;
    const rec = container.platformSaas.getTenant(filter.subdomain.toLowerCase().trim());
    return rec ? wrapTenantRecord(rec) : null;
  },

  async findById(id: string): Promise<ITenant | null> {
    const rec = container.platformSaas.getTenant(String(id));
    return rec ? wrapTenantRecord(rec) : null;
  },

  find() {
    const list = container.platformSaas.listAllTenants().map(wrapTenantRecord);
    return {
      sort: (_spec?: any) => Promise.resolve(list),
      lean: () => Promise.resolve(list),
      then: (resolve: any, reject: any) => Promise.resolve(list).then(resolve, reject),
    };
  },

  async create(input: Partial<ITenant>): Promise<ITenant> {
    const rec = container.platformSaas.registerTenantRecord({
      name: input.name || "Organization",
      subdomain: input.subdomain || "org",
      billingPlan: input.billingPlan,
      maxStudents: input.maxStudents,
      maxGuardians: input.maxGuardians,
      maxTeachers: input.maxTeachers,
      maxClasses: input.maxClasses,
      maxAdmins: input.maxAdmins,
      perStudentFeeBdt: input.perStudentFeeBdt,
      orgStudentShareBdt: input.orgStudentShareBdt,
      platformStudentShareBdt: input.platformStudentShareBdt,
      guardianPortalFree: input.guardianPortalFree,
      guardianMultiStudentAllowed: input.guardianMultiStudentAllowed,
    });
    return wrapTenantRecord(rec);
  },

  async findByIdAndDelete(id: string): Promise<ITenant | null> {
    const rec = container.platformSaas.getTenant(String(id));
    return rec ? wrapTenantRecord(rec) : null;
  },
};
