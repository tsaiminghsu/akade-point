"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, Crosshair, Lock, LockOpen, MoveHorizontal, RotateCcw, SquareArrowDown, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

/**
 * Gimbal control (Mission Planner's Payload Control, reworked): sliders stream
 * angles over the direct link while dragging (the companion throttles them to
 * 10 Hz for the STorM32) and send one confirmed command on release; over the
 * cloud only the release is sent. Quick buttons cover the common poses and
 * the mount modes.
 */
export function GimbalPanel({ state, canCommand, directOpen }: { state: VehicleStateV2 | null; canCommand: boolean; directOpen: boolean }) {
  const t = useTranslations("Gcs.gimbal");
  const send = useGcsStore((s) => s.send);
  const gimbalStream = useGcsStore((s) => s.gimbalStream);
  const mount = state?.mount ?? null;

  const [pitch, setPitch] = useState(mount?.p ?? 0);
  const [yaw, setYaw] = useState(mount?.y ?? 0);
  const [lock, setLock] = useState(false);
  const dragging = useRef(false);

  // Follow the gimbal's reported attitude while the user is not dragging.
  useEffect(() => {
    if (!dragging.current && mount) {
      setPitch(Math.round(mount.p));
      setYaw(Math.round(mount.y));
    }
  }, [mount?.p, mount?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(p: number, y: number) {
    dragging.current = false;
    void send({ type: "gimbal_pitchyaw", pitch: p, yaw: y, lock });
  }

  function live(p: number, y: number) {
    dragging.current = true;
    if (directOpen) gimbalStream(p, y, lock);
  }

  const dis = !canCommand;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
        {(["p", "y", "r"] as const).map((k) => (
          <div key={k} className="rounded-md border border-border/60 bg-muted/30 py-1.5">
            <p className="text-[10px] uppercase text-muted-foreground">{t(`axis_${k}`)}</p>
            <p className="text-lg font-semibold">{mount ? `${mount[k].toFixed(0)}°` : "—"}</p>
          </div>
        ))}
      </div>
      {!mount && <p className="text-xs text-muted-foreground">{t("noAttitude")}</p>}

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>{t("pitch")}</span>
          <span className="tabular-nums">{pitch}°</span>
        </div>
        <Slider
          min={-90}
          max={30}
          step={1}
          value={[pitch]}
          disabled={dis}
          aria-label={t("pitch")}
          onValueChange={([v]) => {
            setPitch(v);
            live(v, yaw);
          }}
          onValueCommit={([v]) => commit(v, yaw)}
        />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>{t("yaw")}</span>
          <span className="tabular-nums">{yaw}°</span>
        </div>
        <Slider
          min={-180}
          max={180}
          step={1}
          value={[yaw]}
          disabled={dis}
          aria-label={t("yaw")}
          onValueChange={([v]) => {
            setYaw(v);
            live(pitch, v);
          }}
          onValueCommit={([v]) => commit(pitch, v)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{directOpen ? t("streamHint") : t("cloudHint")}</p>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" className="gap-1.5" disabled={dis} onClick={() => void send({ type: "gimbal_pitchyaw", pitch: -90, yaw: 0, lock: false })}>
          <SquareArrowDown className="h-3.5 w-3.5" /> {t("nadir")}
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" disabled={dis} onClick={() => void send({ type: "gimbal_pitchyaw", pitch: 0, yaw: 0, lock: false })}>
          <MoveHorizontal className="h-3.5 w-3.5" /> {t("forward")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={dis} onClick={() => void send({ type: "gimbal_mode", mode: "neutral" })}>
          <RotateCcw className="h-3.5 w-3.5" /> {t("neutral")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={dis} onClick={() => void send({ type: "gimbal_mode", mode: "retract" })}>
          <ArrowDownToLine className="h-3.5 w-3.5" /> {t("retract")}
        </Button>
        <Button size="sm" variant={lock ? "default" : "outline"} className="gap-1.5" disabled={dis} onClick={() => setLock((l) => !l)} aria-pressed={lock}>
          {lock ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />} {lock ? t("yawLocked") : t("yawFollow")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={dis} onClick={() => void send({ type: "gimbal_mode", mode: "rc" })}>
          <Crosshair className="h-3.5 w-3.5" /> {t("rcControl")}
        </Button>
        <Button size="sm" variant="ghost" className="col-span-2 gap-1.5" disabled={dis} onClick={() => void send({ type: "roi_none" })}>
          <XCircle className="h-3.5 w-3.5" /> {t("roiNone")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("tips")}</p>
    </div>
  );
}
