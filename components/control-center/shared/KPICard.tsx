import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
  accent?: "primary" | "online" | "warning" | "alarm" | "offline" | "muted";
  trend?: { direction: "up" | "down"; label: string };
}

const ACCENT_CLASS: Record<NonNullable<KPICardProps["accent"]>, string> = {
  primary: "text-primary bg-primary/10",
  online: "text-status-online bg-status-online/10",
  warning: "text-status-warning bg-status-warning/10",
  alarm: "text-status-alarm bg-status-alarm/10",
  offline: "text-status-offline bg-status-offline/10",
  muted: "text-muted-foreground bg-muted/40",
};

export function KPICard({ label, value, icon: Icon, sub, accent = "primary", trend }: KPICardProps) {
  return (
    <div className="cc-card cc-glass flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", ACCENT_CLASS[accent])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {trend && (
          <span className={cn("text-xs font-medium", trend.direction === "up" ? "text-status-online" : "text-status-alarm")}>
            {trend.direction === "up" ? "▲" : "▼"} {trend.label}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
