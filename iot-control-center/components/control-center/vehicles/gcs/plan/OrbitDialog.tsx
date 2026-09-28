"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import type { VehicleFamily } from "@/lib/control-center/vehicles/plan/mavCmdMeta";
import { orbitItems } from "@/lib/control-center/vehicles/plan/missionTools";
import { blankItem } from "@/lib/control-center/vehicles/plan/planModel";
import { usePlanStore } from "@/store/usePlanStore";

/**
 * Circles a point of interest: a ring of waypoints around the centre clicked
 * on the map, optionally keeping the gimbal on it (DO_SET_ROI_LOCATION). A
 * ring of waypoints works for rovers too, where NAV_LOITER_TURNS does not.
 */
export function OrbitDialog({
  centre,
  onClose,
  vehicle,
  startBearing,
}: {
  centre: { lat: number; lon: number } | null;
  onClose: () => void;
  vehicle: VehicleFamily;
  /** bearing from the centre to the vehicle, so the orbit starts on the near side */
  startBearing: number | null;
}) {
  const t = useTranslations("Gcs.plan.orbit");
  const appendItems = usePlanStore((s) => s.appendItems);
  const defaultAlt = usePlanStore((s) => s.defaultAlt);
  const hasItems = usePlanStore((s) => s.mission.items.length > 0);
  const rover = vehicle === "rover";

  const [radius, setRadius] = useState("40");
  const [alt, setAlt] = useState(rover ? "0" : String(defaultAlt));
  const [points, setPoints] = useState("12");
  const [turns, setTurns] = useState("1");
  const [ccw, setCcw] = useState(false);
  const [roi, setRoi] = useState(!rover);

  const items = useMemo(
    () =>
      centre
        ? orbitItems({
            lat: centre.lat,
            lon: centre.lon,
            radius: Number(radius) || 0,
            alt: rover ? 0 : Number(alt) || 0,
            points: Number(points) || 12,
            turns: Number(turns) || 1,
            ccw,
            roi,
            startBearing: startBearing ?? 0,
          })
        : [],
    [centre, radius, alt, points, turns, ccw, roi, startBearing, rover]
  );
  const r = Number(radius) || 0;
  const length = 2 * Math.PI * r * (Number(turns) || 1);
  const valid = centre !== null && r >= 5 && r <= 2000 && (rover || Number(alt) > 0);

  function insert() {
    if (!valid) return;
    const prefix = !rover && !hasItems ? [blankItem(22, 0, 0, Number(alt))] : [];
    appendItems([...prefix, ...items]);
    onClose();
  }

  return (
    <Dialog open={centre !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="orbit-r">{t("radius")}</Label>
            <Input id="orbit-r" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          {!rover && (
            <div className="space-y-1">
              <Label htmlFor="orbit-alt">{t("alt")}</Label>
              <Input id="orbit-alt" inputMode="decimal" value={alt} onChange={(e) => setAlt(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="orbit-n">{t("points")}</Label>
            <Input id="orbit-n" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="orbit-t">{t("turns")}</Label>
            <Input id="orbit-t" inputMode="numeric" value={turns} onChange={(e) => setTurns(e.target.value)} />
          </div>
          <label className="col-span-2 flex items-center justify-between gap-2 text-xs">
            {t("ccw")}
            <Switch checked={ccw} onCheckedChange={setCcw} />
          </label>
          <label className="col-span-2 flex items-center justify-between gap-2 text-xs">
            <span>
              {t("roi")}
              <span className="block text-[11px] text-muted-foreground">{t("roiHint")}</span>
            </span>
            <Switch checked={roi} onCheckedChange={setRoi} />
          </label>
        </div>
        <p className="rounded-md bg-muted/40 p-2 text-xs tabular-nums text-muted-foreground">
          {t("summary", { n: items.length, length: formatDistance(length) })}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!valid} onClick={insert}>
            {t("insert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
