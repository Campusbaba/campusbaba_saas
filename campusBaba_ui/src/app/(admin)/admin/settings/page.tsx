"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useGovernance } from "@/hooks/useGovernance";
import {
  ShieldCheck,
  KeyRound,
  Layers,
  Award,
  CreditCard,
  Save,
  CheckCircle2,
  Lock,
  Sparkles,
} from "lucide-react";

const ROLE_LIST = [
  { key: "employee", label: "Staff / Employee" },
  { key: "teacher", label: "Teacher" },
  { key: "student", label: "Student" },
  { key: "parent", label: "Parent / Guardian" },
  { key: "accountant", label: "Accountant" },
  { key: "librarian", label: "Librarian" },
];

const PERMISSION_CATALOG = [
  { code: "users:invite", label: "Issue Signed QR Invitations", group: "Academic & Users" },
  { code: "students:read", label: "View Students", group: "Academic & Users" },
  { code: "students:write", label: "Create / Edit Students", group: "Academic & Users" },
  { code: "teachers:read", label: "View Teachers", group: "Academic & Users" },
  { code: "teachers:write", label: "Create / Edit Teachers", group: "Academic & Users" },
  { code: "employees:read", label: "View Employees", group: "Academic & Users" },
  { code: "employees:write", label: "Create / Edit Employees", group: "Academic & Users" },
  { code: "parents:read", label: "View Guardians", group: "Academic & Users" },
  { code: "parents:write", label: "Create / Edit Guardians", group: "Academic & Users" },
  { code: "academics:read", label: "View Classes & Routines", group: "Academic & Users" },
  { code: "academics:write", label: "Manage Classes & Routines", group: "Academic & Users" },
  { code: "attendance:read", label: "View Attendance", group: "Academic & Users" },
  { code: "attendance:mark", label: "Mark Attendance", group: "Academic & Users" },
  { code: "batches:read", label: "View Coaching Batches", group: "Academic & Users" },
  { code: "batches:write", label: "Manage Coaching Batches", group: "Academic & Users" },
  { code: "exams:read", label: "View Exams & Results", group: "Exams & Grading" },
  { code: "exams:write", label: "Create Exams", group: "Exams & Grading" },
  { code: "marks:read", label: "View Subject Marks & Tabulation", group: "Exams & Grading" },
  { code: "marks:evaluate", label: "Enter / Evaluate Subject Marks", group: "Exams & Grading" },
  { code: "marks:publish", label: "Publish Term Results & GPA", group: "Exams & Grading" },
  { code: "payments:read", label: "View Fees & Invoices", group: "Finance & Billing" },
  { code: "payments:write", label: "Create / Record Fee Payments", group: "Finance & Billing" },
  { code: "payments:verify_trx", label: "Verify Manual bKash/Nagad TrxID", group: "Finance & Billing" },
  { code: "expenses:read", label: "View Expenses", group: "Finance & Billing" },
  { code: "expenses:write", label: "Create Expense Entries", group: "Finance & Billing" },
  { code: "expenses:approve", label: "Approve Expenses", group: "Finance & Billing" },
  { code: "reports:financial:read", label: "View Profit & Income Reports", group: "Finance & Billing" },
  { code: "notices:read", label: "Read Notices", group: "Operations & Add-ons" },
  { code: "notices:write", label: "Publish Notices", group: "Operations & Add-ons" },
  { code: "sms:send", label: "Send Bulk / Absentee BTRC SMS", group: "Operations & Add-ons" },
  { code: "library:read", label: "View Library Catalog", group: "Operations & Add-ons" },
  { code: "library:write", label: "Manage Library Books & Loans", group: "Operations & Add-ons" },
  { code: "transport:read", label: "View Transport Routes", group: "Operations & Add-ons" },
  { code: "transport:write", label: "Manage Transport Routes", group: "Operations & Add-ons" },
  { code: "hostel:read", label: "View Hostel Allocations", group: "Operations & Add-ons" },
  { code: "hostel:write", label: "Manage Hostel Rooms & Beds", group: "Operations & Add-ons" },
];

const FEATURE_META: Array<{
  key:
    | "coachingBatches"
    | "gpa5Grading"
    | "madrasaTrack"
    | "onlinePayments"
    | "sms"
    | "library"
    | "transport"
    | "hostel";
  title: string;
  desc: string;
}> = [
  {
    key: "coachingBatches",
    title: "Coaching Batches & MCQ Engine",
    desc: "Batch capacity waitlists, mid-month pro-rated fee calculation, MCQ negative marking, and teacher revenue-share.",
  },
  {
    key: "gpa5Grading",
    title: "Bangladesh 5.00 GPA & 4th Subject Bonus",
    desc: "NCTB 5.00 GPA scale, 4th-subject bonus above 2.00, mandatory fail rules, merit rank, and Bangla PDF marksheets.",
  },
  {
    key: "madrasaTrack",
    title: "Alia & Qawmi Madrasa Track",
    desc: "Dakhil/Alim/Dawra-e-Hadith classes, Hifz Para/Sabaq/Sabqi/Manzil progress logs, and Zakat/Lillah fund separation.",
  },
  {
    key: "onlinePayments",
    title: "bKash / Nagad / SSLCommerz & MFS TrxID Verification",
    desc: "Allow guardians to submit bKash/Nagad Send-Money TrxID or pay online with accountant approval.",
  },
  {
    key: "sms",
    title: "BTRC Masking SMS & Absentee Alerts",
    desc: "Bangla Unicode (UCS-2) & GSM-7 segment calculator, BTRC quiet hours (21:00–09:00), and automated guardian SMS.",
  },
  {
    key: "library",
    title: "Library Management",
    desc: "Book catalog, student/teacher circulation loans, and overdue fine ledger.",
  },
  {
    key: "transport",
    title: "Transport & Bus Routes",
    desc: "Bus route stops, monthly pickup fee synchronization, and student transport assignments.",
  },
  {
    key: "hostel",
    title: "Hostel & Mess Management",
    desc: "Dormitory room allocation, bed capacity, and monthly mess billing.",
  },
];

export default function AdminGovernanceSettingsPage() {
  const { config, loading, updateConfig, saveCredentials } = useGovernance();
  const [activeTab, setActiveTab] = useState<
    "rbac" | "modules" | "grading" | "gateways"
  >("rbac");
  const [selectedRole, setSelectedRole] = useState<string>("teacher");
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [roleMatrix, setRoleMatrix] = useState<Record<string, string[]>>({});
  const [featureFlags, setFeatureFlags] = useState({
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
    ipAllowlist: [] as string[],
  });
  const [gradingScheme, setGradingScheme] = useState({
    name: "NCTB Standard 5.00 GPA",
    maxGpa: 5.0,
    enableFourthSubjectBonus: true,
    fourthSubjectDeduction: 2.0,
    failIfAnyMandatoryFailed: true,
  });

  const [credForm, setCredForm] = useState({
    capability: "payment" as "payment" | "sms",
    providerCode: "bkash",
    apiKey: "",
    apiSecret: "",
    merchantNumber: "",
  });

  useEffect(() => {
    if (config) {
      setRoleMatrix(config.rolePermissions || {});
      setFeatureFlags(config.featureFlags);
      setSecuritySettings(config.securitySettings);
      setGradingScheme({
        name: config.gradingScheme.name,
        maxGpa: config.gradingScheme.maxGpa,
        enableFourthSubjectBonus: config.gradingScheme.enableFourthSubjectBonus,
        fourthSubjectDeduction: config.gradingScheme.fourthSubjectDeduction,
        failIfAnyMandatoryFailed: config.gradingScheme.failIfAnyMandatoryFailed,
      });
    }
  }, [config]);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const togglePermission = (role: string, perm: string) => {
    const current = roleMatrix[role] || [];
    const exists = current.includes(perm);
    const updated = exists
      ? current.filter((p) => p !== perm)
      : [...current, perm];
    setRoleMatrix({ ...roleMatrix, [role]: updated });
  };

  const handleSaveRbac = async () => {
    await updateConfig({ rolePermissions: roleMatrix });
    showToast(
      `Role permissions saved for ${config?.tenantId || "Institution"}. Changes are active immediately!`
    );
  };

  const handleSaveModulesAndSecurity = async () => {
    await updateConfig({
      featureFlags,
      securitySettings,
    });
    showToast("Campus modules and security settings updated live!");
  };

  const handleSaveGrading = async () => {
    if (!config) return;
    await updateConfig({
      gradingScheme: {
        ...config.gradingScheme,
        ...gradingScheme,
      },
    });
    showToast("5.00 GPA & 4th-Subject grading rules updated live!");
  };

  const handleSaveGatewayCredentials = async () => {
    await saveCredentials({
      capability: credForm.capability,
      providerCode: credForm.providerCode,
      secrets: {
        apiKey: credForm.apiKey,
        apiSecret: credForm.apiSecret,
        merchantNumber: credForm.merchantNumber,
      },
    });
    setCredForm({ ...credForm, apiKey: "", apiSecret: "" });
    showToast(
      `Encrypted ${credForm.providerCode.toUpperCase()} credentials stored in AES-256-GCM vault!`
    );
  };

  return (
    <>
      <Header title="Access, Security & Module Control Center" />
      <main className="p-5 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-[--border] bg-[--card]">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  Zero-Code Institution Control Plane
                </h2>
                <Badge variant="outline" className="text-xs">
                  Tenant: {config?.tenantId || "Current"}
                </Badge>
              </div>
              <p className="text-xs text-[--muted-foreground] mt-0.5">
                Control every role permission, campus module, 5.00 GPA rule,
                QR registration lock, and payment/SMS gateway from one place—no
                code changes or server restarts required.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={activeTab === "rbac" ? "default" : "outline"}
              onClick={() => setActiveTab("rbac")}
            >
              <KeyRound size={14} className="mr-1.5" />
              Role Permissions (RBAC)
            </Button>
            <Button
              size="sm"
              variant={activeTab === "modules" ? "default" : "outline"}
              onClick={() => setActiveTab("modules")}
            >
              <Layers size={14} className="mr-1.5" />
              Modules & Security
            </Button>
            <Button
              size="sm"
              variant={activeTab === "grading" ? "default" : "outline"}
              onClick={() => setActiveTab("grading")}
            >
              <Award size={14} className="mr-1.5" />
              5.00 GPA & Grading
            </Button>
            <Button
              size="sm"
              variant={activeTab === "gateways" ? "default" : "outline"}
              onClick={() => setActiveTab("gateways")}
            >
              <CreditCard size={14} className="mr-1.5" />
              SMS & Payment Gateways
            </Button>
          </div>
        </div>

        {statusBanner && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 text-sm font-medium">
            <CheckCircle2 size={16} />
            <span>{statusBanner}</span>
          </div>
        )}

        {/* TAB 1: DYNAMIC RBAC PERMISSION MATRIX */}
        {activeTab === "rbac" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Dynamic Role-Based Access Control (RBAC)</CardTitle>
                <p className="text-xs text-[--muted-foreground] mt-1">
                  Select a role below and check/uncheck permissions. Every API
                  endpoint enforces this matrix in real time.
                </p>
              </div>
              <Button size="sm" onClick={handleSaveRbac} disabled={loading}>
                <Save size={14} className="mr-1.5" />
                Save Role Permissions
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2 pb-3 border-b border-[--border]">
                {ROLE_LIST.map((r) => {
                  const count = (roleMatrix[r.key] || []).length;
                  const active = selectedRole === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setSelectedRole(r.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-2 ${
                        active
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-[--muted]/40 hover:bg-[--muted] border-[--border]"
                      }`}
                    >
                      <span>{r.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-blue-500/10 text-blue-600"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {PERMISSION_CATALOG.map((perm) => {
                  const checked = (roleMatrix[selectedRole] || []).includes(
                    perm.code
                  );
                  return (
                    <label
                      key={perm.code}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? "border-blue-500/50 bg-blue-500/5"
                          : "border-[--border] hover:bg-[--muted]/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                        checked={checked}
                        onChange={() =>
                          togglePermission(selectedRole, perm.code)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold">{perm.label}</p>
                        <p className="text-[11px] font-mono text-[--muted-foreground]">
                          {perm.code}
                        </p>
                        <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[--muted] text-[--muted-foreground]">
                          {perm.group}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 2: CAMPUS MODULES & SECURITY OVERRIDES */}
        {activeTab === "modules" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Campus Modules & Feature Flags</CardTitle>
                  <p className="text-xs text-[--muted-foreground] mt-1">
                    Enable or disable modules for your institution. Disabled
                    modules are automatically hidden from navigation and blocked
                    at the API layer.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveModulesAndSecurity}
                  disabled={loading}
                >
                  <Save size={14} className="mr-1.5" />
                  Save Changes
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FEATURE_META.map((f) => {
                  const enabled = featureFlags[f.key];
                  return (
                    <label
                      key={f.key}
                      className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border cursor-pointer ${
                        enabled
                          ? "border-blue-500/40 bg-blue-500/5"
                          : "border-[--border] opacity-75"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {f.title}
                          </span>
                          <Badge
                            variant={enabled ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {enabled ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                        <p className="text-xs text-[--muted-foreground]">
                          {f.desc}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={enabled}
                        onChange={(e) =>
                          setFeatureFlags({
                            ...featureFlags,
                            [f.key]: e.target.checked,
                          })
                        }
                      />
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Lock size={16} className="text-blue-600" />
                    Access & Verification Locks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[--border] cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold">
                        Allow Signed QR Onboarding
                      </p>
                      <p className="text-[11px] text-[--muted-foreground]">
                        Allow students & teachers with a single-use signed QR
                        token to self-register.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={securitySettings.allowQrSelfRegistration}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          allowQrSelfRegistration: e.target.checked,
                        })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[--border] cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold">
                        Require Accountant TrxID Verification
                      </p>
                      <p className="text-[11px] text-[--muted-foreground]">
                        Manual bKash/Nagad Send-Money TrxID submissions must be
                        approved by an Accountant before marking paid.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={
                        securitySettings.requireAccountantTrxVerification
                      }
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          requireAccountantTrxVerification: e.target.checked,
                        })
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[--border] cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold">
                        Auto-Activate Student on Tuition Payment
                      </p>
                      <p className="text-[11px] text-[--muted-foreground]">
                        Automatically transition student status to Active once
                        admission/tuition invoice is paid.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={securitySettings.autoActivateStudentOnPayment}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          autoActivateStudentOnPayment: e.target.checked,
                        })
                      }
                    />
                  </label>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 3: 5.00 GPA & 4TH SUBJECT GRADING SCHEME */}
        {activeTab === "grading" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  Bangladesh NCTB 5.00 GPA & 4th-Subject Grading Configurator
                </CardTitle>
                <p className="text-xs text-[--muted-foreground] mt-1">
                  Customize how term GPA, 4th-subject bonus points, and
                  mandatory subject failures are calculated for your marksheets.
                </p>
              </div>
              <Button size="sm" onClick={handleSaveGrading} disabled={loading}>
                <Save size={14} className="mr-1.5" />
                Save Grading Rules
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-[--border]">
                  <div>
                    <p className="text-xs font-semibold">
                      Enable 4th-Subject Bonus
                    </p>
                    <p className="text-[11px] text-[--muted-foreground] mt-0.5">
                      Add `(4th Subject GP - Deduction)` to total grade points
                      before dividing by mandatory subject count.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={gradingScheme.enableFourthSubjectBonus}
                    onChange={(e) =>
                      setGradingScheme({
                        ...gradingScheme,
                        enableFourthSubjectBonus: e.target.checked,
                      })
                    }
                  />
                </label>

                <div className="p-3.5 rounded-xl border border-[--border]">
                  <label className="text-xs font-semibold block mb-1">
                    4th-Subject Deduction Constant (Default: 2.00)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="4"
                    value={gradingScheme.fourthSubjectDeduction}
                    onChange={(e) =>
                      setGradingScheme({
                        ...gradingScheme,
                        fourthSubjectDeduction: Number(e.target.value),
                      })
                    }
                  />
                </div>

                <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-[--border]">
                  <div>
                    <p className="text-xs font-semibold">
                      Fail Term if Any Mandatory Subject is Failed (F)
                    </p>
                    <p className="text-[11px] text-[--muted-foreground] mt-0.5">
                      If a student scores below 33% (0.00 GP) in any mandatory
                      subject, final GPA is 0.00 (F).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={gradingScheme.failIfAnyMandatoryFailed}
                    onChange={(e) =>
                      setGradingScheme({
                        ...gradingScheme,
                        failIfAnyMandatoryFailed: e.target.checked,
                      })
                    }
                  />
                </label>
              </div>

              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs border border-[--border] rounded-lg">
                  <thead className="bg-[--muted]/50">
                    <tr>
                      <th className="p-2.5 text-left">Marks Range (%)</th>
                      <th className="p-2.5 text-left">Letter Grade</th>
                      <th className="p-2.5 text-left">Grade Point (GP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(config?.gradingScheme.gradeBands || []).map((b, idx) => (
                      <tr key={idx} className="border-t border-[--border]">
                        <td className="p-2.5 font-mono">
                          {b.minPercentage}% – {b.maxPercentage}%
                        </td>
                        <td className="p-2.5 font-bold">{b.letterGrade}</td>
                        <td className="p-2.5 font-mono">
                          {b.gradePoint.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 4: ENCRYPTED SMS & PAYMENT GATEWAY CREDENTIALS */}
        {activeTab === "gateways" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles size={16} className="text-blue-600" />
                Configure Gateway Credentials (AES-256-GCM Encrypted)
              </CardTitle>
              <p className="text-xs text-[--muted-foreground]">
                Store your institution&apos;s own bKash, Nagad, SSLCommerz, or
                BulkSMSBD credentials. Secrets are encrypted at rest via
                AES-256-GCM and never exposed in plain text after saving.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 max-w-xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1">
                    Gateway Capability
                  </label>
                  <select
                    className="w-full h-9 rounded-md border border-[--border] bg-transparent px-3 text-xs"
                    value={credForm.capability}
                    onChange={(e) => {
                      const cap = e.target.value as "payment" | "sms";
                      setCredForm({
                        ...credForm,
                        capability: cap,
                        providerCode:
                          cap === "payment" ? "bkash" : "bulksmsbd",
                      });
                    }}
                  >
                    <option value="payment">Payment Gateway</option>
                    <option value="sms">SMS Gateway (BTRC)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1">
                    Provider
                  </label>
                  <select
                    className="w-full h-9 rounded-md border border-[--border] bg-transparent px-3 text-xs"
                    value={credForm.providerCode}
                    onChange={(e) =>
                      setCredForm({
                        ...credForm,
                        providerCode: e.target.value,
                      })
                    }
                  >
                    {credForm.capability === "payment" ? (
                      <>
                        <option value="bkash">bKash Tokenized Checkout</option>
                        <option value="nagad">Nagad Merchant PGW</option>
                        <option value="sslcommerz">SSLCommerz</option>
                        <option value="aamarpay">aamarPay</option>
                        <option value="manual">
                          Manual MFS Send-Money (TrxID)
                        </option>
                      </>
                    ) : (
                      <>
                        <option value="bulksmsbd">BulkSMSBD</option>
                        <option value="alpha">Alpha SMS BD</option>
                        <option value="ssl_wireless">SSL Wireless</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">
                  Merchant / Sender Account Number
                </label>
                <Input
                  placeholder="e.g. 017XXXXXXXX or Store ID"
                  value={credForm.merchantNumber}
                  onChange={(e) =>
                    setCredForm({
                      ...credForm,
                      merchantNumber: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">
                  API Key / App Key
                </label>
                <Input
                  type="password"
                  placeholder="Enter API Key (Encrypted on save)"
                  value={credForm.apiKey}
                  onChange={(e) =>
                    setCredForm({ ...credForm, apiKey: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">
                  API Secret / Store Password
                </label>
                <Input
                  type="password"
                  placeholder="Enter Secret Key (Encrypted on save)"
                  value={credForm.apiSecret}
                  onChange={(e) =>
                    setCredForm({ ...credForm, apiSecret: e.target.value })
                  }
                />
              </div>

              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={handleSaveGatewayCredentials}
                  disabled={loading}
                >
                  <Save size={14} className="mr-1.5" />
                  Encrypt & Save Credentials
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
