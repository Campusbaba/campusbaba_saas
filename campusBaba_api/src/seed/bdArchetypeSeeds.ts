import { AppContainer } from "../composition/container";

export interface DemoTenantSeedSummary {
  slug: string;
  name: string;
  nameBn: string;
  institutionType: "school" | "college" | "madrasa_alia" | "coaching";
  planCode: "starter" | "postpaid" | "coaching_pro" | "enterprise";
}

export const BD_ARCHETYPE_TENANTS: DemoTenantSeedSummary[] = [
  {
    slug: "dhakamodel",
    name: "Dhaka Model High School",
    nameBn: "ঢাকা মডেল উচ্চ বিদ্যালয়",
    institutionType: "school",
    planCode: "postpaid",
  },
  {
    slug: "chittagongcollege",
    name: "Chattogram City Science College",
    nameBn: "চট্টগ্রাম সিটি বিজ্ঞান কলেজ",
    institutionType: "college",
    planCode: "enterprise",
  },
  {
    slug: "darululoom",
    name: "Darul Uloom Kamil Madrasa",
    nameBn: "দারুল উলুম কামিল মাদ্রাসা",
    institutionType: "madrasa_alia",
    planCode: "postpaid",
  },
  {
    slug: "udvashbatch",
    name: "Sunrise Academic & Admission Coaching",
    nameBn: "সানরাইজ একাডেমিক ও অ্যাডমিশন কোচিং",
    institutionType: "coaching",
    planCode: "coaching_pro",
  },
];

/**
 * Seeds the 4 deterministic Bangladeshi institution archetype tenants
 * (School, College, Madrasa, Coaching Center) into the container's SaaS & RLS stores.
 */
export function seedBangladeshArchetypeTenants(
  appContainer: AppContainer
): DemoTenantSeedSummary[] {
  const demoCounts: Record<
    string,
    { students: number; guardians: number; teachers: number; classes: number; admins: number }
  > = {
    dhakamodel: { students: 420, guardians: 390, teachers: 28, classes: 18, admins: 4 },
    chittagongcollege: { students: 950, guardians: 880, teachers: 54, classes: 32, admins: 8 },
    darululoom: { students: 310, guardians: 295, teachers: 22, classes: 14, admins: 3 },
    udvashbatch: { students: 680, guardians: 640, teachers: 10, classes: 24, admins: 4 },
  };

  for (const archetype of BD_ARCHETYPE_TENANTS) {
    appContainer.platformSaas.registerTenantRecord({
      name: archetype.name,
      subdomain: archetype.slug,
      billingPlan: archetype.planCode,
      institutionType: archetype.institutionType,
    });
    if (demoCounts[archetype.slug]) {
      appContainer.platformSaas.setActiveCounts(
        archetype.slug,
        demoCounts[archetype.slug]
      );
    }

    if (archetype.institutionType === "coaching") {
      appContainer.bdModules.createCoachingBatch(archetype.slug, {
        batchCode: "HSC-PHY-26-A",
        name: "HSC 2026 Physics Morning Batch",
        nameBn: "এইচএসসি ২০২৬ পদার্থবিজ্ঞান প্রভাতি ব্যাচ",
        scheduleSummary: "Sat, Mon, Wed 08:00 AM - 09:30 AM",
        capacity: 60,
        monthlyFee: 1500,
        feeModel: "monthly",
      });
    }
  }

  return BD_ARCHETYPE_TENANTS;
}
