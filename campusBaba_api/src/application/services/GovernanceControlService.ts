import {
  PERMISSIONS,
  PermissionCode,
  DEFAULT_ROLE_PERMISSIONS,
  TenantRoleCode,
} from "../../domain/rbac/Permissions";
import { AuditPort } from "../../ports";
import { ProviderResolver } from "../../infrastructure/security/ProviderResolver";
import { BD_BOARD_GRADE_BANDS, GradeBand } from "../../domain/grading/BangladeshGradingPolicy";

export interface PlatformSecurityPolicy {
  enforceHostOnlyResolution: boolean;
  maintenanceMode: boolean;
  showDemoCredentialsOnLogin: boolean;
  loginRateLimitPerMin: number;
  apiRateLimitPerMin: number;
  accessTtlMinutes: number;
  refreshTtlDays: number;
  corsAllowedOrigins: string[];
  reservedSubdomains: string[];
  storageMaxUploadMb: number;
  profilePhotoMaxKb: number;
  allowedMimeTypes: string[];
  enforceBtrcPromotionalWindow: boolean;
  defaultSmsSenderId: string;
  enabledPaymentGateways: ("manual" | "bkash" | "nagad" | "rocket" | "sslcommerz" | "aamarpay")[];
  autoActivateStudentOnPayment: boolean;
}

export interface TenantFeatureFlags {
  library: boolean;
  transport: boolean;
  hostel: boolean;
  sms: boolean;
  onlinePayments: boolean;
  coachingBatches: boolean;
  gpa5Grading: boolean;
  madrasaTrack: boolean;
}

export interface TenantGovernanceConfig {
  tenantId: string;
  customDomain?: string;
  featureFlags: TenantFeatureFlags;
  rolePermissions: Record<string, PermissionCode[]>;
  securitySettings: {
    allowQrSelfRegistration: boolean;
    requireAccountantTrxVerification: boolean;
    autoActivateStudentOnPayment: boolean;
    ipAllowlist: string[];
  };
  gradingScheme: {
    name: string;
    maxGpa: number;
    enableFourthSubjectBonus: boolean;
    fourthSubjectDeduction: number;
    failIfAnyMandatoryFailed: boolean;
    gradeBands: GradeBand[];
  };
  updatedAt: Date;
}

/**
 * Centralized No-Code Governance, Security & RBAC Control Service
 * Allows SuperAdmins (via RMS) and Tenant Admins (via Institution Portal) to control:
 * - Global & Per-Tenant Role-Based Access Control (RBAC) permission matrices
 * - Per-Tenant Feature Flags & Campus Modules (Library, Transport, Hostel, Batches, SMS, Payments)
 * - Platform Security, Rate Limits, CORS Origins, Storage Quotas & MIME policies
 * - Per-Tenant Grading Schemes (5.00 GPA, 4th Subject Bonus) & Encrypted Gateway Credentials
 * without touching any code or redeploying.
 */
export class GovernanceControlService {
  private platformPolicy: PlatformSecurityPolicy;
  private defaultRoleMatrix: Record<string, PermissionCode[]>;
  private readonly tenantConfigs = new Map<string, TenantGovernanceConfig>();

  constructor(
    private readonly deps: {
      audit: AuditPort;
      providerResolver: ProviderResolver;
      initialCorsOrigins: readonly string[];
      initialReservedSubdomains: ReadonlySet<string>;
      initialAllowedMimes: ReadonlySet<string>;
      initialMaxUploadBytes: number;
    }
  ) {
    this.platformPolicy = {
      enforceHostOnlyResolution: false,
      maintenanceMode: false,
      showDemoCredentialsOnLogin: false,
      loginRateLimitPerMin: 30,
      apiRateLimitPerMin: 120,
      accessTtlMinutes: 15,
      refreshTtlDays: 30,
      corsAllowedOrigins: [...deps.initialCorsOrigins],
      reservedSubdomains: Array.from(deps.initialReservedSubdomains),
      storageMaxUploadMb: Math.round(deps.initialMaxUploadBytes / (1024 * 1024)),
      profilePhotoMaxKb: 300,
      allowedMimeTypes: Array.from(deps.initialAllowedMimes),
      enforceBtrcPromotionalWindow: true,
      defaultSmsSenderId: "CAMPUSBABA",
      enabledPaymentGateways: ["manual", "bkash", "nagad", "sslcommerz", "aamarpay"],
      autoActivateStudentOnPayment: true,
    };

    this.defaultRoleMatrix = {
      admin: [...DEFAULT_ROLE_PERMISSIONS.admin],
      employee: [...DEFAULT_ROLE_PERMISSIONS.employee],
      teacher: [...DEFAULT_ROLE_PERMISSIONS.teacher],
      student: [...DEFAULT_ROLE_PERMISSIONS.student],
      parent: [...DEFAULT_ROLE_PERMISSIONS.parent],
      accountant: [
        PERMISSIONS.STUDENTS_READ,
        PERMISSIONS.PAYMENTS_READ,
        PERMISSIONS.PAYMENTS_WRITE,
        PERMISSIONS.PAYMENTS_VERIFY_TRX,
        PERMISSIONS.EXPENSES_READ,
        PERMISSIONS.EXPENSES_WRITE,
        PERMISSIONS.EXPENSES_APPROVE,
        PERMISSIONS.REPORTS_FINANCIAL_READ,
      ],
      librarian: [
        PERMISSIONS.STUDENTS_READ,
        PERMISSIONS.TEACHERS_READ,
        PERMISSIONS.LIBRARY_READ,
        PERMISSIONS.LIBRARY_WRITE,
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Platform-Wide Security & Access Policy (SuperAdmin RMS)
  // ---------------------------------------------------------------------------
  getPlatformPolicy(): PlatformSecurityPolicy {
    return { ...this.platformPolicy };
  }

  async updatePlatformPolicy(
    patch: Partial<PlatformSecurityPolicy>,
    actorAdminId: string
  ): Promise<PlatformSecurityPolicy> {
    this.platformPolicy = {
      ...this.platformPolicy,
      ...patch,
    };

    await this.deps.audit.record({
      actorUserId: actorAdminId,
      action: "governance.platform_policy_updated",
      entityType: "PlatformSecurityPolicy",
      entityId: "global",
      metadata: { updatedKeys: Object.keys(patch) },
    });

    return this.getPlatformPolicy();
  }

  getAllPermissionCatalog(): { code: PermissionCode; module: string }[] {
    return Object.values(PERMISSIONS).map((code) => ({
      code,
      module: code.split(":")[0],
    }));
  }

  getGlobalRoleMatrix(): Record<string, PermissionCode[]> {
    const copy: Record<string, PermissionCode[]> = {};
    for (const [role, perms] of Object.entries(this.defaultRoleMatrix)) {
      copy[role] = [...perms];
    }
    return copy;
  }

  async updateGlobalRoleMatrix(
    roleCode: string,
    permissions: PermissionCode[],
    actorAdminId: string,
    propagateToAllTenants = false
  ): Promise<Record<string, PermissionCode[]>> {
    this.defaultRoleMatrix[roleCode] = [...permissions];

    if (propagateToAllTenants) {
      for (const cfg of this.tenantConfigs.values()) {
        cfg.rolePermissions[roleCode] = [...permissions];
        cfg.updatedAt = new Date();
      }
    }

    await this.deps.audit.record({
      actorUserId: actorAdminId,
      action: "governance.global_rbac_updated",
      entityType: "RoleMatrix",
      entityId: roleCode,
      metadata: {
        roleCode,
        permissionsCount: permissions.length,
        propagateToAllTenants,
      },
    });

    return this.getGlobalRoleMatrix();
  }

  // ---------------------------------------------------------------------------
  // 2. Per-Tenant Governance, RBAC, Feature Flags & Grading Config
  // ---------------------------------------------------------------------------
  getTenantGovernance(tenantId: string): TenantGovernanceConfig {
    const normalized = tenantId.toLowerCase().trim();
    let cfg = this.tenantConfigs.get(normalized);
    if (!cfg) {
      cfg = {
        tenantId: normalized,
        featureFlags: {
          library: true,
          transport: true,
          hostel: true,
          sms: true,
          onlinePayments: true,
          coachingBatches: true,
          gpa5Grading: true,
          madrasaTrack: false,
        },
        rolePermissions: this.getGlobalRoleMatrix(),
        securitySettings: {
          allowQrSelfRegistration: true,
          requireAccountantTrxVerification: true,
          autoActivateStudentOnPayment: this.platformPolicy.autoActivateStudentOnPayment,
          ipAllowlist: [],
        },
        gradingScheme: {
          name: "NCTB Standard 5.00 GPA",
          maxGpa: 5.0,
          enableFourthSubjectBonus: true,
          fourthSubjectDeduction: 2.0,
          failIfAnyMandatoryFailed: true,
          gradeBands: [...BD_BOARD_GRADE_BANDS],
        },
        updatedAt: new Date(),
      };
      this.tenantConfigs.set(normalized, cfg);
    }
    return cfg;
  }

  async updateTenantGovernance(
    tenantId: string,
    patch: {
      customDomain?: string;
      featureFlags?: Partial<TenantFeatureFlags>;
      rolePermissions?: Record<string, PermissionCode[]>;
      securitySettings?: Partial<TenantGovernanceConfig["securitySettings"]>;
      gradingScheme?: Partial<TenantGovernanceConfig["gradingScheme"]>;
    },
    actorUserId: string
  ): Promise<TenantGovernanceConfig> {
    const current = this.getTenantGovernance(tenantId);

    if (patch.customDomain !== undefined) {
      current.customDomain = patch.customDomain.trim().toLowerCase() || undefined;
    }
    if (patch.featureFlags) {
      current.featureFlags = {
        ...current.featureFlags,
        ...patch.featureFlags,
      };
    }
    if (patch.rolePermissions) {
      for (const [role, perms] of Object.entries(patch.rolePermissions)) {
        current.rolePermissions[role] = [...perms];
      }
    }
    if (patch.securitySettings) {
      current.securitySettings = {
        ...current.securitySettings,
        ...patch.securitySettings,
      };
    }
    if (patch.gradingScheme) {
      current.gradingScheme = {
        ...current.gradingScheme,
        ...patch.gradingScheme,
      };
    }
    current.updatedAt = new Date();

    await this.deps.audit.record({
      tenantId,
      actorUserId,
      action: "governance.tenant_config_updated",
      entityType: "TenantGovernanceConfig",
      entityId: tenantId,
      metadata: {
        updatedSections: Object.keys(patch),
      },
    });

    return current;
  }

  /**
   * Live RBAC check evaluated on every API request by `authorize(...)` middleware.
   * Changes made in the RMS or Admin UI take effect on the very next HTTP request!
   */
  hasPermission(
    tenantId: string | undefined,
    role: string,
    permission: PermissionCode
  ): boolean {
    if (role === "superadmin") return true;
    if (tenantId) {
      const cfg = this.getTenantGovernance(tenantId);
      const rolePerms = cfg.rolePermissions[role];
      if (rolePerms) {
        return rolePerms.includes(permission);
      }
    }
    const globalPerms = this.defaultRoleMatrix[role as TenantRoleCode];
    return globalPerms ? globalPerms.includes(permission) : false;
  }

  /**
   * Live Feature Flag check evaluated by module routes and UI navigation.
   */
  isFeatureEnabled(tenantId: string, feature: keyof TenantFeatureFlags): boolean {
    const cfg = this.getTenantGovernance(tenantId);
    return !!cfg.featureFlags[feature];
  }

  /**
   * Configures encrypted per-tenant SMS or Payment Gateway credentials from the UI.
   */
  async configureTenantProviderCredentials(params: {
    tenantId: string;
    capability: "sms" | "payment";
    providerCode: string;
    secrets: Record<string, unknown>;
    actorUserId: string;
  }) {
    const envelope = this.deps.providerResolver.setTenantCredential({
      tenantId: params.tenantId,
      capability: params.capability,
      providerCode: params.providerCode,
      secrets: params.secrets,
    });

    await this.deps.audit.record({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "governance.provider_credentials_updated",
      entityType: "ProviderCredential",
      entityId: `${params.capability}:${params.providerCode}`,
      metadata: {
        capability: params.capability,
        providerCode: params.providerCode,
        iv: envelope.iv,
      },
    });

    return {
      tenantId: params.tenantId,
      capability: params.capability,
      providerCode: params.providerCode,
      configured: true,
    };
  }
}
