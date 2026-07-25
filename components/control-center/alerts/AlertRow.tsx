"use client";

import { useState } from "react";
import { AlertTriangle, Check, EyeOff, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { Alert } from "@/lib/control-center/types";
import { useAlertStore } from "@/store/useAlertStore";
import { useMachinesStore } from "@/store/useMachinesStore";

const STATUS_BADGE: Record<Alert["status"], { label: string; className: string }> = {
  active: { label: "Active", className: "border-status-alarm/40 bg-status-alarm/10 text-status-alarm" },
  acknowledged: { label: "Acknowledged", className: "border-status-warning/40 bg-status-warning/10 text-status-warning" },
  resolved: { label: "Resolved", className: "border-status-online/40 bg-status-online/10 text-status-online" },
  ignored: { label: "Ignored", className: "border-border bg-muted/40 text-muted-foreground" },
};

interface AlertRowProps {
  alert: Alert;
  onOpenMachine?: (machineId: string) => void;
}

export function AlertRow({ alert, onOpenMachine }: AlertRowProps) {
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const acknowledge = useAlertStore((s) => s.acknowledge);
  const resolve = useAlertStore((s) => s.resolve);
  const ignore = useAlertStore((s) => s.ignore);
  const machine = useMachinesStore((s) => s.getMachine(alert.machineId));
  const store = useMachinesStore((s) => s.stores.find((st) => st.id === alert.storeId));
  const badge = STATUS_BADGE[alert.status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        onClick={() => onOpenMachine?.(alert.machineId)}
      >
        <ShieldAlert className={cn("mt-0.5 h-4 w-4 shrink-0", alert.severity === "critical" ? "text-status-alarm" : "text-status-warning")} />
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{alert.message}</p>
          <p className="truncate text-xs text-muted-foreground">
            {machine?.name ?? alert.machineId} · {store?.name ?? alert.storeId} · {new Date(alert.createdAt).toLocaleString("zh-TW")}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className={badge.className}>
          {badge.label}
        </Badge>
        {alert.status === "active" && (
          <>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => acknowledge(alert.id)}>
              <Check className="h-3.5 w-3.5" /> Ack
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => resolve(alert.id)}>
              <ShieldCheck className="h-3.5 w-3.5" /> Resolve
            </Button>
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => setIgnoreOpen(true)}>
              <EyeOff className="h-3.5 w-3.5" /> Ignore
            </Button>
          </>
        )}
        {alert.status === "acknowledged" && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => resolve(alert.id)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Resolve
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={ignoreOpen}
        onOpenChange={setIgnoreOpen}
        title="Ignore this alert?"
        description="Ignored alerts are removed from active monitoring but kept in history."
        confirmLabel="Ignore"
        onConfirm={() => ignore(alert.id)}
      />
    </div>
  );
}

export function AlertSeverityIcon({ severity }: { severity: Alert["severity"] }) {
  return severity === "critical" ? (
    <ShieldAlert className="h-4 w-4 text-status-alarm" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-status-warning" />
  );
}
