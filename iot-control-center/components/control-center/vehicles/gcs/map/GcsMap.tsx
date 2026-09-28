"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Crosshair, Download, Home, Layers, LocateFixed, Navigation, Plane, Ruler, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { bearingDeg, distanceM, formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import { DEFAULT_LAYER_ID, TILE_LAYERS, layerById, tilesForBounds } from "@/lib/control-center/vehicles/gcs/tiles";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { AdsbLayer } from "./AdsbLayer";
import { AutoResize, FollowView, InitialView, VehicleMarker, homeIcon, targetIcon } from "./mapParts";

const LAYER_KEY = "gcs.map.layer";
const TRAFFIC_KEY = "gcs.map.traffic";
const TAIPEI: [number, number] = [25.033, 121.5654];
const MENU_W = 184;
const MENU_H = 170;

export interface MapAction {
  kind: "flyTo" | "setHome" | "lookAt";
  lat: number;
  lon: number;
}

interface MenuState {
  lat: number;
  lon: number;
  x: number;
  y: number;
}

function readLayer(): string {
  try {
    return localStorage.getItem(LAYER_KEY) ?? DEFAULT_LAYER_ID;
  } catch {
    return DEFAULT_LAYER_ID;
  }
}

function ClickCatcher({
  onMenu,
  onClose,
  onClick,
}: {
  onMenu: ((m: MenuState) => void) | null;
  onClose: () => void;
  onClick?: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    contextmenu(e) {
      if (onMenu) onMenu({ lat: e.latlng.lat, lon: e.latlng.lng, x: e.containerPoint.x, y: e.containerPoint.y });
    },
    click(e) {
      onClose();
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
    movestart: onClose,
  });
  return null;
}

function PrefetchButton({ layerId }: { layerId: string }) {
  const t = useTranslations("Gcs.map");
  const map = useMap();
  const layer = layerById(layerId);
  const [busy, setBusy] = useState(false);

  async function prefetch() {
    const reg = await navigator.serviceWorker?.getRegistration("/iot-control-center/vehicles/");
    const sw = reg?.active;
    if (!sw) {
      toast.error(t("prefetchNoWorker"));
      return;
    }
    const b = map.getBounds();
    const z = map.getZoom();
    const urls = tilesForBounds(layer, { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }, Math.max(1, z - 2), Math.min(z + 3, layer.maxNativeZoom));
    if (!urls) {
      toast.error(t("prefetchTooBig"));
      return;
    }
    setBusy(true);
    const channel = new MessageChannel();
    const id = toast.loading(t("prefetchProgress", { done: 0, total: urls.length }));
    channel.port1.onmessage = (ev) => {
      const { done, total, failed, finished } = ev.data ?? {};
      if (finished) {
        setBusy(false);
        toast.success(t("prefetchDone", { total, failed }), { id });
      } else {
        toast.loading(t("prefetchProgress", { done, total }), { id });
      }
    };
    sw.postMessage({ type: "prefetch", urls }, [channel.port2]);
  }

  if (!layer.prefetch) return null;
  return (
    <Button size="icon-sm" variant="secondary" className="shadow" disabled={busy} onClick={prefetch} aria-label={t("prefetch")} title={t("prefetch")}>
      <Download className="h-3.5 w-3.5" />
    </Button>
  );
}

export function GcsMap({
  state,
  trail,
  target,
  canCommand,
  onAction,
  onMapClick,
  contextMenu = true,
  follow: followInitial = true,
  children,
  vehicleLabel,
  cursor,
}: {
  state: VehicleStateV2 | null;
  trail: [number, number][];
  target: { lat: number; lon: number } | null;
  canCommand: boolean;
  onAction?: (a: MapAction) => void;
  /** left click on empty map (plan editing) */
  onMapClick?: (lat: number, lon: number) => void;
  contextMenu?: boolean;
  follow?: boolean;
  children?: React.ReactNode;
  vehicleLabel?: string;
  /** CSS cursor over the map, e.g. "crosshair" while adding points */
  cursor?: string;
}) {
  const t = useTranslations("Gcs.map");
  const [layerId, setLayerId] = useState(DEFAULT_LAYER_ID);
  const [follow, setFollow] = useState(followInitial);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [measure, setMeasure] = useState<{ lat: number; lon: number } | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLayerId(readLayer()), []);
  useEffect(() => {
    try {
      setShowTraffic(localStorage.getItem(TRAFFIC_KEY) !== "0");
    } catch {
      /* private mode */
    }
  }, []);

  function toggleTraffic() {
    setShowTraffic((on) => {
      try {
        localStorage.setItem(TRAFFIC_KEY, on ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !on;
    });
  }
  useEffect(() => {
    // Cache tiles for offline use; scoped to the vehicles pages only.
    navigator.serviceWorker?.register("/tile-sw.js", { scope: "/iot-control-center/vehicles/" }).catch(() => undefined);
  }, []);

  const layer = layerById(layerId);
  const pos = state?.pos ?? null;
  const home = state?.home ?? null;
  const cls = state?.veh?.cls ?? "other";

  const measureInfo = useMemo(() => {
    if (!measure || !pos) return null;
    return {
      dist: formatDistance(distanceM(pos.lat, pos.lon, measure.lat, measure.lon)),
      brg: Math.round(bearingDeg(pos.lat, pos.lon, measure.lat, measure.lon)),
    };
  }, [measure, pos]);

  function chooseLayer(id: string) {
    setLayerId(id);
    try {
      localStorage.setItem(LAYER_KEY, id);
    } catch {
      /* private mode */
    }
  }

  function act(kind: MapAction["kind"]) {
    if (!menu) return;
    onAction?.({ kind, lat: menu.lat, lon: menu.lon });
    setMenu(null);
  }

  return (
    <div ref={boxRef} className="gcs-map relative h-full w-full overflow-hidden rounded-md" style={cursor ? ({ "--gcs-cursor": cursor } as React.CSSProperties) : undefined} data-cursor={cursor ? "" : undefined}>
      <MapContainer center={pos ? [pos.lat, pos.lon] : TAIPEI} zoom={pos ? 17 : 12} maxZoom={21} className="h-full w-full" zoomControl>
        <TileLayer key={layer.id} url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} maxNativeZoom={layer.maxNativeZoom} crossOrigin="anonymous" />
        <AutoResize />
        <InitialView lat={pos?.lat ?? null} lon={pos?.lon ?? null} />
        <FollowView lat={pos?.lat ?? null} lon={pos?.lon ?? null} enabled={follow} />
        <ClickCatcher onMenu={contextMenu ? setMenu : null} onClose={() => setMenu(null)} onClick={onMapClick} />
        {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: "#f97316", weight: 2, opacity: 0.85 }} />}
        {home && <Marker position={[home.lat, home.lon]} icon={homeIcon()} />}
        {target && <Marker position={[target.lat, target.lon]} icon={targetIcon()} />}
        {pos && target && <Polyline positions={[[pos.lat, pos.lon], [target.lat, target.lon]]} pathOptions={{ color: "#e11d48", weight: 2, dashArray: "6 6" }} />}
        {pos && measure && <Polyline positions={[[pos.lat, pos.lon], [measure.lat, measure.lon]]} pathOptions={{ color: "#facc15", weight: 2, dashArray: "4 4" }} />}
        {showTraffic && <AdsbLayer targets={state?.adsb} />}
        {pos && <VehicleMarker lat={pos.lat} lon={pos.lon} heading={state?.hdg ?? state?.att?.y ?? null} cls={cls} label={vehicleLabel} />}
        {children}
        <div className="leaflet-top leaflet-right">
          <div className="leaflet-control flex flex-col gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="secondary" className="shadow" aria-label={t("layers")} title={t("layers")}>
                  <Layers className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={layerId} onValueChange={chooseLayer}>
                  {TILE_LAYERS.map((l) => (
                    <DropdownMenuRadioItem key={l.id} value={l.id}>
                      {t(`layers_${l.labelKey}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon-sm"
              variant={follow ? "default" : "secondary"}
              className="shadow"
              onClick={() => setFollow((f) => !f)}
              aria-pressed={follow}
              aria-label={t("follow")}
              title={t("follow")}
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </Button>
            {state?.adsb != null && (
              <Button
                size="icon-sm"
                variant={showTraffic ? "default" : "secondary"}
                className="shadow"
                onClick={toggleTraffic}
                aria-pressed={showTraffic}
                aria-label={t("traffic")}
                title={t("traffic")}
              >
                <Plane className="h-3.5 w-3.5" />
              </Button>
            )}
            <PrefetchButton layerId={layerId} />
          </div>
        </div>
      </MapContainer>

      {measureInfo && (
        <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-md bg-background/90 px-2.5 py-1.5 text-xs shadow">
          <Ruler className="h-3.5 w-3.5 text-primary" />
          <span className="tabular-nums">
            {measureInfo.dist} · {measureInfo.brg}°
          </span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setMeasure(null)} aria-label={t("clearMeasure")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {menu && (
        <div
          className="absolute z-[1000] w-[184px] overflow-hidden rounded-md border border-border bg-popover text-sm text-popover-foreground shadow-lg"
          // Keep the menu inside the map: open leftwards/upwards near an edge.
          style={{
            left: Math.max(4, Math.min(menu.x, (boxRef.current?.clientWidth ?? 9999) - MENU_W - 4)),
            top: Math.max(4, Math.min(menu.y, (boxRef.current?.clientHeight ?? 9999) - MENU_H - 4)),
          }}
          role="menu"
        >
          <div className="border-b border-border px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">
            {menu.lat.toFixed(6)}, {menu.lon.toFixed(6)}
          </div>
          <MenuItem icon={<Navigation className="h-3.5 w-3.5" />} disabled={!canCommand} onClick={() => act("flyTo")}>
            {cls === "rover" ? t("driveHere") : t("flyHere")}
          </MenuItem>
          <MenuItem icon={<Crosshair className="h-3.5 w-3.5" />} disabled={!canCommand || !state?.caps.includes("gimbal")} onClick={() => act("lookAt")}>
            {t("lookHere")}
          </MenuItem>
          <MenuItem icon={<Home className="h-3.5 w-3.5" />} disabled={!canCommand} onClick={() => act("setHome")}>
            {t("setHomeHere")}
          </MenuItem>
          <MenuItem
            icon={<Ruler className="h-3.5 w-3.5" />}
            disabled={!pos}
            onClick={() => {
              setMeasure({ lat: menu.lat, lon: menu.lon });
              setMenu(null);
            }}
          >
            {t("measure")}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, children, disabled, onClick }: { icon: React.ReactNode; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}
