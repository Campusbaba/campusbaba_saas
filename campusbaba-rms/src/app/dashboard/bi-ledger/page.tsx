"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  ArrowUpRight,
  Download,
  RotateCcw,
  Building2,
  GraduationCap,
  Users,
  DollarSign,
  Wallet,
  ArrowUpDown,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { getDashboardStats } from "@/lib/api";

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

export default function BiLedgerPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrgBiRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quotaFilter, setQuotaFilter] = useState("all");
  const [sortBy, setSortBy] = useState("mrr_desc");

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const res = await getDashboardStats();
        setRows(res.data?.orgBreakdown || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchLedger();
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = rows.filter((org) => {
      const matchesSearch =
        !q ||
        org.name.toLowerCase().includes(q) ||
        org.subdomain.toLowerCase().includes(q) ||
        org.billingPlan.toLowerCase().includes(q);

      const matchesTier =
        tierFilter === "all" || org.billingPlan === tierFilter;

      const matchesStatus =
        statusFilter === "all" || org.subscriptionStatus === statusFilter;

      let matchesQuota = true;
      if (quotaFilter === "unlimited_students") {
        matchesQuota = org.maxStudents === -1;
      } else if (quotaFilter === "capped_students") {
        matchesQuota = org.maxStudents !== -1;
      } else if (quotaFilter === "high_utilization") {
        const teacherUtil =
          org.maxTeachers > 0 ? org.teachers / org.maxTeachers : 0;
        const studentUtil =
          org.maxStudents > 0 ? org.students / org.maxStudents : 0;
        matchesQuota = teacherUtil >= 0.8 || studentUtil >= 0.8;
      }

      return matchesSearch && matchesTier && matchesStatus && matchesQuota;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "mrr_desc":
          return b.totalPlatformMrrBdt - a.totalPlatformMrrBdt;
        case "students_desc":
          return b.students - a.students;
        case "org_share_desc":
          return b.orgEarnedBdt - a.orgEarnedBdt;
        case "teachers_desc":
          return b.teachers - a.teachers;
        case "name_asc":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [rows, searchQuery, tierFilter, statusFilter, quotaFilter, sortBy]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.students += r.students;
        acc.guardians += r.guardians;
        acc.grossBdt += r.grossBdt;
        acc.orgEarnedBdt += r.orgEarnedBdt;
        acc.platformMrrBdt += r.totalPlatformMrrBdt;
        return acc;
      },
      {
        students: 0,
        guardians: 0,
        grossBdt: 0,
        orgEarnedBdt: 0,
        platformMrrBdt: 0,
      }
    );
  }, [filteredRows]);

  const hasActiveFilters =
    searchQuery !== "" ||
    tierFilter !== "all" ||
    statusFilter !== "all" ||
    quotaFilter !== "all";

  const resetFilters = () => {
    setSearchQuery("");
    setTierFilter("all");
    setStatusFilter("all");
    setQuotaFilter("all");
    setSortBy("mrr_desc");
  };

  const exportCsv = () => {
    const headers = [
      "Organization",
      "Subdomain",
      "Tier",
      "Status",
      "Students",
      "MaxStudents",
      "FreeGuardians",
      "Teachers",
      "MaxTeachers",
      "Classes",
      "MaxClasses",
      "PerStudentFeeBDT",
      "OrgShareBDT",
      "PlatformShareBDT",
      "GrossBDT",
      "OrgEarnedBDT",
      "PlatformMRR_BDT",
    ];
    const csvLines = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.name.replace(/"/g, '""')}"`,
          r.subdomain,
          r.billingPlan,
          r.subscriptionStatus,
          r.students,
          r.maxStudents === -1 ? "Unlimited" : r.maxStudents,
          r.guardians,
          r.teachers,
          r.maxTeachers === -1 ? "Unlimited" : r.maxTeachers,
          r.classes,
          r.maxClasses === -1 ? "Unlimited" : r.maxClasses,
          r.perStudentFeeBdt,
          r.orgShareBdt,
          r.platformShareBdt,
          r.grossBdt,
          r.orgEarnedBdt,
          r.totalPlatformMrrBdt,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campusbaba-bi-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[115px] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[460px] rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Filtered KPI Totals ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Filtered Orgs"
          value={filteredRows.length}
          subtitle={`Out of ${rows.length} total`}
          icon={Building2}
          tone="neutral"
        />
        <StatCard
          title="Paid Students"
          value={summary.students}
          subtitle={`${summary.guardians.toLocaleString()} Free Guardians`}
          icon={GraduationCap}
          tone="violet"
        />
        <StatCard
          title="Gross Fee Volume"
          value={summary.grossBdt}
          subtitle="Total per-student billed"
          icon={Wallet}
          tone="blue"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="Org Retained Share"
          value={summary.orgEarnedBdt}
          subtitle="Institution payout share"
          icon={Users}
          tone="cyan"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
        <StatCard
          title="CampusBaba Net MRR"
          value={summary.platformMrrBdt}
          subtitle="Our net monthly revenue"
          icon={DollarSign}
          tone="emerald"
          formatValue={(v) => `৳${v.toLocaleString()}`}
        />
      </div>

      {/* ─── Ledger Table + Multi-Faceted Search & Filtering ─── */}
      <Card className="border border-border bg-card shadow-xs">
        <CardHeader className="border-b border-border/60 pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight">
                Organization BI Ledger (Quotas, Per-Student Split & Monthly Revenue)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Filter by tier, status, or quota utilization. Click any school row to open its governance, quotas, and pricing controls.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-8 text-xs font-mono"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                className="h-8 text-xs font-mono"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative lg:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search school or subdomain..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-secondary/40"
              />
            </div>

            <Select
              value={tierFilter}
              onValueChange={(v) => setTierFilter(v || "all")}
            >
              <SelectTrigger className="h-8 text-xs font-mono">
                <Filter className="h-3 w-3 mr-1.5" />
                <SelectValue placeholder="All Tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subscription Tiers</SelectItem>
                <SelectItem value="individual_tutor">Individual Tutor</SelectItem>
                <SelectItem value="sme_coaching">SME Coaching</SelectItem>
                <SelectItem value="campus_connect">Campus Connect</SelectItem>
                <SelectItem value="starter">Starter School</SelectItem>
                <SelectItem value="postpaid">Postpaid</SelectItem>
                <SelectItem value="prepaid">Prepaid</SelectItem>
                <SelectItem value="coaching_pro">Coaching Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v || "all")}
            >
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={quotaFilter}
              onValueChange={(v) => setQuotaFilter(v || "all")}
            >
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue placeholder="Quota Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quota Modes</SelectItem>
                <SelectItem value="unlimited_students">
                  Unlimited Students (∞)
                </SelectItem>
                <SelectItem value="capped_students">
                  Capped Students
                </SelectItem>
                <SelectItem value="high_utilization">
                  Near Capacity (&ge;80%)
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v || "mrr_desc")}
            >
              <SelectTrigger className="h-8 text-xs font-mono">
                <ArrowUpDown className="h-3 w-3 mr-1.5" />
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mrr_desc">
                  Sort: CampusBaba MRR (High→Low)
                </SelectItem>
                <SelectItem value="students_desc">
                  Sort: Students (High→Low)
                </SelectItem>
                <SelectItem value="org_share_desc">
                  Sort: Org Share (High→Low)
                </SelectItem>
                <SelectItem value="teachers_desc">
                  Sort: Teachers (High→Low)
                </SelectItem>
                <SelectItem value="name_asc">Sort: Name (A→Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 text-[11px] font-mono uppercase">
                  <TableHead className="pl-5">Organization</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Guardians (Free)</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Split (Tot/Org/Ours)</TableHead>
                  <TableHead>Org Share</TableHead>
                  <TableHead className="pr-5 text-right">
                    Ours (Net MRR)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center py-12 text-xs text-muted-foreground font-mono"
                    >
                      No organizations match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((org) => (
                    <TableRow
                      key={org.subdomain}
                      className="border-border/50 cursor-pointer hover:bg-secondary/50 text-xs"
                      onClick={() =>
                        router.push(`/dashboard/organizations/${org.subdomain}`)
                      }
                    >
                      <TableCell className="pl-5 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{org.name}</span>
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {org.subdomain}.campusbaba.com
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono uppercase"
                        >
                          {org.billingPlan.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono uppercase ${
                            org.subscriptionStatus === "active"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : org.subscriptionStatus === "past_due"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {org.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {org.students} /{" "}
                        {org.maxStudents === -1 ? "∞" : org.maxStudents}
                      </TableCell>
                      <TableCell className="font-mono">
                        {org.guardians} /{" "}
                        {org.maxGuardians === -1 ? "∞" : org.maxGuardians}{" "}
                        <span className="text-[10px] text-muted-foreground">
                          (৳0)
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">
                        {org.teachers} /{" "}
                        {org.maxTeachers === -1 ? "∞" : org.maxTeachers}
                      </TableCell>
                      <TableCell className="font-mono">
                        {org.classes} /{" "}
                        {org.maxClasses === -1 ? "∞" : org.maxClasses}
                      </TableCell>
                      <TableCell className="font-mono">
                        ৳{org.perStudentFeeBdt} (৳{org.orgShareBdt}/৳
                        {org.platformShareBdt})
                      </TableCell>
                      <TableCell className="font-mono text-blue-600 dark:text-blue-400">
                        ৳{org.orgEarnedBdt.toLocaleString()}
                      </TableCell>
                      <TableCell className="pr-5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        ৳{org.totalPlatformMrrBdt.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
