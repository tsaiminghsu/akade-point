"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import { CAMERA_PRESETS, surveyGrid } from "@/lib/control-center/vehicles/plan/missionTools";
import { blankItem } from "@/lib/control-center/vehicles/plan/planModel";
import type { VehicleFamily } from "@/lib/control-center/vehicles/plan/mavCmdMeta";
import { usePlanStore } from "@/store/usePlanStore";

/**
 * Turns the polygon drawn on the map into lawnmower lanes. Camera trigger by
 * distance is optional: it takes photos when the autopilot has a camera
 * configured (for the Pi camera: CAM1_TYPE = 6 and the companion's MAVLink
 * camera, [camera]), so it stays off unless asked for.
 */
export function SurveyDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: VehicleFamily }) {
  const t = useTranslations("Gcs.plan.survey");
  const polygon = usePlanStore((s) => s.drawPoints);
  const appendItems = usePlanStore((s) => s.appendItems);
  const clearDraw = usePlanStore((s) => s.clearDraw);
  const hasItems = usePlanStore((s) => s.mission.items.length > 0);

  const [alt, setAlt] = useState(vehicle === "rover" ? "0" : "50");
  const [preset, setPreset] = useState<keyof typeof CAMERA_PRESETS>("piCam3");
  const [front, setFront] = useState("75");
  const [side, setSide] = useState("65");
  const [angle, setAngle] = useState("0");
  const [trigger, setTrigger] = useState(false);

  const result = useMemo(
    () =>
      surveyGrid({
        polygon,
        // Rovers sweep at ground level; lanes come from a nominal 30 m footprint.
        alt: vehicle === "rover" ? 30 : Number(alt),
        camera: CAMERA_PRESETS[preset],
        frontOverlap: Number(front),
        sideOverlap: Number(side),
        angle: Number(angle),
        trigger,
      }),
    [polygon, alt, preset, front, side, angle, trigger, vehicle]
  );

  function insert() {
    if (!result) return;
    const items = vehicle === "rover" ? result.items.map((i) => ({ ...i, alt: 0 })) : result.items;
    const prefix = vehicle === "copter" && !hasItems ? [blankItem(22, 0, 0, Number(alt))] : [];
    appendItems([...prefix, ...items]);
    clearDraw();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { points: polygon.length })}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {vehicle === "copter" && (
            <div className="space-y-1">
              <Label>{t("alt")}</Label>
              <Input inputMode="decimal" value={alt} onChange={(e) => setAlt(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>{t("angle")}</Label>
            <Input inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>{t("camera")}</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as keyof typeof CAMERA_PRESETS)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(CAMERA_PRESETS).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`camera_${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("front")}</Label>
            <Input inputMode="numeric" value={front} onChange={(e) => setFront(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("side")}</Label>
            <Input inputMode="numeric" value={side} onChange={(e) => setSide(e.target.value)} />
          </div>
          <label className="col-span-2 flex items-center justify-between gap-2 text-xs">
            <span>
              {t("trigger")}
              <span className="block text-muted-foreground">{t("triggerHint")}</span>
            </span>
            <Switch aria-label={t("trigger")} checked={trigger} onCheckedChange={setTrigger} />
          </label>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-xs tabular-nums">
          {result ? (
            <div className="grid grid-cols-2 gap-1">
              <span>{t("lanes", { n: result.lanes })}</span>
              <span>{t("spacing", { m: result.laneSpacing.toFixed(1) })}</span>
              <span>{t("length", { d: formatDistance(result.lengthM) })}</span>
              {vehicle === "copter" && <span>{t("gsd", { cm: result.gsd.toFixed(2) })}</span>}
              {trigger && <span>{t("triggerDist", { m: result.triggerDistance.toFixed(1) })}</span>}
            </div>
          ) : (
            <span className="text-status-alarm">{t("invalid")}</span>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={!result} onClick={insert}>
            {t("insert", { n: result?.items.filter((i) => i.cmd === 16).length ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
