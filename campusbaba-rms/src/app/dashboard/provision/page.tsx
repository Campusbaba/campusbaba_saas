"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Globe,
  Mail,
  Lock,
  Users,
  GraduationCap,
  Briefcase,
  CheckCircle2,
  DollarSign,
  Layers,
  ArrowLeft,
  Eye,
  EyeOff,
  Wand2,
  Infinity as InfinityIcon,
  ShieldCheck,
  Sparkles,
  School,
  UserCheck,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { provisionTenant } from "@/lib/api";
import { toast } from "sonner";

interface PlanPreset {
  code: string;
  title: string;
  subtitle: string;
  icon: typeof UserCheck;
  maxStudents: number;
  maxGuardians: number;
  maxTeachers: number;
  maxClasses: number;
  maxAdmins: number;
  perStudentFeeBdt: number;
  orgStudentShareBdt: number;
  platformStudentShareBdt: number;
}

const PLAN_OPTIONS: PlanPreset[] = [
  {
    code: "individual_tutor",
    title: "Individual Tutor",
    subtitle: "1 Teacher · ∞ Students · 20 Classes",
    icon: UserCheck,
    maxStudents: -1,
    maxGuardians: -1,
    maxTeachers: 1,
    maxClasses: 20,
    maxAdmins: 1,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
  },
  {
    code: "sme_coaching",
    title: "SME Coaching",
    subtitle: "10 Teachers · ∞ Students · 60 Classes",
    icon: Sparkles,
    maxStudents: -1,
    maxGuardians: -1,
    maxTeachers: 10,
    maxClasses: 60,
    maxAdmins: 5,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
  },
  {
    code: "campus_connect",
    title: "Campus Connect",
    subtitle: "100 Teachers · ∞ Students · 150 Classes",
    icon: School,
    maxStudents: -1,
    maxGuardians: -1,
    maxTeachers: 100,
    maxClasses: 150,
    maxAdmins: 15,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
  },
];

function formatLimit(n: number) {
  return n === -1 ? "Unlimited (∞)" : n.toLocaleString();
}

export default function ProvisionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    subdomain: "",
    billingPlan: "campus_connect",
    adminEmail: "",
    adminPassword: "",
    maxStudents: -1,
    maxGuardians: -1,
    maxTeachers: 100,
    maxClasses: 150,
    maxAdmins: 15,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    guardianPortalFree: true,
    guardianMultiStudentAllowed: true,
  });

  const activePlan = useMemo(
    () => PLAN_OPTIONS.find((p) => p.code === formData.billingPlan) || PLAN_OPTIONS[2],
    [formData.billingPlan]
  );

  const handlePlanChange = (plan: PlanPreset) => {
    setFormData((prev) => ({
      ...prev,
      billingPlan: plan.code,
      maxStudents: plan.maxStudents,
      maxGuardians: plan.maxGuardians,
      maxTeachers: plan.maxTeachers,
      maxClasses: plan.maxClasses,
      maxAdmins: plan.maxAdmins,
      perStudentFeeBdt: plan.perStudentFeeBdt,
      orgStudentShareBdt: plan.orgStudentShareBdt,
      platformStudentShareBdt: plan.platformStudentShareBdt,
    }));
  };

  const generateTempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
    let pw = "Cb@";
    for (let i = 0; i < 9; i++) {
      pw += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, adminPassword: pw }));
    setShowPassword(true);
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => {
      const shouldAutoSlug =
        !prev.subdomain ||
        prev.subdomain ===
          prev.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return {
        ...prev,
        name,
        subdomain: shouldAutoSlug
          ? name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 28)
          : prev.subdomain,
      };
    });
  };

  const totalCharge = Math.max(1, formData.perStudentFeeBdt);
  const orgPct = Math.min(100, Math.round((formData.orgStudentShareBdt / totalCharge) * 100));
  const platformPct = Math.max(0, 100 - orgPct);

  const isReady =
    formData.name.trim().length > 1 &&
    formData.subdomain.trim().length > 1 &&
    formData.adminEmail.includes("@") &&
    formData.adminPassword.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await provisionTenant(formData);
      toast.success("Organization provisioned successfully!", {
        description: `${formData.name} is now live at ${formData.subdomain}.campusbaba.com`,
      });
      setTimeout(() => router.push("/dashboard/organizations"), 1200);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || "Failed to provision tenant"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => router.push("/dashboard/organizations")}
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                Provision New Organization
              </h1>
              <Badge variant="secondary" className="font-medium">
                Multi-Tenant RLS
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Deploy an isolated tenant workspace with subscription tier caps, commercial revenue split, and initial admin access.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Configuration Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. Organization Identity & Plan Tier */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  1. Organization Identity &amp; Subscription Tier
                </CardTitle>
                <CardDescription>
                  Configure the institution name, dedicated subdomain, and baseline SaaS tier.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      required
                      placeholder="e.g. Dhaka Model School & College"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-subdomain">Tenant Subdomain *</Label>
                    <div className="flex">
                      <Input
                        id="org-subdomain"
                        required
                        placeholder="dhakamodel"
                        value={formData.subdomain}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            subdomain: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, ""),
                          })
                        }
                        className="rounded-r-none font-mono text-sm"
                      />
                      <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground text-xs font-medium whitespace-nowrap">
                        .campusbaba.com
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label>Select Subscription Tier</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {PLAN_OPTIONS.map((plan) => {
                      const Icon = plan.icon;
                      const isSelected = formData.billingPlan === plan.code;
                      return (
                        <button
                          key={plan.code}
                          type="button"
                          onClick={() => handlePlanChange(plan)}
                          className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/[0.03] ring-1 ring-primary"
                              : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div
                              className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="font-semibold text-sm">{plan.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {plan.subtitle}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. Registration Quotas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  2. Registration Quotas &amp; Seat Caps
                </CardTitle>
                <CardDescription>
                  Fine-tune hard registration caps enforced atomically on the backend. Use <code className="px-1 py-0.5 rounded bg-muted text-xs">-1</code> for unlimited.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5 rounded-lg border p-3 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5">
                        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                        Max Students
                      </Label>
                      <Button
                        type="button"
                        variant={formData.maxStudents === -1 ? "secondary" : "ghost"}
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            maxStudents: p.maxStudents === -1 ? 500 : -1,
                          }))
                        }
                      >
                        <InfinityIcon className="h-3 w-3 mr-1" />
                        {formData.maxStudents === -1 ? "Unlimited" : "Set ∞"}
                      </Button>
                    </div>
                    <Input
                      required
                      type="number"
                      min={-1}
                      value={formData.maxStudents}
                      onChange={(e) =>
                        setFormData({ ...formData, maxStudents: +e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 rounded-lg border p-3 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        Max Guardians
                      </Label>
                      <Button
                        type="button"
                        variant={formData.maxGuardians === -1 ? "secondary" : "ghost"}
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            maxGuardians: p.maxGuardians === -1 ? 500 : -1,
                          }))
                        }
                      >
                        <InfinityIcon className="h-3 w-3 mr-1" />
                        {formData.maxGuardians === -1 ? "Unlimited" : "Set ∞"}
                      </Button>
                    </div>
                    <Input
                      required
                      type="number"
                      min={-1}
                      value={formData.maxGuardians}
                      onChange={(e) =>
                        setFormData({ ...formData, maxGuardians: +e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 rounded-lg border p-3 bg-muted/10">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      Max Teachers
                    </Label>
                    <Input
                      required
                      type="number"
                      min={1}
                      value={formData.maxTeachers}
                      onChange={(e) =>
                        setFormData({ ...formData, maxTeachers: +e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 rounded-lg border p-3 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Max Classes / Batches</Label>
                      <Button
                        type="button"
                        variant={formData.maxClasses === -1 ? "secondary" : "ghost"}
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            maxClasses: p.maxClasses === -1 ? 40 : -1,
                          }))
                        }
                      >
                        <InfinityIcon className="h-3 w-3 mr-1" />
                        {formData.maxClasses === -1 ? "Unlimited" : "Set ∞"}
                      </Button>
                    </div>
                    <Input
                      required
                      type="number"
                      min={-1}
                      value={formData.maxClasses}
                      onChange={(e) =>
                        setFormData({ ...formData, maxClasses: +e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 rounded-lg border p-3 bg-muted/10">
                    <Label className="text-xs flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Max Admin Accounts
                    </Label>
                    <Input
                      required
                      type="number"
                      min={1}
                      value={formData.maxAdmins}
                      onChange={(e) =>
                        setFormData({ ...formData, maxAdmins: +e.target.value })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 3. Billing Split & Guardian Policy */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  3. Per-Student Revenue Split &amp; Guardian Policy
                </CardTitle>
                <CardDescription>
                  Define monthly per-student billing and revenue sharing between the organization and CampusBaba.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total Per-Student Fee (৳)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.perStudentFeeBdt}
                      onChange={(e) => {
                        const total = +e.target.value;
                        setFormData({
                          ...formData,
                          perStudentFeeBdt: total,
                          platformStudentShareBdt: Math.max(
                            0,
                            total - formData.orgStudentShareBdt
                          ),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Organization Share (৳)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.orgStudentShareBdt}
                      onChange={(e) => {
                        const orgShare = +e.target.value;
                        setFormData({
                          ...formData,
                          orgStudentShareBdt: orgShare,
                          platformStudentShareBdt: Math.max(
                            0,
                            formData.perStudentFeeBdt - orgShare
                          ),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CampusBaba Platform Share (৳)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.platformStudentShareBdt}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          platformStudentShareBdt: +e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Live Split Ratio Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Organization Retained ({orgPct}%)</span>
                    <span>CampusBaba Platform ({platformPct}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-600 transition-all"
                      style={{ width: `${orgPct}%` }}
                    />
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${platformPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border bg-muted/20">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      Free Guardian Portal (৳0) &amp; Multi-Sibling Linking
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Allow one guardian account to monitor multiple students across batches at zero extra charge.
                    </p>
                  </div>
                  <Switch
                    checked={formData.guardianMultiStudentAllowed}
                    onCheckedChange={(v) =>
                      setFormData({ ...formData, guardianMultiStudentAllowed: v })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* 4. Initial Administrator */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  4. Initial Organization Administrator
                </CardTitle>
                <CardDescription>
                  Creates the primary tenant admin login for{" "}
                  <span className="font-mono text-foreground">
                    {formData.subdomain || "tenant"}.campusbaba.com
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-email">Admin Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="admin-email"
                        required
                        type="email"
                        placeholder="principal@school.edu.bd"
                        value={formData.adminEmail}
                        onChange={(e) =>
                          setFormData({ ...formData, adminEmail: e.target.value })
                        }
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="admin-password">Temporary Password *</Label>
                      <button
                        type="button"
                        onClick={generateTempPassword}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                      >
                        <Wand2 className="h-3 w-3" />
                        Generate
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="admin-password"
                        required
                        type={showPassword ? "text" : "password"}
                        minLength={6}
                        placeholder="Min 6 characters"
                        value={formData.adminPassword}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            adminPassword: e.target.value,
                          })
                        }
                        className="pl-9 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sticky Summary Column */}
          <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Provisioning Summary</CardTitle>
                <CardDescription>
                  Review live tenant configuration before deployment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="rounded-lg border p-3 bg-muted/20 space-y-1">
                  <div className="font-semibold truncate">
                    {formData.name || "Untitled Organization"}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground flex items-center gap-1.5 truncate">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    https://{formData.subdomain || "subdomain"}.campusbaba.com
                  </div>
                  <div className="pt-1.5">
                    <Badge variant="secondary">{activePlan.title}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Students Quota</span>
                    <span className="font-medium">{formatLimit(formData.maxStudents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guardians Quota</span>
                    <span className="font-medium">{formatLimit(formData.maxGuardians)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Teachers Cap</span>
                    <span className="font-medium">{formatLimit(formData.maxTeachers)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Classes / Batches</span>
                    <span className="font-medium">{formatLimit(formData.maxClasses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Admin Accounts</span>
                    <span className="font-medium">{formatLimit(formData.maxAdmins)}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per-Student Charge</span>
                    <span className="font-semibold">৳{formData.perStudentFeeBdt} / mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Org / Platform Split</span>
                    <span className="font-medium">
                      ৳{formData.orgStudentShareBdt} / ৳{formData.platformStudentShareBdt}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guardian Portal</span>
                    <span className="font-medium text-emerald-600">Free (৳0)</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2 pt-1">
                  <Button
                    type="submit"
                    disabled={loading || !isReady}
                    className="w-full"
                    size="lg"
                  >
                    {loading ? "Provisioning Workspace..." : "Provision Organization"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push("/dashboard/organizations")}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
