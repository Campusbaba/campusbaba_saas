"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Lock,
  Mail,
  ArrowRight,
  Sun,
  Moon,
  Terminal,
  Copy,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { loginSuperAdmin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState("admin@campusbaba.com");
  const [password, setPassword] = useState("admin12345678");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginSuperAdmin(email, password);
      if (result.success) {
        localStorage.setItem("superadmin_token", result.token);
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail("admin@campusbaba.com");
    setPassword("admin12345678");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col justify-between p-6">
      {/* Top Bar */}
      <header className="flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-mono text-xs font-bold">
            CB
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight">
              CampusBaba
            </span>
            <Badge
              variant="outline"
              className="ml-2 text-[10px] font-mono uppercase"
            >
              RMS Control Plane
            </Badge>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 px-2.5 text-xs font-mono"
        >
          {theme === "dark" ? (
            <>
              <Sun className="h-3.5 w-3.5 mr-1.5" />
              White Theme
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 mr-1.5" />
              Black Theme
            </>
          )}
        </Button>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center py-8">
        <Card className="w-full max-w-[400px] border-border bg-card shadow-none">
          <CardHeader className="space-y-1.5 pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight">
              SuperAdmin Authentication
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Enter your root platform credentials to access the multi-tenant
              governance & BI console.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 rounded-md text-xs font-mono">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@campusbaba.com"
                    className="pl-9 h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="pl-9 h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-9 text-xs font-medium"
              >
                {loading ? (
                  "Authenticating..."
                ) : (
                  <>
                    Sign In to Console
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </>
                )}
              </Button>
            </form>

            <Separator />

            {/* Dev Bootstrap Credential Helper */}
            <div className="rounded-md border border-border bg-secondary/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  Bootstrap Credentials
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fillDemo}
                  className="h-6 px-2 text-[10px] font-mono"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Filled
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Auto-Fill
                    </>
                  )}
                </Button>
              </div>
              <div className="text-[11px] font-mono text-foreground space-y-0.5">
                <div>ID: admin@campusbaba.com</div>
                <div>PW: admin12345678</div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="border-t border-border/60 pt-4 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>PostgreSQL 16 + RLS</span>
            <span className="font-mono">v2.0 Monochrome</span>
          </CardFooter>
        </Card>
      </main>

      <footer className="text-center text-[11px] text-muted-foreground font-mono">
        CampusBaba SaaS Infrastructure &middot; Zero-Code Governance Plane
      </footer>
    </div>
  );
}
