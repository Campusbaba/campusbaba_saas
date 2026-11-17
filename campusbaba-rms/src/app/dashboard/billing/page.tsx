"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  TrendingUp,
  DollarSign,
  Layers,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/chart-card";
import { getDashboardStats, getPlans, upsertPlan } from "@/lib/api";

const MONO_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export default function BillingPage() {
  const [biStats, setBiStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [planForm, setPlanForm] = useState({
    code: "individual_tutor",
    name: "Individual Tutor Plan",
    pricingModel: "per_student",
    priceBdt: 0,
    perStudentFeeBdt: 15,
    orgStudentShareBdt: 5,
    platformStudentShareBdt: 10,
    maxStudents: -1,
    maxGuardians: -1,
    maxTeachers: 1,
    maxClasses: 20,
    maxAdmins: 1,
    storageLimitMb: 500,
    includedSmsCredits: 500,
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSavedMsg, setPlanSavedMsg] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [statsRes, plansRes] = await Promise.all([
        getDashboardStats().catch(() => ({ data: null })),
        getPlans().catch(() => ({ data: [] })),
      ]);
      setBiStats(statsRes.data);
      setPlans(plansRes.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const selectPlanPreset = (p: any) => {
    setPlanForm({
      code: p.code,
      name: p.name,
      pricingModel: p.pricingModel || "per_student",
      priceBdt: p.priceBdt ?? 0,
      perStudentFeeBdt: p.perStudentFeeBdt ?? 15,
      orgStudentShareBdt: p.orgStudentShareBdt ?? 5,
      platformStudentShareBdt: p.platformStudentShareBdt ?? 10,
      maxStudents: p.maxStudents ?? -1,
      maxGuardians: p.maxGuardians ?? -1,
      maxTeachers: p.maxTeachers ?? 10,
      maxClasses: p.maxClasses ?? 50,
      maxAdmins: p.maxAdmins ?? 3,
      storageLimitMb: p.storageLimitMb ?? 500,
      includedSmsCredits: p.includedSmsCredits ?? 500,
    });
  };

  const handleSavePlan = async () => {
    setSavingPlan(true);
    setPlanSavedMsg(null);
    try {
      await upsertPlan(planForm);
      setPlanSavedMsg(
        `Tier '${planForm.name}' (${planForm.code}) updated: ৳${planForm.perStudentFeeBdt}/student (৳${planForm.orgStudentShareBdt} Org / ৳${planForm.platformStudentShareBdt} Ours)`
      );
      fetchAll();
    } catch {
      // ignore
    } finally {
      setSavingPlan(false);
    }
  };

  const orgBreakdown: any[] = biStats?.orgBreakdown || [];
  const grossBdt = biStats?.financialBi?.grossPerStudentCollectionsBdt ?? 0;
  const orgShareBdt = biStats?.financialBi?.orgRetainedShareBdt ?? 0;
  const platformMrrBdt = biStats?.financialBi?.totalPlatformMrrBdt ?? 0;
  const platformArrBdt = biStats?.financialBi?.totalPlatformArrBdt ?? 0;

  const monthlyData = (() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const baseStudents = Math.max(200, (biStats?.totalStudents ?? 1000) - 400);
    return months.map((month, i) => {
      const stu = baseStudents + i * 85;
      return {
        month,
        oursCampusBaba: stu * 10,
        orgShare: stu * 5,
      };
    });
  })();

  const planCounts: Record<string, number> = {};
  orgBreakdown.forEach((t) => {
    planCounts[t.billingPlan] = (planCounts[t.billingPlan] || 0) + 1;
  });
  const planData = Object.entries(planCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " ").toUpperCase(),
    value,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[115px] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[350px] rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="CampusBaba Net MRR (Ours)"
          value={platformMrrBdt}
          subtitle="৳10/student + Base Tier Fees"
          icon={DollarSign}
          tone="emerald"
          formatValue={(v) => `৳${v.toLocaleString()}`}
          trend={{ value: 15, label: "net", positive: true }}
        />
        <StatCard
          title="Annual Run Rate (ARR)"
          value={platformArrBdt}
          subtitle="12-month projected net"
          icon={TrendingUp}
          tone="violet"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Organization Share (৳5/stu)"
          value={orgShareBdt}
          subtitle={`Out of ৳${grossBdt.toLocaleString()} gross`}
          icon={CreditCard}
          tone="blue"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Guardian Portal Revenue"
          value={0}
          subtitle={`${biStats?.totalGuardians ?? 0} Free Guardian Portals`}
          icon={Users}
          tone="cyan"
          formatValue={() => "৳0 (FREE)"}
        />
      </div>

      {/* ─── Shadcn Tier & Split Configurator ─── */}
      <Card className="border border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Subscription Tier & Per-Student Revenue Split Configurator
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Select a tier preset below to edit Max Students (`-1` = ∞), Max
              Guardians, Max Teachers, Max Classes, and Per-Student Split (`৳15`
              = `৳5` Org + `৳10` Ours).
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleSavePlan}
            disabled={savingPlan}
          >
            {savingPlan ? "Saving..." : "Save Tier Live"}
          </Button>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border/60">
            {plans.map((p) => (
              <Button
                key={p.code}
                type="button"
                size="sm"
                variant={planForm.code === p.code ? "default" : "outline"}
                onClick={() => selectPlanPreset(p)}
                className="h-8 text-xs font-mono"
              >
                {p.name} ({p.maxTeachers === -1 ? "∞" : p.maxTeachers}T /{" "}
                {p.maxStudents === -1 ? "∞" : p.maxStudents}S • ৳
                {p.perStudentFeeBdt ?? 15})
              </Button>
            ))}
          </div>

          {planSavedMsg && (
            <div className="p-2.5 rounded-md border border-border bg-secondary text-foreground text-xs font-mono">
              {planSavedMsg}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Tier Code</Label>
              <Input
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.code}
                onChange={(e) =>
                  setPlanForm({ ...planForm, code: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Display Name
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                value={planForm.name}
                onChange={(e) =>
                  setPlanForm({ ...planForm, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Per-Student Charge (৳)
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.perStudentFeeBdt}
                onChange={(e) => {
                  const total = Number(e.target.value);
                  setPlanForm({
                    ...planForm,
                    perStudentFeeBdt: total,
                    platformStudentShareBdt: Math.max(
                      0,
                      total - planForm.orgStudentShareBdt
                    ),
                  });
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Org Share (৳)
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.orgStudentShareBdt}
                onChange={(e) => {
                  const org = Number(e.target.value);
                  setPlanForm({
                    ...planForm,
                    orgStudentShareBdt: org,
                    platformStudentShareBdt: Math.max(
                      0,
                      planForm.perStudentFeeBdt - org
                    ),
                  });
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Ours / CampusBaba (৳)
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.platformStudentShareBdt}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    platformStudentShareBdt: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Max Students (-1 = ∞)
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.maxStudents}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    maxStudents: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Max Guardians (-1 = ∞)
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.maxGuardians}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    maxGuardians: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Max Teachers
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.maxTeachers}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    maxTeachers: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Max Classes / Batches
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.maxClasses}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    maxClasses: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Base Monthly Fee (৳)
              </Label>
              <Input
                type="number"
                className="mt-1 h-8 text-xs font-mono"
                value={planForm.priceBdt}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    priceBdt: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Monochrome Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="CampusBaba Share (৳10) vs Organization Share (৳5)"
          subtitle="Monthly per-student revenue split breakdown"
          className="lg:col-span-2"
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip />
                <Legend iconType="square" iconSize={8} />
                <Bar
                  dataKey="oursCampusBaba"
                  fill="var(--chart-1)"
                  radius={[3, 3, 0, 0]}
                  name="CampusBaba Share (৳10/stu)"
                  maxBarSize={32}
                />
                <Bar
                  dataKey="orgShare"
                  fill="var(--chart-3)"
                  radius={[3, 3, 0, 0]}
                  name="Org Share (৳5/stu)"
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Plan Tier Distribution"
          subtitle="Active organizations by tier"
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    planData.length > 0
                      ? planData
                      : [{ name: "CAMPUS CONNECT", value: 1 }]
                  }
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {(planData.length > 0
                    ? planData
                    : [{ name: "CAMPUS CONNECT", value: 1 }]
                  ).map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={MONO_PALETTE[index % MONO_PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="square" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ─── Per-Organization Billing & Split Table ─── */}
      <Card className="border border-border bg-card shadow-none">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Organization Per-Student Billing & Split Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 text-[11px] font-mono uppercase">
                <TableHead className="pl-5">Organization</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Active Students</TableHead>
                <TableHead>Free Guardians</TableHead>
                <TableHead>Rate Split (Total / Org / Ours)</TableHead>
                <TableHead>Gross Billed</TableHead>
                <TableHead>Org Share</TableHead>
                <TableHead className="pr-5 text-right">
                  CampusBaba Net
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgBreakdown.map((t) => (
                <TableRow
                  key={t.subdomain}
                  className="border-border/40 text-xs"
                >
                  <TableCell className="pl-5 font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="uppercase text-[10px] font-mono"
                    >
                      {t.billingPlan.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {t.students} / {t.maxStudents === -1 ? "∞" : t.maxStudents}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {t.guardians} (৳0 Free)
                  </TableCell>
                  <TableCell className="font-mono">
                    ৳{t.perStudentFeeBdt} (৳{t.orgShareBdt} / ৳
                    {t.platformShareBdt})
                  </TableCell>
                  <TableCell className="font-mono">
                    ৳{t.grossBdt.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    ৳{t.orgEarnedBdt.toLocaleString()}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-mono font-semibold text-foreground">
                    ৳{t.totalPlatformMrrBdt.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
