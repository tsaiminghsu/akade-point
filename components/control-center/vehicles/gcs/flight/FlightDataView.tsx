"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Map as MapIcon, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { distanceM, formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import { useGcsStore } from "@/store/useGcsStore";
import { GcsMap, type MapAction } from "../map/GcsMap";
import { ActionsPanel } from "./ActionsPanel";
import { GraphPanel } from "./GraphPanel";
import { Hud } from "./Hud";
import { CommandLog, MessagesPanel } from "./MessagesPanel";
import { QuickPanel } from "./QuickPanel";
import { RoverDrivePad } from "./RoverDrivePad";
import { VideoPanel } from "./VideoPanel";

/**
 * Mission Planner's Flight Data screen: HUD over a tabbed panel on the left,
 * the map on the right (stacked on narrow screens).
 */
export function FlightDataView({ canCommand }: { canCommand: boolean }) {
  const t = useTranslations("Gcs");
  const vehicle = useGcsStore((s) => s.vehicle);
  const state = useGcsStore((s) => s.state);
  const stale = useGcsStore((s) => s.stale);
  const link = useGcsStore((s) => s.link);
  const messages = useGcsStore((s) => s.messages);
  const commands = useGcsStore((s) => s.commands);
  const samples = useGcsStore((s) => s.samples);
  const trail = useGcsStore((s) => s.trail);
  const now = useGcsStore((s) => s.now);
  const send = useGcsStore((s) => s.send);

  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number } | null>(null);
  const [flyAlt, setFlyAlt] = useState("");
  const [homeAt, setHomeAt] = useState<{ lat: number; lon: number } | null>(null);
  const [target, setTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [main, setMain] = useState<"map" | "video">("map");
  const [hudOnVideo, setHudOnVideo] = useState(true);
  const hasVideo = Boolean(vehicle?.videoUrl);

  const rover = vehicle?.type === "rover";
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

  function onMapAction(a: MapAction) {
    if (a.kind === "flyTo") {
      setFlyAlt(rover ? "0" : String(Math.max(5, Math.round(state?.pos?.rel ?? 10))));
      setFlyTo({ lat: a.lat, lon: a.lon });
    } else if (a.kind === "setHome") {
      setHomeAt({ lat: a.lat, lon: a.lon });
    }
  }

  const flyDist = flyTo && state?.pos ? formatDistance(distanceM(state.pos.lat, state.pos.lon, flyTo.lat, flyTo.lon)) : null;
  const altNum = Number(flyAlt);

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:flex-row">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:w-[400px] lg:shrink-0">
        <div className="aspect-[4/3] w-full shrink-0">
          <Hud state={state} stale={stale} everReceived={state !== null} labels={hudLabels} />
        </div>
        <Tabs defaultValue="quick" className="flex flex-col lg:min-h-0 lg:flex-1">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="quick" className="flex-1 text-xs">
              {t("tabs.quick")}
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1 text-xs">
              {t("tabs.actions")}
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex-1 text-xs">
              {t("tabs.messages")}
              {state && state.health.msgs.length > 0 && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-status-alarm" />}
            </TabsTrigger>
            <TabsTrigger value="graph" className="flex-1 text-xs">
              {t("tabs.graph")}
            </TabsTrigger>
            {rover && (
              <TabsTrigger value="drive" className="flex-1 text-xs">
                {t("tabs.drive")}
              </TabsTrigger>
            )}
          </TabsList>
          <div className="min-h-[260px] flex-1 overflow-y-auto overflow-x-hidden pt-2 lg:min-h-0">
            <TabsContent value="quick" className="mt-0">
              <QuickPanel state={state} stale={stale} />
            </TabsContent>
            <TabsContent value="actions" className="mt-0 space-y-4">
              {vehicle && <ActionsPanel vehicleType={vehicle.type} state={state} canCommand={canCommand} />}
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("commands.title")}</p>
                <CommandLog commands={commands} />
              </div>
            </TabsContent>
            <TabsContent value="messages" className="mt-0 h-full">
              <MessagesPanel messages={messages} state={state} />
            </TabsContent>
            <TabsContent value="graph" className="mt-0 h-full">
              <GraphPanel samples={samples} now={now} />
            </TabsContent>
            {rover && (
              <TabsContent value="drive" className="mt-0">
                <RoverDrivePad state={state} canCommand={canCommand} directOpen={link.direct.status === "open" && link.direct.scope === "control"} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>

      <div className="relative h-[60vh] min-h-[360px] lg:h-auto lg:flex-1">
        {main === "video" && hasVideo ? (
          <VideoPanel
            url={vehicle!.videoUrl}
            state={state}
            canCommand={canCommand}
            overlay={hudOnVideo ? <Hud state={state} stale={stale} everReceived={state !== null} labels={hudLabels} transparent className="h-full w-full" /> : undefined}
          />
        ) : (
          <GcsMap state={state} trail={trail} target={target} canCommand={canCommand} onAction={onMapAction} vehicleLabel={vehicle?.name} />
        )}
        {hasVideo && (
          <>
            {/* Picture-in-picture of whichever view is not main. */}
            <div className="absolute bottom-3 left-3 z-[1001] hidden h-36 w-56 overflow-hidden rounded-md border border-border shadow-lg sm:block">
              {main === "map" ? (
                <VideoPanel url={vehicle!.videoUrl} state={state} canCommand={canCommand} compact />
              ) : (
                <GcsMap state={state} trail={trail} target={target} canCommand={false} contextMenu={false} />
              )}
            </div>
            <div className="absolute left-1/2 top-3 z-[1001] flex -translate-x-1/2 gap-1 rounded-md bg-background/85 p-1 shadow">
              <Button size="sm" variant={main === "map" ? "secondary" : "ghost"} className="h-7 gap-1 text-xs" onClick={() => setMain("map")}>
                <MapIcon className="h-3.5 w-3.5" /> {t("video.map")}
              </Button>
              <Button size="sm" variant={main === "video" ? "secondary" : "ghost"} className="h-7 gap-1 text-xs" onClick={() => setMain("video")}>
                <Video className="h-3.5 w-3.5" /> {t("video.video")}
              </Button>
              {main === "video" && (
                <Button size="sm" variant={hudOnVideo ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setHudOnVideo((v) => !v)} aria-pressed={hudOnVideo}>
                  HUD
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={flyTo !== null} onOpenChange={(o) => !o && setFlyTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rover ? t("fly.driveTitle") : t("fly.title")}</DialogTitle>
            <DialogDescription>
              {flyTo && `${flyTo.lat.toFixed(6)}, ${flyTo.lon.toFixed(6)}`}
              {flyDist && ` · ${flyDist}`}
              <br />
              {t("fly.guidedNote")}
            </DialogDescription>
          </DialogHeader>
          {!rover && (
            <div className="space-y-1.5">
              <Label htmlFor="fly-alt">{t("fly.alt")}</Label>
              <Input id="fly-alt" inputMode="decimal" value={flyAlt} onChange={(e) => setFlyAlt(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFlyTo(null)}>
              {t("fly.cancel")}
            </Button>
            <Button
              disabled={!canCommand || !Number.isFinite(altNum) || (!rover && altNum <= 0)}
              onClick={async () => {
                if (!flyTo) return;
                const ok = await send({ type: "goto", lat: flyTo.lat, lon: flyTo.lon, alt: rover ? 0 : altNum });
                if (ok) setTarget(flyTo);
                setFlyTo(null);
              }}
            >
              {rover ? t("fly.driveConfirm") : t("fly.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={homeAt !== null}
        onOpenChange={(o) => !o && setHomeAt(null)}
        title={t("home.title")}
        description={homeAt ? t("home.description", { lat: homeAt.lat.toFixed(6), lon: homeAt.lon.toFixed(6) }) : undefined}
        destructive={false}
        onConfirm={() => {
          if (homeAt) void send({ type: "set_home", lat: homeAt.lat, lon: homeAt.lon, alt: state?.home?.alt ?? state?.pos?.alt ?? 0 });
          setHomeAt(null);
        }}
      />
    </div>
  );
}
