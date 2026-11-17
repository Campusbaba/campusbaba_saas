"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAnimatedCounter } from "@/lib/hooks";
import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  tone?: "emerald" | "blue" | "violet" | "amber" | "cyan" | "neutral";
  accentColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  className?: string;
  formatValue?: (val: number) => string;
}

const TONE_STYLES: Record<string, string> = {
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  violet:
    "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  amber:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  neutral: "bg-secondary text-foreground border-border",
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  tone = "neutral",
  className = "",
  formatValue,
}: StatCardProps) {
  const animatedValue = useAnimatedCounter(value);

  return (
    <Card
      className={`border border-border bg-card shadow-xs hover:shadow-sm transition-shadow ${className}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-5 px-5">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={`h-8 w-8 rounded-lg border flex items-center justify-center ${
            TONE_STYLES[tone] || TONE_STYLES.neutral
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {formatValue
              ? formatValue(animatedValue)
              : animatedValue.toLocaleString()}
          </div>
          {trend && (
            <Badge
              variant="outline"
              className={`text-[11px] font-medium px-1.5 py-0 h-5 flex items-center gap-0.5 ${
                trend.positive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
            >
              {trend.positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend.value)}%
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1.5 truncate">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
