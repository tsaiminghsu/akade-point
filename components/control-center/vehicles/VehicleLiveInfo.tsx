"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";

import type { VehicleState } from "@/lib/control-center/vehicles/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground tabular-nums">{value}</span>
    </>
  );
}

export function VehicleLiveInfo({ state }: { state: VehicleState | null }) {
  const t = useTranslations("VehicleDrawer");
  if (!state) return <p className="text-sm text-muted-foreground">{t("noState")}</p>;

  const fix = state.gps.fix >= 6 ? "RTK" : state.gps.fix >= 3 ? "3D" : state.gps.fix >= 2 ? "2D" : "—";
  const maps = `https://www.google.com/maps?q=${state.pos.lat},${state.pos.lon}`;

  return (
    <div className="space-y-3">
      <div className="cc-card cc-glass grid grid-cols-2 gap-y-2.5 p-4 text-sm">
        <Row label={t("fldArmed")} value={state.armed ? "ARMED" : "DISARMED"} />
        <Row label={t("fldMode")} value={state.mode} />
        <Row label={t("fldSys")} value={state.sys} />
        <Row label={t("fldBattery")} value={`${Math.round(state.bat.pct)}%`} />
        <Row label={t("fldVoltage")} value={`${state.bat.v.toFixed(1)} V`} />
        <Row label={t("fldGps")} value={`${fix} · ${state.gps.sats} · hdop ${state.gps.hdop.toFixed(1)}`} />
        <Row label={t("fldAltitude")} value={`${state.pos.rel.toFixed(1)} m`} />
        <Row label={t("fldHeading")} value={`${Math.round(state.hdg)}°`} />
        <Row label={t("fldGroundspeed")} value={`${state.gs.toFixed(1)} m/s`} />
        <Row label={t("fldWaypoint")} value={`${state.wp.cur} / ${state.wp.n}`} />
        <Row label={t("fldFirmware")} value={state.fw} />
      </div>
      <a
        href={maps}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> {t("openInMaps")} ({state.pos.lat.toFixed(6)}, {state.pos.lon.toFixed(6)})
      </a>
    </div>
  );
}
