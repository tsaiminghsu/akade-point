"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { VehicleClass } from "@/lib/control-center/vehicles/types";

/** SVG glyphs; drawn pointing north and rotated by heading. */
function glyph(cls: VehicleClass | "other", color: string): string {
  if (cls === "rover") {
    return `<svg width="30" height="30" viewBox="-15 -15 30 30"><rect x="-7" y="-10" width="14" height="20" rx="3" fill="${color}" stroke="#000" stroke-width="1.5"/><path d="M0 -14 L5 -7 L-5 -7 Z" fill="#fff" stroke="#000" stroke-width="1"/></svg>`;
  }
  return `<svg width="34" height="34" viewBox="-17 -17 34 34"><path d="M0 -15 L10 12 L0 6 L-10 12 Z" fill="${color}" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

/**
 * A vehicle marker created once and updated in place: at 10 Hz, replacing a
 * Leaflet divIcon on every update would rebuild its DOM each time.
 */
export function VehicleMarker({
  lat,
  lon,
  heading,
  cls,
  color = "#ffb000",
  label,
  onClick,
}: {
  lat: number;
  lon: number;
  heading: number | null;
  cls: VehicleClass | "other";
  color?: string;
  label?: string;
  onClick?: () => void;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const icon = L.divIcon({
      className: "gcs-vehicle-icon",
      html: `<div class="gcs-rot" style="transform:rotate(${heading ?? 0}deg)">${glyph(cls, color)}</div>${
        label ? `<div class="gcs-vehicle-label">${label.replace(/</g, "&lt;")}</div>` : ""
      }`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    const m = L.marker([lat, lon], { icon, zIndexOffset: 1000, keyboard: false }).addTo(map);
    if (onClick) m.on("click", onClick);
    markerRef.current = m;
    return () => {
      m.remove();
      markerRef.current = null;
    };
    // Recreated only when the look changes; position and heading update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, cls, color, label]);

  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    m.setLatLng([lat, lon]);
    const rot = m.getElement()?.querySelector<HTMLElement>(".gcs-rot");
    if (rot) rot.style.transform = `rotate(${heading ?? 0}deg)`;
  }, [lat, lon, heading]);

  return null;
}

/** Pans the map to follow a position while `enabled`. */
export function FollowView({ lat, lon, enabled }: { lat: number | null; lon: number | null; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && lat !== null && lon !== null) map.panTo([lat, lon], { animate: true, duration: 0.25 });
  }, [map, lat, lon, enabled]);
  return null;
}

/** Centres once, the first time a position is known. */
export function InitialView({ lat, lon, zoom = 17 }: { lat: number | null; lon: number | null; zoom?: number }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!done.current && lat !== null && lon !== null) {
      map.setView([lat, lon], zoom);
      done.current = true;
    }
  }, [map, lat, lon, zoom]);
  return null;
}

export const homeIcon = () =>
  L.divIcon({
    className: "gcs-home-icon",
    html: `<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#16a34a" stroke="#fff" stroke-width="2"/><text x="11" y="15.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="sans-serif">H</text></svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

export const targetIcon = () =>
  L.divIcon({
    className: "gcs-target-icon",
    html: `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="none" stroke="#e11d48" stroke-width="3"/><circle cx="13" cy="13" r="2.5" fill="#e11d48"/></svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

/** Leaflet only measures its container on load; re-measure when the layout changes it. */
export function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}
