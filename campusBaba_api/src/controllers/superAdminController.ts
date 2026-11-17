import { Request, Response } from "express";
import { SuperAdmin } from "../masterModels/SuperAdmin";
import { Tenant } from "../masterModels/Tenant";
import { GlobalNotice } from "../masterModels/GlobalNotice";
import {
  Student,
  Parent,
  Teacher,
  ClassRoom,
  Employee,
  User,
} from "../models";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { container } from "../composition/container";
import { RlsTenantStore } from "../infrastructure/persistence/postgres/rlsTransaction";

// Super Admin Login (Fixes P0-7: sets httpOnly Secure SameSite=Lax host-only cookie)
export const loginSuperAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and password" });
    }

    const admin = await SuperAdmin.findOne({ email: email.toLowerCase().trim() });

    if (!admin || !(await admin.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    if (!admin.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Account is disabled" });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: "superadmin" },
      config.auth.accessSecret,
      {
        expiresIn: config.auth.accessTtl as jwt.SignOptions["expiresIn"],
      }
    );

    // P0-7 Fix: Host-only httpOnly cookie (no Domain=.campusbaba.com)
    res.cookie("superadmin_token", token, {
      httpOnly: true,
      secure: config.app.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await container.audit.record({
      actorUserId: String(admin._id),
      action: "superadmin.login",
      entityType: "SuperAdmin",
      entityId: String(admin._id),
      ipAddress: req.ip || null,
      metadata: { email: admin.email },
    });

    res.status(200).json({
      success: true,
      token,
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

export const logoutSuperAdmin = async (_req: Request, res: Response) => {
  res.clearCookie("superadmin_token", {
    httpOnly: true,
    secure: config.app.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

// Provision new Tenant in PostgreSQL RLS
export const provisionTenant = async (req: Request, res: Response) => {
  try {
    const {
      name,
      subdomain,
      billingPlan,
      maxStudents,
      maxGuardians,
      maxTeachers,
      maxClasses,
      maxAdmins,
      perStudentFeeBdt,
      orgStudentShareBdt,
      platformStudentShareBdt,
      guardianPortalFree,
      guardianMultiStudentAllowed,
      adminEmail,
      adminPassword,
    } = req.body;

    if (!name || !subdomain || !adminEmail || !adminPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const normalizedSubdomain = String(subdomain).toLowerCase().trim();
    if (container.config.tenancy.reservedSubdomains.has(normalizedSubdomain)) {
      return res.status(400).json({
        success: false,
        message: `Subdomain '${normalizedSubdomain}' is reserved`,
      });
    }

    const plan = container.platformSaas.getPlanByCode(
      billingPlan || "campus_connect"
    );

    const existingTenant = await Tenant.findOne({ subdomain: normalizedSubdomain });
    if (existingTenant) {
      return res
        .status(400)
        .json({ success: false, message: "Subdomain already in use" });
    }

    const tenant = await Tenant.create({
      name,
      subdomain: normalizedSubdomain,
      billingPlan: plan.code,
      maxStudents: maxStudents !== undefined ? Number(maxStudents) : plan.maxStudents,
      maxGuardians: maxGuardians !== undefined ? Number(maxGuardians) : plan.maxGuardians,
      maxTeachers: maxTeachers !== undefined ? Number(maxTeachers) : plan.maxTeachers,
      maxClasses: maxClasses !== undefined ? Number(maxClasses) : plan.maxClasses,
      maxAdmins: maxAdmins !== undefined ? Number(maxAdmins) : plan.maxAdmins,
      perStudentFeeBdt:
        perStudentFeeBdt !== undefined ? Number(perStudentFeeBdt) : plan.perStudentFeeBdt,
      orgStudentShareBdt:
        orgStudentShareBdt !== undefined ? Number(orgStudentShareBdt) : plan.orgStudentShareBdt,
      platformStudentShareBdt:
        platformStudentShareBdt !== undefined
          ? Number(platformStudentShareBdt)
          : plan.platformStudentShareBdt,
      guardianPortalFree:
        guardianPortalFree !== undefined ? Boolean(guardianPortalFree) : plan.guardianPortalFree,
      guardianMultiStudentAllowed:
        guardianMultiStudentAllowed !== undefined
          ? Boolean(guardianMultiStudentAllowed)
          : plan.guardianMultiStudentAllowed,
    });

    // Seed initial Admin staff & user membership inside the new tenant's PostgreSQL RLS context
    await RlsTenantStore.runWithTenantContext(
      {
        tenantId: normalizedSubdomain,
        tenantSlug: normalizedSubdomain,
      },
      async () => {
        const newEmployee = await Employee.create({
          employeeId: `ADM-${Date.now()}`,
          firstName: "Admin",
          lastName: "User",
          email: adminEmail,
          phone: "+8801700000000",
          dateOfBirth: new Date("1980-01-01"),
          gender: "other",
          address: {
            street: "123 Main St",
            city: "Dhaka",
            state: "Dhaka",
            zipCode: "1000",
            country: "Bangladesh",
          },
          position: "Principal",
          department: "Administration",
          joiningDate: new Date(),
          salary: 0,
          status: "active",
          emergencyContact: {
            name: "Emergency Contact",
            relationship: "Other",
            phone: "+8801700000000",
          },
        });

        await User.create({
          email: adminEmail,
          password: adminPassword,
          role: "admin",
          referenceId: newEmployee._id,
          isActive: true,
        });
      }
    );

    await container.audit.record({
      tenantId: String(tenant._id),
      actorUserId: req.superAdmin?.id || null,
      action: "tenant.provisioned",
      entityType: "Tenant",
      entityId: String(tenant._id),
      metadata: {
        name,
        subdomain: normalizedSubdomain,
        billingPlan: plan.code,
      },
    });

    res.status(201).json({
      success: true,
      message: "Tenant provisioned successfully in PostgreSQL RLS",
      data: {
        tenant,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Provisioning failed",
      error: error.message,
    });
  }
};

// Get all Tenants
export const getTenants = async (_req: Request, res: Response) => {
  try {
    const tenants = await Tenant.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: tenants,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch tenants" });
  }
};

// Get specific Tenant details (Deep Info via PostgreSQL RLS)
export const getTenantDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    const rlsData = await RlsTenantStore.runWithTenantContext(
      {
        tenantId: tenant.subdomain,
        tenantSlug: tenant.subdomain,
      },
      async () => {
        const [students, parents, teachers, classRooms, employees] =
          await Promise.all([
            Student.find().lean(),
            Parent.find().lean(),
            Teacher.find().lean(),
            ClassRoom.find().lean(),
            Employee.find().lean(),
          ]);
        return { students, parents, teachers, classRooms, employees };
      }
    );

    const activeCounts = container.platformSaas.getActiveCounts(tenant.subdomain);
    const currentStudents = Math.max(rlsData.students.length, activeCounts.students);
    const currentGuardians = Math.max(rlsData.parents.length, activeCounts.guardians);
    const currentTeachers = Math.max(rlsData.teachers.length, activeCounts.teachers);
    const currentClasses = Math.max(rlsData.classRooms.length, activeCounts.classes);
    const currentEmployees = Math.max(rlsData.employees.length, activeCounts.admins);

    const revenueSplit = container.platformSaas.calculateTenantRevenueSplit(
      {
        billingPlan: tenant.billingPlan,
        perStudentFeeBdt: tenant.perStudentFeeBdt ?? 15,
        orgStudentShareBdt: tenant.orgStudentShareBdt ?? 5,
        platformStudentShareBdt: tenant.platformStudentShareBdt ?? 10,
      },
      currentStudents,
      currentGuardians
    );

    res.status(200).json({
      success: true,
      data: {
        tenant,
        analytics: {
          currentStudents,
          currentGuardians,
          currentTeachers,
          currentClasses,
          currentEmployees,
          revenueSplit,
        },
        lists: rlsData,
      },
    });
  } catch (error: any) {
    console.error("Deep fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch deep tenant info",
      error: error.message,
    });
  }
};

// Update Tenant (PostgreSQL RLS + SaaS Store, all quotas & per-student fee splits)
export const updateTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      subscriptionStatus,
      maxStudents,
      maxGuardians,
      maxTeachers,
      maxClasses,
      maxAdmins,
      billingPlan,
      perStudentFeeBdt,
      orgStudentShareBdt,
      platformStudentShareBdt,
      guardianPortalFree,
      guardianMultiStudentAllowed,
    } = req.body;

    const saasRec = container.platformSaas.getTenant(id);
    if (!saasRec) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    if (subscriptionStatus) saasRec.subscriptionStatus = subscriptionStatus;
    if (maxStudents !== undefined) saasRec.maxStudents = Number(maxStudents);
    if (maxGuardians !== undefined) saasRec.maxGuardians = Number(maxGuardians);
    if (maxTeachers !== undefined) saasRec.maxTeachers = Number(maxTeachers);
    if (maxClasses !== undefined) saasRec.maxClasses = Number(maxClasses);
    if (maxAdmins !== undefined) saasRec.maxAdmins = Number(maxAdmins);
    if (billingPlan) saasRec.billingPlan = billingPlan;
    if (perStudentFeeBdt !== undefined)
      saasRec.perStudentFeeBdt = Number(perStudentFeeBdt);
    if (orgStudentShareBdt !== undefined)
      saasRec.orgStudentShareBdt = Number(orgStudentShareBdt);
    if (platformStudentShareBdt !== undefined)
      saasRec.platformStudentShareBdt = Number(platformStudentShareBdt);
    if (guardianPortalFree !== undefined)
      saasRec.guardianPortalFree = Boolean(guardianPortalFree);
    if (guardianMultiStudentAllowed !== undefined)
      saasRec.guardianMultiStudentAllowed = Boolean(guardianMultiStudentAllowed);

    await container.audit.record({
      tenantId: String(saasRec.id),
      actorUserId: req.superAdmin?.id || "superadmin",
      action: "tenant.quotas_and_pricing_updated",
      entityType: "Tenant",
      entityId: String(saasRec.id),
      metadata: {
        maxStudents,
        maxGuardians,
        maxTeachers,
        maxClasses,
        maxAdmins,
        billingPlan,
        perStudentFeeBdt,
        orgStudentShareBdt,
        platformStudentShareBdt,
        guardianMultiStudentAllowed,
      },
    });

    res.status(200).json({
      success: true,
      message: "Tenant quotas and per-student pricing updated successfully",
      data: saasRec,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update tenant" });
  }
};

// Business Intelligence (BI) & Operations Dashboard Stats (PostgreSQL RLS)
export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const tenants = container.platformSaas.listAllTenants();

    let totalStudents = 0;
    let totalGuardians = 0;
    let totalTeachers = 0;
    let totalClasses = 0;
    let totalEmployees = 0;

    let grossPerStudentCollectionsBdt = 0;
    let orgRetainedShareBdt = 0;
    let platformStudentRevenueBdt = 0;
    let platformBasePlanRevenueBdt = 0;

    const orgBreakdown: Array<{
      name: string;
      subdomain: string;
      billingPlan: string;
      subscriptionStatus: string;
      students: number;
      guardians: number;
      teachers: number;
      classes: number;
      maxStudents: number;
      maxGuardians: number;
      maxTeachers: number;
      maxClasses: number;
      perStudentFeeBdt: number;
      orgShareBdt: number;
      platformShareBdt: number;
      grossBdt: number;
      orgEarnedBdt: number;
      platformEarnedBdt: number;
      totalPlatformMrrBdt: number;
    }> = [];

    for (const tenant of tenants) {
      const rlsCounts = await RlsTenantStore.runWithTenantContext(
        {
          tenantId: tenant.subdomain,
          tenantSlug: tenant.subdomain,
        },
        async () => {
          const [stu, par, tch, cls, emp] = await Promise.all([
            Student.countDocuments(),
            Parent.countDocuments(),
            Teacher.countDocuments(),
            ClassRoom.countDocuments(),
            Employee.countDocuments(),
          ]);
          return { stu, par, tch, cls, emp };
        }
      );

      const memCounts = container.platformSaas.getActiveCounts(tenant.subdomain);
      const studentCount = Math.max(rlsCounts.stu, memCounts.students);
      const guardianCount = Math.max(rlsCounts.par, memCounts.guardians);
      const teacherCount = Math.max(rlsCounts.tch, memCounts.teachers);
      const classCount = Math.max(rlsCounts.cls, memCounts.classes);
      const employeeCount = Math.max(rlsCounts.emp, memCounts.admins);

      totalStudents += studentCount;
      totalGuardians += guardianCount;
      totalTeachers += teacherCount;
      totalClasses += classCount;
      totalEmployees += employeeCount;

      const split = container.platformSaas.calculateTenantRevenueSplit(
        {
          billingPlan: tenant.billingPlan || "campus_connect",
          perStudentFeeBdt: tenant.perStudentFeeBdt ?? 15,
          orgStudentShareBdt: tenant.orgStudentShareBdt ?? 5,
          platformStudentShareBdt: tenant.platformStudentShareBdt ?? 10,
        },
        studentCount,
        guardianCount
      );

      if (tenant.subscriptionStatus === "active") {
        grossPerStudentCollectionsBdt += split.grossStudentFeeBdt;
        orgRetainedShareBdt += split.orgEarnedShareBdt;
        platformStudentRevenueBdt += split.platformEarnedShareBdt;
        platformBasePlanRevenueBdt += split.baseMonthlyBdt;
      }

      orgBreakdown.push({
        name: tenant.name,
        subdomain: tenant.subdomain,
        billingPlan: tenant.billingPlan || "campus_connect",
        subscriptionStatus: tenant.subscriptionStatus,
        students: studentCount,
        guardians: guardianCount,
        teachers: teacherCount,
        classes: classCount,
        maxStudents: tenant.maxStudents ?? -1,
        maxGuardians: tenant.maxGuardians ?? -1,
        maxTeachers: tenant.maxTeachers ?? 10,
        maxClasses: tenant.maxClasses ?? 50,
        perStudentFeeBdt: split.perStudentFeeBdt,
        orgShareBdt: split.orgStudentShareBdt,
        platformShareBdt: split.platformStudentShareBdt,
        grossBdt: split.grossStudentFeeBdt,
        orgEarnedBdt: split.orgEarnedShareBdt,
        platformEarnedBdt: split.platformEarnedShareBdt,
        totalPlatformMrrBdt: split.totalPlatformMonthlyRevenueBdt,
      });
    }

    const totalPlatformMrrBdt =
      platformBasePlanRevenueBdt + platformStudentRevenueBdt;

    res.status(200).json({
      success: true,
      data: {
        totalOrganizations: tenants.length,
        activeOrganizations: tenants.filter(
          (t) => t.subscriptionStatus === "active"
        ).length,
        inactiveOrganizations: tenants.filter(
          (t) => t.subscriptionStatus !== "active"
        ).length,
        totalStudents,
        totalGuardians,
        totalTeachers,
        totalClasses,
        totalEmployees,
        totalSubdomains: tenants.filter((t) => t.subdomain).length,
        financialBi: {
          grossPerStudentCollectionsBdt,
          orgRetainedShareBdt,
          platformStudentRevenueBdt,
          platformBasePlanRevenueBdt,
          totalPlatformMrrBdt,
          totalPlatformArrBdt: totalPlatformMrrBdt * 12,
          guardianPortalRevenueBdt: 0, // Always Free
        },
        orgBreakdown,
      },
    });
  } catch (error: any) {
    console.error("Dashboard stats error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard stats" });
  }
};

// Suspend Tenant
export const suspendTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saasRec = container.platformSaas.getTenant(id);
    if (!saasRec) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    saasRec.subscriptionStatus = "suspended";

    await container.audit.record({
      tenantId: String(saasRec.id),
      actorUserId: req.superAdmin?.id || null,
      action: "tenant.suspended",
      entityType: "Tenant",
      entityId: String(saasRec.id),
      metadata: { subdomain: saasRec.subdomain },
    });

    res.status(200).json({
      success: true,
      message: "Tenant suspended successfully",
      data: saasRec,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to suspend tenant" });
  }
};

// Activate Tenant
export const activateTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saasRec = container.platformSaas.getTenant(id);
    if (!saasRec) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    saasRec.subscriptionStatus = "active";

    await container.audit.record({
      tenantId: String(saasRec.id),
      actorUserId: req.superAdmin?.id || null,
      action: "tenant.activated",
      entityType: "Tenant",
      entityId: String(saasRec.id),
      metadata: { subdomain: saasRec.subdomain },
    });

    res.status(200).json({
      success: true,
      message: "Tenant activated successfully",
      data: saasRec,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to activate tenant" });
  }
};

/**
 * Safe Tenant Offboarding & Verified Purge (Fixes P0-6):
 * Requires tenant to be suspended first, exports manifest, purges storage prefix
 * (`tenants/{subdomain}/`), purges PostgreSQL RLS rows, and logs audit trail.
 */
export const exportTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const exportBundle = await container.platformSaas.exportTenantBundle(
      id,
      req.superAdmin?.id || "superadmin"
    );

    res.status(200).json({
      success: true,
      message: "Tenant export bundle generated and retention window started",
      data: exportBundle,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to export tenant",
    });
  }
};

export const deleteTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query.force === "true" || req.body?.force === true;
    const saasTenant = container.platformSaas.getTenant(id);

    if (!saasTenant) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    if (saasTenant.subscriptionStatus === "active") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete an active tenant. Suspend the tenant and export its archive before purging.",
      });
    }

    const purgeRes = await container.platformSaas.verifyAndPurgeTenant(
      saasTenant.subdomain,
      req.superAdmin?.id || "superadmin",
      { forceBypassRetentionWindow: force }
    );

    res.status(200).json({
      success: true,
      message: "Tenant verified and purged from PostgreSQL RLS and storage",
      data: purgeRes,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to delete tenant",
    });
  }
};

// Audited, Time-Boxed SuperAdmin Tenant Impersonation
export const impersonateTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "A detailed reason (min 5 chars) is required for tenant impersonation",
      });
    }

    const tenant = container.platformSaas.getTenant(id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const impersonationToken = jwt.sign(
      {
        id: `impersonated-${tenant.subdomain}`,
        email: `impersonation@${tenant.subdomain}.campusbaba.com`,
        role: "admin",
        referenceId: String(tenant.id),
        tenantId: tenant.subdomain,
        impersonatedBy: req.superAdmin?.id || "superadmin",
      },
      config.auth.accessSecret,
      { expiresIn: "15m" }
    );

    await container.audit.record({
      tenantId: String(tenant.id),
      actorUserId: req.superAdmin?.id || null,
      impersonatedByAdminId: req.superAdmin?.id || null,
      action: "tenant.impersonation_started",
      entityType: "Tenant",
      entityId: String(tenant.id),
      ipAddress: req.ip || null,
      metadata: {
        subdomain: tenant.subdomain,
        reason: String(reason).trim(),
        ttlMinutes: 15,
      },
    });

    res.status(200).json({
      success: true,
      message: "Time-boxed (15m) audited impersonation token issued",
      data: {
        token: impersonationToken,
        tenantSubdomain: tenant.subdomain,
        expiresInMinutes: 15,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to impersonate tenant",
    });
  }
};

// Plans CRUD (Fixes P0-11)
export const getPlans = async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: container.platformSaas.listPlans(),
  });
};

export const upsertPlan = async (req: Request, res: Response) => {
  try {
    const { code, name, priceBdt } = req.body;
    if (!code || !name || priceBdt === undefined) {
      return res.status(400).json({
        success: false,
        message: "Plan code, name, and priceBdt are required",
      });
    }
    const plan = container.platformSaas.upsertPlan(req.body);
    res.status(200).json({
      success: true,
      message: "Plan saved successfully",
      data: plan,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to save plan",
    });
  }
};

// Audit Logs Query
export const getAuditLogs = async (req: Request, res: Response) => {
  const { tenantId, action, limit } = req.query;
  const logs = await container.audit.query({
    tenantId: tenantId ? String(tenantId) : undefined,
    action: action ? String(action) : undefined,
    limit: limit ? Number(limit) : 100,
  });
  res.status(200).json({
    success: true,
    data: logs,
  });
};

// Global Notices CRUD
export const createGlobalNotice = async (req: Request, res: Response) => {
  try {
    const notice = await GlobalNotice.create({
      ...req.body,
      ...(req.superAdmin?.id ? { createdBy: req.superAdmin.id } : {}),
    });
    res.status(201).json({
      success: true,
      message: "Notice created successfully",
      data: notice,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to create notice",
      error: error.message,
    });
  }
};

export const getGlobalNotices = async (_req: Request, res: Response) => {
  try {
    const notices = await GlobalNotice.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: notices,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch notices" });
  }
};

export const updateGlobalNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const notice = await GlobalNotice.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!notice) {
      return res
        .status(404)
        .json({ success: false, message: "Notice not found" });
    }

    res.status(200).json({
      success: true,
      message: "Notice updated successfully",
      data: notice,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update notice" });
  }
};

export const deleteGlobalNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const notice = await GlobalNotice.findByIdAndDelete(id);

    if (!notice) {
      return res
        .status(404)
        .json({ success: false, message: "Notice not found" });
    }

    res.status(200).json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete notice" });
  }
};
