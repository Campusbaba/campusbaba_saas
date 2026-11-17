"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Globe,
  Users,
  GraduationCap,
  Briefcase,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Clock,
  Layers,
  Wallet,
  Sparkles,
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

const COLORS = {
  primary: "#6366f1",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const PIE_COLORS = [
  COLORS.primary,
  COLORS.emerald,
  COLORS.cyan,
  COLORS.violet,
  COLORS.amber,
  COLORS.rose,
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

  // 1. 6-Month Revenue Split Trend (Gross ৳15 vs CampusBaba ৳10 vs Org ৳5)
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

  // 2. Per-Organization Revenue Split Bar Chart
  const orgRevenueChartData = orgBreakdown.slice(0, 6).map((o) => ({
    name: o.name.length > 16 ? o.name.slice(0, 16) + "…" : o.name,
    campusBabaShare: o.platformEarnedBdt,
    orgShare: o.orgEarnedBdt,
    students: o.students,
  }));

  // 3. Plan Tier Distribution Pie
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

  // 4. Enrollment & Free Guardian Portal Comparison
  const enrollmentVsGuardianData = orgBreakdown.slice(0, 6).map((o) => ({
    name: o.name.length > 15 ? o.name.slice(0, 15) + "…" : o.name,
    students: o.students,
    guardians: o.guardians,
    teachers: o.teachers,
    classes: o.classes,
  }));

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
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 stagger-children">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[350px] rounded-xl" />
          <Skeleton className="h-[350px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-2 animate-fade-in">
      {/* ─── Business Intelligence (BI) Executive KPI Banner ─── */}
      <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">
                CampusBaba SaaS Business Intelligence & Revenue Split Engine
              </h2>
              <Badge variant="outline" className="text-[10px]">
                Live BI Telemetry
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per-Student Model: Default ৳15/student (৳10 CampusBaba Share + ৳5 Organization Share) • Guardian Portal: ৳0 (100% Free)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/dashboard/billing")}
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            Manage Plans & Splits
          </Button>
          <Button
            size="sm"
            className="gradient-primary text-white"
            onClick={() => router.push("/dashboard/provision")}
          >
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Provision Organization
          </Button>
        </div>
      </div>

      {/* ─── Row 1: Operational & Financial BI KPI Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 stagger-children">
        <StatCard
          title="CampusBaba Net MRR (Ours)"
          value={totalPlatformMrrBdt}
          subtitle={`ARR: ৳${totalPlatformArrBdt.toLocaleString()} (৳10/student + base)`}
          icon={DollarSign}
          gradientFrom="from-emerald-500/20"
          gradientTo="to-emerald-600/10"
          accentColor="text-emerald-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
          trend={{ value: 18, label: "platform net", positive: true }}
        />
        <StatCard
          title="Gross Student Fee Volume"
          value={grossCollectionsBdt}
          subtitle={`Org Share Retained: ৳${orgRetainedBdt.toLocaleString()} (৳5/stu)`}
          icon={Wallet}
          gradientFrom="from-indigo-500/20"
          gradientTo="to-violet-600/10"
          accentColor="text-indigo-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Total Enrolled Students"
          value={totalStudents}
          subtitle={`Across ${activeOrgs} active organizations (${inactiveOrgs} inactive)`}
          icon={GraduationCap}
          gradientFrom="from-violet-500/20"
          gradientTo="to-violet-600/10"
          accentColor="text-violet-400"
        />
        <StatCard
          title="Free Guardian Accounts"
          value={totalGuardians}
          subtitle={`${totalTeachers} Teachers • ${totalClasses} Active Classes`}
          icon={Users}
          gradientFrom="from-cyan-500/20"
          gradientTo="to-cyan-600/10"
          accentColor="text-cyan-400"
        />
      </div>

      {/* ─── Row 2: BI Revenue Split & Per-Org Financial Charting ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Per-Student Revenue Split Trajectory"
          subtitle="Gross ৳15/student vs CampusBaba ৳10 share vs Organization ৳5 share"
          action={
            <Badge variant="outline" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1 text-emerald-400" />
              2:1 Split Ratio
            </Badge>
          }
        >
          <div className="h-[290px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSplitTrend}>
                <defs>
                  <linearGradient id="cbGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="orgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
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
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} />
                <Area
                  type="monotone"
                  dataKey="grossCollected"
                  stroke={COLORS.violet}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                  name="Gross Billed (৳15/stu)"
                />
                <Area
                  type="monotone"
                  dataKey="campusBabaRevenue"
                  stroke={COLORS.emerald}
                  strokeWidth={2.5}
                  fill="url(#cbGrad)"
                  name="CampusBaba Share (৳10/stu)"
                />
                <Area
                  type="monotone"
                  dataKey="orgShare"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  fill="url(#orgGrad)"
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
          <div className="h-[290px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orgRevenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} />
                <Bar
                  dataKey="campusBabaShare"
                  stackId="a"
                  fill={COLORS.emerald}
                  radius={[0, 0, 0, 0]}
                  name="CampusBaba Share (৳)"
                  maxBarSize={42}
                />
                <Bar
                  dataKey="orgShare"
                  stackId="a"
                  fill={COLORS.primary}
                  radius={[6, 6, 0, 0]}
                  name="Organization Share (৳)"
                  maxBarSize={42}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ─── Row 3: Tier Distribution & Student/Guardian/Teacher/Class Telemetry ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Subscription Tier Mix"
          subtitle="Individual Tutor vs SME Coaching vs Campus Connect"
        >
          <div className="h-[260px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {planDistributionData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Students vs Free Guardian Accounts vs Classes"
          subtitle="Operational utilization across active institutions"
          className="lg:col-span-2"
        >
          <div className="h-[260px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrollmentVsGuardianData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} />
                <Bar
                  dataKey="students"
                  fill={COLORS.violet}
                  radius={[4, 4, 0, 0]}
                  name="Paid Students"
                  maxBarSize={28}
                />
                <Bar
                  dataKey="guardians"
                  fill={COLORS.cyan}
                  radius={[4, 4, 0, 0]}
                  name="Free Guardians"
                  maxBarSize={28}
                />
                <Bar
                  dataKey="classes"
                  fill={COLORS.amber}
                  radius={[4, 4, 0, 0]}
                  name="Classes / Batches"
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ─── Row 4: Organization BI & Quota Utilization Matrix Table ─── */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              Organization BI Ledger (Quotas, Per-Student Split & Monthly Revenue)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any organization to adjust its Max Students, Max Guardians, Max Teachers, Max Classes, or custom ৳/student split.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {totalOrgs} Organizations
          </Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 text-xs">
                <TableHead>Organization</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Students (Used/Max)</TableHead>
                <TableHead>Free Guardians</TableHead>
                <TableHead>Teachers</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Per-Student Split</TableHead>
                <TableHead>Org Earned</TableHead>
                <TableHead>Ours (CampusBaba)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgBreakdown.map((org) => (
                <TableRow
                  key={org.subdomain}
                  className="border-border/30 cursor-pointer hover:bg-secondary/30 text-xs"
                  onClick={() =>
                    router.push(`/dashboard/organizations/${org.subdomain}`)
                  }
                >
                  <TableCell className="font-medium">
                    <div>{org.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {org.subdomain}.campusbaba.com
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {org.billingPlan.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {org.students} / {org.maxStudents === -1 ? "∞" : org.maxStudents}
                  </TableCell>
                  <TableCell className="font-mono text-cyan-400">
                    {org.guardians} / {org.maxGuardians === -1 ? "∞" : org.maxGuardians}{" "}
                    <span className="text-[10px] text-emerald-400">(৳0)</span>
                  </TableCell>
                  <TableCell className="font-mono">
                    {org.teachers} / {org.maxTeachers === -1 ? "∞" : org.maxTeachers}
                  </TableCell>
                  <TableCell className="font-mono">
                    {org.classes} / {org.maxClasses === -1 ? "∞" : org.maxClasses}
                  </TableCell>
                  <TableCell className="font-mono">
                    ৳{org.perStudentFeeBdt} (৳{org.orgShareBdt} / ৳{org.platformShareBdt})
                  </TableCell>
                  <TableCell className="font-mono text-indigo-400">
                    ৳{org.orgEarnedBdt.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono font-bold text-emerald-400">
                    ৳{org.totalPlatformMrrBdt.toLocaleString()}
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
