/**
 * The "Quick" panel's fields (Mission Planner lets pilots choose them too):
 * a registry of what can be shown and a per-vehicle-type layout the operator
 * picks, remembered in the browser.
 */

import type { VehicleStateV2 } from "../types";
import { worstTraffic } from "./adsb";
import { distanceM } from "./geo";
import { batteryLevel, ekfLevel, radioPct, vibeLevel, type Level } from "./health";

export type QuickTone = "warn" | "bad";

export interface QuickValue {
  /** already formatted; "—" when unknown */
  value: string;
  unit?: string;
  tone?: QuickTone;
}

type Family = "copter" | "rover";

interface FieldDef {
  key: string;
  /** vehicle types the field makes sense for */
  for: Family[];
  get: (s: VehicleStateV2 | null) => QuickValue;
}

const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d));
const tone = (l: Level): QuickTone | undefined => (l === "bad" ? "bad" : l === "warn" ? "warn" : undefined);
const BOTH: Family[] = ["copter", "rover"];

/** Metres as "850 m" / "1.2 km" without the unit split, for distances. */
function dist(m: number | null): QuickValue {
  if (m === null) return { value: "—" };
  return m >= 1000 ? { value: (m / 1000).toFixed(m >= 10_000 ? 0 : 1), unit: "km" } : { value: m.toFixed(0), unit: "m" };
}

export const QUICK_FIELDS: FieldDef[] = [
  { key: "alt", for: ["copter"], get: (s) => ({ value: n(s?.pos?.rel, 1), unit: "m" }) },
  { key: "altAmsl", for: BOTH, get: (s) => ({ value: n(s?.pos?.alt, 0), unit: "m" }) },
  { key: "groundspeed", for: BOTH, get: (s) => ({ value: n(s?.gs, 1), unit: "m/s" }) },
  { key: "airspeed", for: ["copter"], get: (s) => ({ value: n(s?.as, 1), unit: "m/s" }) },
  { key: "climb", for: ["copter"], get: (s) => ({ value: n(s?.vs, 1), unit: "m/s" }) },
  {
    key: "homeDist",
    for: BOTH,
    get: (s) => dist(s?.pos && s.home ? distanceM(s.pos.lat, s.pos.lon, s.home.lat, s.home.lon) : null),
  },
  { key: "wpDist", for: BOTH, get: (s) => dist(s?.wp?.dist ?? null) },
  { key: "waypoint", for: BOTH, get: (s) => ({ value: s?.wp ? `${s.wp.cur}/${s.wp.n ?? "—"}` : "—" }) },
  { key: "crosstrack", for: BOTH, get: (s) => ({ value: n(s?.wp?.xt, 1), unit: "m" }) },
  { key: "voltage", for: BOTH, get: (s) => ({ value: n(s?.bat?.v, 2), unit: "V" }) },
  {
    key: "cell",
    for: BOTH,
    get: (s) => ({ value: n(s?.bat?.cellV, 2), unit: s?.bat?.cellAvg ? "V~" : "V", tone: s ? tone(batteryLevel(s.bat)) : undefined }),
  },
  { key: "batteryPct", for: BOTH, get: (s) => ({ value: n(s?.bat?.pct), unit: "%", tone: s ? tone(batteryLevel(s.bat)) : undefined }) },
  { key: "current", for: BOTH, get: (s) => ({ value: n(s?.bat?.a, 1), unit: "A" }) },
  { key: "used", for: BOTH, get: (s) => ({ value: n(s?.bat?.mah), unit: "mAh" }) },
  { key: "heading", for: BOTH, get: (s) => ({ value: n(s?.hdg), unit: "°" }) },
  { key: "throttle", for: BOTH, get: (s) => ({ value: n(s?.thr), unit: "%" }) },
  { key: "wind", for: ["copter"], get: (s) => (s?.wind ? { value: n(s.wind.spd, 1), unit: `m/s ${n(s.wind.dir)}°` } : { value: "—" }) },
  { key: "sats", for: BOTH, get: (s) => ({ value: s?.gps ? `${s.gps.sats ?? "—"}` : "—", unit: s?.gps?.hdop != null ? `· ${s.gps.hdop.toFixed(1)}` : undefined }) },
  { key: "rssi", for: BOTH, get: (s) => ({ value: n(radioPct(s?.rssi.radio?.rssi) ?? s?.rssi.rc), unit: "%" }) },
  { key: "ekf", for: BOTH, get: (s) => ({ value: n(s?.ekf?.worst, 2), tone: s ? tone(ekfLevel(s.ekf)) : undefined }) },
  {
    key: "vibe",
    for: BOTH,
    get: (s) => ({ value: s?.vibe ? n(Math.max(s.vibe.x, s.vibe.y, s.vibe.z)) : "—", unit: "m/s²", tone: s ? tone(vibeLevel(s.vibe)) : undefined }),
  },
  { key: "aboveTerrain", for: ["copter"], get: (s) => ({ value: n(s?.terrain?.fc?.above, 1), unit: "m" }) },
  { key: "gimbalPitch", for: BOTH, get: (s) => ({ value: n(s?.mount?.p), unit: "°" }) },
  {
    key: "traffic",
    for: BOTH,
    get: (s) => {
      if (s?.adsb == null) return { value: "—" };
      const w = worstTraffic(s.adsb);
      const nearest = s.adsb[0];
      const d = dist(nearest?.d ?? null);
      return { ...d, tone: w?.level === "alarm" ? "bad" : w ? "warn" : undefined };
    },
  },
  { key: "piTemp", for: BOTH, get: (s) => ({ value: n(s?.comp?.tempC), unit: "°C", tone: (s?.comp?.tempC ?? 0) >= 80 ? "bad" : (s?.comp?.tempC ?? 0) >= 70 ? "warn" : undefined }) },
];

const BY_KEY = new Map(QUICK_FIELDS.map((f) => [f.key, f]));

export function fieldsFor(family: Family): FieldDef[] {
  return QUICK_FIELDS.filter((f) => f.for.includes(family));
}

export function quickValue(key: string, s: VehicleStateV2 | null): QuickValue {
  return BY_KEY.get(key)?.get(s) ?? { value: "—" };
}

export interface QuickLayout {
  fields: string[];
  columns: 2 | 3 | 4;
}

/** What the panel showed before it was customisable. */
export const DEFAULT_LAYOUT: Record<Family, QuickLayout> = {
  copter: { columns: 3, fields: ["alt", "groundspeed", "climb", "homeDist", "wpDist", "waypoint", "voltage", "cell", "current", "used", "heading", "throttle", "wind"] },
  rover: { columns: 3, fields: ["groundspeed", "homeDist", "wpDist", "waypoint", "voltage", "cell", "current", "used", "heading", "throttle", "crosstrack"] },
};

export const layoutKey = (family: Family) => `gcs.quick.${family}`;

/** Parses a stored layout, dropping unknown or inapplicable fields; the default if nothing usable is left. */
export function parseLayout(raw: string | null, family: Family): QuickLayout {
  if (!raw) return DEFAULT_LAYOUT[family];
  try {
    const v = JSON.parse(raw) as Partial<QuickLayout>;
    const allowed = new Set(fieldsFor(family).map((f) => f.key));
    const fields = Array.isArray(v.fields) ? [...new Set(v.fields.filter((k): k is string => typeof k === "string" && allowed.has(k)))] : [];
    const columns = v.columns === 2 || v.columns === 3 || v.columns === 4 ? v.columns : DEFAULT_LAYOUT[family].columns;
    return fields.length ? { fields, columns } : DEFAULT_LAYOUT[family];
  } catch {
    return DEFAULT_LAYOUT[family];
  }
}
