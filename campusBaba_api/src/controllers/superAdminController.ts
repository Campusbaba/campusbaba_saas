import { Request, Response } from "express";
import { SuperAdmin } from "../masterModels/SuperAdmin";
import { Tenant } from "../masterModels/Tenant";
import { GlobalNotice } from "../masterModels/GlobalNotice";
import jwt from "jsonwebtoken";
import { config } from "../config";
import TenantConnectionManager from "../utils/TenantConnectionManager";
import { container } from "../composition/container";

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

export const logoutSuperAdmin = async (req: Request, res: Response) => {
  res.clearCookie("superadmin_token", {
    httpOnly: true,
    secure: config.app.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

// Provision new Tenant
export const provisionTenant = async (req: Request, res: Response) => {
  try {
    const {
      name,
      subdomain,
      billingPlan,
      maxStudents,
      maxTeachers,
      maxAdmins,
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

    const plan = container.platformSaas.getPlanByCode(billingPlan || "postpaid");

    // Check if subdomain exists
    const existingTenant = await Tenant.findOne({ subdomain: normalizedSubdomain });
    if (existingTenant) {
      return res
        .status(400)
        .json({ success: false, message: "Subdomain already in use" });
    }

    const defaultUri = config.env.MONGODB_URI;
    const uriObj = new URL(defaultUri);
    const dbPathParts = uriObj.pathname.split("/");
    dbPathParts[dbPathParts.length - 1] = `tenant_${normalizedSubdomain}`;
    uriObj.pathname = dbPathParts.join("/");
    const tenantDbURI = uriObj.toString();

    const tenant = await Tenant.create({
      name,
      subdomain: normalizedSubdomain,
      dbURI: tenantDbURI,
      billingPlan: plan.code,
      maxStudents: maxStudents || plan.maxStudents,
      maxTeachers: maxTeachers || plan.maxTeachers,
      maxAdmins: maxAdmins || plan.maxAdmins,
    });

    container.platformSaas.registerTenantRecord({
      id: String(tenant._id),
      name: tenant.name,
      subdomain: tenant.subdomain,
      billingPlan: tenant.billingPlan,
      maxStudents: tenant.maxStudents,
      maxTeachers: tenant.maxTeachers,
      maxAdmins: tenant.maxAdmins,
      actorAdminId: req.superAdmin?.id,
    });

    const tenantConn = TenantConnectionManager.getTenantConnection(
      normalizedSubdomain,
      tenantDbURI
    );

    const EmployeeModel = TenantConnectionManager.getTenantModel<any>(
      tenantConn,
      "Employee"
    );
    const UserModel = TenantConnectionManager.getTenantModel<any>(
      tenantConn,
      "User"
    );

    const newEmployee = await EmployeeModel.create({
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

    await UserModel.create({
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      referenceId: newEmployee._id,
    });

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
      message: "Tenant provisioned successfully",
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

// Get specific Tenant details (Deep Info)
export const getTenantDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    const tenantConn = TenantConnectionManager.getTenantConnection(
      tenant.subdomain,
      tenant.dbURI
    );

    const StudentModel = TenantConnectionManager.getTenantModel<any>(
      tenantConn,
      "Student"
    );
    const TeacherModel = TenantConnectionManager.getTenantModel<any>(
      tenantConn,
      "Teacher"
    );
    const EmployeeModel = TenantConnectionManager.getTenantModel<any>(
      tenantConn,
      "Employee"
    );

    const [students, teachers, employees] = await Promise.all([
      StudentModel.find().lean(),
      TeacherModel.find().lean(),
      EmployeeModel.find().lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        tenant,
        analytics: {
          currentStudents: students.length,
          currentTeachers: teachers.length,
          currentEmployees: employees.length,
        },
        lists: {
          students,
          teachers,
          employees,
        },
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

// Update Tenant
export const updateTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      subscriptionStatus,
      maxStudents,
      maxTeachers,
      maxAdmins,
      billingPlan,
    } = req.body;

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    if (subscriptionStatus) tenant.subscriptionStatus = subscriptionStatus;
    if (maxStudents !== undefined) tenant.maxStudents = maxStudents;
    if (maxTeachers !== undefined) tenant.maxTeachers = maxTeachers;
    if (maxAdmins !== undefined) tenant.maxAdmins = maxAdmins;
    if (billingPlan) tenant.billingPlan = billingPlan;

    await tenant.save();

    res.status(200).json({
      success: true,
      message: "Tenant updated successfully",
      data: tenant,
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Failed to update tenant" });
  }
};

// Dashboard Stats
export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const tenants = await Tenant.find().lean();

    let totalStudents = 0;
    let totalTeachers = 0;
    let totalEmployees = 0;

    for (const tenant of tenants) {
      try {
        const tenantConn = TenantConnectionManager.getTenantConnection(
          tenant.subdomain,
          tenant.dbURI
        );
        const StudentModel = TenantConnectionManager.getTenantModel<any>(
          tenantConn,
          "Student"
        );
        const TeacherModel = TenantConnectionManager.getTenantModel<any>(
          tenantConn,
          "Teacher"
        );
        const EmployeeModel = TenantConnectionManager.getTenantModel<any>(
          tenantConn,
          "Employee"
        );

        const [studentCount, teacherCount, employeeCount] = await Promise.all([
          StudentModel.countDocuments(),
          TeacherModel.countDocuments(),
          EmployeeModel.countDocuments(),
        ]);

        totalStudents += studentCount;
        totalTeachers += teacherCount;
        totalEmployees += employeeCount;
      } catch (err) {
        console.warn(
          `Could not fetch stats for tenant ${tenant.subdomain}:`,
          err
        );
      }
    }

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
        totalTeachers,
        totalEmployees,
        totalSubdomains: tenants.filter((t) => t.subdomain).length,
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
    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    tenant.subscriptionStatus = "inactive";
    await tenant.save();

    const saasRec = container.platformSaas.getTenant(tenant.subdomain);
    if (saasRec) {
      saasRec.subscriptionStatus = "suspended";
    }

    await container.audit.record({
      tenantId: String(tenant._id),
      actorUserId: req.superAdmin?.id || null,
      action: "tenant.suspended",
      entityType: "Tenant",
      entityId: String(tenant._id),
      metadata: { subdomain: tenant.subdomain },
    });

    res.status(200).json({
      success: true,
      message: "Tenant suspended successfully",
      data: tenant,
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
    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });
    }

    tenant.subscriptionStatus = "active";
    await tenant.save();

    const saasRec = container.platformSaas.getTenant(tenant.subdomain);
    if (saasRec) {
      saasRec.subscriptionStatus = "active";
    }

    await container.audit.record({
      tenantId: String(tenant._id),
      actorUserId: req.superAdmin?.id || null,
      action: "tenant.activated",
      entityType: "Tenant",
      entityId: String(tenant._id),
      metadata: { subdomain: tenant.subdomain },
    });

    res.status(200).json({
      success: true,
      message: "Tenant activated successfully",
      data: tenant,
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
 * (`tenants/{subdomain}/`), drops/evicts the tenant DB connection, and logs audit trail.
 */
export const exportTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let tenant = await Tenant.findById(id).catch(() => null);
    const key = tenant ? tenant.subdomain : id;

    if (tenant && !container.platformSaas.getTenant(tenant.subdomain)) {
      container.platformSaas.registerTenantRecord({
        id: String(tenant._id),
        name: tenant.name,
        subdomain: tenant.subdomain,
        billingPlan: tenant.billingPlan,
      });
      const rec = container.platformSaas.getTenant(tenant.subdomain)!;
      rec.subscriptionStatus =
        tenant.subscriptionStatus === "inactive" ? "suspended" : "active";
    }

    const exportBundle = await container.platformSaas.exportTenantBundle(
      key,
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
    const tenant = await Tenant.findById(id).catch(() => null);

    if (!tenant) {
      const saasTenant = container.platformSaas.getTenant(id);
      if (!saasTenant) {
        return res
          .status(404)
          .json({ success: false, message: "Tenant not found" });
      }
      const purgeRes = await container.platformSaas.verifyAndPurgeTenant(
        saasTenant.subdomain,
        req.superAdmin?.id || "superadmin",
        { forceBypassRetentionWindow: force }
      );
      return res.status(200).json({
        success: true,
        message: "Tenant verified and purged",
        data: purgeRes,
      });
    }

    // P0-6 Guard: Cannot delete an active tenant without suspending first
    if (tenant.subscriptionStatus === "active") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete an active tenant. Suspend the tenant and export its archive before purging.",
      });
    }

    if (!container.platformSaas.getTenant(tenant.subdomain)) {
      container.platformSaas.registerTenantRecord({
        id: String(tenant._id),
        name: tenant.name,
        subdomain: tenant.subdomain,
        billingPlan: tenant.billingPlan,
      });
      const rec = container.platformSaas.getTenant(tenant.subdomain)!;
      rec.subscriptionStatus = "suspended";
      await container.platformSaas.exportTenantBundle(
        tenant.subdomain,
        req.superAdmin?.id || "superadmin"
      );
    }

    const purgeSummary = await container.platformSaas.verifyAndPurgeTenant(
      tenant.subdomain,
      req.superAdmin?.id || "superadmin",
      { forceBypassRetentionWindow: true }
    );

    await TenantConnectionManager.evictAndDropTenantDatabase(tenant.subdomain);
    await Tenant.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Tenant archived, storage purged, and database removed",
      data: purgeSummary,
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

    const tenant: any =
      (await Tenant.findById(id).catch(() => null)) ||
      container.platformSaas.getTenant(id);
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
        referenceId: String(tenant._id || tenant.id),
        tenantId: tenant.subdomain,
        impersonatedBy: req.superAdmin?.id || "superadmin",
      },
      config.auth.accessSecret,
      { expiresIn: "15m" }
    );

    await container.audit.record({
      tenantId: String(tenant._id || tenant.id),
      actorUserId: req.superAdmin?.id || null,
      impersonatedByAdminId: req.superAdmin?.id || null,
      action: "tenant.impersonation_started",
      entityType: "Tenant",
      entityId: String(tenant._id || tenant.id),
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
