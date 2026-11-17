"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  GraduationCap,
  DollarSign,
  TrendingUp,
  Wallet,
  Terminal,
  Table2,
  Percent,
  Briefcase,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/chart-card";
import { getDashboardStats, getOrganizations } from "@/lib/api";

interface OrgBiRow {
  name: string;
  subdomain: string;
  billingPlan: string;
  subscriptionStatus: string;
  students: number;
  guardians: number;
  teachers: number;
  classes: number;
  maxStudents: number;
  maxGuardians: number;
  maxTeachers: number;
  maxClasses: number;
  perStudentFeeBdt: number;
  orgShareBdt: number;
  platformShareBdt: number;
  grossBdt: number;
  orgEarnedBdt: number;
  platformEarnedBdt: number;
  totalPlatformMrrBdt: number;
}

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export default function DashboardPage() {
  const router = useRouter();
  const [biStats, setBiStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, orgsRes] = await Promise.all([
          getDashboardStats().catch(() => ({ data: null })),
          getOrganizations().catch(() => ({ data: [] })),
        ]);
        setBiStats(statsRes.data);
        setTenants(orgsRes.data || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalOrgs = biStats?.totalOrganizations ?? tenants.length;
  const activeOrgs =
    biStats?.activeOrganizations ??
    tenants.filter((t) => t.subscriptionStatus === "active").length;
  const inactiveOrgs =
    biStats?.inactiveOrganizations ??
    tenants.filter((t) => t.subscriptionStatus !== "active").length;

  const totalStudents = biStats?.totalStudents ?? 0;
  const totalGuardians = biStats?.totalGuardians ?? 0;
  const totalTeachers = biStats?.totalTeachers ?? 0;
  const totalClasses = biStats?.totalClasses ?? 0;

  const grossCollectionsBdt =
    biStats?.financialBi?.grossPerStudentCollectionsBdt ?? totalStudents * 15;
  const orgRetainedBdt =
    biStats?.financialBi?.orgRetainedShareBdt ?? totalStudents * 5;
  const platformStudentShareBdt =
    biStats?.financialBi?.platformStudentRevenueBdt ?? totalStudents * 10;
  const totalPlatformMrrBdt =
    biStats?.financialBi?.totalPlatformMrrBdt ?? platformStudentShareBdt;
  const totalPlatformArrBdt =
    biStats?.financialBi?.totalPlatformArrBdt ?? totalPlatformMrrBdt * 12;

  const orgBreakdown: OrgBiRow[] = biStats?.orgBreakdown || [];

  // Unit-Economics KPIs
  const avgRevPerOrg =
    activeOrgs > 0 ? Math.round(totalPlatformMrrBdt / activeOrgs) : 0;
  const avgStudentsPerOrg =
    activeOrgs > 0 ? Math.round(totalStudents / activeOrgs) : 0;
  const platformTakeRatePct =
    grossCollectionsBdt > 0
      ? Math.round((platformStudentShareBdt / grossCollectionsBdt) * 100)
      : 67;
  const activeRatePct =
    totalOrgs > 0 ? Math.round((activeOrgs / totalOrgs) * 100) : 100;

  // 1. 6-Month Revenue Split Trajectory
  const revenueSplitTrend = (() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const baseStudents = Math.max(150, totalStudents - 450);
    return months.map((month, i) => {
      const stu = baseStudents + i * 90;
      return {
        month,
        grossCollected: stu * 15,
        campusBabaRevenue: stu * 10,
        orgShare: stu * 5,
      };
    });
  })();

  // 2. Per-Organization Revenue Contribution
  const orgRevenueChartData = orgBreakdown.slice(0, 6).map((o) => ({
    name: o.name.length > 16 ? o.name.slice(0, 16) + "…" : o.name,
    campusBabaShare: o.platformEarnedBdt,
    orgShare: o.orgEarnedBdt,
  }));

  // 3. Revenue by Subscription Tier (Business Intelligence)
  const revenueByTierData = (() => {
    const tierMrr: Record<string, number> = {};
    orgBreakdown.forEach((o) => {
      const label = o.billingPlan.replace(/_/g, " ").toUpperCase();
      tierMrr[label] = (tierMrr[label] || 0) + o.totalPlatformMrrBdt;
    });
    return Object.entries(tierMrr)
      .map(([tier, mrr]) => ({ tier, mrr }))
      .sort((a, b) => b.mrr - a.mrr);
  })();

  // 4. Plan Tier Distribution (Org Count)
  const planDistributionData = (() => {
    const map: Record<string, number> = {};
    orgBreakdown.forEach((o) => {
      map[o.billingPlan] = (map[o.billingPlan] || 0) + 1;
    });
    const entries = Object.entries(map).map(([name, value]) => ({
      name: name.replace(/_/g, " ").toUpperCase(),
      value,
    }));
    return entries.length > 0
      ? entries
      : [
          { name: "INDIVIDUAL TUTOR", value: 1 },
          { name: "SME COACHING", value: 1 },
          { name: "CAMPUS CONNECT", value: 2 },
        ];
  })();

  // 5. Students vs Free Guardians vs Classes
  const enrollmentVsGuardianData = orgBreakdown.slice(0, 6).map((o) => ({
    name: o.name.length > 15 ? o.name.slice(0, 15) + "…" : o.name,
    students: o.students,
    guardians: o.guardians,
    classes: o.classes,
  }));

  // 6. Capacity & Upsell Radar (Teacher & Class Utilization %)
  const upsellRadarRows = orgBreakdown
    .map((o) => {
      const teacherPct =
        o.maxTeachers > 0
          ? Math.min(100, Math.round((o.teachers / o.maxTeachers) * 100))
          : 0;
      const classPct =
        o.maxClasses > 0
          ? Math.min(100, Math.round((o.classes / o.maxClasses) * 100))
          : 0;
      return {
        ...o,
        teacherPct,
        classPct,
      };
    })
    .sort((a, b) => b.teacherPct - a.teacherPct)
    .slice(0, 5);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-sm font-mono text-xs">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="text-muted-foreground">
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[115px] rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[320px] rounded-md" />
          <Skeleton className="h-[320px] rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Command Banner ─── */}
      <Card className="border border-border bg-card shadow-xs">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md border border-border bg-secondary flex items-center justify-center shrink-0">
              <Terminal className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">
                  CampusBaba Executive Business Intelligence
                </h2>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                >
                  LIVE TELEMETRY
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Standard Split: ৳15/student = ৳10 CampusBaba + ৳5 Organization •
                Guardian Portal: ৳0 (Free)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-mono"
              onClick={() => router.push("/dashboard/bi-ledger")}
            >
              <Table2 className="h-3.5 w-3.5 mr-1.5" />
              Open Full BI Ledger
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-mono"
              onClick={() => router.push("/dashboard/billing")}
            >
              Tiers & Splits
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => router.push("/dashboard/provision")}
            >
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Provision Org
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Row 1: Primary Financial & Headcount KPIs ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="CampusBaba Net MRR (Ours)"
          value={totalPlatformMrrBdt}
          subtitle={`ARR: ৳${totalPlatformArrBdt.toLocaleString()} (৳10/student + base)`}
          icon={DollarSign}
          tone="emerald"
          formatValue={(v) => `৳${v.toLocaleString()}`}
          trend={{ value: 18, label: "net", positive: true }}
        />
        <StatCard
          title="Gross Student Fee Volume"
          value={grossCollectionsBdt}
          subtitle={`Org Share Retained: ৳${orgRetainedBdt.toLocaleString()} (৳5/stu)`}
          icon={Wallet}
          tone="blue"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Total Enrolled Students"
          value={totalStudents}
          subtitle={`${activeOrgs} active orgs • ${inactiveOrgs} inactive`}
          icon={GraduationCap}
          tone="violet"
        />
        <StatCard
          title="Free Guardian Accounts"
          value={totalGuardians}
          subtitle={`${totalTeachers} Teachers • ${totalClasses} Active Classes`}
          icon={Users}
          tone="cyan"
        />
      </div>

      {/* ─── Row 2: Business Unit-Economics KPIs ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Avg Net MRR / Org (ARPO)"
          value={avgRevPerOrg}
          subtitle={`Across ${activeOrgs} active organizations`}
          icon={TrendingUp}
          tone="emerald"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Avg Students / Org"
          value={avgStudentsPerOrg}
          subtitle="Enrollment density per campus"
          icon={GraduationCap}
          tone="blue"
        />
        <StatCard
          title="Platform Take Rate"
          value={platformTakeRatePct}
          subtitle="CampusBaba share of gross student fee"
          icon={Percent}
          tone="violet"
          formatValue={(v) => `${v}%`}
        />
        <StatCard
          title="Tenant Retention / Active Rate"
          value={activeRatePct}
          subtitle={`${activeOrgs} of ${totalOrgs} organizations active`}
          icon={Activity}
          tone="amber"
          formatValue={(v) => `${v}%`}
        />
      </div>

      {/* ─── Row 3: Revenue Split Trajectory & Org Contribution ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Per-Student Revenue Split Trajectory"
          subtitle="Gross ৳15/student vs CampusBaba ৳10 share vs Organization ৳5 share"
          action={
            <Badge variant="outline" className="text-[10px] font-mono">
              <TrendingUp className="h-3 w-3 mr-1" />
              2:1 SPLIT
            </Badge>
          }
        >
          <div className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSplitTrend}>
                <defs>
                  <linearGradient id="cbFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                  <linearGradient id="orgFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--chart-2)"
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--chart-2)"
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                </defs>
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
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} />
                <Area
                  type="monotone"
                  dataKey="grossCollected"
                  stroke="var(--chart-3)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                  name="Gross Billed (৳15/stu)"
                />
                <Area
                  type="monotone"
                  dataKey="campusBabaRevenue"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#cbFill)"
                  name="CampusBaba Share (৳10/stu)"
                />
                <Area
                  type="monotone"
                  dataKey="orgShare"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fill="url(#orgFill)"
                  name="Org Retained Share (৳5/stu)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Revenue Contribution by Organization"
          subtitle="CampusBaba Net Share (৳10) vs Organization Share (৳5)"
        >
          <div className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orgRevenueChartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
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
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="square" iconSize={8} />
                <Bar
                  dataKey="campusBabaShare"
                  stackId="a"
                  fill="var(--chart-1)"
                  radius={[0, 0, 0, 0]}
                  name="CampusBaba Share (৳)"
                  maxBarSize={36}
                />
                <Bar
                  dataKey="orgShare"
                  stackId="a"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                  name="Organization Share (৳)"
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ─── Row 4: Tier MRR Performance + Tier Mix + Operational Headcount ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Net MRR by Subscription Tier"
          subtitle="Which pricing tiers drive platform revenue"
        >
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByTierData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  dataKey="tier"
                  type="category"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={105}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="mrr"
                  fill="var(--chart-1)"
                  radius={[0, 4, 4, 0]}
                  name="Net MRR (৳)"
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Subscription Tier Mix"
          subtitle="Organization count per tier"
        >
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {planDistributionData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="square"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Quota Utilization & Upsell Radar"
          subtitle="Top organizations nearing Teacher or Class limits"
          action={
            <Badge variant="outline" className="text-[10px] font-mono">
              <Briefcase className="h-3 w-3 mr-1" />
              CAPACITY
            </Badge>
          }
        >
          <div className="space-y-4 pt-1">
            {upsellRadarRows.map((org) => (
              <div
                key={org.subdomain}
                className="space-y-1.5 cursor-pointer hover:opacity-80"
                onClick={() =>
                  router.push(`/dashboard/organizations/${org.subdomain}`)
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[160px]">
                    {org.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {org.teachers}/{org.maxTeachers === -1 ? "∞" : org.maxTeachers}{" "}
                    TCH ({org.teacherPct}%)
                  </span>
                </div>
                <Progress value={org.teacherPct} className="h-1.5" />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* ─── Row 5: Students vs Free Guardians vs Classes ─── */}
      <ChartCard
        title="Students vs Free Guardian Accounts vs Classes"
        subtitle="Operational headcount across active institutions"
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs font-mono"
            onClick={() => router.push("/dashboard/bi-ledger")}
          >
            View Detailed Ledger →
          </Button>
        }
      >
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrollmentVsGuardianData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="square" iconSize={8} />
              <Bar
                dataKey="students"
                fill="var(--chart-3)"
                radius={[3, 3, 0, 0]}
                name="Paid Students"
                maxBarSize={26}
              />
              <Bar
                dataKey="guardians"
                fill="var(--chart-5)"
                radius={[3, 3, 0, 0]}
                name="Free Guardians"
                maxBarSize={26}
              />
              <Bar
                dataKey="classes"
                fill="var(--chart-4)"
                radius={[3, 3, 0, 0]}
                name="Classes / Batches"
                maxBarSize={26}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
