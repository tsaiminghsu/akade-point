/**
 * Flight replay from the cloud telemetry history (one point every 2 s while
 * armed, 5 s otherwise, kept 7 days). Splits the history into flights by
 * arming, summarises each, and interpolates the vehicle at any moment for the
 * replay slider.
 */

import type { TelemetryPoint } from "../types";
import { angleDiff, distanceM, wrap360 } from "./geo";

export interface Flight {
  start: number;
  end: number;
  points: TelemetryPoint[];
  /** metres along the track */
  distance: number;
  maxRel: number;
  maxGs: number;
  /** battery % at the start and end, when reported */
  batStart: number | null;
  batEnd: number | null;
}

/** A gap longer than this ends a flight even without a disarm (link lost, companion restart). */
export const FLIGHT_GAP_MS = 60_000;
/** Shorter armed spells (arm then disarm on the ground) are not listed. */
export const MIN_FLIGHT_MS = 20_000;

export function segmentFlights(points: TelemetryPoint[], gapMs = FLIGHT_GAP_MS, minMs = MIN_FLIGHT_MS): Flight[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const flights: Flight[] = [];
  let cur: TelemetryPoint[] = [];
  const close = () => {
    if (cur.length >= 2 && cur[cur.length - 1].t - cur[0].t >= minMs) flights.push(summarise(cur));
    cur = [];
  };
  for (const p of sorted) {
    if (p.armed !== true) {
      close();
      continue;
    }
    if (cur.length && p.t - cur[cur.length - 1].t > gapMs) close();
    cur.push(p);
  }
  close();
  return flights.reverse(); // newest first
}

function summarise(points: TelemetryPoint[]): Flight {
  let distance = 0;
  for (let i = 1; i < points.length; i++) distance += distanceM(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  const bats = points.map((p) => p.batPct).filter((b): b is number => b !== null);
  return {
    start: points[0].t,
    end: points[points.length - 1].t,
    points,
    distance,
    maxRel: Math.max(...points.map((p) => p.rel)),
    maxGs: Math.max(0, ...points.map((p) => p.gs ?? 0)),
    batStart: bats.length ? bats[0] : null,
    batEnd: bats.length ? bats[bats.length - 1] : null,
  };
}

export interface ReplaySample {
  t: number;
  lat: number;
  lon: number;
  rel: number;
  hdg: number | null;
  gs: number | null;
  batPct: number | null;
  mode: string | null;
}

/** The vehicle at time t, linearly between the two surrounding points. */
export function sampleAt(points: TelemetryPoint[], t: number): ReplaySample | null {
  if (points.length === 0) return null;
  if (t <= points[0].t) return fromPoint(points[0]);
  const last = points[points.length - 1];
  if (t >= last.t) return fromPoint(last);
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = (t - a.t) / (b.t - a.t);
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const lerpN = (x: number | null, y: number | null) => (x === null || y === null ? (f < 0.5 ? x : y) : lerp(x, y));
  return {
    t,
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    rel: lerp(a.rel, b.rel),
    // Headings interpolate the short way round (350° → 10° passes north).
    hdg: a.hdg === null || b.hdg === null ? (a.hdg ?? b.hdg) : wrap360(a.hdg + angleDiff(b.hdg, a.hdg) * f),
    gs: lerpN(a.gs, b.gs),
    batPct: f < 0.5 ? a.batPct : b.batPct,
    mode: f < 0.5 ? a.mode : b.mode,
  };
}

function fromPoint(p: TelemetryPoint): ReplaySample {
  return { t: p.t, lat: p.lat, lon: p.lon, rel: p.rel, hdg: p.hdg, gs: p.gs, batPct: p.batPct, mode: p.mode };
}
