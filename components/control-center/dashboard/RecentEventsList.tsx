"use client";

import { Activity, AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: ShieldAlert } as const;
const SEVERITY_CLASS = {
  info: "text-muted-foreground",
  warning: "text-status-warning",
  critical: "text-status-alarm",
} as const;

export function RecentEventsList() {
  const events = useMachinesStore((s) => s.events);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  return (
    <Card className="cc-glass">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" /> Recent Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState title="No events yet" description="Events will appear here as machines report activity." />
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
            {events.slice(0, 30).map((e) => {
              const Icon = SEVERITY_ICON[e.severity];
              return (
                <button
                  key={e.id}
                  onClick={() => openMachineDrawer(e.machineId)}
                  className="flex w-full items-start gap-2.5 rounded-md p-2 text-left text-xs hover:bg-muted/40"
                >
                  <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", SEVERITY_CLASS[e.severity])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">{e.message}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString("zh-TW")}</span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
