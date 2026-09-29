"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftRight, Layers2, X } from "lucide-react";
import { Circle, CircleMarker } from "react-leaflet";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aimFromClick } from "@/lib/control-center/vehicles/gcs/aim";
import { missionAction, stripButtons, type StripButton } from "@/lib/control-center/vehicles/gcs/flyView";
import { distanceM, formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import type { CommandRequest } from "@/lib/control-center/vehicles/schemas";
import { cn } from "@/lib/utils";
import { useGcsStore } from "@/store/useGcsStore";
import { GcsMap, type MapAction } from "../map/GcsMap";
import { ActionsPanel } from "./ActionsPanel";
import { AttitudeCompass } from "./AttitudeCompass";
import { CameraPanel } from "./CameraPanel";
import { FlyToolStrip } from "./FlyToolStrip";
import { FollowMePanel } from "./FollowMePanel";
import { GimbalPanel } from "./GimbalPanel";
import { GraphPanel } from "./GraphPanel";
import { GuidedConfirm, type GuidedRequest } from "./GuidedConfirm";
import { Hud } from "./Hud";
import { CommandLog, MessagesPanel } from "./MessagesPanel";
import { PayloadPanel } from "./PayloadPanel";
import { QuickPanel } from "./QuickPanel";
import { RoverDrivePad } from "./RoverDrivePad";
import { ValuesBar } from "./ValuesBar";
import { VideoPanel } from "./VideoPanel";

/** Height of Leaflet's attribution line, which overlays must leave visible. */
const ATTRIBUTION = 22;

function useSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * QGroundControl's Fly view: the map fills the screen and everything else
 * floats on it. Guided actions run down the left edge and confirm with a
 * slider at the top; the values bar and the attitude/compass instrument sit
 * along the bottom; video swaps with the map. The remaining tools (actions,
 * quick values, HUD, messages, graphs, gimbal, camera, payload, drive) open
 * in a panel: docked on the right on wide screens, a bottom sheet on phones.
 */
export function FlightDataView({ canCommand }: { canCommand: boolean }) {
  const t = useTranslations("Gcs");
  const tf = useTranslations("Gcs.flyView");
  const ta = useTranslations("Gcs.actions");
  const vehicle = useGcsStore((s) => s.vehicle);
  const state = useGcsStore((s) => s.state);
  const stale = useGcsStore((s) => s.stale);
  const link = useGcsStore((s) => s.link);
  const messages = useGcsStore((s) => s.messages);
  const commands = useGcsStore((s) => s.commands);
  const samples = useGcsStore((s) => s.samples);
  const trail = useGcsStore((s) => s.trail);
  const now = useGcsStore((s) => s.now);
  const me = useGcsStore((s) => s.me);
  const photoPoints = useGcsStore((s) => s.photoPoints);
  const send = useGcsStore((s) => s.send);

  const [guided, setGuided] = useState<GuidedRequest | null>(null);
  const [target, setTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [main, setMain] = useState<"map" | "video">("map");
  const [hudOnVideo, setHudOnVideo] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(areaRef);

  const rover = vehicle?.type === "rover";
  const hasVideo = Boolean(vehicle?.videoUrl);
  const hasGimbal = Boolean(state?.caps.includes("gimbal") || state?.mount);
  const hasPayload = Boolean(state?.caps.includes("payload") || state?.payload);
  const hasCamera = Boolean(state?.caps.includes("camera") || state?.camera);
  const directControl = link.direct.status === "open" && link.direct.scope === "control";

  // Phone-sized map: smaller instrument, two-column values, no picture-in-picture.
  const narrow = w > 0 && w < 640;
  const instrument = narrow ? 112 : 150;
  const pip = hasVideo && !narrow;
  const buttons = stripButtons(state, rover, stale);
  const stripCount = buttons.length + 1 + (hasVideo && !pip ? 1 : 0);
  // Labelled buttons are 40 px (phones) / 48 px tall; drop the labels before the strip would run off the map.
  const stripCompact = h > 0 && stripCount * (narrow ? 42 : 50) + 8 > h - ATTRIBUTION - 8;
  const valuesRoom = w - (narrow ? 62 : 72) - 8 - instrument - (pip ? 216 : 0) - 16;
  const valuesCols: 2 | 3 | 4 = valuesRoom >= 480 ? 4 : valuesRoom >= 360 ? 3 : 2;

  const lastMissionCmd = commands.find((c) => c.status === "acked" && (c.type === "mission_start" || c.type === "mission_pause" || c.type === "mission_resume"))?.type ?? null;
  const mission = missionAction(state, lastMissionCmd);
  const missionLabel = mission === "missionPause" ? tf("g_missionPause") : mission === "missionResume" ? tf("g_missionResume") : undefined;
  const blockedBy = state && (state.health.msgs.length > 0 || state.health.prearm === false) ? (state.health.msgs[0] ?? "PreArm") : null;

  const hudLabels = useMemo(
    () => ({
      linkLost: t("hud.linkLost"),
      noData: t("hud.noData"),
      noAttitude: t("hud.noAttitude"),
      armed: t("hud.armed"),
      disarmed: t("hud.disarmed"),
      fcLost: t("hud.fcLost"),
    }),
    [t]
  );

  function onStrip(b: StripButton) {
    if (!b.enabled) {
      toast.message(tf("unavailable"));
      return;
    }
    const kind = b.kind === "mission" ? mission : b.kind;
    setGuided({ kind, seq: kind === "missionStart" ? state?.wp?.cur : undefined, alt: kind === "takeoff" ? 10 : undefined });
  }

  function onMapAction(a: MapAction) {
    if (a.kind === "flyTo") {
      const dist = state?.pos ? formatDistance(distanceM(state.pos.lat, state.pos.lon, a.lat, a.lon)) : undefined;
      setGuided({ kind: "flyTo", at: { lat: a.lat, lon: a.lon }, dist, alt: Math.max(5, Math.round(state?.pos?.rel ?? 10)) });
    } else if (a.kind === "setHome") {
      setGuided({ kind: "setHome", at: { lat: a.lat, lon: a.lon } });
    } else if (a.kind === "lookAt") {
      // Point the camera at a spot on the ground (relative altitude 0 = home level).
      void send({ type: "roi_location", lat: a.lat, lon: a.lon, alt: 0 });
    }
  }

  function requestFor(g: GuidedRequest, alt: number | null): CommandRequest {
    const at = g.at ?? { lat: 0, lon: 0 };
    switch (g.kind) {
      case "arm":
        return { type: "arm" };
      case "disarm":
        return { type: "disarm" };
      case "takeoff":
        return { type: "takeoff", alt: alt ?? 10 };
      case "land":
        return { type: "land" };
      case "rtl":
        return { type: "rtl" };
      case "pause":
        return { type: "hold" };
      case "missionStart":
        return { type: "mission_start" };
      case "missionResume":
        return { type: "mission_resume" };
      case "missionPause":
        return { type: "mission_pause" };
      case "flyTo":
        return { type: "goto", lat: at.lat, lon: at.lon, alt: rover ? 0 : (alt ?? 10) };
      case "setHome":
        return { type: "set_home", lat: at.lat, lon: at.lon, alt: state?.home?.alt ?? state?.pos?.alt ?? 0 };
    }
  }

  async function runGuided(alt: number | null) {
    const g = guided;
    setGuided(null);
    if (!g) return;
    const request = requestFor(g, alt);
    if (!(await send(request))) return;
    toast.message(ta("sent", { command: ta(`cmd_${request.type}`) }));
    if (g.kind === "flyTo" && g.at) setTarget(g.at);
  }

  const map = (
    <GcsMap state={state} trail={trail} target={target} canCommand={canCommand} onAction={onMapAction} vehicleLabel={vehicle?.name}>
      {photoPoints.map((p) => (
        <CircleMarker key={p.idx} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: "#fff", weight: 1, fillColor: "#a855f7", fillOpacity: 0.9 }} />
      ))}
      {me && (
        <>
          <Circle center={[me.lat, me.lon]} radius={me.accuracy} pathOptions={{ color: "#3b82f6", weight: 1, fillOpacity: 0.1 }} />
          <CircleMarker center={[me.lat, me.lon]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }} />
        </>
      )}
    </GcsMap>
  );

  const video = hasVideo ? (
    <VideoPanel
      url={vehicle!.videoUrl}
      state={state}
      canCommand={canCommand}
      overlay={hudOnVideo ? <Hud state={state} stale={stale} everReceived={state !== null} labels={hudLabels} transparent className="h-full w-full" /> : undefined}
      onClickAim={
        hasGimbal && canCommand && state?.mount
          ? (nx, ny) => {
              const { pitch, yaw } = aimFromClick(nx, ny, state.mount!);
              void send({ type: "gimbal_pitchyaw", pitch, yaw });
            }
          : undefined
      }
    />
  ) : null;

  const tabs: { value: string; label: string; show: boolean }[] = [
    { value: "actions", label: t("tabs.actions"), show: true },
    { value: "quick", label: t("tabs.quick"), show: true },
    { value: "hud", label: tf("hudTab"), show: true },
    { value: "messages", label: t("tabs.messages"), show: true },
    { value: "graph", label: t("tabs.graph"), show: true },
    { value: "gimbal", label: t("tabs.gimbal"), show: hasGimbal },
    { value: "camera", label: t("tabs.camera"), show: hasCamera },
    { value: "payload", label: t("tabs.payload"), show: hasPayload },
    { value: "drive", label: t("tabs.drive"), show: rover },
  ];

  return (
    <div className="relative flex h-full min-h-0 gap-3">
      <div ref={areaRef} className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-muted">
        <div className="absolute inset-0">{main === "video" && video ? video : map}</div>

        {main === "video" && (
          <Button
            size="sm"
            variant={hudOnVideo ? "secondary" : "ghost"}
            className="absolute right-2 top-2 z-10 h-7 bg-background/85 text-xs shadow"
            onClick={() => setHudOnVideo((v) => !v)}
            aria-pressed={hudOnVideo}
            title={tf("hudOnVideo")}
          >
            HUD
          </Button>
        )}

        <div className="absolute left-2 top-2 z-10">
          <FlyToolStrip
            buttons={buttons}
            onAction={onStrip}
            missionLabel={missionLabel}
            missionPauses={mission === "missionPause"}
            compact={stripCompact}
            onMore={() => setPanel((p) => (p ? null : "actions"))}
            moreOpen={panel !== null}
            video={hasVideo && !pip ? { main, toggle: () => setMain((m) => (m === "map" ? "video" : "map")) } : undefined}
          />
        </div>

        {guided && (
          <div className={cn("absolute z-20", narrow ? "left-[62px] right-12 top-2" : "left-1/2 top-3 w-[400px] max-w-[calc(100%-160px)] -translate-x-1/2")}>
            <GuidedConfirm request={guided} rover={rover} canCommand={canCommand} blockedBy={blockedBy} onConfirm={(alt) => void runGuided(alt)} onCancel={() => setGuided(null)} />
          </div>
        )}

        <div className={cn("pointer-events-none absolute right-2 z-10 flex items-end gap-2", narrow ? "left-[62px]" : "left-[72px]")} style={{ bottom: ATTRIBUTION }}>
          {pip && (
            <div className="pointer-events-auto relative h-32 w-52 shrink-0 overflow-hidden rounded-md border border-border shadow-lg">
              {main === "map" ? (
                <VideoPanel url={vehicle!.videoUrl} state={state} canCommand={canCommand} compact />
              ) : (
                <GcsMap state={state} trail={trail} target={target} canCommand={false} contextMenu={false} />
              )}
              <Button
                size="icon-sm"
                variant="secondary"
                className="absolute right-1 top-1 z-[1001] h-6 w-6 shadow"
                onClick={() => setMain((m) => (m === "map" ? "video" : "map"))}
                aria-label={main === "map" ? tf("swapVideo") : tf("swapMap")}
                title={main === "map" ? tf("swapVideo") : tf("swapMap")}
              >
                <ArrowLeftRight className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className={cn("flex min-w-0 flex-1", narrow ? "justify-start" : "justify-center")}>
            <div className="pointer-events-auto max-w-full">
              <ValuesBar state={state} stale={stale} family={rover ? "rover" : "copter"} columns={valuesCols} />
            </div>
          </div>
          <div className="pointer-events-auto shrink-0" style={{ width: instrument, height: instrument }}>
            <AttitudeCompass state={state} stale={stale} label={tf("instrument")} />
          </div>
        </div>
      </div>

      {panel && (
        <aside
          className="absolute inset-x-0 bottom-0 z-30 flex h-[62%] flex-col rounded-t-xl border border-border bg-background shadow-2xl lg:static lg:z-auto lg:h-auto lg:w-[360px] lg:shrink-0 lg:rounded-md lg:shadow-none"
          aria-label={tf("panel")}
        >
          <Tabs value={panel} onValueChange={setPanel} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start gap-1 border-b border-border p-1.5">
              <Layers2 className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <TabsList className="h-auto min-w-0 flex-1 flex-wrap justify-start gap-0.5 bg-transparent p-0">
                {tabs
                  .filter((x) => x.show)
                  .map((x) => (
                    <TabsTrigger key={x.value} value={x.value} className="px-2 py-1 text-xs data-[state=active]:bg-muted">
                      {x.value === "messages" && state && state.health.msgs.length > 0 && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-status-alarm" />}
                      {x.label}
                    </TabsTrigger>
                  ))}
              </TabsList>
              <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={() => setPanel(null)} aria-label={tf("panelClose")}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
              <TabsContent value="actions" className="mt-0 space-y-4">
                {vehicle && <ActionsPanel vehicleType={vehicle.type} state={state} canCommand={canCommand} />}
                {vehicle && <FollowMePanel state={state} canCommand={canCommand} rover={rover} />}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{t("commands.title")}</p>
                  <CommandLog commands={commands} />
                </div>
              </TabsContent>
              <TabsContent value="quick" className="mt-0">
                <QuickPanel state={state} stale={stale} family={rover ? "rover" : "copter"} />
              </TabsContent>
              <TabsContent value="hud" className="mt-0">
                <div className="mx-auto aspect-[4/3] w-full max-w-md">
                  <Hud state={state} stale={stale} everReceived={state !== null} labels={hudLabels} />
                </div>
              </TabsContent>
              <TabsContent value="messages" className="mt-0 h-full">
                <MessagesPanel messages={messages} state={state} />
              </TabsContent>
              <TabsContent value="graph" className="mt-0 h-full">
                <GraphPanel samples={samples} now={now} />
              </TabsContent>
              {hasGimbal && (
                <TabsContent value="gimbal" className="mt-0">
                  <GimbalPanel state={state} canCommand={canCommand} directOpen={directControl} />
                </TabsContent>
              )}
              {hasCamera && (
                <TabsContent value="camera" className="mt-0">
                  <CameraPanel state={state} canCommand={canCommand} />
                </TabsContent>
              )}
              {hasPayload && (
                <TabsContent value="payload" className="mt-0">
                  <PayloadPanel state={state} canCommand={canCommand} />
                </TabsContent>
              )}
              {rover && (
                <TabsContent value="drive" className="mt-0">
                  <RoverDrivePad state={state} canCommand={canCommand} directOpen={directControl} />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </aside>
      )}
    </div>
  );
}
