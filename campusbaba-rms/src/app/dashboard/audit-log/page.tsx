"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Filter,
  Shield,
  Clock,
  User,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getAuditLogs } from "@/lib/api";

interface AuditRecord {
  id: string;
  tenantId?: string | null;
  actorUserId?: string | null;
  impersonatedByAdminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({ limit: 150 });
      if (Array.isArray(res.data)) {
        setLogs(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(log.entityId || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" ||
      log.action.toLowerCase().startsWith(categoryFilter);

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 mt-2 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search action, entity, or ID..."
              className="pl-9 h-9 bg-secondary/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(val) => setCategoryFilter(val || "all")}
          >
            <SelectTrigger className="w-[170px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="tenant">Tenant Lifecycle</SelectItem>
              <SelectItem value="governance">Security & RBAC</SelectItem>
              <SelectItem value="superadmin">SuperAdmin Ops</SelectItem>
              <SelectItem value="file">Sensitive File Access</SelectItem>
              <SelectItem value="payment">Payment Verification</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh Logs
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Immutable Platform & Security Audit Trail ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-4 py-3 hover:bg-secondary/20 rounded-lg px-2 -mx-2 transition-colors border-b border-border/30 last:border-0"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 bg-primary/10 text-primary">
                  <Shield className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium font-mono">{log.action}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {log.entityType}
                    </Badge>
                    {log.tenantId && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        Tenant: {log.tenantId}
                      </Badge>
                    )}
                    {log.impersonatedByAdminId && (
                      <Badge className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400">
                        Impersonated by: {log.impersonatedByAdminId}
                      </Badge>
                    )}
                  </div>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <code className="text-[11px] text-muted-foreground mt-1 block truncate">
                      {JSON.stringify(log.metadata)}
                    </code>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Actor: {log.actorUserId || "system"}
                    </span>
                    {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredLogs.length === 0 && (
            <p className="text-center text-muted-foreground py-12 text-sm">
              {loading
                ? "Loading audit trail..."
                : "No audit events recorded yet for this filter."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
