import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { MachineEvent } from "@/lib/control-center/types";

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: ShieldAlert } as const;
const SEVERITY_CLASS = {
  info: "text-muted-foreground",
  warning: "text-status-warning",
  critical: "text-status-alarm",
} as const;

export function MachineEventsList({ events }: { events: MachineEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No recent events" description="This machine has no recorded events yet." />;
  }
  return (
    <div className="space-y-1.5">
      {events.slice(0, 20).map((e) => {
        const Icon = SEVERITY_ICON[e.severity];
        return (
          <div key={e.id} className="flex items-start gap-2.5 rounded-md border border-border/60 p-2.5 text-xs">
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", SEVERITY_CLASS[e.severity])} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground">{e.message}</p>
              <p className="text-muted-foreground">{new Date(e.timestamp).toLocaleString("zh-TW")}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
