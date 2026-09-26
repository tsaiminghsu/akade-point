"use client";

import { useTranslations } from "next-intl";
import { Activity, Battery, Cable, Cpu, Radio, Satellite, ShieldAlert, Users, Waves, Wifi } from "lucide-react";

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
  type Level,
} from "@/lib/control-center/vehicles/gcs/health";
import { fixLabel } from "@/lib/control-center/vehicles/summary";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import type { LinkInfo } from "@/store/useGcsStore";

function Chip({ level, icon, children, title }: { level: Level; icon: React.ReactNode; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
    >
      <span className={levelClass(level)}>{icon}</span>
      <span className="text-foreground">{children}</span>
    </span>
  );
}

const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : v.toFixed(d));

export function StatusBar({ state, stale, link }: { state: VehicleStateV2 | null; stale: boolean; link: LinkInfo }) {
  const t = useTranslations("Gcs.status");
  const s = stale ? null : state;
  const ic = "h-3.5 w-3.5";

  const linkLevel: Level = link.active === "none" || stale ? "bad" : link.active === "cloud" ? "ok" : "ok";
  const directNote = link.direct.status === "idle" ? t("directOff") : t(`direct_${link.direct.status}`);
  const linkTitle = [
    `${t("cloud")}: ${link.cloud.ok ? t("ok") : t("down")}`,
    `${t("direct")}: ${directNote}${link.direct.detail ? ` (${link.direct.detail})` : ""}`,
  ].join("\n");

  const fcLevel: Level = !s ? "unknown" : s.fc.ok ? "ok" : "bad";
  const bat = s?.bat ?? null;
  const vibe = s?.vibe ?? null;
  const rcPct = s?.rssi.rc ?? null;
  const radio = radioPct(s?.rssi.radio?.rssi);
  const comp = s?.comp ?? null;
  const prearm = s ? prearmLevel(s.health) : "unknown";
  const others = s?.gcs.others ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip level={linkLevel} icon={<Wifi className={ic} />} title={linkTitle}>
        {link.active === "direct" ? t("direct") : link.active === "cloud" ? t("cloud") : t("noLink")}
      </Chip>
      <Chip level={fcLevel} icon={<Cable className={ic} />} title={t("fcTitle")}>
        FC {s ? (s.fc.ok ? n(s.fc.age, 1) + "s" : t("down")) : "—"}
      </Chip>
      <Chip level={s ? gpsLevel(s.gps) : "unknown"} icon={<Satellite className={ic} />} title={t("gpsTitle")}>
        {s?.gps ? `${fixLabel(s.gps.fix)} ${n(s.gps.sats)} · ${n(s.gps.hdop, 1)}` : "GPS —"}
      </Chip>
      <Chip level={s ? batteryLevel(bat) : "unknown"} icon={<Battery className={ic} />} title={bat?.cellAvg ? t("cellAvgTitle") : t("batTitle")}>
        {bat ? `${n(bat.v, 1)}V${bat.cellV !== null ? ` ${bat.cellAvg ? "~" : ""}${bat.cellV.toFixed(2)}/c` : ""} ${n(bat.pct)}%` : "BAT —"}
      </Chip>
      <Chip level={s ? ekfLevel(s.ekf) : "unknown"} icon={<Activity className={ic} />} title={t("ekfTitle")}>
        EKF {n(s?.ekf?.worst, 2)}
      </Chip>
      <Chip level={s ? vibeLevel(vibe, Boolean(vibe && vibe.clip.some((c) => c > 0))) : "unknown"} icon={<Waves className={ic} />} title={t("vibeTitle")}>
        VIBE {vibe ? n(Math.max(vibe.x, vibe.y, vibe.z)) : "—"}
      </Chip>
      <Chip level={s ? rssiLevel(radio ?? rcPct) : "unknown"} icon={<Radio className={ic} />} title={t("rssiTitle")}>
        RC {n(rcPct)}%{radio !== null ? ` · TLM ${radio}%` : ""}
      </Chip>
      <Chip level={s ? companionLevel(comp) : "unknown"} icon={<Cpu className={ic} />} title={comp?.throttled?.join(", ") || t("piTitle")}>
        Pi {comp?.tempC != null ? `${comp.tempC.toFixed(0)}°C` : "—"}
        {comp?.throttled?.includes("under_voltage") ? ` ${t("underVoltage")}` : ""}
      </Chip>
      <Chip level={prearm} icon={<ShieldAlert className={ic} />} title={s?.health.msgs.join("\n") || t("prearmTitle")}>
        {prearm === "bad" ? t("prearmFail", { count: Math.max(1, s?.health.msgs.length ?? 0) }) : prearm === "ok" ? t("prearmOk") : t("prearmUnknown")}
      </Chip>
      {others > 0 && (
        <Chip level="warn" icon={<Users className={ic} />} title={t("otherGcsTitle")}>
          {t("otherGcs", { count: others })}
        </Chip>
      )}
    </div>
  );
}
