/**
 * Geodetic and navigation maths for the radar module.
 *
 * Everything here is pure and unit-tested. See types.ts for the unit contract:
 * NM for distance, knots for speed, degrees true clockwise from north for
 * bearing. The local plane is east/north in NM.
 */

import type { LatLon, Vec2 } from './types';

/**
 * Earth radius in nautical miles.
 *
 * Deliberately 180*60/pi rather than the 3440.065 mean radius: the nautical
 * mile is defined as one minute of arc, and this value is the one that makes
 * that identity exact. It keeps the great-circle helpers consistent with
 * `toLocalPlane`, which converts at a flat 60 NM per degree. Using the mean
 * radius instead leaves a 0.07% disagreement between the two projections.
 */
export const EARTH_RADIUS_NM = (180 * 60) / Math.PI;
export const KM_PER_NM = 1.852;
export const M_PER_NM = 1852;

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Wrap any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Signed shortest angular difference from `a` to `b`, in (-180, 180].
 * Positive means `b` lies clockwise (to starboard) of `a`.
 */
export function bearingDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Great-circle distance in nautical miles. */
export function haversineNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from `a` to `b`, degrees true. */
export function initialBearing(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Point reached by steering `bearing` for `distNm` from `origin`. */
export function destinationPoint(origin: LatLon, bearing: number, distNm: number): LatLon {
  const ang = distNm / EARTH_RADIUS_NM;
  const brg = toRad(bearing);
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const sinLat2 =
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brg);
  const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * sinLat2
    );
  return {
    lat: toDeg(lat2),
    lon: ((toDeg(lon2) + 540) % 360) - 180,
  };
}

/**
 * Project a lat/lon onto the local east/north plane anchored at `origin`.
 *
 * This is an equirectangular projection. Over the tens of nautical miles a
 * radar scope covers, its error is far below the measurement noise we inject,
 * and it keeps the tracker filter linear.
 */
export function toLocalPlane(origin: LatLon, p: LatLon): Vec2 {
  const meanLat = toRad((origin.lat + p.lat) / 2);
  return {
    x: (p.lon - origin.lon) * 60 * Math.cos(meanLat),
    y: (p.lat - origin.lat) * 60,
  };
}

/** Inverse of `toLocalPlane`. */
export function fromLocalPlane(origin: LatLon, v: Vec2): LatLon {
  const lat = origin.lat + v.y / 60;
  const meanLat = toRad((origin.lat + lat) / 2);
  return {
    lat,
    lon: origin.lon + v.x / (60 * Math.cos(meanLat)),
  };
}

/** Bearing and range converted into an east/north vector. */
export function polarToVec(bearing: number, rangeNm: number): Vec2 {
  const b = toRad(bearing);
  return { x: rangeNm * Math.sin(b), y: rangeNm * Math.cos(b) };
}

/** East/north vector converted back into bearing and range. */
export function vecToPolar(v: Vec2): { bearing: number; range: number } {
  return {
    bearing: normalizeDeg(toDeg(Math.atan2(v.x, v.y))),
    range: Math.hypot(v.x, v.y),
  };
}

export const vecAdd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vecSub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vecScale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const vecLen = (a: Vec2): number => Math.hypot(a.x, a.y);

/** Knots converted to NM per second, the unit the filters integrate in. */
export const knotsToNmPerSec = (kn: number): number => kn / 3600;
export const nmPerSecToKnots = (v: number): number => v * 3600;

/** Bearing relative to own ship's head, in [0, 360). */
export function relativeBearing(trueBearing: number, heading: number): number {
  return normalizeDeg(trueBearing - heading);
}

/**
 * Turn `from` toward `to` by at most `maxDeg`, taking the short way round.
 * Used by every autopilot and helm model in the simulation.
 */
export function turnToward(from: number, to: number, maxDeg: number): number {
  const delta = bearingDelta(from, to);
  if (Math.abs(delta) <= maxDeg) return normalizeDeg(to);
  return normalizeDeg(from + Math.sign(delta) * maxDeg);
}

/** Format a bearing the way a radar readout does: three digits plus a degree sign. */
export function formatBearing(deg: number): string {
  return `${normalizeDeg(deg).toFixed(0).padStart(3, '0')}°`;
}

/** Format a range with the precision a real scope uses at that distance. */
export function formatRange(nm: number): string {
  if (!Number.isFinite(nm)) return '--';
  return nm < 10 ? `${nm.toFixed(2)} NM` : `${nm.toFixed(1)} NM`;
}

/** Format a duration in seconds as mm:ss, or as a dash when it is not meaningful. */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '--';
  if (sec < 0) return '已通過';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
