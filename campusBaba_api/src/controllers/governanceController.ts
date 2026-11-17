import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../middlewares/errorHandler";
import { container } from "../composition/container";

// ---------------------------------------------------------------------------
// 1. SuperAdmin Platform-Wide Governance & RBAC Control Endpoints
// ---------------------------------------------------------------------------
export const getPlatformGovernanceOverview = asyncHandler(
  async (_req: Request, res: Response) => {
    const policy = container.governance.getPlatformPolicy();
    const roleMatrix = container.governance.getGlobalRoleMatrix();
    const permissionCatalog = container.governance.getAllPermissionCatalog();
    const plans = container.platformSaas.listPlans();

    res.status(200).json({
      success: true,
      data: {
        policy,
        roleMatrix,
        permissionCatalog,
        plans,
        activeDrivers: {
          storage: container.storage.driverName,
          sms: container.sms.driverName,
          cache: container.cache.driverName,
          queue: container.queue.driverName,
          payments: Array.from(container.paymentGateways.keys()),
        },
      },
    });
  }
);

export const updatePlatformSecurityPolicy = asyncHandler(
  async (req: Request, res: Response) => {
    const updated = await container.governance.updatePlatformPolicy(
      req.body,
      req.superAdmin?.id || "superadmin"
    );

    res.status(200).json({
      success: true,
      message: "Platform security & operational policies updated immediately",
      data: updated,
    });
  }
);

export const updateGlobalRolePermissions = asyncHandler(
  async (req: Request, res: Response) => {
    const { roleCode, permissions, propagateToAllTenants } = req.body;
    if (!roleCode || !Array.isArray(permissions)) {
      throw new AppError(400, "roleCode and permissions[] array are required");
    }

    const updatedMatrix = await container.governance.updateGlobalRoleMatrix(
      roleCode,
      permissions,
      req.superAdmin?.id || "superadmin",
      !!propagateToAllTenants
    );

    res.status(200).json({
      success: true,
      message: `Global permissions for role '${roleCode}' updated`,
      data: updatedMatrix,
    });
  }
);

export const getSuperAdminTenantGovernance = asyncHandler(
  async (req: Request, res: Response) => {
    const { tenantKey } = req.params;
    const cfg = container.governance.getTenantGovernance(tenantKey);
    res.status(200).json({
      success: true,
      data: cfg,
    });
  }
);

export const updateSuperAdminTenantGovernance = asyncHandler(
  async (req: Request, res: Response) => {
    const { tenantKey } = req.params;
    const updated = await container.governance.updateTenantGovernance(
      tenantKey,
      req.body,
      req.superAdmin?.id || "superadmin"
    );

    res.status(200).json({
      success: true,
      message: `Governance & feature flags updated for tenant '${tenantKey}'`,
      data: updated,
    });
  }
);

// ---------------------------------------------------------------------------
// 2. Tenant Admin Access Control, Feature Flags & Provider Credentials Endpoints
// ---------------------------------------------------------------------------
export const getMyTenantGovernance = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId =
      req.tenant?.subdomain || req.resolvedTenantSlug || req.user?.tenantId;
    if (!tenantId) {
      throw new AppError(400, "Tenant context required");
    }

    const cfg = container.governance.getTenantGovernance(tenantId);
    const permissionCatalog = container.governance.getAllPermissionCatalog();
    const myRole = req.user?.role || "student";
    const myPermissions =
      myRole === "superadmin"
        ? permissionCatalog.map((p) => p.code)
        : cfg.rolePermissions[myRole] || [];

    res.status(200).json({
      success: true,
      data: {
        tenantId,
        myRole,
        myPermissions,
        featureFlags: cfg.featureFlags,
        rolePermissions: cfg.rolePermissions,
        securitySettings: cfg.securitySettings,
        gradingScheme: cfg.gradingScheme,
        permissionCatalog,
      },
    });
  }
);

export const updateMyTenantGovernance = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId =
      req.tenant?.subdomain || req.resolvedTenantSlug || req.user?.tenantId;
    if (!tenantId) {
      throw new AppError(400, "Tenant context required");
    }

    const updated = await container.governance.updateTenantGovernance(
      tenantId,
      req.body,
      req.user?.id || "admin"
    );

    res.status(200).json({
      success: true,
      message: "Institution access control & module settings updated",
      data: updated,
    });
  }
);

export const saveTenantProviderCredentials = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId =
      req.tenant?.subdomain || req.resolvedTenantSlug || req.user?.tenantId;
    if (!tenantId) {
      throw new AppError(400, "Tenant context required");
    }

    const { capability, providerCode, secrets } = req.body;
    if (!capability || !providerCode || !secrets) {
      throw new AppError(
        400,
        "capability ('sms' | 'payment'), providerCode, and secrets object are required"
      );
    }

    const result = await container.governance.configureTenantProviderCredentials({
      tenantId,
      capability,
      providerCode,
      secrets,
      actorUserId: req.user?.id || "admin",
    });

    res.status(200).json({
      success: true,
      message: `Encrypted ${capability.toUpperCase()} credentials saved for ${providerCode}`,
      data: result,
    });
  }
);
