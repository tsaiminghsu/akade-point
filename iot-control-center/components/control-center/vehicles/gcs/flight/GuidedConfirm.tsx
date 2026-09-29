"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GuidedKind } from "@/lib/control-center/vehicles/gcs/flyView";
import { SlideToConfirm } from "./SlideToConfirm";

export interface GuidedRequest {
  kind: GuidedKind;
  /** flyTo / setHome target */
  at?: { lat: number; lon: number };
  /** preformatted distance to `at` */
  dist?: string;
  /** waypoint a continued mission picks up from */
  seq?: number;
  /** starting altitude for takeoff / fly to (m above home) */
  alt?: number;
}

/**
 * QGroundControl's guided-action confirmation: a panel at the top of the map
 * naming the action and what it will do, an altitude field when the action
 * takes one, and a slider instead of a button so a stray tap cannot fly the
 * vehicle.
 */
export function GuidedConfirm({
  request,
  rover,
  canCommand,
  blockedBy,
  onConfirm,
  onCancel,
}: {
  request: GuidedRequest;
  rover: boolean;
  canCommand: boolean;
  /** first pre-arm failure when arming would be refused */
  blockedBy: string | null;
  onConfirm: (alt: number | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Gcs.flyView");
  const { kind } = request;
  const takesAlt = !rover && (kind === "takeoff" || kind === "flyTo");
  const [alt, setAlt] = useState(String(request.alt ?? 10));
  useEffect(() => setAlt(String(request.alt ?? 10)), [request]);
  const altNum = Number(alt);
  const altOk = !takesAlt || (Number.isFinite(altNum) && altNum > 0 && altNum <= 500);
  const blocked = (kind === "arm" || kind === "takeoff") && blockedBy !== null;

  const at = request.at ? { lat: request.at.lat.toFixed(6), lon: request.at.lon.toFixed(6) } : { lat: "", lon: "" };
  const text: Record<GuidedKind, [string, string]> = {
    arm: [t("g_arm"), t("g_armMsg")],
    disarm: [t("g_disarm"), t("g_disarmMsg")],
    takeoff: [t("g_takeoff"), t("g_takeoffMsg")],
    land: [t("g_land"), t("g_landMsg")],
    rtl: [t("g_rtl"), t("g_rtlMsg")],
    pause: rover ? [t("g_pauseRover"), t("g_pauseRoverMsg")] : [t("g_pause"), t("g_pauseMsg")],
    missionStart: request.seq && request.seq > 1 ? [t("g_missionContinue"), t("g_missionContinueMsg", { n: request.seq })] : [t("g_missionStart"), t("g_missionStartMsg")],
    missionResume: [t("g_missionResume"), t("g_missionResumeMsg")],
    missionPause: [t("g_missionPause"), t("g_missionPauseMsg")],
    flyTo: [rover ? t("g_driveTo") : t("g_flyTo"), t("g_flyToMsg", { ...at, dist: request.dist ?? "—" })],
    setHome: [t("g_setHome"), t("g_setHomeMsg", at)],
  };
  const [title, message] = text[kind];
  const danger = kind === "disarm";

  const step = (d: number) => setAlt((v) => String(Math.max(1, Math.round((Number(v) || 0) + d))));

  return (
    <div role="dialog" aria-label={title} className="w-full rounded-lg border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">{message}</p>
        </div>
        <Button size="icon-sm" variant="ghost" className="-mr-1 -mt-1 shrink-0" onClick={onCancel} aria-label={t("cancel")}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {takesAlt && (
        <div className="mt-2 flex items-center gap-1.5">
          <label htmlFor="guided-alt" className="mr-auto text-xs text-muted-foreground">
            {t("alt")}
          </label>
          <Button size="icon-sm" variant="outline" onClick={() => step(-5)} aria-label={t("altDown")}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input id="guided-alt" inputMode="decimal" className="h-8 w-16 text-center tabular-nums" value={alt} onChange={(e) => setAlt(e.target.value)} />
          <Button size="icon-sm" variant="outline" onClick={() => step(5)} aria-label={t("altUp")}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {blocked && <p className="mt-2 break-words text-xs text-status-alarm">{t("blocked", { msg: blockedBy!.replace(/^(PreArm|Arm):\s*/, "") })}</p>}
      {!canCommand && <p className="mt-2 text-xs text-status-warning">{t("needControl")}</p>}
      <div className="mt-2">
        <SlideToConfirm label={t("slide")} tone={danger ? "danger" : "warn"} disabled={!canCommand || blocked || !altOk} onConfirm={() => onConfirm(takesAlt ? altNum : null)} />
      </div>
    </div>
  );
}
