"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  TrendingUp,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
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
import { getOrganizations, getPlans, upsertPlan } from "@/lib/api";

interface Tenant {
  _id: string;
  name: string;
  subdomain: string;
  subscriptionStatus: string;
  billingPlan: string;
  maxStudents: number;
  createdAt: string;
}

const PLAN_RATES: Record<string, number> = {
  postpaid: 5000,
  prepaid: 4500,
  enterprise: 15000,
};

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981"];

export default function BillingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [planRates, setPlanRates] = useState<Record<string, number>>(PLAN_RATES);
  const [loading, setLoading] = useState(true);
  const [planForm, setPlanForm] = useState({
    code: "postpaid",
    name: "Postpaid Standard",
    priceBdt: 5000,
    maxStudents: 500,
    maxTeachers: 50,
    storageQuotaMb: 2048,
    monthlySmsQuota: 2000,
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSavedMsg, setPlanSavedMsg] = useState<string | null>(null);

  const handleSavePlan = async () => {
    setSavingPlan(true);
    setPlanSavedMsg(null);
    try {
      await upsertPlan(planForm);
      setPlanRates((prev) => ({
        ...prev,
        [planForm.code]: Number(planForm.priceBdt),
      }));
      setPlanSavedMsg(`Plan '${planForm.code}' updated to ৳${planForm.priceBdt.toLocaleString()}/month across platform!`);
    } catch {
      // ignore
    } finally {
      setSavingPlan(false);
    }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        const [orgsRes, plansRes] = await Promise.all([
          getOrganizations(),
          getPlans().catch(() => ({ data: [] })),
        ]);
        setTenants(orgsRes.data || []);
        if (Array.isArray(plansRes.data) && plansRes.data.length > 0) {
          const dynamicMap: Record<string, number> = { ...PLAN_RATES };
          plansRes.data.forEach((p: { code: string; priceBdt: number }) => {
            dynamicMap[p.code] = Number(p.priceBdt);
          });
          setPlanRates(dynamicMap);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const activeTenants = tenants.filter(
    (t) => t.subscriptionStatus === "active"
  );
  const totalMRR = activeTenants.reduce(
    (sum, t) => sum + (planRates[t.billingPlan] || 5000),
    0
  );
  const totalARR = totalMRR * 12;

  // Plan distribution
  const planCounts: Record<string, number> = {};
  tenants.forEach((t) => {
    planCounts[t.billingPlan] = (planCounts[t.billingPlan] || 0) + 1;
  });
  const planData = Object.entries(planCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  // Monthly revenue simulation
  const monthlyData = (() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const base = Math.max(1, activeTenants.length - 4);
    return months.map((month, i) => ({
      month,
      revenue: (base + i) * 5000,
      expenses: (base + i) * 1200,
      profit: (base + i) * 3800,
    }));
  })();

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
            {entry.name}: ৳{entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  };

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
          title="Monthly Revenue (MRR)"
          value={totalMRR}
          icon={DollarSign}
          gradientFrom="from-emerald-500/20"
          gradientTo="to-emerald-600/10"
          accentColor="text-emerald-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
          trend={{ value: 12, label: "vs last month", positive: true }}
        />
        <StatCard
          title="Annual Revenue (ARR)"
          value={totalARR}
          icon={TrendingUp}
          gradientFrom="from-indigo-500/20"
          gradientTo="to-violet-500/10"
          accentColor="text-indigo-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Active Subscriptions"
          value={activeTenants.length}
          icon={CreditCard}
          gradientFrom="from-cyan-500/20"
          gradientTo="to-cyan-600/10"
          accentColor="text-cyan-400"
        />
        <StatCard
          title="Avg Revenue/Org"
          value={activeTenants.length > 0 ? Math.round(totalMRR / activeTenants.length) : 0}
          icon={BarChart3}
          gradientFrom="from-amber-500/20"
          gradientTo="to-amber-600/10"
          accentColor="text-amber-400"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
      </div>

      {/* ─── Charts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Revenue vs Expenses"
          subtitle="Monthly breakdown"
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
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground">
                      {value}
                    </span>
                  )}
                />
                <Bar
                  dataKey="revenue"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  name="Revenue"
                  maxBarSize={35}
                />
                <Bar
                  dataKey="expenses"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  name="Expenses"
                  maxBarSize={35}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Plan Distribution" subtitle="By billing plan">
          <div className="h-[280px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planData.length > 0 ? planData : [{ name: "No Data", value: 1 }]}
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
                    : [{ name: "No Data", value: 1 }]
                  ).map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={planData.length > 0 ? COLORS[index % COLORS.length] : "#1e2740"}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground">
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ─── Billing Table ─── */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Organization Billing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t._id} className="border-border/30">
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">
                      {t.billingPlan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    ৳{(PLAN_RATES[t.billingPlan] || 5000).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-xs ${
                        t.subscriptionStatus === "active"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {t.subscriptionStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Dynamic Plan Pricing & Quota Editor (Zero-Code Control) ─── */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              Dynamic Plan Pricing & Quota Configurator
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update monthly BDT rates, student/teacher limits, R2 storage quotas, and SMS allocations without touching code.
            </p>
          </div>
          <Button size="sm" onClick={handleSavePlan} disabled={savingPlan}>
            {savingPlan ? "Saving..." : "Update Plan Live"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {planSavedMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              {planSavedMsg}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Plan Code</label>
              <Input
                value={planForm.code}
                onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
              <Input
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Monthly Price (৳)</label>
              <Input
                type="number"
                value={planForm.priceBdt}
                onChange={(e) => setPlanForm({ ...planForm, priceBdt: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Max Students</label>
              <Input
                type="number"
                value={planForm.maxStudents}
                onChange={(e) => setPlanForm({ ...planForm, maxStudents: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">R2 Storage (MB)</label>
              <Input
                type="number"
                value={planForm.storageQuotaMb}
                onChange={(e) => setPlanForm({ ...planForm, storageQuotaMb: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Monthly SMS</label>
              <Input
                type="number"
                value={planForm.monthlySmsQuota}
                onChange={(e) => setPlanForm({ ...planForm, monthlySmsQuota: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Info Banner ─── */}
      <Card className="border-dashed border-border/50 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">
              Billing data is currently estimated
            </p>
            <p className="text-xs text-muted-foreground">
              Revenue figures are calculated based on plan rates. Integrate a payment gateway (Stripe, SSLCommerz) for real billing data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
