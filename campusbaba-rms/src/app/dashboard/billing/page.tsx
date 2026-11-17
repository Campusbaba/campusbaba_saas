"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  TrendingUp,
  DollarSign,
  BarChart3,
  Layers,
  Users,
  GraduationCap,
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/chart-card";
import { getDashboardStats, getPlans, upsertPlan } from "@/lib/api";

const COLORS = ["#10b981", "#6366f1", "#06b6d4", "#8b5cf6", "#f59e0b"];

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
        `Tier '${planForm.name}' (${planForm.code}) updated live: ৳${planForm.perStudentFeeBdt}/student (৳${planForm.orgStudentShareBdt} Org / ৳${planForm.platformStudentShareBdt} Ours) • Max Teachers: ${planForm.maxTeachers === -1 ? "∞" : planForm.maxTeachers} • Max Students: ${planForm.maxStudents === -1 ? "∞" : planForm.maxStudents}`
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
        grossVolume: stu * 15,
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
      <div className="space-y-6 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[350px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-2 animate-fade-in">
      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 stagger-children">
        <StatCard
          title="CampusBaba Net MRR (Ours)"
          value={platformMrrBdt}
          subtitle="৳10/student + Base Tier Fees"
          icon={DollarSign}
          gradientFrom="from-emerald-500/20"
          gradientTo="to-emerald-600/10"
          accentColor="text-emerald-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
          trend={{ value: 15, label: "vs last month", positive: true }}
        />
        <StatCard
          title="Annual Run Rate (ARR)"
          value={platformArrBdt}
          subtitle="12-month projected net"
          icon={TrendingUp}
          gradientFrom="from-indigo-500/20"
          gradientTo="to-violet-500/10"
          accentColor="text-indigo-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Organization Share (৳5/stu)"
          value={orgShareBdt}
          subtitle={`Out of ৳${grossBdt.toLocaleString()} gross`}
          icon={CreditCard}
          gradientFrom="from-cyan-500/20"
          gradientTo="to-cyan-600/10"
          accentColor="text-cyan-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Guardian Portal Revenue"
          value={0}
          subtitle={`${biStats?.totalGuardians ?? 0} Free Guardian Portals`}
          icon={Users}
          gradientFrom="from-amber-500/20"
          gradientTo="to-amber-600/10"
          accentColor="text-amber-400"
          formatValue={() => "৳0 (FREE)"}
        />
      </div>

      {/* ─── Dynamic Plan Tier & Per-Student Split Configurator ─── */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Subscription Tier & Per-Student Revenue Split Configurator
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any tier pill below (`Individual Tutor`, `SME Coaching`, `Campus Connect`) to customize its Max Students (`-1` = ∞), Max Guardians, Max Teachers, Max Classes, and Per-Student BDT Split (`৳15` = `৳5` Org + `৳10` Ours).
            </p>
          </div>
          <Button size="sm" onClick={handleSavePlan} disabled={savingPlan}>
            {savingPlan ? "Saving..." : "Save Tier Live"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tier Selector Pills */}
          <div className="flex flex-wrap gap-2 pb-2 border-b border-border/40">
            {plans.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => selectPlanPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  planForm.code === p.code
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/30 hover:bg-secondary border-border/50"
                }`}
              >
                {p.name} ({p.maxTeachers === -1 ? "∞" : p.maxTeachers} TCH •{" "}
                {p.maxStudents === -1 ? "∞" : p.maxStudents} STU • ৳
                {p.perStudentFeeBdt ?? 15}/stu)
              </button>
            ))}
          </div>

          {planSavedMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              {planSavedMsg}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Tier Code
              </label>
              <Input
                value={planForm.code}
                onChange={(e) =>
                  setPlanForm({ ...planForm, code: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Tier Display Name
              </label>
              <Input
                value={planForm.name}
                onChange={(e) =>
                  setPlanForm({ ...planForm, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Per-Student Charge (৳)
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Org Share (৳)
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Ours / CampusBaba (৳)
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Max Students (-1 = ∞)
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Max Guardians (-1 = ∞ Free)
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Max Teachers
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Max Classes / Batches
              </label>
              <Input
                type="number"
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
              <label className="text-xs text-muted-foreground block mb-1">
                Base Monthly Fee (৳)
              </label>
              <Input
                type="number"
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

      {/* ─── Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="CampusBaba Share (৳10) vs Organization Share (৳5)"
          subtitle="Monthly per-student revenue split breakdown"
          className="lg:col-span-2"
        >
          <div className="h-[280px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
                <Bar
                  dataKey="oursCampusBaba"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  name="CampusBaba Share (৳10/stu)"
                  maxBarSize={35}
                />
                <Bar
                  dataKey="orgShare"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  name="Org Share (৳5/stu)"
                  maxBarSize={35}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Plan Tier Distribution" subtitle="Active organizations by tier">
          <div className="h-[280px] mt-2">
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
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {(planData.length > 0
                    ? planData
                    : [{ name: "CAMPUS CONNECT", value: 1 }]
                  ).map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ─── Per-Organization Billing & Split Table ─── */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Organization Per-Student Billing & Split Ledger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 text-xs">
                <TableHead>Organization</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Active Students</TableHead>
                <TableHead>Free Guardians</TableHead>
                <TableHead>Rate Split (Total / Org / Ours)</TableHead>
                <TableHead>Gross Billed</TableHead>
                <TableHead>Org Share</TableHead>
                <TableHead>CampusBaba Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgBreakdown.map((t) => (
                <TableRow key={t.subdomain} className="border-border/30 text-xs">
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {t.billingPlan.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {t.students} / {t.maxStudents === -1 ? "∞" : t.maxStudents}
                  </TableCell>
                  <TableCell className="font-mono text-cyan-400">
                    {t.guardians} (৳0 Free)
                  </TableCell>
                  <TableCell className="font-mono">
                    ৳{t.perStudentFeeBdt} (৳{t.orgShareBdt} / ৳{t.platformShareBdt})
                  </TableCell>
                  <TableCell className="font-mono">
                    ৳{t.grossBdt.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-indigo-400">
                    ৳{t.orgEarnedBdt.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono font-bold text-emerald-400">
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
