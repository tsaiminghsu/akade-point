"use client";

import { useTranslations } from "next-intl";
import { DoorClosed, DoorOpen, HeartPulse, RefreshCcw, Signal, Wifi } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Machine } from "@/lib/control-center/types";

function relativeTime(ts: number, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return t("justNow");
  if (diff < 60_000) return t("secondsAgo", { seconds: Math.floor(diff / 1000) });
  if (diff < 3_600_000) return t("minutesAgo", { minutes: Math.floor(diff / 60_000) });
  return t("hoursAgo", { hours: Math.floor(diff / 3_600_000) });
}

function rssiBars(rssi: number): number {
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

function InfoTile({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="cc-card cc-glass flex flex-col gap-2 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn("text-sm font-semibold text-foreground", valueClassName)}>{value}</div>
    </div>
  );
}

export function MachineLiveInfo({ machine }: { machine: Machine }) {
  const t = useTranslations("MachineLiveInfo");
  const bars = rssiBars(machine.rssi);
  return (
    <div className="grid grid-cols-2 gap-3">
      <InfoTile
        icon={HeartPulse}
        label={t("heartbeat")}
        value={
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full bg-status-online", Date.now() - machine.heartbeatAt < 5000 && "animate-pulse")} />
            {relativeTime(machine.heartbeatAt, t)}
          </span>
        }
      />
      <InfoTile
        icon={machine.door === "open" ? DoorOpen : DoorClosed}
        label={t("door")}
        value={machine.door === "open" ? t("open") : t("closed")}
        valueClassName={machine.door === "open" ? "text-status-alarm" : undefined}
      />
      <InfoTile
        icon={Wifi}
        label={t("wifiRssi")}
        value={
          <span className="flex items-center gap-2">
            {machine.rssi} dBm
            <span className="flex items-end gap-0.5">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn("w-1 rounded-sm bg-muted", i <= bars && "bg-primary")}
                  style={{ height: `${i * 3 + 3}px` }}
                />
              ))}
            </span>
          </span>
        }
      />
      <InfoTile icon={RefreshCcw} label={t("restartCount")} value={machine.restartCount} />
      <InfoTile icon={Signal} label={t("firmware")} value={machine.firmware} />
      <InfoTile icon={HeartPulse} label={t("lastUpdate")} value={relativeTime(machine.lastUpdate, t)} />
    </div>
  );
}
