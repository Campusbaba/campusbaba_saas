"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  User,
  Shield,
  Palette,
  Globe,
  Save,
  Lock,
  Moon,
  Sun,
  KeyRound,
  Cpu,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getPlatformGovernance,
  updatePlatformSecurityPolicy,
  updateGlobalRolePermissions,
} from "@/lib/api";
import { toast } from "sonner";

const FALLBACK_PERMISSIONS = [
  { code: "users:invite", module: "users" },
  { code: "users:manage", module: "users" },
  { code: "students:read", module: "students" },
  { code: "students:write", module: "students" },
  { code: "students:delete", module: "students" },
  { code: "teachers:read", module: "teachers" },
  { code: "teachers:write", module: "teachers" },
  { code: "teachers:delete", module: "teachers" },
  { code: "employees:read", module: "employees" },
  { code: "employees:write", module: "employees" },
  { code: "employees:delete", module: "employees" },
  { code: "parents:read", module: "parents" },
  { code: "parents:write", module: "parents" },
  { code: "parents:delete", module: "parents" },
  { code: "academics:read", module: "academics" },
  { code: "academics:write", module: "academics" },
  { code: "attendance:read", module: "attendance" },
  { code: "attendance:mark", module: "attendance" },
  { code: "batches:read", module: "batches" },
  { code: "batches:write", module: "batches" },
  { code: "exams:read", module: "exams" },
  { code: "exams:write", module: "exams" },
  { code: "marks:read", module: "marks" },
  { code: "marks:evaluate", module: "marks" },
  { code: "marks:publish", module: "marks" },
  { code: "payments:read", module: "payments" },
  { code: "payments:write", module: "payments" },
  { code: "payments:verify_trx", module: "payments" },
  { code: "expenses:read", module: "expenses" },
  { code: "expenses:write", module: "expenses" },
  { code: "expenses:approve", module: "expenses" },
  { code: "reports:financial:read", module: "reports" },
  { code: "notices:read", module: "notices" },
  { code: "notices:write", module: "notices" },
  { code: "sms:send", module: "sms" },
  { code: "library:read", module: "library" },
  { code: "library:write", module: "library" },
  { code: "transport:read", module: "transport" },
  { code: "transport:write", module: "transport" },
  { code: "hostel:read", module: "hostel" },
  { code: "hostel:write", module: "hostel" },
  { code: "files:upload", module: "files" },
  { code: "files:read", module: "files" },
  { code: "files:sensitive:read", module: "files" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRbac, setSavingRbac] = useState(false);

  // Centralized Platform Security & Operational Policy
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
    enabledPaymentGateways: ["manual", "bkash", "nagad", "sslcommerz", "aamarpay"],
  });

  // Dynamic RBAC Matrix
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
  const [permissionCatalog, setPermissionCatalog] = useState(FALLBACK_PERMISSIONS);
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
        if (res.data.permissionCatalog?.length) {
          setPermissionCatalog(res.data.permissionCatalog);
        }
        if (res.data.activeDrivers) setActiveDrivers(res.data.activeDrivers);
      }
    } catch {
      // Fallback to local state if backend is offline
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
      toast.success("Platform security & operational policies applied immediately!");
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

  const handleSaveRbac = async () => {
    setSavingRbac(true);
    try {
      await updateGlobalRolePermissions({
        roleCode: selectedRole,
        permissions: roleMatrix[selectedRole] || [],
        propagateToAllTenants: propagateToAll,
      });
      toast.success(
        `RBAC permissions saved for '${selectedRole}'${propagateToAll ? " and propagated to all organizations" : ""}!`
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

  return (
    <div className="space-y-6 mt-2 animate-fade-in max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Centralized Zero-Code Control Plane — Manage RBAC permissions, security policies, rate limits, storage quotas, and payment/SMS gateways across the entire platform.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchGovernance} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Sync Live State
        </Button>
      </div>

      <Tabs defaultValue="rbac" className="space-y-6">
        <TabsList>
          <TabsTrigger value="rbac" className="text-xs">
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
            RBAC Permission Matrix
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Security, CORS & Rate Limits
          </TabsTrigger>
          <TabsTrigger value="drivers" className="text-xs">
            <Cpu className="h-3.5 w-3.5 mr-1.5" />
            R2 Storage, SMS & Gateways
          </TabsTrigger>
          <TabsTrigger value="appearance" className="text-xs">
            <Palette className="h-3.5 w-3.5 mr-1.5" />
            Theme & Appearance
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: Global RBAC Permission Matrix ─── */}
        <TabsContent value="rbac">
          <Card className="border-border/50">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Dynamic Role-Based Access Control (RBAC) Matrix
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Toggle exact API & UI permissions per role. Changes take effect immediately without touching code.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={propagateToAll}
                    onCheckedChange={(v) => setPropagateToAll(!!v)}
                  />
                  <span>Apply to all active organizations</span>
                </label>
                <Button
                  onClick={handleSaveRbac}
                  disabled={savingRbac}
                  className="gradient-primary text-white"
                  size="sm"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {savingRbac ? "Saving..." : `Save '${selectedRole.toUpperCase()}' Permissions`}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Role Selector Pills */}
              <div className="flex flex-wrap gap-2">
                {Object.keys(roleMatrix).map((role) => (
                  <Button
                    key={role}
                    type="button"
                    size="sm"
                    variant={selectedRole === role ? "default" : "outline"}
                    onClick={() => setSelectedRole(role)}
                    className={
                      selectedRole === role
                        ? "gradient-primary text-white capitalize"
                        : "capitalize"
                    }
                  >
                    {role}
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {(roleMatrix[role] || []).length}
                    </Badge>
                  </Button>
                ))}
              </div>

              <Separator />

              {/* Permission Checkboxes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {permissionCatalog
                  .filter((p) => !p.code.startsWith("platform:"))
                  .map((perm) => {
                    const checked = (roleMatrix[selectedRole] || []).includes(
                      perm.code
                    );
                    return (
                      <label
                        key={perm.code}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          checked
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              toggleRolePermission(perm.code)
                            }
                          />
                          <div>
                            <p className="text-xs font-mono font-medium">
                              {perm.code}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase">
                              Module: {perm.module}
                            </p>
                          </div>
                        </div>
                        {checked && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        )}
                      </label>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 2: Platform Security, CORS & Rate Limits ─── */}
        <TabsContent value="security">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Zero-Touch Security, Subdomain Isolation & Rate Limiting
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Control tenant resolution rules, JWT lifetimes, rate limits, and CORS allowlists in real time.
                </p>
              </div>
              <Button
                onClick={handleSavePolicy}
                disabled={savingPolicy}
                className="gradient-primary text-white"
                size="sm"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingPolicy ? "Applying..." : "Apply Security Policy"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div>
                    <p className="text-sm font-medium">Strict Host-Only Resolution</p>
                    <p className="text-xs text-muted-foreground">
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

                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div>
                    <p className="text-sm font-medium">Maintenance Mode</p>
                    <p className="text-xs text-muted-foreground">
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

                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div>
                    <p className="text-sm font-medium">Auto-Activate on Payment</p>
                    <p className="text-xs text-muted-foreground">
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
                  <Label className="text-xs">Login Rate Limit (req/min)</Label>
                  <Input
                    type="number"
                    value={policy.loginRateLimitPerMin}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        loginRateLimitPerMin: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">API Rate Limit (req/min)</Label>
                  <Input
                    type="number"
                    value={policy.apiRateLimitPerMin}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        apiRateLimitPerMin: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Access Token TTL (Minutes)</Label>
                  <Input
                    type="number"
                    value={policy.accessTtlMinutes}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        accessTtlMinutes: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Refresh Token TTL (Days)</Label>
                  <Input
                    type="number"
                    value={policy.refreshTtlDays}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        refreshTtlDays: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">
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
                    className="mt-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">
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
                    className="mt-1.5 font-mono text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 3: R2 Storage, SMS & Payment Gateways ─── */}
        <TabsContent value="drivers">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  Plug-and-Play Drivers, Cloudflare R2 Guardrails & BTRC SMS Rules
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Monitor active infrastructure adapters and configure file upload limits, SMS rules, and payment gateways.
                </p>
              </div>
              <Button
                onClick={handleSavePolicy}
                disabled={savingPolicy}
                className="gradient-primary text-white"
                size="sm"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Driver & Gateway Rules
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
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
                    className="p-3 rounded-lg bg-secondary/40 border border-border/50"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {d.label}
                    </p>
                    <p className="text-xs font-mono font-semibold text-emerald-400 mt-1 truncate">
                      {d.val}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Max Document Upload Size (MB)</Label>
                  <Input
                    type="number"
                    value={policy.storageMaxUploadMb}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        storageMaxUploadMb: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Profile Photo Size (KB)</Label>
                  <Input
                    type="number"
                    value={policy.profilePhotoMaxKb}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        profilePhotoMaxKb: +e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">
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
                    className="mt-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">
                    Enforce BTRC Promotional SMS Window (09:00 AM – 09:00 PM Asia/Dhaka)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Automatically blocks promotional bulk SMS outside BTRC permitted hours
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
                <Label className="text-xs mb-2 block">
                  Enabled Bangladeshi Payment Gateways
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: "manual", label: "Manual Send-Money TrxID (bKash/Nagad/Rocket)" },
                    { code: "bkash", label: "bKash Tokenized Merchant" },
                    { code: "nagad", label: "Nagad Merchant API" },
                    { code: "sslcommerz", label: "SSLCommerz Aggregator" },
                    { code: "aamarpay", label: "aamarPay Aggregator" },
                  ].map((gw) => {
                    const active = (policy.enabledPaymentGateways || []).includes(
                      gw.code
                    );
                    return (
                      <label
                        key={gw.code}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border/50 text-muted-foreground"
                        }`}
                      >
                        <Checkbox
                          checked={active}
                          onCheckedChange={() => togglePaymentGateway(gw.code)}
                        />
                        <span>{gw.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 4: Theme & Appearance ─── */}
        <TabsContent value="appearance">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                Appearance Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-muted-foreground">
                    Choose your preferred color scheme
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {[
                    { value: "light", icon: Sun, label: "Light" },
                    { value: "dark", icon: Moon, label: "Dark" },
                  ].map(({ value, icon: Icon, label }) => (
                    <Button
                      key={value}
                      variant={theme === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTheme(value)}
                      className={
                        theme === value ? "gradient-primary text-white" : ""
                      }
                    >
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
