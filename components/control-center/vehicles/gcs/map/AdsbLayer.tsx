"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { trafficLabel, trafficLevel, type TrafficLevel } from "@/lib/control-center/vehicles/gcs/adsb";
import { formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import type { AdsbTarget } from "@/lib/control-center/vehicles/types";

const COLORS: Record<TrafficLevel, string> = { alarm: "#ef4444", warn: "#f59e0b", none: "#38bdf8" };

function planeSvg(color: string): string {
  return `<svg width="26" height="26" viewBox="-13 -13 26 26"><path d="M0 -12 L2 -4 L11 1 L11 3 L2 1 L1.5 8 L4.5 10.5 L4.5 12 L0 11 L-4.5 12 L-4.5 10.5 L-1.5 8 L-2 1 L-11 3 L-11 1 L-2 -4 Z" fill="${color}" stroke="#000" stroke-width="1"/></svg>`;
}

function labelHtml(t: AdsbTarget): string {
  const dz = t.dz === null ? "" : `${t.dz > 0 ? "+" : ""}${t.dz} m`;
  const d = t.d === null ? "" : formatDistance(t.d);
  const line2 = [dz, d].filter(Boolean).join(" · ");
  return `${trafficLabel(t).replace(/</g, "&lt;")}${line2 ? `<br>${line2}` : ""}`;
}

/**
 * ADS-B aircraft on the ground-station map, coloured by how close they are.
 * Markers are kept per ICAO address and updated in place.
 */
export function AdsbLayer({ targets }: { targets: AdsbTarget[] | null | undefined }) {
  const map = useMap();
  const markers = useRef(new Map<string, { m: L.Marker; level: TrafficLevel }>());

  useEffect(() => {
    const seen = new Set<string>();
    for (const t of targets ?? []) {
      seen.add(t.icao);
      const level = trafficLevel(t);
      let entry = markers.current.get(t.icao);
      if (entry && entry.level !== level) {
        entry.m.remove();
        entry = undefined;
      }
      if (!entry) {
        const icon = L.divIcon({
          className: "gcs-adsb-icon",
          html: `<div class="gcs-rot">${planeSvg(COLORS[level])}</div><div class="gcs-adsb-label" data-level="${level}"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        entry = { m: L.marker([t.lat, t.lon], { icon, keyboard: false, zIndexOffset: level === "alarm" ? 900 : 500 }).addTo(map), level };
        markers.current.set(t.icao, entry);
      }
      entry.m.setLatLng([t.lat, t.lon]);
      const el = entry.m.getElement();
      const rot = el?.querySelector<HTMLElement>(".gcs-rot");
      if (rot) rot.style.transform = `rotate(${t.hdg ?? 0}deg)`;
      const label = el?.querySelector<HTMLElement>(".gcs-adsb-label");
      if (label) label.innerHTML = labelHtml(t);
    }
    for (const [icao, entry] of markers.current) {
      if (!seen.has(icao)) {
        entry.m.remove();
        markers.current.delete(icao);
      }
    }
  }, [map, targets]);

  useEffect(() => {
    const all = markers.current;
    return () => {
      for (const { m } of all.values()) m.remove();
      all.clear();
    };
  }, [map]);

  return null;
}
