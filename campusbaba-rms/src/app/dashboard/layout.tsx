"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  Megaphone,
  CreditCard,
  ClipboardList,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Search,
  Sun,
  Moon,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "sonner";

const navItems = [
  {
    name: "BI Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    section: "operations",
  },
  {
    name: "BI Ledger",
    href: "/dashboard/bi-ledger",
    icon: Table2,
    section: "operations",
  },
  {
    name: "Organizations",
    href: "/dashboard/organizations",
    icon: Building2,
    section: "operations",
  },
  {
    name: "Provision Org",
    href: "/dashboard/provision",
    icon: PlusCircle,
    section: "operations",
  },
  {
    name: "Plans & Splits",
    href: "/dashboard/billing",
    icon: CreditCard,
    section: "governance",
  },
  {
    name: "Global Broadcasts",
    href: "/dashboard/notices",
    icon: Megaphone,
    section: "governance",
  },
  {
    name: "Audit Ledger",
    href: "/dashboard/audit-log",
    icon: ClipboardList,
    section: "governance",
  },
  {
    name: "Control Plane",
    href: "/dashboard/settings",
    icon: Settings,
    section: "governance",
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("superadmin_token");
    if (!token) {
      router.push("/");
    }
  }, [router]);

  if (!mounted) return null;

  const handleLogout = () => {
    localStorage.removeItem("superadmin_token");
    router.push("/");
  };

  const getCurrentTitle = () => {
    const exact = navItems.find((item) => item.href === pathname);
    if (exact) return exact.name;
    if (pathname === "/dashboard/bi-ledger")
      return "Organization BI Ledger (Quotas, Per-Student Split & Monthly Revenue)";
    if (pathname.startsWith("/dashboard/organizations/"))
      return "Organization Governance & Quotas";
    return "Business Intelligence Overview";
  };

  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((seg, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/");
      const label = seg.replace(/-/g, " ").toUpperCase();
      return { label, href };
    });
  };

  const opsNav = navItems.filter((item) => item.section === "operations");
  const govNav = navItems.filter((item) => item.section === "governance");
  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* ─── Monochrome Shadcn Sidebar ─── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ${
          sidebarCollapsed ? "w-[64px]" : "w-60"
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-mono text-xs font-bold">
              CB
            </div>
            {!sidebarCollapsed && (
              <div className="leading-none">
                <span className="text-sm font-semibold tracking-tight block">
                  CampusBaba
                </span>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  RMS Console
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-2.5 space-y-6 overflow-y-auto">
          <div>
            {!sidebarCollapsed && (
              <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Operations
              </p>
            )}
            <ul className="space-y-0.5">
              {opsNav.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground"
                      } ${sidebarCollapsed ? "justify-center" : ""}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            {!sidebarCollapsed ? (
              <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Governance & Billing
              </p>
            ) : (
              <Separator className="my-2" />
            )}
            <ul className="space-y-0.5">
              {govNav.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground"
                      } ${sidebarCollapsed ? "justify-center" : ""}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2.5 border-t border-sidebar-border space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`w-full h-8 text-xs text-muted-foreground hover:text-foreground ${
              sidebarCollapsed ? "justify-center px-0" : "justify-start"
            }`}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-3.5 w-3.5 mr-2" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={`w-full h-8 text-xs text-muted-foreground hover:text-destructive ${
              sidebarCollapsed ? "justify-center px-0" : "justify-start"
            }`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!sidebarCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </aside>

      {/* ─── Main Content Shell ─── */}
      <div
        className={`flex-1 flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? "ml-[64px]" : "ml-60"
        }`}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-14 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between px-6">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs font-mono">
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">/</span>}
                {i === breadcrumbs.length - 1 ? (
                  <span className="font-semibold text-foreground">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Right Controls: Search + Black/White Theme Switcher + Role Badge */}
          <div className="flex items-center gap-2.5">
            <div className="relative hidden md:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter tenant or command..."
                className="w-56 pl-8 h-8 text-xs bg-secondary/40 border-border"
              />
            </div>

            {/* Pure Black / Pure White Theme Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 px-2.5 text-xs font-mono border-border"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="h-3.5 w-3.5 mr-1.5" />
                  White
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 mr-1.5" />
                  Black
                </>
              )}
            </Button>

            <Separator orientation="vertical" className="h-5" />

            <Badge
              variant="outline"
              className="h-8 px-2.5 font-mono text-[11px] flex items-center gap-1.5 border-border"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              ROOT SUPERADMIN
            </Badge>
          </div>
        </header>

        {/* Page Title Header */}
        <div className="px-6 pt-5 pb-3 border-b border-border/60 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {getCurrentTitle()}
            </h1>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">
            PostgreSQL 16 + Mandatory RLS
          </span>
        </div>

        {/* Page Body */}
        <main className="flex-1 p-6">{children}</main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          },
        }}
      />
    </div>
  );
}
