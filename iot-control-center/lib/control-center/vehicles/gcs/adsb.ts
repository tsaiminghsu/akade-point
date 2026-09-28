/**
 * ADS-B traffic around the vehicle: how close each aircraft is and which ones
 * deserve attention. Distances and height differences come from the companion
 * (`adsb[].d`, `.dz`); an aircraft without a known altitude is judged on
 * distance alone, since it could be at any height.
 *
 * Thresholds follow what drone pilots usually use near manned traffic: act
 * inside roughly 1 km / 150 m, keep an eye on anything inside 3 km / 300 m.
 */

import type { AdsbTarget } from "../types";

export type TrafficLevel = "alarm" | "warn" | "none";

export interface TrafficThresholds {
  alarmM: number;
  alarmDzM: number;
  warnM: number;
  warnDzM: number;
}

export const DEFAULT_TRAFFIC: TrafficThresholds = { alarmM: 1000, alarmDzM: 150, warnM: 3000, warnDzM: 300 };

export function trafficLevel(t: AdsbTarget, th: TrafficThresholds = DEFAULT_TRAFFIC): TrafficLevel {
  if (t.d === null || t.d === undefined) return "none";
  const dz = t.dz === null || t.dz === undefined ? 0 : Math.abs(t.dz);
  if (t.d <= th.alarmM && dz <= th.alarmDzM) return "alarm";
  if (t.d <= th.warnM && dz <= th.warnDzM) return "warn";
  return "none";
}

const RANK: Record<TrafficLevel, number> = { alarm: 2, warn: 1, none: 0 };

/** The most urgent aircraft (then the nearest), or null if nothing is close. */
export function worstTraffic(list: AdsbTarget[] | null | undefined, th: TrafficThresholds = DEFAULT_TRAFFIC): { target: AdsbTarget; level: TrafficLevel } | null {
  let best: { target: AdsbTarget; level: TrafficLevel } | null = null;
  for (const target of list ?? []) {
    const level = trafficLevel(target, th);
    if (level === "none") continue;
    if (!best || RANK[level] > RANK[best.level] || (RANK[level] === RANK[best.level] && (target.d ?? Infinity) < (best.target.d ?? Infinity))) {
      best = { target, level };
    }
  }
  return best;
}

/** Callsign, or the ICAO address when the aircraft sends none. */
export function trafficLabel(t: AdsbTarget): string {
  return t.cs || t.icao;
}
