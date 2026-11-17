import bcrypt from "bcryptjs";
import { AppContainer } from "../composition/container";
import { RlsTenantStore } from "../infrastructure/persistence/postgres/rlsTransaction";

export interface DemoTenantSeedSummary {
  slug: string;
  name: string;
  nameBn: string;
  institutionType: "school" | "college" | "madrasa_alia" | "coaching";
  planCode: "campus_connect" | "sme_coaching" | "individual_tutor" | "starter" | "postpaid" | "coaching_pro" | "enterprise";
}

export const BD_ARCHETYPE_TENANTS: DemoTenantSeedSummary[] = [
  {
    slug: "demo",
    name: "CampusBaba Official Demo Academy",
    nameBn: "ক্যাম্পাসবাবা ডেমো একাডেমি",
    institutionType: "school",
    planCode: "campus_connect",
  },
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

// Pre-computed bcrypt hash for "password123" so seeding stays synchronous and fast
const PASSWORD_123_HASH = bcrypt.hashSync("password123", 10);

/**
 * Seeds the customer-facing `demo` organization (`demo.campusbaba.com`) + 4 Bangladeshi
 * institution archetype tenants into the container's SaaS & RLS stores, complete with
 * ready-to-login Admin, Teacher, Parent (Guardian), and Student accounts.
 */
export function seedBangladeshArchetypeTenants(
  appContainer: AppContainer
): DemoTenantSeedSummary[] {
  const demoCounts: Record<
    string,
    { students: number; guardians: number; teachers: number; classes: number; admins: number }
  > = {
    demo: { students: 250, guardians: 240, teachers: 18, classes: 12, admins: 3 },
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

    if (archetype.institutionType === "coaching" || archetype.slug === "demo") {
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

    // Seed ready-to-login Demo Role Accounts inside each tenant's PostgreSQL RLS context
    RlsTenantStore.runWithTenantContext(
      {
        tenantId: archetype.slug,
        tenantSlug: archetype.slug,
      },
      () => {
        const existingUsers = appContainer.rlsStore.findMany("tenant_memberships");
        if (existingUsers.length > 0) return;

        // 1. Seed Department, Course & Classroom
        const dept = appContainer.rlsStore.insert("departments", {
          id: `dept-sci-${archetype.slug}`,
          _id: `dept-sci-${archetype.slug}`,
          name: "Science Department",
          code: "SCI",
          description: "NCTB Science Track",
          status: "active",
        });

        const course = appContainer.rlsStore.insert("courses", {
          id: `crs-ssc-${archetype.slug}`,
          _id: `crs-ssc-${archetype.slug}`,
          name: "Class 10 (SSC Science)",
          code: "SSC-10",
          credits: 10,
          duration: 12,
          departmentId: dept.id,
          status: "active",
        });

        const classRoom = appContainer.rlsStore.insert("class_sections", {
          id: `cls-10a-${archetype.slug}`,
          _id: `cls-10a-${archetype.slug}`,
          classRoomId: "CR-0001",
          name: "Class 10 - Section Padma",
          roomNumber: "201",
          capacity: 60,
          currentEnrollment: 1,
          departmentId: dept.id,
          courseId: course.id,
          academicYear: "2026",
          semester: "Annual",
          status: "active",
        });

        // 2. Seed Admin Profile (Employee) + Admin User Logins
        const adminProfile = appContainer.rlsStore.insert("staff", {
          id: `emp-admin-${archetype.slug}`,
          _id: `emp-admin-${archetype.slug}`,
          employeeId: "EMP-0001",
          firstName: "Kamrul",
          lastName: "Hasan (Principal)",
          email: "admin@demo.campusbaba.com",
          phone: "+8801711000001",
          position: "Principal",
          department: "Administration",
          salary: 65000,
          status: "active",
        });

        for (const adminEmail of [
          "admin@demo.campusbaba.com",
          "admin@gmail.com",
        ]) {
          appContainer.rlsStore.insert("tenant_memberships", {
            email: adminEmail,
            password: PASSWORD_123_HASH,
            role: "admin",
            referenceId: adminProfile.id,
            isActive: true,
          });
        }

        // 3. Seed Teacher Profile + Teacher User Logins
        const teacherProfile = appContainer.rlsStore.insert("staff", {
          id: `tch-1-${archetype.slug}`,
          _id: `tch-1-${archetype.slug}`,
          teacherId: "TCH-0001",
          firstName: "Milon",
          lastName: "Sir (Senior Teacher)",
          email: "teacher@demo.campusbaba.com",
          phone: "+8801711000002",
          departmentId: dept.id,
          designation: "Senior Lecturer",
          qualification: "M.Sc in Physics (DU)",
          specialization: ["Physics", "Higher Mathematics"],
          salary: 45000,
          status: "active",
        });

        for (const teacherEmail of [
          "teacher@demo.campusbaba.com",
          "lavern_howe@yahoo.com",
        ]) {
          appContainer.rlsStore.insert("tenant_memberships", {
            email: teacherEmail,
            password: PASSWORD_123_HASH,
            role: "teacher",
            referenceId: teacherProfile.id,
            isActive: true,
          });
        }

        // 4. Seed Parent (Guardian) Profile + Parent User Logins
        const parentProfile = appContainer.rlsStore.insert("guardians", {
          id: `par-1-${archetype.slug}`,
          _id: `par-1-${archetype.slug}`,
          parentId: "PAR-0001",
          firstName: "Abdul",
          lastName: "Karim (Guardian)",
          email: "parent@demo.campusbaba.com",
          phone: "+8801711000003",
          relationship: "father",
          occupation: "Business",
          status: "active",
        });

        for (const parentEmail of [
          "parent@demo.campusbaba.com",
          "tiara_wunsch@hotmail.com",
        ]) {
          appContainer.rlsStore.insert("tenant_memberships", {
            email: parentEmail,
            password: PASSWORD_123_HASH,
            role: "parent",
            referenceId: parentProfile.id,
            isActive: true,
          });
        }

        // 5. Seed Student Profile + Student User Logins
        const studentProfile = appContainer.rlsStore.insert("students", {
          id: `stu-1-${archetype.slug}`,
          _id: `stu-1-${archetype.slug}`,
          studentId: "STU-0001",
          firstName: "Tanvir",
          lastName: "Ahmed",
          email: "student@demo.campusbaba.com",
          phone: "+8801711000004",
          rollNumber: "101",
          gender: "male",
          parentId: parentProfile.id,
          classRoomId: classRoom.id,
          departmentId: dept.id,
          enrollmentDate: new Date("2026-01-10"),
          status: "active",
        });

        for (const studentEmail of [
          "student@demo.campusbaba.com",
          "gabriella.harber@yahoo.com",
        ]) {
          appContainer.rlsStore.insert("tenant_memberships", {
            email: studentEmail,
            password: PASSWORD_123_HASH,
            role: "student",
            referenceId: studentProfile.id,
            isActive: true,
          });
        }
      }
    );
  }

  return BD_ARCHETYPE_TENANTS;
}
