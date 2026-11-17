"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  children,
  action,
  className = "",
}: ChartCardProps) {
  return (
    <Card className={`border border-border bg-card shadow-none ${className}`}>
      <CardHeader className="flex flex-row items-start justify-between pb-3 border-b border-border/60">
        <div className="space-y-1">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </CardTitle>
          {subtitle && (
            <CardDescription className="text-xs text-muted-foreground">
              {subtitle}
            </CardDescription>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
