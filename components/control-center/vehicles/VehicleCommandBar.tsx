"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, LockOpen, Navigation, Home, Plane, Play, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { MODES_BY_TYPE } from "@/lib/control-center/vehicles/constants";
import type { CommandRequest } from "@/lib/control-center/vehicles/schemas";
import { useVehiclesStore } from "@/store/useVehiclesStore";
import type { Vehicle } from "@/lib/control-center/vehicles/types";

export function VehicleCommandBar({ vehicle }: { vehicle: Vehicle }) {
  const t = useTranslations("VehicleCommands");
  const issueCommand = useVehiclesStore((s) => s.issueCommand);

  const [mode, setMode] = useState(MODES_BY_TYPE[vehicle.type][0]);
  const [confirmArm, setConfirmArm] = useState(false);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [takeoffAlt, setTakeoffAlt] = useState("10");
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoLat, setGotoLat] = useState("");
  const [gotoLon, setGotoLon] = useState("");
  const [gotoAlt, setGotoAlt] = useState("30");

  const offline = vehicle.linkState !== "online";
  const isDrone = vehicle.type === "drone";

  async function send(request: CommandRequest) {
    const cmd = await issueCommand(vehicle.id, request);
    if (cmd) toast.success(`${t(request.type === "set_mode" ? "setMode" : cmdKey(request.type))}`);
  }

  function openGoto() {
    if (vehicle.state) {
      setGotoLat(vehicle.state.pos.lat.toFixed(7));
      setGotoLon(vehicle.state.pos.lon.toFixed(7));
    }
    setGotoOpen(true);
  }

  return (
    <div className="space-y-3">
      {offline && <p className="rounded-md bg-status-offline/10 px-3 py-2 text-xs text-status-offline">{t("disabledOffline")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={() => setConfirmArm(true)}>
          <LockOpen className="h-3.5 w-3.5" /> {t("arm")}
        </Button>
        <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={() => send({ type: "disarm" })}>
          <Lock className="h-3.5 w-3.5" /> {t("disarm")}
        </Button>
        {isDrone && (
          <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={() => setTakeoffOpen(true)}>
            <Plane className="h-3.5 w-3.5" /> {t("takeoff")}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={openGoto}>
          <Navigation className="h-3.5 w-3.5" /> {t("goto")}
        </Button>
        <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={() => send({ type: "rtl" })}>
          <Home className="h-3.5 w-3.5" /> {t("rtl")}
        </Button>
        <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={() => send({ type: "mission_start" })}>
          <Play className="h-3.5 w-3.5" /> {t("missionStart")}
        </Button>
        <Button size="sm" variant="outline" disabled={offline} className="gap-1.5" onClick={() => send({ type: "mission_download" })}>
          <Download className="h-3.5 w-3.5" /> {t("missionDownload")}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES_BY_TYPE[vehicle.type].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={offline} onClick={() => send({ type: "set_mode", mode })}>
          {t("setMode")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmArm}
        onOpenChange={setConfirmArm}
        title={t("confirmArmTitle")}
        description={t("confirmArmDescription")}
        confirmLabel={t("arm")}
        onConfirm={() => send({ type: "arm" })}
      />

      <Dialog open={takeoffOpen} onOpenChange={setTakeoffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTakeoffTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmTakeoffDescription")}</p>
          <div className="space-y-1.5">
            <Label>{t("altLabel")}</Label>
            <Input type="number" value={takeoffAlt} onChange={(e) => setTakeoffAlt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const alt = Number(takeoffAlt);
                if (alt > 0) {
                  void send({ type: "takeoff", alt });
                  setTakeoffOpen(false);
                }
              }}
            >
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gotoOpen} onOpenChange={setGotoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("goto")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>{t("latLabel")}</Label>
              <Input value={gotoLat} onChange={(e) => setGotoLat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("lonLabel")}</Label>
              <Input value={gotoLon} onChange={(e) => setGotoLon(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("altLabel")}</Label>
              <Input type="number" value={gotoAlt} onChange={(e) => setGotoAlt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const lat = Number(gotoLat);
                const lon = Number(gotoLon);
                const alt = Number(gotoAlt);
                if (!Number.isNaN(lat) && !Number.isNaN(lon) && !Number.isNaN(alt)) {
                  void send({ type: "goto", lat, lon, alt });
                  setGotoOpen(false);
                }
              }}
            >
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cmdKey(type: string): "arm" | "disarm" | "takeoff" | "goto" | "rtl" | "missionStart" | "missionDownload" | "setMode" {
  switch (type) {
    case "arm":
      return "arm";
    case "disarm":
      return "disarm";
    case "takeoff":
      return "takeoff";
    case "goto":
      return "goto";
    case "rtl":
      return "rtl";
    case "mission_start":
      return "missionStart";
    case "mission_download":
      return "missionDownload";
    default:
      return "setMode";
  }
}
