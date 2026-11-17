"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  MoreHorizontal,
  Ban,
  Trash2,
  Power,
  Eye,
  Plus,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  getOrganizations,
  suspendOrganization,
  activateOrganization,
  deleteOrganization,
} from "@/lib/api";
import { useDebounce } from "@/lib/hooks";
import { toast } from "sonner";

interface Tenant {
  _id: string;
  name: string;
  subdomain: string;
  subscriptionStatus: "active" | "inactive" | "past_due" | "suspended";
  billingPlan: string;
  maxStudents: number;
  maxGuardians?: number;
  maxTeachers: number;
  maxClasses?: number;
  maxAdmins: number;
  perStudentFeeBdt?: number;
  orgStudentShareBdt?: number;
  platformStudentShareBdt?: number;
  createdAt: string;
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  const [confirmAction, setConfirmAction] = useState<{
    type: "suspend" | "activate" | "delete";
    tenant: Tenant;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchTenants = async () => {
    try {
      const result = await getOrganizations();
      setTenants(result.data || []);
    } catch {
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.subdomain.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t._id.toLowerCase().includes(debouncedSearch.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || t.subscriptionStatus === statusFilter;

    const matchesPlan = planFilter === "all" || t.billingPlan === planFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const activeCount = tenants.filter(
    (t) => t.subscriptionStatus === "active"
  ).length;
  const inactiveCount = tenants.filter(
    (t) => t.subscriptionStatus !== "active"
  ).length;
  const pastDueCount = tenants.filter(
    (t) => t.subscriptionStatus === "past_due"
  ).length;

  const handleAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);

    try {
      switch (confirmAction.type) {
        case "suspend":
          await suspendOrganization(confirmAction.tenant._id);
          toast.success(`${confirmAction.tenant.name} has been suspended`);
          break;
        case "activate":
          await activateOrganization(confirmAction.tenant._id);
          toast.success(`${confirmAction.tenant.name} has been activated`);
          break;
        case "delete":
          await deleteOrganization(confirmAction.tenant._id);
          toast.success(`${confirmAction.tenant.name} has been deleted`);
          break;
      }
      fetchTenants();
    } catch {
      toast.error(`Failed to ${confirmAction.type} organization`);
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          >
            Active
          </Badge>
        );
      case "inactive":
      case "suspended":
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
          >
            {status}
          </Badge>
        );
      case "past_due":
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
          >
            Past Due
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] font-mono uppercase">
            {status}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[115px] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Summary Stats ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Organizations"
          value={tenants.length}
          subtitle="Provisioned tenants"
          icon={Building2}
          tone="blue"
        />
        <StatCard
          title="Active Subscriptions"
          value={activeCount}
          subtitle="Live in production"
          icon={CheckCircle}
          tone="emerald"
        />
        <StatCard
          title="Suspended / Inactive"
          value={inactiveCount}
          subtitle="Access paused"
          icon={XCircle}
          tone="violet"
        />
        <StatCard
          title="Past Due"
          value={pastDueCount}
          subtitle="Billing follow-up"
          icon={AlertTriangle}
          tone="amber"
        />
      </div>

      {/* ─── Organizations Table Card ─── */}
      <Card className="border border-border bg-card shadow-none">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">
              Organization Directory
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Manage tenant quotas, per-student splits, modules, and lifecycle.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, subdomain, ID..."
                className="pl-8 w-full sm:w-64 h-8 text-xs bg-secondary/40"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val || "all")}
            >
              <SelectTrigger className="w-[125px] h-8 text-xs font-mono">
                <Filter className="h-3 w-3 mr-1.5" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={planFilter}
              onValueChange={(val) => setPlanFilter(val || "all")}
            >
              <SelectTrigger className="w-[150px] h-8 text-xs font-mono">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="individual_tutor">
                  Individual Tutor
                </SelectItem>
                <SelectItem value="sme_coaching">SME Coaching</SelectItem>
                <SelectItem value="campus_connect">Campus Connect</SelectItem>
                <SelectItem value="postpaid">Postpaid</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => router.push("/dashboard/provision")}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Provision
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredTenants.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Building2}
                title="No organizations found"
                description={
                  searchQuery || statusFilter !== "all"
                    ? "Try adjusting your filters or search query."
                    : "Get started by provisioning your first organization."
                }
                actionLabel={
                  !searchQuery && statusFilter === "all"
                    ? "Provision Organization"
                    : undefined
                }
                onAction={
                  !searchQuery && statusFilter === "all"
                    ? () => router.push("/dashboard/provision")
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 text-[11px] font-mono uppercase">
                    <TableHead className="pl-5">Organization</TableHead>
                    <TableHead>Subdomain</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-center">Max Students</TableHead>
                    <TableHead className="text-center">Max Guardians</TableHead>
                    <TableHead className="text-center">Max Teachers</TableHead>
                    <TableHead className="text-center">Split (৳)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.map((tenant) => (
                    <TableRow
                      key={tenant._id}
                      className="cursor-pointer hover:bg-secondary/50 border-border/40 text-xs"
                      onClick={() =>
                        router.push(
                          `/dashboard/organizations/${tenant.subdomain || tenant._id}`
                        )
                      }
                    >
                      <TableCell className="pl-5 font-medium">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded border border-border bg-secondary text-foreground font-mono text-xs font-bold shrink-0">
                            {tenant.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {tenant.name}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              ID: {tenant._id.slice(-8)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {tenant.subdomain}
                        <span className="text-muted-foreground">
                          .campusbaba.com
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono uppercase"
                        >
                          {tenant.billingPlan.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {tenant.maxStudents === -1 ? "∞" : tenant.maxStudents}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {(tenant.maxGuardians ?? -1) === -1
                          ? "∞ (Free)"
                          : tenant.maxGuardians}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {tenant.maxTeachers === -1 ? "∞" : tenant.maxTeachers}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        ৳{tenant.perStudentFeeBdt ?? 15} (৳
                        {tenant.orgStudentShareBdt ?? 5}/৳
                        {tenant.platformStudentShareBdt ?? 10})
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(tenant.subscriptionStatus)}
                      </TableCell>
                      <TableCell
                        className="text-right pr-5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              />
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(
                                  `/dashboard/organizations/${tenant.subdomain || tenant._id}`
                                )
                              }
                            >
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              Manage Quotas & RBAC
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                window.open(
                                  `https://${tenant.subdomain}.campusbaba.com`,
                                  "_blank"
                                )
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-2" />
                              Open Subdomain
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {tenant.subscriptionStatus === "active" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    type: "suspend",
                                    tenant,
                                  })
                                }
                              >
                                <Ban className="h-3.5 w-3.5 mr-2" />
                                Suspend Tenant
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    type: "activate",
                                    tenant,
                                  })
                                }
                              >
                                <Power className="h-3.5 w-3.5 mr-2" />
                                Activate Tenant
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmAction({ type: "delete", tenant })
                              }
                              className="text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Purge Tenant
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredTenants.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/60">
              <p className="text-[11px] font-mono text-muted-foreground">
                Showing {filteredTenants.length} of {tenants.length}{" "}
                organizations
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={() => setConfirmAction(null)}
          title={
            confirmAction.type === "delete"
              ? `Purge ${confirmAction.tenant.name}?`
              : confirmAction.type === "suspend"
              ? `Suspend ${confirmAction.tenant.name}?`
              : `Activate ${confirmAction.tenant.name}?`
          }
          description={
            confirmAction.type === "delete"
              ? "Ensure the tenant is suspended and exported before verified purge."
              : confirmAction.type === "suspend"
              ? "This will pause access for this organization until reactivated."
              : "This will restore active access for this organization."
          }
          confirmLabel={
            confirmAction.type === "delete"
              ? "Purge"
              : confirmAction.type === "suspend"
              ? "Suspend"
              : "Activate"
          }
          variant={confirmAction.type === "delete" ? "danger" : "warning"}
          loading={actionLoading}
          onConfirm={handleAction}
        />
      )}
    </div>
  );
}
