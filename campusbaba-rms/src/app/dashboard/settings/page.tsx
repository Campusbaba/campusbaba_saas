"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Shield,
  Palette,
  Save,
  Moon,
  Sun,
  KeyRound,
  Cpu,
  CheckCircle2,
  RefreshCw,
  Check,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getPlatformGovernance,
  updatePlatformSecurityPolicy,
  updateGlobalRolePermissions,
} from "@/lib/api";
import { toast } from "sonner";

const FALLBACK_PERMISSIONS = [
  { code: "users:invite", module: "Users & Onboarding", label: "Issue Signed QR Invitations" },
  { code: "users:manage", module: "Users & Onboarding", label: "Manage User Accounts" },
  { code: "students:read", module: "Users & Onboarding", label: "View Students" },
  { code: "students:write", module: "Users & Onboarding", label: "Create & Edit Students" },
  { code: "students:delete", module: "Users & Onboarding", label: "Delete Students" },
  { code: "teachers:read", module: "Users & Onboarding", label: "View Teachers" },
  { code: "teachers:write", module: "Users & Onboarding", label: "Create & Edit Teachers" },
  { code: "teachers:delete", module: "Users & Onboarding", label: "Delete Teachers" },
  { code: "employees:read", module: "Users & Onboarding", label: "View Staff / Employees" },
  { code: "employees:write", module: "Users & Onboarding", label: "Create & Edit Staff" },
  { code: "employees:delete", module: "Users & Onboarding", label: "Delete Staff" },
  { code: "parents:read", module: "Users & Onboarding", label: "View Guardians" },
  { code: "parents:write", module: "Users & Onboarding", label: "Create & Edit Guardians" },
  { code: "parents:delete", module: "Users & Onboarding", label: "Delete Guardians" },
  { code: "academics:read", module: "Academics & Batches", label: "View Classes & Courses" },
  { code: "academics:write", module: "Academics & Batches", label: "Manage Classes & Routines" },
  { code: "attendance:read", module: "Academics & Batches", label: "View Attendance Records" },
  { code: "attendance:mark", module: "Academics & Batches", label: "Mark Daily Attendance" },
  { code: "batches:read", module: "Academics & Batches", label: "View Coaching Batches" },
  { code: "batches:write", module: "Academics & Batches", label: "Manage Coaching Batches" },
  { code: "exams:read", module: "Exams & 5.00 GPA", label: "View Exam Schedules" },
  { code: "exams:write", module: "Exams & 5.00 GPA", label: "Create & Edit Exams" },
  { code: "marks:read", module: "Exams & 5.00 GPA", label: "View Subject Marks & Merit" },
  { code: "marks:evaluate", module: "Exams & 5.00 GPA", label: "Enter & Evaluate Marks" },
  { code: "marks:publish", module: "Exams & 5.00 GPA", label: "Publish Term GPA Results" },
  { code: "payments:read", module: "Finance & Billing", label: "View Fee Invoices" },
  { code: "payments:write", module: "Finance & Billing", label: "Collect Cash / Record Fees" },
  { code: "payments:verify_trx", module: "Finance & Billing", label: "Verify bKash/Nagad TrxID" },
  { code: "expenses:read", module: "Finance & Billing", label: "View Campus Expenses" },
  { code: "expenses:write", module: "Finance & Billing", label: "Record Expenses" },
  { code: "expenses:approve", module: "Finance & Billing", label: "Approve Expense Vouchers" },
  { code: "reports:financial:read", module: "Finance & Billing", label: "View Profit & Income BI" },
  { code: "notices:read", module: "Campus Operations", label: "Read Notices" },
  { code: "notices:write", module: "Campus Operations", label: "Publish Notices" },
  { code: "sms:send", module: "Campus Operations", label: "Send BTRC Masking SMS" },
  { code: "library:read", module: "Campus Operations", label: "View Library Catalog" },
  { code: "library:write", module: "Campus Operations", label: "Issue & Return Books" },
  { code: "transport:read", module: "Campus Operations", label: "View Transport Routes" },
  { code: "transport:write", module: "Campus Operations", label: "Manage Fleet & Routes" },
  { code: "hostel:read", module: "Campus Operations", label: "View Hostel Rooms" },
  { code: "hostel:write", module: "Campus Operations", label: "Manage Rooms & Mess" },
  { code: "files:upload", module: "Storage & R2", label: "Upload Documents & Photos" },
  { code: "files:read", module: "Storage & R2", label: "Download General Files" },
  { code: "files:sensitive:read", module: "Storage & R2", label: "Access Sensitive NID/Birth Certs" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Institution Admin",
  employee: "Staff / Employee",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent / Guardian",
  accountant: "Accountant",
  librarian: "Librarian",
};

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<
    "rbac" | "security" | "drivers" | "appearance"
  >("rbac");
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRbac, setSavingRbac] = useState(false);

  const [policy, setPolicy] = useState({
    enforceHostOnlyResolution: false,
    maintenanceMode: false,
    showDemoCredentialsOnLogin: false,
    loginRateLimitPerMin: 30,
    apiRateLimitPerMin: 120,
    accessTtlMinutes: 15,
    refreshTtlDays: 30,
    corsAllowedOrigins: "http://localhost:3000,http://localhost:3001",
    reservedSubdomains: "www,app,api,admin,rms,mail,support,status",
    storageMaxUploadMb: 10,
    profilePhotoMaxKb: 300,
    enforceBtrcPromotionalWindow: true,
    defaultSmsSenderId: "CAMPUSBABA",
    autoActivateStudentOnPayment: true,
    enabledPaymentGateways: [
      "manual",
      "bkash",
      "nagad",
      "sslcommerz",
      "aamarpay",
    ],
  });

  const [selectedRole, setSelectedRole] = useState<string>("employee");
  const [propagateToAll, setPropagateToAll] = useState<boolean>(true);
  const [roleMatrix, setRoleMatrix] = useState<Record<string, string[]>>({
    admin: FALLBACK_PERMISSIONS.map((p) => p.code),
    employee: [
      "students:read",
      "students:write",
      "payments:read",
      "payments:write",
      "payments:verify_trx",
      "expenses:read",
      "expenses:write",
      "notices:read",
    ],
    teacher: [
      "students:read",
      "academics:read",
      "attendance:read",
      "attendance:mark",
      "exams:read",
      "marks:read",
      "marks:evaluate",
      "notices:read",
      "notices:write",
    ],
    student: [
      "students:read",
      "academics:read",
      "attendance:read",
      "exams:read",
      "marks:read",
      "payments:read",
      "notices:read",
    ],
    parent: [
      "students:read",
      "parents:read",
      "attendance:read",
      "exams:read",
      "marks:read",
      "payments:read",
      "notices:read",
    ],
    accountant: [
      "students:read",
      "payments:read",
      "payments:write",
      "payments:verify_trx",
      "expenses:read",
      "expenses:write",
      "expenses:approve",
      "reports:financial:read",
    ],
    librarian: ["students:read", "library:read", "library:write"],
  });

  const [activeDrivers, setActiveDrivers] = useState<Record<string, any>>({
    storage: "local",
    sms: "console",
    cache: "memory",
    queue: "inline",
    payments: ["manual", "bkash", "nagad", "sslcommerz", "aamarpay"],
  });

  const fetchGovernance = async () => {
    setLoading(true);
    try {
      const res = await getPlatformGovernance();
      if (res.data) {
        const p = res.data.policy;
        if (p) {
          setPolicy({
            ...p,
            corsAllowedOrigins: Array.isArray(p.corsAllowedOrigins)
              ? p.corsAllowedOrigins.join(",")
              : p.corsAllowedOrigins,
            reservedSubdomains: Array.isArray(p.reservedSubdomains)
              ? p.reservedSubdomains.join(",")
              : p.reservedSubdomains,
          });
        }
        if (res.data.roleMatrix) setRoleMatrix(res.data.roleMatrix);
        if (res.data.activeDrivers) setActiveDrivers(res.data.activeDrivers);
      }
    } catch {
      // Fallback to local defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGovernance();
  }, []);

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      await updatePlatformSecurityPolicy({
        ...policy,
        corsAllowedOrigins: policy.corsAllowedOrigins
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        reservedSubdomains: policy.reservedSubdomains
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      });
      toast.success(
        "Platform security & operational policies applied immediately!"
      );
    } catch {
      toast.error("Failed to update platform security policy");
    } finally {
      setSavingPolicy(false);
    }
  };

  const toggleRolePermission = (permCode: string) => {
    const current = roleMatrix[selectedRole] || [];
    const updated = current.includes(permCode)
      ? current.filter((c) => c !== permCode)
      : [...current, permCode];
    setRoleMatrix({ ...roleMatrix, [selectedRole]: updated });
  };

  const selectAllForRole = () => {
    setRoleMatrix({
      ...roleMatrix,
      [selectedRole]: FALLBACK_PERMISSIONS.map((p) => p.code),
    });
  };

  const clearAllForRole = () => {
    setRoleMatrix({
      ...roleMatrix,
      [selectedRole]: [],
    });
  };

  const handleSaveRbac = async () => {
    setSavingRbac(true);
    try {
      await updateGlobalRolePermissions({
        roleCode: selectedRole,
        permissions: roleMatrix[selectedRole] || [],
        propagateToAllTenants: propagateToAll,
      });
      toast.success(
        `RBAC permissions saved for '${selectedRole}'${
          propagateToAll ? " and propagated to all organizations" : ""
        }!`
      );
    } catch {
      toast.error("Failed to save RBAC permissions");
    } finally {
      setSavingRbac(false);
    }
  };

  const togglePaymentGateway = (gw: string) => {
    const current = policy.enabledPaymentGateways || [];
    const updated = current.includes(gw)
      ? current.filter((g) => g !== gw)
      : [...current, gw];
    setPolicy({ ...policy, enabledPaymentGateways: updated });
  };

  // Group permissions by module for clean visual sections
  const groupedPermissions = FALLBACK_PERMISSIONS.reduce(
    (acc, perm) => {
      if (!acc[perm.module]) acc[perm.module] = [];
      acc[perm.module].push(perm);
      return acc;
    },
    {} as Record<string, typeof FALLBACK_PERMISSIONS>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Control Plane Header & Clean Tab Bar ─── */}
      <Card className="border border-border bg-card shadow-xs">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Zero-Code Platform Governance & Security Control Plane
              </h2>
              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                LIVE ENFORCEMENT
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Manage role permissions, tenant resolution, rate limits, R2
              storage quotas, and BTRC SMS rules from one place without touching
              code.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={activeTab === "rbac" ? "default" : "outline"}
              onClick={() => setActiveTab("rbac")}
              className="h-8 text-xs"
            >
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              RBAC Matrix
            </Button>
            <Button
              size="sm"
              variant={activeTab === "security" ? "default" : "outline"}
              onClick={() => setActiveTab("security")}
              className="h-8 text-xs"
            >
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Security & Rate Limits
            </Button>
            <Button
              size="sm"
              variant={activeTab === "drivers" ? "default" : "outline"}
              onClick={() => setActiveTab("drivers")}
              className="h-8 text-xs"
            >
              <Cpu className="h-3.5 w-3.5 mr-1.5" />
              R2, SMS & Gateways
            </Button>
            <Button
              size="sm"
              variant={activeTab === "appearance" ? "default" : "outline"}
              onClick={() => setActiveTab("appearance")}
              className="h-8 text-xs"
            >
              <Palette className="h-3.5 w-3.5 mr-1.5" />
              Appearance
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchGovernance}
              disabled={loading}
              className="h-8 w-8"
              title="Sync Live State"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── TAB 1: Global RBAC Permission Matrix ─── */}
      {activeTab === "rbac" && (
        <Card className="border border-border bg-card shadow-xs">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-4">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Dynamic Role-Based Access Control (RBAC) Matrix
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Select a role below and grant or revoke permissions. Every API
                route enforces this matrix immediately.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                onClick={() => setPropagateToAll(!propagateToAll)}
                className="flex items-center gap-2 text-xs cursor-pointer px-2.5 py-1.5 rounded-md border border-border bg-secondary/40"
              >
                <Checkbox checked={propagateToAll} />
                <span>Propagate to all organizations</span>
              </div>

              <Button
                onClick={handleSaveRbac}
                disabled={savingRbac}
                size="sm"
                className="h-8 text-xs"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingRbac
                  ? "Saving..."
                  : `Save ${ROLE_LABELS[selectedRole] || selectedRole}`}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-5 space-y-6">
            {/* Role Selector Bar + Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(roleMatrix).map((role) => {
                  const isSelected = selectedRole === role;
                  const count = (roleMatrix[role] || []).length;
                  return (
                    <Button
                      key={role}
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => setSelectedRole(role)}
                      className="h-8 text-xs"
                    >
                      <span>{ROLE_LABELS[role] || role}</span>
                      <Badge
                        variant={isSelected ? "secondary" : "outline"}
                        className="ml-2 text-[10px] font-mono px-1.5 py-0"
                      >
                        {count}
                      </Badge>
                    </Button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllForRole}
                  className="h-7 text-[11px] font-mono"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Grant All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAllForRole}
                  className="h-7 text-[11px] font-mono"
                >
                  <X className="h-3 w-3 mr-1" />
                  Revoke All
                </Button>
              </div>
            </div>

            {/* Grouped Permission Cards by Module */}
            <div className="space-y-6">
              {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
                <div key={moduleName} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                      {moduleName}
                    </h3>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {
                        perms.filter((p) =>
                          (roleMatrix[selectedRole] || []).includes(p.code)
                        ).length
                      }{" "}
                      / {perms.length} active
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {perms.map((perm) => {
                      const checked = (
                        roleMatrix[selectedRole] || []
                      ).includes(perm.code);
                      return (
                        <div
                          key={perm.code}
                          onClick={() => toggleRolePermission(perm.code)}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? "border-emerald-500/40 bg-emerald-500/5"
                              : "border-border bg-card hover:bg-secondary/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Checkbox checked={checked} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {perm.label}
                              </p>
                              <p className="text-[11px] font-mono text-muted-foreground truncate">
                                {perm.code}
                              </p>
                            </div>
                          </div>
                          {checked && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 2: Platform Security, CORS & Rate Limits ─── */}
      {activeTab === "security" && (
        <Card className="border border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Zero-Touch Security, Subdomain Isolation & Rate Limiting
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Control tenant resolution rules, JWT lifetimes, rate limits, and
                CORS allowlists in real time.
              </CardDescription>
            </div>
            <Button
              onClick={handleSavePolicy}
              disabled={savingPolicy}
              size="sm"
              className="h-8 text-xs"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {savingPolicy ? "Applying..." : "Apply Security Policy"}
            </Button>
          </CardHeader>

          <CardContent className="pt-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/20">
                <div className="pr-3">
                  <p className="text-xs font-semibold">
                    Strict Host-Only Resolution
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Reject x-tenant-id header unless matched by Host subdomain
                  </p>
                </div>
                <Switch
                  checked={policy.enforceHostOnlyResolution}
                  onCheckedChange={(v) =>
                    setPolicy({ ...policy, enforceHostOnlyResolution: v })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/20">
                <div className="pr-3">
                  <p className="text-xs font-semibold">Maintenance Mode</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Temporarily pause tenant mutations during cutover
                  </p>
                </div>
                <Switch
                  checked={policy.maintenanceMode}
                  onCheckedChange={(v) =>
                    setPolicy({ ...policy, maintenanceMode: v })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/20">
                <div className="pr-3">
                  <p className="text-xs font-semibold">
                    Auto-Activate on Payment
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Activate student status when tuition invoice is paid
                  </p>
                </div>
                <Switch
                  checked={policy.autoActivateStudentOnPayment}
                  onCheckedChange={(v) =>
                    setPolicy({ ...policy, autoActivateStudentOnPayment: v })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Login Rate Limit (req/min)
                </Label>
                <Input
                  type="number"
                  value={policy.loginRateLimitPerMin}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      loginRateLimitPerMin: +e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  API Rate Limit (req/min)
                </Label>
                <Input
                  type="number"
                  value={policy.apiRateLimitPerMin}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      apiRateLimitPerMin: +e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Access Token TTL (Minutes)
                </Label>
                <Input
                  type="number"
                  value={policy.accessTtlMinutes}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      accessTtlMinutes: +e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Refresh Token TTL (Days)
                </Label>
                <Input
                  type="number"
                  value={policy.refreshTtlDays}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      refreshTtlDays: +e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Reserved Subdomains Blocklist (comma-separated)
                </Label>
                <Input
                  value={policy.reservedSubdomains}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      reservedSubdomains: e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Explicit CORS Allowed Origins (alongside *.campusbaba.com)
                </Label>
                <Input
                  value={policy.corsAllowedOrigins}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      corsAllowedOrigins: e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 3: R2 Storage, SMS & Payment Gateways ─── */}
      {activeTab === "drivers" && (
        <Card className="border border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Cpu className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Plug-and-Play Drivers, Cloudflare R2 Guardrails & BTRC SMS Rules
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Monitor active infrastructure adapters and configure file upload
                limits, SMS rules, and payment gateways.
              </CardDescription>
            </div>
            <Button
              onClick={handleSavePolicy}
              disabled={savingPolicy}
              size="sm"
              className="h-8 text-xs"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save Driver & Gateway Rules
            </Button>
          </CardHeader>

          <CardContent className="pt-5 space-y-6">
            {/* Active Drivers Status Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "StoragePort", val: activeDrivers.storage },
                { label: "SmsPort", val: activeDrivers.sms },
                { label: "CachePort", val: activeDrivers.cache },
                { label: "QueuePort", val: activeDrivers.queue },
                {
                  label: "PaymentGateways",
                  val: (activeDrivers.payments || []).join(", "),
                },
              ].map((d) => (
                <div
                  key={d.label}
                  className="p-3 rounded-lg bg-secondary/40 border border-border"
                >
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {d.label}
                  </p>
                  <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                    {d.val}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Document Upload Size (MB)
                </Label>
                <Input
                  type="number"
                  value={policy.storageMaxUploadMb}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      storageMaxUploadMb: +e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Profile Photo Size (KB)
                </Label>
                <Input
                  type="number"
                  value={policy.profilePhotoMaxKb}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      profilePhotoMaxKb: +e.target.value,
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Default BTRC Masking Sender ID (Max 11 chars)
                </Label>
                <Input
                  maxLength={11}
                  value={policy.defaultSmsSenderId}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      defaultSmsSenderId: e.target.value.toUpperCase(),
                    })
                  }
                  className="mt-1.5 h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/20">
              <div>
                <p className="text-xs font-semibold">
                  Enforce BTRC Promotional SMS Window (09:00 AM – 09:00 PM
                  Asia/Dhaka)
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Automatically blocks promotional bulk SMS outside BTRC
                  permitted hours
                </p>
              </div>
              <Switch
                checked={policy.enforceBtrcPromotionalWindow}
                onCheckedChange={(v) =>
                  setPolicy({ ...policy, enforceBtrcPromotionalWindow: v })
                }
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2.5 block">
                Enabled Bangladeshi Payment Gateways
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  {
                    code: "manual",
                    label: "Manual Send-Money TrxID (bKash/Nagad/Rocket)",
                  },
                  { code: "bkash", label: "bKash Tokenized Merchant" },
                  { code: "nagad", label: "Nagad Merchant API" },
                  { code: "sslcommerz", label: "SSLCommerz Aggregator" },
                  { code: "aamarpay", label: "aamarPay Aggregator" },
                ].map((gw) => {
                  const active = (policy.enabledPaymentGateways || []).includes(
                    gw.code
                  );
                  return (
                    <div
                      key={gw.code}
                      onClick={() => togglePaymentGateway(gw.code)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer text-xs transition-colors ${
                        active
                          ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                          : "border-border text-muted-foreground hover:bg-secondary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox checked={active} />
                        <span className="font-medium">{gw.label}</span>
                      </div>
                      {active && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 4: Theme & Appearance ─── */}
      {activeTab === "appearance" && (
        <Card className="border border-border bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Appearance & Theme Mode
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Switch between eye-friendly Soft Light Mode and Soft Charcoal Dark
              Mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">Interface Color Scheme</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Applies immediately across all RMS dashboards and tables
                </p>
              </div>
              <div className="flex items-center gap-2">
                {[
                  { value: "light", icon: Sun, label: "Soft Light" },
                  { value: "dark", icon: Moon, label: "Soft Dark" },
                ].map(({ value, icon: Icon, label }) => (
                  <Button
                    key={value}
                    variant={theme === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme(value)}
                    className="h-8 text-xs"
                  >
                    <Icon className="h-3.5 w-3.5 mr-1.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
