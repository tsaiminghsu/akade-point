"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Activity, Battery, BatteryLow, ChevronDown, MessageSquareWarning, Radio, Satellite, Wifi, WifiOff } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mainStatus, modesFor } from "@/lib/control-center/vehicles/gcs/flyView";
import {
  batteryLevel,
  companionLevel,
  ekfLevel,
  gpsLevel,
  levelClass,
  prearmLevel,
  radioPct,
  rssiLevel,
  vibeLevel,
  worstLevel,
  type Level,
} from "@/lib/control-center/vehicles/gcs/health";
import { fixLabel } from "@/lib/control-center/vehicles/summary";
import type { VehicleStateV2, VehicleType } from "@/lib/control-center/vehicles/types";
import { cn } from "@/lib/utils";
import { useGcsStore, type GcsMessage, type LinkInfo } from "@/store/useGcsStore";
import { MessagesPanel } from "./MessagesPanel";
import { StatusBar } from "./StatusBar";

const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : v.toFixed(d));

const STATUS_BG: Record<Level, string> = {
  ok: "bg-status-online/20 text-status-online ring-status-online/40",
  warn: "bg-status-warning/20 text-status-warning ring-status-warning/40",
  bad: "bg-status-alarm/20 text-status-alarm ring-status-alarm/50",
  unknown: "bg-muted text-muted-foreground ring-border",
};

function Row({ label, value, level }: { label: string; value: React.ReactNode; level?: Level }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium tabular-nums", level ? levelClass(level) : "text-foreground")}>{value}</span>
    </div>
  );
}

/** A toolbar indicator: icon (coloured by level) and a short value; tap for details, as in QGC. */
function Indicator({ level, icon, value, label, children, wide }: { level: Level; icon: React.ReactNode; value?: string; label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-semibold tabular-nums text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={levelClass(level)}>{icon}</span>
          {value !== undefined && <span>{value}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={8} className={cn("max-h-[70dvh] overflow-y-auto p-3 text-xs", wide ? "w-[min(22rem,calc(100vw-1rem))]" : "w-60")}>
        <p className="mb-1.5 font-semibold text-foreground">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * QGroundControl's fly-view toolbar: the main status ("Ready to fly", "Not
 * ready", "Armed", "Flying", "Communication lost"), the flight mode menu, then
 * one indicator per subsystem. Every indicator opens its details, so nothing
 * has to be squeezed onto a phone-width bar.
 */
export function FlyToolbar({
  vehicleType,
  state,
  stale,
  link,
  messages,
  canCommand,
}: {
  vehicleType: VehicleType;
  state: VehicleStateV2 | null;
  stale: boolean;
  link: LinkInfo;
  messages: GcsMessage[];
  canCommand: boolean;
}) {
  const t = useTranslations("Gcs.flyView");
  const tStatus = useTranslations("Gcs.status");
  const tGcs = useTranslations("Gcs");
  const send = useGcsStore((s) => s.send);
  const rover = vehicleType === "rover";
  const s = stale ? null : state;
  const main = mainStatus(state, stale, rover);
  const statusText = main.key === "ready" && rover ? t("status_readyRover") : t(`status_${main.key}`);
  const ic = "h-4 w-4";

  const gps = s?.gps ?? null;
  const bat = s?.bat ?? null;
  const rcPct = s?.rssi.rc ?? null;
  const radio = s?.rssi.radio ?? null;
  const tlmPct = radioPct(radio?.rssi);
  const batLevel = s ? batteryLevel(bat) : "unknown";
  const important = messages.filter((m) => m.sev <= 4).length + (s?.health.msgs.length ?? 0);
  const linkLevel: Level = link.active === "none" || stale ? "bad" : "ok";
  const health: Level = s
    ? worstLevel(ekfLevel(s.ekf), vibeLevel(s.vibe, Boolean(s.vibe && s.vibe.clip.some((c) => c > 0))), companionLevel(s.comp), prearmLevel(s.health), s.gcs.others > 0 ? "warn" : "ok")
    : "unknown";

  async function setMode(mode: string) {
    if (!canCommand) {
      toast.message(t("modeNeedsControl"));
      return;
    }
    if (await send({ type: "set_mode", mode })) toast.message(t("modeSent", { mode }));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border border-border/60 bg-card/80 px-1.5 py-1" role="toolbar" aria-label={t("statusTitle")}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold ring-1 ring-inset", STATUS_BG[main.level])}
            aria-label={`${t("statusTitle")}: ${statusText}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {statusText}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={8} className="w-[min(20rem,calc(100vw-1rem))] p-3 text-xs">
          <p className="mb-1.5 font-semibold">{statusText}</p>
          {s && s.health.msgs.length > 0 ? (
            <>
              <p className="mb-1 text-status-warning">{t("prearmFailing")}</p>
              <ul className="space-y-0.5">
                {s.health.msgs.map((m) => (
                  <li key={m}>• {m.replace(/^(PreArm|Arm):\s*/, "")}</li>
                ))}
              </ul>
            </>
          ) : (
            s && <p className="text-muted-foreground">{t("allGood")}</p>
          )}
          {s && s.health.bad.length > 0 && <p className="mt-1.5 text-status-warning">{t("sensorsBad", { list: s.health.bad.join(", ") })}</p>}
          {s?.veh?.ap === "px4" && <p className="mt-1.5 text-status-warning">{tGcs("px4Basic")}</p>}
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 font-mono text-xs font-bold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${t("mode")}: ${state?.mode ?? "—"}`}
          >
            {state?.mode ?? "—"}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" collisionPadding={8} className="max-h-[60dvh] overflow-y-auto">
          <DropdownMenuLabel className="text-xs">{canCommand ? t("mode") : t("modeNeedsControl")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={state?.mode ?? ""} onValueChange={(m) => void setMode(m)}>
            {modesFor(vehicleType, state).map((m) => (
              <DropdownMenuRadioItem key={m} value={m} disabled={!canCommand} className="font-mono text-xs">
                {m}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-0.5">
        <Indicator level={important > 0 ? (s?.health.msgs.length ? "warn" : "bad") : "ok"} icon={<MessageSquareWarning className={ic} />} value={important > 0 ? String(important) : undefined} label={t("ind_messages")} wide>
          <div className="h-[min(50dvh,22rem)]">
            <MessagesPanel messages={messages} state={state} />
          </div>
        </Indicator>
        <Indicator level={s ? gpsLevel(gps) : "unknown"} icon={<Satellite className={ic} />} value={gps?.sats != null ? String(gps.sats) : "—"} label={t("ind_gps")}>
          <Row label={t("fix")} value={gps ? fixLabel(gps.fix) : "—"} level={s ? gpsLevel(gps) : undefined} />
          <Row label={t("sats")} value={n(gps?.sats)} />
          <Row label={t("hdop")} value={n(gps?.hdop, 1)} />
        </Indicator>
        <Indicator
          level={batLevel}
          icon={batLevel === "bad" ? <BatteryLow className={ic} /> : <Battery className={ic} />}
          value={bat?.pct != null ? `${bat.pct.toFixed(0)}%` : bat?.v != null ? `${bat.v.toFixed(1)}V` : "—"}
          label={t("ind_battery")}
        >
          <Row label={t("voltage")} value={bat?.v != null ? `${bat.v.toFixed(2)} V` : "—"} />
          <Row label={bat?.cellAvg ? t("cellAvg") : t("cell")} value={bat?.cellV != null ? `${bat.cellV.toFixed(2)} V` : "—"} level={batLevel} />
          <Row label={t("remaining")} value={bat?.pct != null ? `${bat.pct.toFixed(0)}%` : "—"} level={batLevel} />
          <Row label={t("current")} value={bat?.a != null ? `${bat.a.toFixed(1)} A` : "—"} />
          <Row label={t("used")} value={bat?.mah != null ? `${bat.mah.toFixed(0)} mAh` : "—"} />
        </Indicator>
        <Indicator level={s ? rssiLevel(tlmPct ?? rcPct) : "unknown"} icon={<Radio className={ic} />} value={rcPct != null ? `${rcPct.toFixed(0)}` : tlmPct != null ? `${tlmPct}` : "—"} label={t("ind_radio")}>
          <Row label={t("rc")} value={rcPct != null ? `${rcPct.toFixed(0)}%` : "—"} level={s ? rssiLevel(rcPct) : undefined} />
          <Row label={t("tlm")} value={tlmPct != null ? `${tlmPct}%` : "—"} level={s ? rssiLevel(tlmPct) : undefined} />
          {radio && <Row label={t("tlmRemote")} value={`${radioPct(radio.remrssi) ?? "—"}%`} />}
        </Indicator>
        <Indicator level={linkLevel} icon={linkLevel === "bad" ? <WifiOff className={ic} /> : <Wifi className={ic} />} label={t("ind_link")}>
          <Row label={t("cloud")} value={link.cloud.ok ? tStatus("ok") : tStatus("down")} level={link.cloud.ok ? "ok" : "bad"} />
          <Row
            label={t("direct")}
            value={link.direct.status === "idle" ? tStatus("directOff") : tStatus(`direct_${link.direct.status}`)}
            level={link.direct.status === "open" ? "ok" : link.direct.status === "idle" ? undefined : "warn"}
          />
          {link.direct.detail && <p className="break-words text-muted-foreground">{link.direct.detail}</p>}
          <Row label={t("fc")} value={s ? (s.fc.ok ? `${n(s.fc.age, 1)} s` : tStatus("down")) : "—"} level={s ? (s.fc.ok ? "ok" : "bad") : undefined} />
        </Indicator>
        <Indicator level={health} icon={<Activity className={ic} />} label={t("ind_health")} wide>
          <StatusBar state={state} stale={stale} link={link} />
        </Indicator>
      </div>
    </div>
  );
}
