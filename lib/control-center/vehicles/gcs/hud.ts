/**
 * Geometry for the attitude HUD, kept free of canvas calls so it can be unit
 * tested. Conventions: roll right-wing-down positive, pitch nose-up positive
 * (ArduPilot ATTITUDE, in degrees); screen y grows downwards.
 */

import { wrap360 } from "./geo";

export interface Point {
  x: number;
  y: number;
}

/**
 * The horizon line through the HUD centre, rotated by roll and shifted by
 * pitch. Returns its two ends (long enough to cross any HUD) plus the offset
 * of the horizon centre from the HUD centre.
 */
export function horizon(rollDeg: number, pitchDeg: number, cx: number, cy: number, pxPerDeg: number, halfLength = 2000) {
  const r = (-rollDeg * Math.PI) / 180;
  // Nose up moves the horizon down the screen, along the rotated vertical.
  const shift = pitchDeg * pxPerDeg;
  const centre: Point = { x: cx - Math.sin(r) * shift, y: cy + Math.cos(r) * shift };
  const dx = Math.cos(r) * halfLength;
  const dy = Math.sin(r) * halfLength;
  return {
    centre,
    a: { x: centre.x - dx, y: centre.y - dy },
    b: { x: centre.x + dx, y: centre.y + dy },
    angleRad: r,
  };
}

/** Pitch ladder rungs visible within ±range degrees of the current pitch. */
export function pitchRungs(pitchDeg: number, stepDeg = 10, rangeDeg = 25): number[] {
  const out: number[] = [];
  const lo = Math.ceil((pitchDeg - rangeDeg) / stepDeg) * stepDeg;
  for (let p = lo; p <= pitchDeg + rangeDeg; p += stepDeg) {
    if (p !== 0 && p >= -90 && p <= 90) out.push(p);
  }
  return out;
}

export interface Tick {
  value: number;
  /** pixels from the tape centre; positive = below/right of centre */
  offset: number;
  major: boolean;
}

/**
 * Ticks for a vertical tape (speed or altitude) centred on `value`. Higher
 * values sit above the centre, so their offset is negative.
 */
export function tapeTicks(value: number, halfSpanPx: number, pxPerUnit: number, step: number, majorEvery = 5): Tick[] {
  const ticks: Tick[] = [];
  const unitsVisible = halfSpanPx / pxPerUnit;
  const lo = Math.ceil((value - unitsVisible) / step) * step;
  for (let v = lo; v <= value + unitsVisible + 1e-9; v += step) {
    const rounded = Math.round(v / step) * step;
    ticks.push({ value: rounded, offset: (value - rounded) * pxPerUnit, major: Math.round(rounded / step) % majorEvery === 0 });
  }
  return ticks;
}

export interface HeadingTick extends Tick {
  label: string | null;
}

const CARDINAL: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };

/** Ticks for the horizontal heading tape, wrapping through north. */
export function headingTicks(hdg: number, halfSpanPx: number, pxPerDeg: number, step = 5): HeadingTick[] {
  const out: HeadingTick[] = [];
  const degVisible = halfSpanPx / pxPerDeg;
  const lo = Math.ceil((hdg - degVisible) / step) * step;
  for (let d = lo; d <= hdg + degVisible + 1e-9; d += step) {
    const rounded = Math.round(d / step) * step;
    const v = wrap360(rounded);
    const major = v % 15 === 0;
    const label = v in CARDINAL ? CARDINAL[v] : v % 30 === 0 ? String(v) : null;
    out.push({ value: v, offset: (rounded - hdg) * pxPerDeg, major, label });
  }
  return out;
}

/** A tape step that keeps roughly `targetTicks` labelled ticks on screen. */
export function niceStep(unitsVisible: number, targetTicks = 6): number {
  const raw = unitsVisible / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}
