"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  GraduationCap,
  Briefcase,
  UserCheck,
  Calendar,
  Globe,
  Database,
  CreditCard,
  Shield,
  Power,
  Ban,
  Trash2,
  Save,
  KeyRound,
  Download,
  Sliders,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  getOrganizationDetails,
  updateOrganization,
  suspendOrganization,
  activateOrganization,
  exportOrganization,
  impersonateOrganization,
  deleteOrganization,
  getTenantGovernance,
  updateTenantGovernance,
} from "@/lib/api";
import { toast } from "sonner";

const FEATURE_MODULES = [
  {
    key: "coachingBatches",
    label: "Coaching & Batch Management",
    desc: "Batch capacity, waitlist, pro-rated mid-month fees & MCQ exams",
  },
  {
    key: "gpa5Grading",
    label: "Bangladesh 5.00 GPA & 4th Subject",
    desc: "NCTB 5.00 GPA scale, 4th-subject bonus & merit tabulation sheets",
  },
  {
    key: "madrasaTrack",
    label: "Madrasa Track (Dakhil / Alim / Hifz)",
    desc: "Alia & Qawmi madrasa tracks and Arabic medium support",
  },
  {
    key: "onlinePayments",
    label: "MFS TrxID & Online Payment Gateways",
    desc: "bKash, Nagad, Rocket manual TrxID verification & SSLCommerz",
  },
  {
    key: "sms",
    label: "BTRC SMS Gateway & Alerts",
    desc: "Bangla Unicode 70-char SMS wallet & automated guardian alerts",
  },
  {
    key: "library",
    label: "Library & Book Loans",
    desc: "ISBN/Barcode catalogue, issue/return & overdue fine tracking",
  },
  {
    key: "transport",
    label: "Transport & Vehicle Fleet",
    desc: "Routes, stops, vehicle fitness/tax-token expiry alerts",
  },
  {
    key: "hostel",
    label: "Hostel, Rooms & Mess Management",
    desc: "Room/bed allocation, daily meal on/off & bazar cost tracking",
  },
] as const;

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Quota Editable fields
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    maxStudents: 0,
    maxTeachers: 0,
    maxAdmins: 0,
    billingPlan: "",
  });
  const [saving, setSaving] = useState(false);

  // Per-Tenant Feature Flags & Security Governance
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    coachingBatches: true,
    gpa5Grading: true,
    madrasaTrack: false,
    onlinePayments: true,
    sms: true,
    library: true,
    transport: true,
    hostel: true,
  });
  const [securitySettings, setSecuritySettings] = useState({
    allowQrSelfRegistration: true,
    requireAccountantTrxVerification: true,
    autoActivateStudentOnPayment: true,
  });
  const [customDomain, setCustomDomain] = useState("");
  const [savingGov, setSavingGov] = useState(false);

  // Impersonation state
  const [impersonateReason, setImpersonateReason] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<
    "suspend" | "activate" | "export" | "delete" | null
  >(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetails = async () => {
    try {
      const response = await getOrganizationDetails(id as string);
      setData(response.data);
      const t = response.data.tenant;
      setEditForm({
        maxStudents: t.maxStudents,
        maxTeachers: t.maxTeachers,
        maxAdmins: t.maxAdmins,
        billingPlan: t.billingPlan,
      });

      if (t.subdomain) {
        const govRes = await getTenantGovernance(t.subdomain).catch(() => null);
        if (govRes?.data) {
          if (govRes.data.featureFlags) setFeatureFlags(govRes.data.featureFlags);
          if (govRes.data.securitySettings) {
            setSecuritySettings(govRes.data.securitySettings);
          }
          if (govRes.data.customDomain) setCustomDomain(govRes.data.customDomain);
        }
      }
    } catch {
      setError("Failed to fetch organization details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateOrganization(id as string, editForm);
      toast.success("Organization quotas updated successfully");
      setEditMode(false);
      fetchDetails();
    } catch {
      toast.error("Failed to update organization");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGovernance = async () => {
    if (!data?.tenant?.subdomain) return;
    setSavingGov(true);
    try {
      await updateTenantGovernance(data.tenant.subdomain, {
        customDomain,
        featureFlags,
        securitySettings,
      });
      toast.success(
        `Modules & security policies applied immediately for ${data.tenant.name}!`
      );
    } catch {
      toast.error("Failed to update tenant governance settings");
    } finally {
      setSavingGov(false);
    }
  };

  const handleImpersonate = async () => {
    if (!impersonateReason || impersonateReason.trim().length < 5) {
      toast.error("Please enter a valid audit reason (min 5 characters)");
      return;
    }
    setImpersonating(true);
    try {
      const res = await impersonateOrganization(
        id as string,
        impersonateReason.trim()
      );
      navigator.clipboard?.writeText(res.data.token).catch(() => null);
      toast.success(
        `15-minute audited impersonation token issued for ${res.data.tenantSubdomain} (copied to clipboard)`
      );
      setImpersonateReason("");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Impersonation failed");
    } finally {
      setImpersonating(false);
    }
  };

  const handleAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      switch (confirmAction) {
        case "suspend":
          await suspendOrganization(id as string);
          toast.success("Organization suspended");
          break;
        case "activate":
          await activateOrganization(id as string);
          toast.success("Organization activated");
          break;
        case "export":
          await exportOrganization(id as string);
          toast.success(
            "Organization archive exported & 14-day retention hold started"
          );
          break;
        case "delete":
          await deleteOrganization(id as string);
          toast.success("Organization verified and purged");
          router.push("/dashboard/organizations");
          return;
      }
      fetchDetails();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || `Failed to ${confirmAction} organization`
      );
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <Skeleton className="h-12 w-96" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-[140px] rounded-xl" />
          <Skeleton className="h-[140px] rounded-xl" />
          <Skeleton className="h-[140px] rounded-xl" />
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (error)
    return (
      <div className="p-8 text-center text-destructive">
        {error}
        <br />
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/dashboard/organizations")}
        >
          Back to Organizations
        </Button>
      </div>
    );
  if (!data) return null;

  const { tenant, analytics, lists } = data;
  const studentPercent = Math.min(
    100,
    (analytics.currentStudents / tenant.maxStudents) * 100
  );
  const teacherPercent = Math.min(
    100,
    (analytics.currentTeachers / tenant.maxTeachers) * 100
  );
  const employeePercent = Math.min(
    100,
    (analytics.currentEmployees / tenant.maxAdmins) * 100
  );

  return (
    <div className="space-y-6 mt-2 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/dashboard/organizations")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg">
                {tenant.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold">{tenant.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    <Globe className="h-3 w-3 mr-1" />
                    {tenant.subdomain}.campusbaba.com
                  </Badge>
                  <Badge
                    className={`text-xs ${
                      tenant.subscriptionStatus === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : tenant.subscriptionStatus === "past_due"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}
                  >
                    {tenant.subscriptionStatus.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons (Safe Offboarding Pipeline: Suspend -> Export -> Purge) */}
        <div className="flex items-center gap-2 flex-wrap">
          {tenant.subscriptionStatus === "active" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction("suspend")}
              className="text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
            >
              <Ban className="h-4 w-4 mr-1.5" />
              1. Suspend
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction("activate")}
                className="text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
              >
                <Power className="h-4 w-4 mr-1.5" />
                Reactivate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction("export")}
                className="text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/10"
              >
                <Download className="h-4 w-4 mr-1.5" />
                2. Export Archive
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction("delete")}
            className="text-red-400 border-red-500/20 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            3. Verified Purge
          </Button>
        </div>
      </div>

      {/* ─── Quota Usage ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <GraduationCap className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.currentStudents}{" "}
              <span className="text-sm text-muted-foreground font-normal">
                / {tenant.maxStudents}
              </span>
            </div>
            <Progress value={studentPercent} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {studentPercent.toFixed(0)}% capacity used
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Teachers</CardTitle>
            <Briefcase className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.currentTeachers}{" "}
              <span className="text-sm text-muted-foreground font-normal">
                / {tenant.maxTeachers}
              </span>
            </div>
            <Progress value={teacherPercent} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {teacherPercent.toFixed(0)}% capacity used
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">
              Admins / Employees
            </CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.currentEmployees}{" "}
              <span className="text-sm text-muted-foreground font-normal">
                / {tenant.maxAdmins}
              </span>
            </div>
            <Progress value={employeePercent} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {employeePercent.toFixed(0)}% capacity used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Per-Tenant Feature Flags, Security Overrides & Impersonation ─── */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" />
              Organization Modules, Security Policies & Audited Impersonation
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Enable or disable specific Bangladesh campus modules and security controls for {tenant.name} in real time.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSaveGovernance}
            disabled={savingGov}
            className="gradient-primary text-white"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {savingGov ? "Saving..." : "Apply Module & Security Config"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Module Toggles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURE_MODULES.map((mod) => (
              <div
                key={mod.key}
                className="flex items-start justify-between p-3 rounded-lg border border-border/50 bg-secondary/20"
              >
                <div className="pr-2">
                  <p className="text-xs font-semibold">{mod.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {mod.desc}
                  </p>
                </div>
                <Switch
                  checked={!!featureFlags[mod.key]}
                  onCheckedChange={(v) =>
                    setFeatureFlags({ ...featureFlags, [mod.key]: v })
                  }
                />
              </div>
            ))}
          </div>

          {/* Security Overrides + Custom Domain + Audited Impersonation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2 border-t border-border/40">
            <div className="space-y-2">
              <Label className="text-xs">Verified Custom Domain (Optional)</Label>
              <Input
                placeholder="e.g. portal.dhakapublic.edu.bd"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Tenant Security Policies</Label>
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex items-center justify-between p-2 rounded border border-border/50">
                  <span>Allow QR Self-Registration Invites</span>
                  <Switch
                    checked={securitySettings.allowQrSelfRegistration}
                    onCheckedChange={(v) =>
                      setSecuritySettings({
                        ...securitySettings,
                        allowQrSelfRegistration: v,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded border border-border/50">
                  <span>Require Accountant Verification on MFS TrxID</span>
                  <Switch
                    checked={securitySettings.requireAccountantTrxVerification}
                    onCheckedChange={(v) =>
                      setSecuritySettings({
                        ...securitySettings,
                        requireAccountantTrxVerification: v,
                      })
                    }
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                Time-Boxed (15m) Audited Impersonation
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter support ticket / audit reason..."
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  className="text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImpersonate}
                  disabled={impersonating}
                  className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                >
                  {impersonating ? "Issuing..." : "Impersonate"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Every action taken during impersonation is recorded in the platform audit log.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Info & Quota Controls ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Organization Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  <Shield className="h-3 w-3 inline mr-1" />
                  Tenant ID
                </p>
                <code className="text-sm font-mono bg-secondary/50 px-2 py-1 rounded">
                  {tenant._id}
                </code>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  <Globe className="h-3 w-3 inline mr-1" />
                  Subdomain
                </p>
                <p className="text-sm font-medium">
                  {tenant.subdomain}.campusbaba.com
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  <CreditCard className="h-3 w-3 inline mr-1" />
                  Billing Plan
                </p>
                <p className="text-sm font-medium capitalize">
                  {tenant.billingPlan}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Registered
                </p>
                <p className="text-sm font-medium">
                  {new Date(tenant.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quota Controls */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Quota & Plan Configuration
            </CardTitle>
            {!editMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Edit Quotas
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gradient-primary text-white"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Students
                </Label>
                <Input
                  type="number"
                  value={editForm.maxStudents}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      maxStudents: +e.target.value,
                    })
                  }
                  disabled={!editMode}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Teachers
                </Label>
                <Input
                  type="number"
                  value={editForm.maxTeachers}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      maxTeachers: +e.target.value,
                    })
                  }
                  disabled={!editMode}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Admins
                </Label>
                <Input
                  type="number"
                  value={editForm.maxAdmins}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      maxAdmins: +e.target.value,
                    })
                  }
                  disabled={!editMode}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Billing Plan
                </Label>
                <Select
                  value={editForm.billingPlan}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, billingPlan: val || "postpaid" })
                  }
                  disabled={!editMode}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="postpaid">Postpaid</SelectItem>
                    <SelectItem value="prepaid">Prepaid</SelectItem>
                    <SelectItem value="coaching_pro">Coaching Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Member Tables ─── */}
      <Card className="border-border/50">
        <Tabs defaultValue="students">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Members</CardTitle>
              <TabsList>
                <TabsTrigger value="students" className="text-xs">
                  <GraduationCap className="h-3.5 w-3.5 mr-1.5" />
                  Students ({lists.students.length})
                </TabsTrigger>
                <TabsTrigger value="teachers" className="text-xs">
                  <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                  Teachers ({lists.teachers.length})
                </TabsTrigger>
                <TabsTrigger value="employees" className="text-xs">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Employees ({lists.employees.length})
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          <CardContent>
            <TabsContent value="students" className="mt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.students.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No students enrolled
                      </TableCell>
                    </TableRow>
                  )}
                  {lists.students.slice(0, 20).map((student: any) => (
                    <TableRow key={student._id} className="border-border/30">
                      <TableCell className="font-medium">
                        {student.firstName} {student.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {student.email || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {student.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {student.createdAt
                          ? new Date(student.createdAt).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="teachers" className="mt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.teachers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No teachers added
                      </TableCell>
                    </TableRow>
                  )}
                  {lists.teachers.slice(0, 20).map((teacher: any) => (
                    <TableRow key={teacher._id} className="border-border/30">
                      <TableCell className="font-medium">
                        {teacher.firstName} {teacher.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {teacher.department || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {teacher.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {teacher.createdAt
                          ? new Date(teacher.createdAt).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="employees" className="mt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Name</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.employees.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No employees found
                      </TableCell>
                    </TableRow>
                  )}
                  {lists.employees.slice(0, 20).map((emp: any) => (
                    <TableRow key={emp._id} className="border-border/30">
                      <TableCell className="font-medium">
                        {emp.firstName} {emp.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {emp.position || "N/A"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {emp.department || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {emp.status || "active"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* ─── Confirm Dialog ─── */}
      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={() => setConfirmAction(null)}
          title={
            confirmAction === "delete"
              ? `Purge ${tenant.name}?`
              : confirmAction === "export"
              ? `Export Archive for ${tenant.name}?`
              : confirmAction === "suspend"
              ? `Suspend ${tenant.name}?`
              : `Activate ${tenant.name}?`
          }
          description={
            confirmAction === "delete"
              ? "This will permanently purge R2 storage objects under tenants/{subdomain}/ and remove all tenant records."
              : confirmAction === "export"
              ? "This generates a verified SHA-256 export manifest and begins the retention hold before final purge."
              : confirmAction === "suspend"
              ? "This will immediately block platform access for this organization."
              : "This will restore platform access for this organization."
          }
          confirmLabel={
            confirmAction === "delete"
              ? "Purge Tenant"
              : confirmAction === "export"
              ? "Export Archive"
              : confirmAction === "suspend"
              ? "Suspend"
              : "Activate"
          }
          variant={confirmAction === "delete" ? "danger" : "warning"}
          loading={actionLoading}
          onConfirm={handleAction}
        />
      )}
    </div>
  );
}
