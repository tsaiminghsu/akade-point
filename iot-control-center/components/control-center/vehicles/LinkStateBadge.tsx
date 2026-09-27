"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { VehicleLinkState } from "@/lib/control-center/vehicles/types";

const DOT: Record<VehicleLinkState, string> = {
  online: "bg-status-online",
  stale: "bg-status-warning",
  offline: "bg-status-offline",
};

const TEXT: Record<VehicleLinkState, string> = {
  online: "text-status-online",
  stale: "text-status-warning",
  offline: "text-status-offline",
};

/** The vehicles-module analogue of StatusBadge, mapping link state onto the
 *  shared status colour language (online→green, stale→amber, offline→gray). */
export function LinkStateBadge({ state, className }: { state: VehicleLinkState; className?: string }) {
  const t = useTranslations("VehicleLink");
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TEXT[state], className)}>
      <span className={cn("h-2 w-2 rounded-full", DOT[state], state === "online" && "animate-cc-pulse-ring")} />
      {t(state)}
    </span>
  );
}
