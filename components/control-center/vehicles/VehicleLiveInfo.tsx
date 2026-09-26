"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";

import { fixLabel, summarize } from "@/lib/control-center/vehicles/summary";
import type { VehicleState } from "@/lib/control-center/vehicles/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground tabular-nums">{value}</span>
    </>
  );
}

/** Formats a possibly-unknown number; unknown shows as an em dash, never 0. */
function f(value: number | null | undefined, digits: number, unit = ""): string {
  return value == null ? "—" : `${value.toFixed(digits)}${unit}`;
}

export function VehicleLiveInfo({ state }: { state: VehicleState | null }) {
  const t = useTranslations("VehicleDrawer");
  const s = summarize(state);
  if (!s) return <p className="text-sm text-muted-foreground">{t("noState")}</p>;

  const maps = s.pos ? `https://www.google.com/maps?q=${s.pos.lat},${s.pos.lon}` : null;

  return (
    <div className="space-y-3">
      <div className="cc-card cc-glass grid grid-cols-2 gap-y-2.5 p-4 text-sm">
        <Row label={t("fldArmed")} value={s.armed == null ? "—" : s.armed ? "ARMED" : "DISARMED"} />
        <Row label={t("fldMode")} value={s.mode ?? "—"} />
        <Row label={t("fldSys")} value={s.sys ?? "—"} />
        <Row label={t("fldBattery")} value={f(s.batPct, 0, "%")} />
        <Row label={t("fldVoltage")} value={f(s.batV, 1, " V")} />
        <Row label={t("fldGps")} value={`${fixLabel(s.fix) ?? "—"} · ${s.sats ?? "—"} · hdop ${f(s.hdop, 1)}`} />
        <Row label={t("fldAltitude")} value={f(s.pos?.rel, 1, " m")} />
        <Row label={t("fldHeading")} value={f(s.hdg, 0, "°")} />
        <Row label={t("fldGroundspeed")} value={f(s.gs, 1, " m/s")} />
        <Row label={t("fldWaypoint")} value={s.wp ? `${s.wp.cur} / ${s.wp.n ?? "—"}` : "—"} />
        <Row label={t("fldFirmware")} value={s.fw ?? "—"} />
      </div>
      {maps && s.pos && (
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> {t("openInMaps")} ({s.pos.lat.toFixed(6)}, {s.pos.lon.toFixed(6)})
        </a>
      )}
    </div>
  );
}
