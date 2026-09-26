"use client";

import { useTranslations } from "next-intl";

import { distanceM, formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";

function Tile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "text-status-alarm" : tone === "warn" ? "text-status-warning" : "text-foreground";
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`truncate text-xl font-semibold tabular-nums leading-tight ${color}`}>
        {value}
        {unit && value !== "—" && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : v.toFixed(d));

/** Mission Planner's "Quick" tab: the numbers a pilot glances at, large. */
export function QuickPanel({ state, stale }: { state: VehicleStateV2 | null; stale: boolean }) {
  const t = useTranslations("Gcs.quick");
  const s = stale ? null : state;
  const rover = s?.veh?.cls === "rover";
  const homeDist = s?.pos && s.home ? distanceM(s.pos.lat, s.pos.lon, s.home.lat, s.home.lon) : null;
  const bat = s?.bat ?? null;

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {!rover && <Tile label={t("alt")} value={n(s?.pos?.rel, 1)} unit="m" />}
      <Tile label={t("groundspeed")} value={n(s?.gs, 1)} unit="m/s" />
      {!rover && <Tile label={t("climb")} value={n(s?.vs, 1)} unit="m/s" />}
      <Tile label={t("homeDist")} value={homeDist === null ? "—" : formatDistance(homeDist)} />
      <Tile label={t("wpDist")} value={s?.wp?.dist != null ? formatDistance(s.wp.dist) : "—"} />
      <Tile label={t("waypoint")} value={s?.wp ? `${s.wp.cur}/${s.wp.n ?? "—"}` : "—"} />
      <Tile label={t("voltage")} value={n(bat?.v, 2)} unit="V" />
      <Tile label={t("cell")} value={n(bat?.cellV, 2)} unit={bat?.cellAvg ? "V~" : "V"} />
      <Tile label={t("current")} value={n(bat?.a, 1)} unit="A" />
      <Tile label={t("used")} value={n(bat?.mah)} unit="mAh" />
      <Tile label={t("heading")} value={n(s?.hdg)} unit="°" />
      <Tile label={t("throttle")} value={n(s?.thr)} unit="%" />
      {rover && <Tile label={t("crosstrack")} value={n(s?.wp?.xt, 1)} unit="m" />}
      <Tile label={t("wind")} value={s?.wind ? `${n(s.wind.spd, 1)}` : "—"} unit={s?.wind ? `m/s ${n(s.wind.dir)}°` : undefined} />
    </div>
  );
}
