import { cn } from "@/lib/utils";
import type { MachineStatus } from "@/lib/control-center/types";
import { STATUS_BG_CLASS, STATUS_LABEL, STATUS_TEXT_CLASS } from "@/lib/control-center/constants";
import { StatusDot } from "./StatusDot";

interface StatusBadgeProps {
  status: MachineStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium",
        STATUS_TEXT_CLASS[status],
        status === "warning" && "animate-cc-blink",
        className
      )}
    >
      <StatusDot status={status} animate={status === "alarm"} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusLegend() {
  const items: MachineStatus[] = ["online", "warning", "alarm", "offline"];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", STATUS_BG_CLASS[s])} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
