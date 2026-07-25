import { cn } from "@/lib/utils";
import type { MachineStatus } from "@/lib/control-center/types";
import { STATUS_BG_CLASS } from "@/lib/control-center/constants";

interface StatusDotProps {
  status: MachineStatus;
  className?: string;
  animate?: boolean;
}

/** The single shared 4-state visual language: online=solid green,
 * warning=blinking amber, alarm=breathing red, offline=flat gray. */
export function StatusDot({ status, className, animate = true }: StatusDotProps) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full", STATUS_BG_CLASS[status], className)}>
      {animate && status === "alarm" && (
        <span className={cn("absolute inset-0 rounded-full animate-cc-pulse-ring", STATUS_BG_CLASS[status])} />
      )}
    </span>
  );
}
