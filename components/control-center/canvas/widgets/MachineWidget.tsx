"use client";

import { Cpu, DoorOpen, HeartPulse, Wifi } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_BORDER_CLASS } from "@/lib/control-center/constants";
import type { Machine, MachineWidgetData } from "@/lib/control-center/types";
import { StatusBadge } from "@/components/control-center/shared/StatusBadge";
import { StatusDot } from "@/components/control-center/shared/StatusDot";

interface MachineWidgetProps {
  widget: MachineWidgetData;
  machine: Machine | undefined;
  animate: boolean;
}

export function MachineWidget({ widget, machine, animate }: MachineWidgetProps) {
  if (!machine) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-[10px] text-muted-foreground">
        Unbound
      </div>
    );
  }

  const alarm = machine.status === "alarm";
  const warning = machine.status === "warning";
  const offline = machine.status === "offline";

  const wrapperClass = cn(
    "flex h-full w-full select-none flex-col overflow-hidden rounded-lg border bg-card/90 shadow-sm transition-colors",
    STATUS_BORDER_CLASS[machine.status],
    offline && "grayscale opacity-60",
    animate && warning && "animate-cc-blink",
    animate && alarm && "animate-cc-breathe"
  );

  if (widget.size === "small") {
    return (
      <div className={cn(wrapperClass, "items-center justify-center gap-0.5 p-1")} title={machine.name}>
        <Cpu className="h-4 w-4 text-foreground/80" />
        <StatusDot status={machine.status} animate={animate} />
      </div>
    );
  }

  if (widget.size === "medium") {
    return (
      <div className={cn(wrapperClass, "justify-between p-2.5")}>
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="truncate text-xs font-medium text-foreground">{machine.name}</p>
        </div>
        <div className="flex items-center justify-between">
          <StatusBadge status={machine.status} />
          <span className="text-xs tabular-nums text-muted-foreground">{machine.current.toFixed(1)}A</span>
        </div>
      </div>
    );
  }

  // large
  return (
    <div className={cn(wrapperClass, "gap-1.5 p-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-foreground">{machine.name}</p>
        <StatusBadge status={machine.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Current</span>
        <span className="text-right tabular-nums text-foreground">{machine.current.toFixed(2)} A</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <DoorOpen className="h-3 w-3" /> Door
        </span>
        <span className={cn("text-right text-foreground", machine.door === "open" && "text-status-alarm")}>
          {machine.door === "open" ? "Open" : "Closed"}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <HeartPulse className="h-3 w-3" /> Heartbeat
        </span>
        <span className="text-right tabular-nums text-foreground">
          {Math.max(0, Math.round((Date.now() - machine.heartbeatAt) / 1000))}s ago
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Wifi className="h-3 w-3" /> RSSI
        </span>
        <span className="text-right tabular-nums text-foreground">{machine.rssi} dBm</span>
        <span className="text-muted-foreground">Firmware</span>
        <span className="truncate text-right text-foreground">{machine.firmware}</span>
        <span className="text-muted-foreground">Last Update</span>
        <span className="text-right text-foreground">{new Date(machine.lastUpdate).toLocaleTimeString("zh-TW")}</span>
      </div>
    </div>
  );
}
