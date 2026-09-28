/**
 * "Follow me": the vehicle keeps station next to the operator's phone or
 * laptop, Mission Planner style — the browser's geolocation drives repeated
 * GUIDED gotos. Works for copters and rovers without any autopilot setup
 * (ArduCopter's FOLLOW mode needs FOLL_* parameters and does nothing for a
 * rover).
 *
 * Pure decision logic; the panel owns the geolocation watch and sends.
 */

import { bearingDeg, destination, distanceM } from "./geo";

export interface FollowSettings {
  /** metres from the operator */
  distance: number;
  /** compass bearing from the operator to the vehicle's station, degrees */
  bearing: number;
  /** relative altitude for copters (rovers ignore it) */
  alt: number;
}

export interface Fix {
  lat: number;
  lon: number;
  /** horizontal accuracy, metres (Geolocation `coords.accuracy`) */
  accuracy: number;
  /** ms, when the fix was taken */
  at: number;
}

export const FOLLOW_LIMITS = {
  /** worse fixes are ignored: a 50 m error would throw the vehicle around */
  maxAccuracyM: 20,
  /** no fix for this long stops following */
  staleMs: 5000,
  /** a new goto when the target moved this far... */
  minMoveM: 3,
  /** ...or at least this often, so the vehicle keeps a fresh target */
  resendMs: 5000,
  /** refuse to start when the vehicle is further than this from the operator */
  maxStartDistanceM: 300,
  /** aim this far ahead along the operator's motion, seconds */
  leadS: 2,
  /** faster "walking" than this is a GPS jump, not movement */
  maxLeadSpeedMs: 15,
} as const;

/**
 * The operator's position pushed ahead along their recent motion. Without a
 * lead each goto lands a few metres ahead, the vehicle brakes for it and
 * trails behind (seen in SITL: ~9 m behind at walking pace, speed pulsing).
 */
export function leadFix(fix: Fix, prev: Fix | null, leadS: number = FOLLOW_LIMITS.leadS): Fix {
  if (!prev || fix.at <= prev.at || leadS <= 0) return fix;
  const dt = (fix.at - prev.at) / 1000;
  const d = distanceM(prev.lat, prev.lon, fix.lat, fix.lon);
  const speed = d / dt;
  // Standing still (GPS wander) or a jump: no lead.
  if (d < 0.5 || speed > FOLLOW_LIMITS.maxLeadSpeedMs || dt > 5) return fix;
  const ahead = destination(fix.lat, fix.lon, bearingDeg(prev.lat, prev.lon, fix.lat, fix.lon), speed * leadS);
  return { ...fix, lat: ahead.lat, lon: ahead.lon };
}

/** Where the vehicle should be for this operator position. */
export function stationFor(fix: { lat: number; lon: number }, s: FollowSettings): { lat: number; lon: number } {
  return s.distance > 0 ? destination(fix.lat, fix.lon, s.bearing, s.distance) : { lat: fix.lat, lon: fix.lon };
}

export type FollowDecision =
  | { kind: "send"; lat: number; lon: number }
  | { kind: "wait" }
  | { kind: "poorFix"; accuracy: number }
  | { kind: "stale" };

/**
 * What to do now: send a new goto, wait, or report why not. `lastSent` is the
 * last target sent and when.
 */
export function followStep(
  fix: Fix | null,
  now: number,
  s: FollowSettings,
  lastSent: { lat: number; lon: number; at: number } | null
): FollowDecision {
  if (!fix || now - fix.at > FOLLOW_LIMITS.staleMs) return { kind: "stale" };
  if (fix.accuracy > FOLLOW_LIMITS.maxAccuracyM) return { kind: "poorFix", accuracy: fix.accuracy };
  const target = stationFor(fix, s);
  if (!lastSent) return { kind: "send", ...target };
  const moved = distanceM(lastSent.lat, lastSent.lon, target.lat, target.lon);
  if (moved >= FOLLOW_LIMITS.minMoveM || now - lastSent.at >= FOLLOW_LIMITS.resendMs) return { kind: "send", ...target };
  return { kind: "wait" };
}

/** Null when following may start, else the reason it may not. */
export function followStartBlock(
  fix: Fix | null,
  vehicle: { lat: number; lon: number } | null,
  now: number
): "noFix" | "poorFix" | "noVehiclePos" | "tooFar" | null {
  if (!fix || now - fix.at > FOLLOW_LIMITS.staleMs) return "noFix";
  if (fix.accuracy > FOLLOW_LIMITS.maxAccuracyM) return "poorFix";
  if (!vehicle) return "noVehiclePos";
  if (distanceM(fix.lat, fix.lon, vehicle.lat, vehicle.lon) > FOLLOW_LIMITS.maxStartDistanceM) return "tooFar";
  return null;
}
