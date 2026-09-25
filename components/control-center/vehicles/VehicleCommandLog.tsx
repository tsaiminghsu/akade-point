"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { useVehiclesStore } from "@/store/useVehiclesStore";
import { VEHICLE_POLL_MS } from "@/lib/control-center/vehicles/constants";
import type { VehicleCommand, VehicleCommandStatus } from "@/lib/control-center/vehicles/types";

const STATUS_META: Record<VehicleCommandStatus, { key: string; className: string }> = {
  pending: { key: "statusPending", className: "text-muted-foreground" },
  sent: { key: "statusSent", className: "text-primary" },
  acked: { key: "statusAcked", className: "text-status-online" },
  failed: { key: "statusFailed", className: "text-status-alarm" },
  timeout: { key: "statusTimeout", className: "text-status-alarm" },
};

function StatusIcon({ status }: { status: VehicleCommandStatus }) {
  if (status === "pending" || status === "sent") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === "acked") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "timeout") return <Clock className="h-3.5 w-3.5" />;
  return <XCircle className="h-3.5 w-3.5" />;
}

function summarize(c: VehicleCommand): string {
  const a = c.args ?? {};
  if (c.type === "set_mode") return `set_mode ${a.mode ?? ""}`;
  if (c.type === "takeoff") return `takeoff ${a.alt ?? ""}m`;
  if (c.type === "goto") return `goto ${Number(a.lat).toFixed(5)}, ${Number(a.lon).toFixed(5)} @${a.alt}m`;
  return c.type;
}

export function VehicleCommandLog({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("VehicleCommands");
  const locale = useLocale();
  const commands = useVehiclesStore((s) => s.commandsByVehicle[vehicleId] ?? []);
  const fetchCommands = useVehiclesStore((s) => s.fetchCommands);

  // Poll while this log is mounted (the drawer is open).
  useEffect(() => {
    void fetchCommands(vehicleId);
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchCommands(vehicleId);
    }, VEHICLE_POLL_MS);
    return () => clearInterval(timer);
  }, [vehicleId, fetchCommands]);

  if (commands.length === 0) return <EmptyState title={t("logEmpty")} />;

  return (
    <div className="space-y-1.5">
      {commands.map((c) => {
        const meta = STATUS_META[c.status];
        return (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{summarize(c)}</p>
              <p className="text-muted-foreground">
                {new Date(c.createdAt).toLocaleTimeString(locale)}
                {c.code && c.status === "failed" ? ` · ${c.code}` : ""}
                {c.msg ? ` · ${c.msg}` : ""}
              </p>
            </div>
            <span className={cn("flex shrink-0 items-center gap-1.5 font-medium", meta.className)}>
              <StatusIcon status={c.status} />
              {t(meta.key)}
              {c.late ? ` ${t("lateAck")}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
