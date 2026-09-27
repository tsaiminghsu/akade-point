"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import { layerById } from "@/lib/control-center/vehicles/gcs/tiles";
import { summarize } from "@/lib/control-center/vehicles/summary";
import type { Vehicle } from "@/lib/control-center/vehicles/types";
import { AutoResize, VehicleMarker } from "./mapParts";

const LINK_COLOR = { online: "#22c55e", stale: "#f59e0b", offline: "#94a3b8" } as const;

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 16);
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
    // Refit only when the set of vehicles with positions changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, points.length]);
  return null;
}

/** Every vehicle with a known position on one map; click one to open its ground station. */
export function FleetMap({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter();
  const layer = layerById("nlsc-emap");
  const located = useMemo(
    () =>
      vehicles
        .map((v) => ({ v, s: summarize(v.state) }))
        .filter((x): x is { v: Vehicle; s: NonNullable<ReturnType<typeof summarize>> } => Boolean(x.s?.pos)),
    [vehicles]
  );

  return (
    <div className="gcs-map h-full w-full overflow-hidden rounded-lg border border-border">
      <MapContainer center={[23.7, 121]} zoom={7} className="h-full w-full" maxZoom={21}>
        <TileLayer url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} maxNativeZoom={layer.maxNativeZoom} crossOrigin="anonymous" />
        <AutoResize />
        <FitAll points={located.map(({ s }) => [s.pos!.lat, s.pos!.lon])} />
        {located.map(({ v, s }) => (
          <VehicleMarker
            key={v.id}
            lat={s.pos!.lat}
            lon={s.pos!.lon}
            heading={s.hdg}
            cls={v.type === "rover" ? "rover" : "copter"}
            color={LINK_COLOR[v.linkState]}
            label={v.name}
            onClick={() => router.push(`/iot-control-center/vehicles/${v.id}`)}
          />
        ))}
      </MapContainer>
    </div>
  );
}
