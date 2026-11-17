import { Router } from "express";
import {
  loginSuperAdmin,
  logoutSuperAdmin,
  provisionTenant,
  getTenants,
  updateTenant,
  getTenantDetails,
  getDashboardStats,
  suspendTenant,
  activateTenant,
  exportTenant,
  deleteTenant,
  impersonateTenant,
  getPlans,
  upsertPlan,
  getAuditLogs,
  createGlobalNotice,
  getGlobalNotices,
  updateGlobalNotice,
  deleteGlobalNotice,
} from "../controllers/superAdminController";
import {
  getPlatformGovernanceOverview,
  updatePlatformSecurityPolicy,
  updateGlobalRolePermissions,
  getSuperAdminTenantGovernance,
  updateSuperAdminTenantGovernance,
} from "../controllers/governanceController";
import { requireSuperAdmin, rateLimit } from "../middlewares/authMiddleware";

const router = Router();

// Public SuperAdmin Login (Rate-limited against brute-force)
router.post(
  "/login",
  rateLimit({ windowSeconds: 60, maxRequests: 20, keyPrefix: "sa_login" }),
  loginSuperAdmin
);

// Public read-only plans endpoint for RMS & marketing pricing display
router.get("/plans", getPlans);

// P0-1 Fix: All subsequent SuperAdmin routes require verified SuperAdmin JWT + Audit Logging
router.use(
  rateLimit({ windowSeconds: 60, maxRequests: 120, keyPrefix: "sa_api" }),
  requireSuperAdmin
);

router.post("/logout", logoutSuperAdmin);

// Dashboard & Audit Logs
router.get("/dashboard-stats", getDashboardStats);
router.get("/audit-logs", getAuditLogs);

// Plans Management (Fixes P0-11)
router.post("/plans", upsertPlan);

// Centralized Security, RBAC & Feature Flag Control Plane
router.get("/governance", getPlatformGovernanceOverview);
router.put("/governance/policy", updatePlatformSecurityPolicy);
router.put("/governance/rbac", updateGlobalRolePermissions);
router.get("/governance/tenants/:tenantKey", getSuperAdminTenantGovernance);
router.put("/governance/tenants/:tenantKey", updateSuperAdminTenantGovernance);

// Tenants Lifecycle (Fixes P0-6: suspend -> export -> delete/purge + audited impersonation)
router.get("/tenants", getTenants);
router.post("/tenants", provisionTenant);
router.get("/tenants/:id/details", getTenantDetails);
router.put("/tenants/:id", updateTenant);
router.post("/tenants/:id/suspend", suspendTenant);
router.post("/tenants/:id/activate", activateTenant);
router.post("/tenants/:id/export", exportTenant);
router.post("/tenants/:id/impersonate", impersonateTenant);
router.delete("/tenants/:id", deleteTenant);

// Global Notices
router.get("/notices", getGlobalNotices);
router.post("/notices", createGlobalNotice);
router.put("/notices/:id", updateGlobalNotice);
router.delete("/notices/:id", deleteGlobalNotice);

export default router;
