"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Car, Hand, Plane, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/control-center/shared/ErrorState";
import { useGcsStore } from "@/store/useGcsStore";
import { LinkStateBadge } from "../LinkStateBadge";
import { FlightDataView } from "./flight/FlightDataView";
import { FlightPlanView } from "./plan/FlightPlanView";
import { LogsView } from "./logs/LogsView";
import { ReplayView } from "./replay/ReplayView";
import { ParamsView } from "./params/ParamsView";
import { StatusBar } from "./flight/StatusBar";
import { VehicleSetupPanel } from "./setup/VehicleSetupPanel";
import { useVoiceAlerts } from "./useVoiceAlerts";

const VOICE_KEY = "gcs.voice";

/** The per-vehicle ground station: Flight Data / Flight Plan / Setup. */
export default function GcsPageContent({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("Gcs");
  const open = useGcsStore((s) => s.open);
  const close = useGcsStore((s) => s.close);
  const vehicle = useGcsStore((s) => s.vehicle);
  const state = useGcsStore((s) => s.state);
  const stale = useGcsStore((s) => s.stale);
  const link = useGcsStore((s) => s.link);
  const control = useGcsStore((s) => s.control);
  const setControl = useGcsStore((s) => s.setControl);
  const [voice, setVoice] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    open(vehicleId);
    return () => close();
  }, [vehicleId, open, close]);

  useEffect(() => {
    // Voice needs a click to start (browser autoplay rules); remember the
    // choice but still wait for this session's first click to speak.
    try {
      setVoice(localStorage.getItem(VOICE_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (vehicle) return;
    const id = setTimeout(() => {
      if (!useGcsStore.getState().vehicle && useGcsStore.getState().link.cloud.error) setNotFound(true);
    }, 6000);
    return () => clearTimeout(id);
  }, [vehicle]);

  useVoiceAlerts(voice);

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    try {
      localStorage.setItem(VOICE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(t("alerts.voiceOn"));
      window.speechSynthesis.speak(u);
    }
  }

  // Commands need: control taken, fresh data, and — on the direct link — a control ticket.
  const directControl = link.active !== "direct" || link.direct.scope === "control";
  const canCommand = control && !stale && link.active !== "none" && directControl;

  if (notFound && !vehicle) {
    return (
      <div className="p-6">
        <ErrorState title={t("notFound")} />
      </div>
    );
  }

  const TypeIcon = vehicle?.type === "rover" ? Car : Plane;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="icon-sm" aria-label={t("back")}>
            <Link href="/iot-control-center/vehicles">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
            <TypeIcon className="h-4 w-4 text-primary" /> {vehicle?.name ?? "…"}
          </h1>
          {vehicle && <LinkStateBadge state={vehicle.linkState} />}
          {state?.mode && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">{state.mode}</span>}
          {state?.armed != null && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${state.armed ? "bg-status-alarm/15 text-status-alarm" : "bg-status-online/15 text-status-online"}`}>
              {state.armed ? t("hud.armed") : t("hud.disarmed")}
            </span>
          )}
          {state?.veh?.ap === "px4" && <span className="rounded bg-status-warning/15 px-1.5 py-0.5 text-xs text-status-warning">{t("px4Basic")}</span>}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Hand className={`h-3.5 w-3.5 ${control ? "text-status-warning" : "text-muted-foreground"}`} />
              {t("control")}
              <Switch checked={control} onCheckedChange={setControl} aria-label={t("control")} />
            </label>
            <Button size="sm" variant={voice ? "secondary" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={toggleVoice} aria-pressed={voice}>
              {voice ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {voice ? t("voiceOn") : t("voiceOff")}
            </Button>
          </div>
        </div>
        <StatusBar state={state} stale={stale} link={link} />
        {!control && <p className="text-xs text-muted-foreground">{t("controlHint")}</p>}
        {control && link.active === "cloud" && <p className="text-xs text-status-warning">{t("cloudControlNote")}</p>}
      </header>

      <Tabs defaultValue="flight" className="flex flex-col lg:min-h-0 lg:flex-1">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="flight">{t("tabs.flight")}</TabsTrigger>
          {state?.caps.includes("mission") !== false && <TabsTrigger value="plan">{t("tabs.plan")}</TabsTrigger>}
          {state?.caps.includes("params") !== false && <TabsTrigger value="params">{t("tabs.params")}</TabsTrigger>}
          <TabsTrigger value="logs">{t("tabs.logs")}</TabsTrigger>
          <TabsTrigger value="replay">{t("tabs.replay")}</TabsTrigger>
          <TabsTrigger value="setup">{t("tabs.setup")}</TabsTrigger>
        </TabsList>
        <TabsContent value="flight" className="mt-3 lg:min-h-0 lg:flex-1">
          <FlightDataView canCommand={canCommand} />
        </TabsContent>
        <TabsContent value="plan" className="mt-3 lg:min-h-0 lg:flex-1">
          {vehicle && <FlightPlanView vehicle={vehicle} canCommand={canCommand} />}
        </TabsContent>
        <TabsContent value="params" className="mt-3 lg:min-h-0 lg:flex-1">
          {vehicle && <ParamsView vehicle={vehicle} canCommand={canCommand} />}
        </TabsContent>
        <TabsContent value="logs" className="mt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {vehicle && <LogsView vehicle={vehicle} canCommand={canCommand} />}
        </TabsContent>
        <TabsContent value="replay" className="mt-3 lg:min-h-0 lg:flex-1">
          {vehicle && <ReplayView vehicle={vehicle} />}
        </TabsContent>
        <TabsContent value="setup" className="mt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {vehicle && <VehicleSetupPanel vehicle={vehicle} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
