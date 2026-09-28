/**
 * Mission statistics, validation, resume and survey generation for the
 * flight-plan editor. Pure functions over the editor model.
 */

import { bearingDeg, destination, distanceM } from "../gcs/geo";
import { cmdMeta, hasLocation, isNav, type VehicleFamily } from "./mavCmdMeta";
import { blankItem, newKey, type FenceDoc, type MissionDoc, type PlanItem } from "./planModel";

// ---- statistics --------------------------------------------------------------

export interface MissionStats {
  /** horizontal path length through every located nav item, metres */
  distance: number;
  /** estimated flight time, seconds (cruise + climbs + holds) */
  duration: number;
  maxAlt: number;
  maxFromHome: number;
  waypoints: number;
}

export function missionStats(doc: MissionDoc, speedMs: number, climbMs = 2.5): MissionStats {
  let distance = 0;
  let duration = 0;
  let maxAlt = 0;
  let maxFromHome = 0;
  let waypoints = 0;
  let prev = { lat: doc.home.lat, lon: doc.home.lon, alt: 0 };
  for (const it of doc.items) {
    if (it.cmd === 20) {
      // RTL flies back home.
      const d = distanceM(prev.lat, prev.lon, doc.home.lat, doc.home.lon);
      distance += d;
      duration += d / speedMs;
      prev = { lat: doc.home.lat, lon: doc.home.lon, alt: prev.alt };
      continue;
    }
    if (it.cmd === 93 || it.cmd === 112) duration += Math.max(0, it.p1);
    if (!isNav(it.cmd) || !hasLocation(it.cmd)) continue;
    const lat = it.lat === 0 && it.lon === 0 ? prev.lat : it.lat;
    const lon = it.lat === 0 && it.lon === 0 ? prev.lon : it.lon;
    const d = distanceM(prev.lat, prev.lon, lat, lon);
    distance += d;
    duration += d / speedMs + Math.abs(it.alt - prev.alt) / climbMs;
    if (it.cmd === 16 || it.cmd === 82) duration += Math.max(0, it.p1);
    if (it.cmd === 19) duration += Math.max(0, it.p1);
    maxAlt = Math.max(maxAlt, it.alt);
    maxFromHome = Math.max(maxFromHome, distanceM(doc.home.lat, doc.home.lon, lat, lon));
    waypoints += 1;
    prev = { lat, lon, alt: it.alt };
  }
  return { distance, duration, maxAlt, maxFromHome, waypoints };
}

// ---- validation ------------------------------------------------------------

export interface PlanIssue {
  level: "error" | "warn" | "info";
  /** i18n key under Gcs.plan.issue */
  key: string;
  /** 1-based item number in the editor (mission seq), if about one item */
  item?: number;
  params?: Record<string, string | number>;
}

export const LEGAL_ALT_M = 120;

/** Point in polygon (ray casting); points as [lat, lon]. */
export function inPolygon(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function insideFence(lat: number, lon: number, fence: FenceDoc): boolean {
  const inclusions = [
    ...fence.polygons.filter((p) => p.inclusion && p.points.length >= 3).map((p) => inPolygon(lat, lon, p.points)),
    ...fence.circles.filter((c) => c.inclusion).map((c) => distanceM(lat, lon, c.lat, c.lon) <= c.radius),
  ];
  const excluded =
    fence.polygons.some((p) => !p.inclusion && p.points.length >= 3 && inPolygon(lat, lon, p.points)) ||
    fence.circles.some((c) => !c.inclusion && distanceM(lat, lon, c.lat, c.lon) <= c.radius);
  const included = inclusions.length === 0 || inclusions.some(Boolean);
  return included && !excluded;
}

export function validateMission(
  doc: MissionDoc,
  vehicle: VehicleFamily,
  opts: { fence?: FenceDoc | null; maxFromHomeM?: number } = {}
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const maxFromHome = opts.maxFromHomeM ?? 1000;
  const navItems = doc.items.filter((it) => isNav(it.cmd));
  if (navItems.length === 0) issues.push({ level: "error", key: "noNav" });
  if (doc.home.lat === 0 && doc.home.lon === 0) issues.push({ level: "warn", key: "noHome" });

  if (vehicle === "copter") {
    const firstNav = doc.items.find((it) => isNav(it.cmd));
    if (firstNav && firstNav.cmd !== 22) issues.push({ level: "warn", key: "noTakeoff" });
  }

  doc.items.forEach((it, i) => {
    const n = i + 1;
    const meta = cmdMeta(it.cmd);
    if (!meta) {
      issues.push({ level: "info", key: "unknownCmd", item: n, params: { cmd: it.cmd } });
      return;
    }
    if (!meta.vehicles.includes(vehicle)) issues.push({ level: "warn", key: "wrongVehicle", item: n, params: { cmd: meta.name } });
    if (meta.loc) {
      const zero = it.lat === 0 && it.lon === 0;
      if (zero && it.cmd !== 21 && it.cmd !== 22) issues.push({ level: "error", key: "zeroLatLon", item: n });
      if (!zero) {
        const d = distanceM(doc.home.lat, doc.home.lon, it.lat, it.lon);
        if (doc.home.lat !== 0 && d > maxFromHome) issues.push({ level: "warn", key: "farFromHome", item: n, params: { m: Math.round(d) } });
        if (opts.fence && !insideFence(it.lat, it.lon, opts.fence)) issues.push({ level: "error", key: "outsideFence", item: n });
      }
      if (vehicle === "copter" && meta.nav && !meta.noAlt) {
        if (it.frame === 3 && it.alt > LEGAL_ALT_M) issues.push({ level: "warn", key: "altOverLimit", item: n, params: { alt: it.alt, limit: LEGAL_ALT_M } });
        if (it.alt <= 0 && it.cmd !== 21) issues.push({ level: "warn", key: "altZero", item: n });
      }
      if (vehicle === "rover" && it.alt !== 0) issues.push({ level: "info", key: "roverAlt", item: n });
    }
    if (it.cmd === 177 && (it.p1 < 1 || it.p1 > doc.items.length)) issues.push({ level: "error", key: "badJump", item: n });
  });
  return issues;
}

export function validateFence(fence: FenceDoc): PlanIssue[] {
  const issues: PlanIssue[] = [];
  fence.polygons.forEach((p, i) => {
    if (p.points.length < 3) issues.push({ level: "error", key: "polygonTooSmall", item: i + 1 });
  });
  fence.circles.forEach((c, i) => {
    if (!(c.radius > 0)) issues.push({ level: "error", key: "circleRadius", item: i + 1 });
  });
  return issues;
}

// ---- resume ------------------------------------------------------------------

/** DO commands whose last setting before the resume point must carry over. */
const STICKY = [178, 206, 195, 201, 197, 205, 1000];

/**
 * Mission Planner's "resume mission": a new mission that starts at item
 * `fromItem` (1-based, as the editor numbers them). Copter gets a takeoff to
 * that item's altitude first. The last speed, camera-trigger, ROI and gimbal
 * settings from before the resume point are re-applied, and DO_JUMP targets
 * are renumbered (jumps to before the resume point are dropped).
 */
export function resumeFrom(doc: MissionDoc, fromItem: number, vehicle: VehicleFamily): { doc: MissionDoc; droppedJumps: number } {
  const idx = Math.max(1, Math.min(fromItem, doc.items.length)) - 1;
  const before = doc.items.slice(0, idx);
  const rest = doc.items.slice(idx);
  const lastByCmd = new Map<number, PlanItem>();
  for (const it of before) {
    if (STICKY.includes(it.cmd)) {
      // An ROI and ROI_NONE cancel each other: keep only the latest of the three.
      if (it.cmd === 195 || it.cmd === 201 || it.cmd === 197) {
        lastByCmd.delete(195);
        lastByCmd.delete(201);
        lastByCmd.delete(197);
      }
      lastByCmd.set(it.cmd, it);
    }
  }
  const prefix: PlanItem[] = [];
  if (vehicle === "copter") {
    const target = rest.find((it) => hasLocation(it.cmd) && isNav(it.cmd));
    prefix.push({ ...blankItem(22, 0, 0, Math.max(5, target?.alt ?? 10)), lat: 0, lon: 0 });
  }
  const carried = [...lastByCmd.values()].sort((a, b) => doc.items.indexOf(a) - doc.items.indexOf(b)).map((it) => ({ ...it, key: newKey() }));
  prefix.push(...carried);

  // Old 1-based number → new 1-based number, for DO_JUMP.
  const shift = prefix.length - idx;
  let droppedJumps = 0;
  const kept: PlanItem[] = [];
  for (const it of rest) {
    if (it.cmd === 177) {
      const target = Math.round(it.p1);
      if (target <= idx) {
        droppedJumps += 1;
        continue;
      }
      kept.push({ ...it, key: newKey(), p1: target + shift });
      continue;
    }
    kept.push({ ...it, key: newKey() });
  }
  return { doc: { home: doc.home, items: [...prefix, ...kept] }, droppedJumps };
}

// ---- survey ------------------------------------------------------------------

export interface Camera {
  /** sensor width/height in mm (landscape) */
  sensorW: number;
  sensorH: number;
  focal: number;
  imageW: number;
  imageH: number;
}

export const CAMERA_PRESETS: Record<string, Camera> = {
  // Raspberry Pi Camera Module 3 (IMX708): 6.45 × 3.63 mm, 4.74 mm, 4608 × 2592.
  piCam3: { sensorW: 6.45, sensorH: 3.63, focal: 4.74, imageW: 4608, imageH: 2592 },
  // Raspberry Pi HQ camera (IMX477) with the 6 mm lens.
  piHq6mm: { sensorW: 6.29, sensorH: 4.71, focal: 6, imageW: 4056, imageH: 3040 },
  // A typical 1/2.3" action camera (wide FOV).
  action: { sensorW: 6.17, sensorH: 4.55, focal: 2.9, imageW: 4000, imageH: 3000 },
};

export interface SurveyInput {
  polygon: [number, number][];
  alt: number;
  camera: Camera;
  frontOverlap: number;
  sideOverlap: number;
  /** lane direction, degrees from north */
  angle: number;
  /** extra run-in/out at each lane end, metres */
  overshoot?: number;
  /** add DO_SET_CAM_TRIGG_DIST start/stop */
  trigger?: boolean;
}

export interface SurveyResult {
  items: PlanItem[];
  laneSpacing: number;
  triggerDistance: number;
  /** ground sample distance, cm per pixel */
  gsd: number;
  lanes: number;
  lengthM: number;
}

export function surveyFootprint(alt: number, cam: Camera) {
  const groundW = (alt * cam.sensorW) / cam.focal;
  const groundH = (alt * cam.sensorH) / cam.focal;
  return { groundW, groundH, gsd: (groundW / cam.imageW) * 100 };
}

/**
 * Lawnmower lanes over a polygon. The camera's long side runs across the
 * lanes. Works for concave polygons: each lane is split into the segments that
 * lie inside, visited boustrophedon-style.
 */
export function surveyGrid(input: SurveyInput): SurveyResult | null {
  const { polygon, alt, camera } = input;
  if (polygon.length < 3 || alt <= 0) return null;
  const { groundW, groundH, gsd } = surveyFootprint(alt, camera);
  const spacing = groundW * (1 - input.sideOverlap / 100);
  const trigger = groundH * (1 - input.frontOverlap / 100);
  if (!(spacing > 0.5) || !(trigger > 0.1)) return null;

  // Local metric frame at the centroid, rotated so lanes run along +x.
  const lat0 = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const lon0 = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  const toXY = ([lat, lon]: [number, number]) => {
    const d = distanceM(lat0, lon0, lat, lon);
    const b = ((bearingDeg(lat0, lon0, lat, lon) - input.angle) * Math.PI) / 180;
    // x along the lane direction, y to its left.
    return { x: d * Math.cos(b), y: -d * Math.sin(b) };
  };
  const toLatLon = (x: number, y: number) => {
    const d = Math.hypot(x, y);
    const b = (Math.atan2(-y, x) * 180) / Math.PI + input.angle;
    return destination(lat0, lon0, b, d);
  };
  const pts = polygon.map(toXY);
  const ys = pts.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const over = input.overshoot ?? 0;

  const segments: { y: number; x1: number; x2: number }[][] = [];
  for (let y = minY + spacing / 2; y < maxY; y += spacing) {
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((m, n) => m - n);
    const lane: { y: number; x1: number; x2: number }[] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) lane.push({ y, x1: xs[k] - over, x2: xs[k + 1] + over });
    if (lane.length) segments.push(lane);
  }
  if (segments.length === 0) return null;

  const items: PlanItem[] = [];
  if (input.trigger) items.push({ ...blankItem(206, 0, 0, 0), p1: Number(trigger.toFixed(2)) });
  let lengthM = 0;
  let prev: { x: number; y: number } | null = null;
  segments.forEach((lane, i) => {
    const ordered = i % 2 === 0 ? lane : [...lane].reverse().map((s) => ({ ...s, x1: s.x2, x2: s.x1 }));
    for (const s of ordered) {
      for (const x of [s.x1, s.x2]) {
        const p = toLatLon(x, s.y);
        items.push(blankItem(16, p.lat, p.lon, alt));
        if (prev) lengthM += Math.hypot(x - prev.x, s.y - prev.y);
        prev = { x, y: s.y };
      }
    }
  });
  if (input.trigger) items.push({ ...blankItem(206, 0, 0, 0), p1: 0 });
  return { items, laneSpacing: spacing, triggerDistance: trigger, gsd, lanes: segments.length, lengthM };
}

// ---- GeoJSON import ----------------------------------------------------------

/** Outer rings of every Polygon / MultiPolygon in a GeoJSON document, as [lat, lon]. */
export function polygonsFromGeoJson(json: unknown): [number, number][][] {
  const out: [number, number][][] = [];
  const ring = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    const pts = coords
      .filter((c): c is [number, number] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number")
      .map(([lon, lat]) => [lat, lon] as [number, number]);
    // GeoJSON rings repeat the first point at the end.
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length >= 3) out.push(pts);
  };
  const visit = (g: unknown) => {
    if (!g || typeof g !== "object") return;
    const o = g as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] };
    if (o.type === "FeatureCollection") o.features?.forEach(visit);
    else if (o.type === "Feature") visit(o.geometry);
    else if (o.type === "GeometryCollection") o.geometries?.forEach(visit);
    else if (o.type === "Polygon" && Array.isArray(o.coordinates)) ring(o.coordinates[0]);
    else if (o.type === "MultiPolygon" && Array.isArray(o.coordinates)) (o.coordinates as unknown[][]).forEach((p) => ring(p[0]));
  };
  visit(json);
  return out;
}

// ---- orbit -------------------------------------------------------------------

export interface OrbitInput {
  lat: number;
  lon: number;
  radius: number;
  /** relative altitude of the ring (rovers: 0) */
  alt: number;
  /** waypoints per turn */
  points: number;
  turns: number;
  ccw: boolean;
  /** point the camera at the centre while circling */
  roi: boolean;
  /** start on the side facing this bearing from the centre (e.g. where the vehicle is) */
  startBearing?: number;
}

/** Items per mission the generator will produce at most (ArduPilot has room for hundreds, keep plans readable). */
export const ORBIT_MAX_ITEMS = 200;

/**
 * An orbit as a ring of waypoints (works for copters and rovers alike, unlike
 * NAV_LOITER_TURNS), optionally wrapped in DO_SET_ROI_LOCATION / ROI_NONE so
 * a gimbal keeps the centre in frame. The ring closes back on its first point.
 */
export function orbitItems(o: OrbitInput): PlanItem[] {
  const points = Math.max(4, Math.min(72, Math.round(o.points)));
  const turns = Math.max(1, Math.min(20, Math.round(o.turns)));
  const radius = Math.max(1, o.radius);
  const step = (o.ccw ? -360 : 360) / points;
  const start = o.startBearing ?? 0;
  const ring: PlanItem[] = [];
  for (let t = 0; t < turns; t++) {
    for (let i = 0; i < points; i++) {
      const p = destination(o.lat, o.lon, start + i * step, radius);
      ring.push(blankItem(16, p.lat, p.lon, o.alt));
    }
  }
  const back = destination(o.lat, o.lon, start, radius);
  ring.push(blankItem(16, back.lat, back.lon, o.alt));
  const head = o.roi ? [blankItem(195, o.lat, o.lon, 0)] : [];
  const tail = o.roi ? [blankItem(197, 0, 0, 0)] : [];
  return [...head, ...ring, ...tail].slice(0, ORBIT_MAX_ITEMS);
}
