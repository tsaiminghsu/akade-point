"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Anchor, ArrowDownToLine, Gauge, Hand, Home, ListChecks, Pause, Play, PlaneTakeoff, Power, RotateCw, ShieldCheck, SkipForward, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODES_BY_TYPE, PX4_MODES } from "@/lib/control-center/vehicles/constants";
import type { CommandRequest } from "@/lib/control-center/vehicles/schemas";
import type { VehicleStateV2, VehicleType } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";
import { SlideToConfirm } from "./SlideToConfirm";

type Pending = { request: CommandRequest; title: string; description: string } | null;

export function ActionsPanel({
  vehicleType,
  state,
  canCommand,
}: {
  vehicleType: VehicleType;
  state: VehicleStateV2 | null;
  canCommand: boolean;
}) {
  const t = useTranslations("Gcs.actions");
  const send = useGcsStore((s) => s.send);
  const px4 = state?.veh?.ap === "px4";
  const modes = px4 ? PX4_MODES : MODES_BY_TYPE[vehicleType];
  const copter = vehicleType === "drone";
  const armed = state?.armed === true;
  const prearmFailing = Boolean(state && (state.health.msgs.length > 0 || state.health.prearm === false));

  const [mode, setMode] = useState<string>("");
  const [takeoffAlt, setTakeoffAlt] = useState("10");
  const [speed, setSpeed] = useState("");
  const [alt, setAlt] = useState("");
  const [seq, setSeq] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [forceText, setForceText] = useState("");

  async function run(request: CommandRequest) {
    const ok = await send(request);
    if (ok) toast.message(t("sent", { command: t(`cmd_${request.type}`) }));
  }

  function confirm(request: CommandRequest, key: string, params: Record<string, string | number> = {}) {
    setPending({ request, title: t(`${key}Title`, params), description: t(`${key}Description`, params) });
  }

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const dis = !canCommand;

  return (
    <div className="space-y-3 text-sm">
      {/* Mode */}
      <div className="flex gap-2">
        <Select value={mode} onValueChange={setMode} disabled={dis}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder={state?.mode ?? t("modePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={dis || !mode} onClick={() => run({ type: "set_mode", mode })}>
          {t("setMode")}
        </Button>
      </div>

      {/* Arm / disarm */}
      {!armed ? (
        <div className="space-y-1">
          <SlideToConfirm label={t("slideToArm")} disabled={dis || prearmFailing} onConfirm={() => run({ type: "arm" })} />
          {prearmFailing && <p className="text-xs text-status-alarm">{t("armBlocked")}</p>}
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" className="flex-1 gap-1.5" disabled={dis} onClick={() => run({ type: "disarm" })}>
            <Power className="h-3.5 w-3.5" /> {t("disarm")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-status-alarm/50 text-status-alarm" disabled={dis} onClick={() => setForceOpen(true)}>
            <TriangleAlert className="h-3.5 w-3.5" /> {t("forceDisarm")}
          </Button>
        </div>
      )}

      {/* Flight */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" className="gap-1.5" disabled={dis} onClick={() => run({ type: "rtl" })}>
          <Home className="h-3.5 w-3.5" /> RTL
        </Button>
        <Button variant="secondary" size="sm" className="gap-1.5" disabled={dis} onClick={() => run({ type: "hold" })}>
          <Hand className="h-3.5 w-3.5" /> {copter ? t("brake") : t("hold")}
        </Button>
        {copter && (
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={dis} onClick={() => run({ type: "land" })}>
            <ArrowDownToLine className="h-3.5 w-3.5" /> {t("land")}
          </Button>
        )}
        <Button variant="secondary" size="sm" className="gap-1.5" disabled={dis} onClick={() => run({ type: "run_prearm" })}>
          <ShieldCheck className="h-3.5 w-3.5" /> {t("prearm")}
        </Button>
      </div>

      {copter && (
        <div className="flex items-center gap-2">
          <Input className="h-8 w-20" inputMode="decimal" value={takeoffAlt} onChange={(e) => setTakeoffAlt(e.target.value)} aria-label={t("takeoffAlt")} />
          <span className="text-xs text-muted-foreground">m</span>
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            disabled={dis || !(num(takeoffAlt) > 0)}
            onClick={() => confirm({ type: "takeoff", alt: num(takeoffAlt) }, "confirmTakeoff", { alt: takeoffAlt })}
          >
            <PlaneTakeoff className="h-3.5 w-3.5" /> {t("takeoff")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center gap-2">
          <Input className="h-8 w-20" inputMode="decimal" placeholder="m/s" value={speed} onChange={(e) => setSpeed(e.target.value)} aria-label={t("speed")} />
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" disabled={dis || !(num(speed) > 0)} onClick={() => run({ type: "change_speed", speed: num(speed) })}>
            <Gauge className="h-3.5 w-3.5" /> {t("changeSpeed")}
          </Button>
        </div>
        {copter && (
          <div className="flex items-center gap-2">
            <Input className="h-8 w-20" inputMode="decimal" placeholder="m" value={alt} onChange={(e) => setAlt(e.target.value)} aria-label={t("alt")} />
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={dis || !(num(alt) >= 0)}
              onClick={() => confirm({ type: "change_alt", alt: num(alt) }, "confirmAlt", { alt })}
            >
              <Anchor className="h-3.5 w-3.5" /> {t("changeAlt")}
            </Button>
          </div>
        )}
      </div>

      {/* Mission */}
      <div className="space-y-2 rounded-md border border-border/60 p-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" /> {t("mission")}
          {state?.wp && <span className="tabular-nums">· {state.wp.cur}/{state.wp.n ?? "—"}</span>}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" className="gap-1.5" disabled={dis} onClick={() => confirm({ type: "mission_start" }, "confirmMissionStart")}>
            <Play className="h-3.5 w-3.5" /> {t("start")}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={dis} onClick={() => run({ type: "mission_pause" })}>
            <Pause className="h-3.5 w-3.5" /> {t("pause")}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={dis} onClick={() => run({ type: "mission_resume" })}>
            <RotateCw className="h-3.5 w-3.5" /> {t("resume")}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input className="h-8 w-20" inputMode="numeric" placeholder="#" value={seq} onChange={(e) => setSeq(e.target.value)} aria-label={t("waypoint")} />
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            disabled={dis || !Number.isInteger(num(seq)) || num(seq) < 0}
            onClick={() => run({ type: "mission_set_current", seq: num(seq) })}
          >
            <SkipForward className="h-3.5 w-3.5" /> {t("setWaypoint")}
          </Button>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 text-muted-foreground"
        disabled={dis || armed}
        onClick={() => confirm({ type: "reboot" }, "confirmReboot")}
      >
        <Power className="h-3.5 w-3.5" /> {t("reboot")}
      </Button>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.title ?? ""}
        description={pending?.description}
        destructive={false}
        onConfirm={() => {
          if (pending) void run(pending.request);
          setPending(null);
        }}
      />

      <Dialog
        open={forceOpen}
        onOpenChange={(o) => {
          setForceOpen(o);
          setForceText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-status-alarm">{t("forceTitle")}</DialogTitle>
            <DialogDescription>{t("forceDescription")}</DialogDescription>
          </DialogHeader>
          <Input value={forceText} onChange={(e) => setForceText(e.target.value)} placeholder="DISARM" autoComplete="off" aria-label={t("forceType")} />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={forceText.trim() !== "DISARM" || dis}
              onClick={() => {
                void run({ type: "disarm", force: true });
                setForceOpen(false);
                setForceText("");
              }}
            >
              {t("forceConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
