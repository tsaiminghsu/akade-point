/**
 * Editor models for the three plan kinds and their conversion to and from the
 * MAVLink item lists the server stores and the companion uploads.
 *
 * - Mission: home + ordered items. Stored with the home item at seq 0.
 * - Fence: inclusion/exclusion polygons and circles, plus an optional return
 *   point. Stored as one item per polygon vertex, each carrying the polygon's
 *   vertex count in param1 (ArduPilot's mission-protocol fence format).
 * - Rally: points with an altitude above home.
 */

import type { MissionItem } from "../types";
import { cmdMeta } from "./mavCmdMeta";

export interface PlanItem {
  /** stable key for the editor */
  key: string;
  cmd: number;
  frame: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  lat: number;
  lon: number;
  alt: number;
  ac: number;
}

export interface Home {
  lat: number;
  lon: number;
  /** AMSL metres; ArduPilot overwrites home with its own on upload */
  alt: number;
}

export interface MissionDoc {
  home: Home;
  items: PlanItem[];
}

export interface FencePolygon {
  key: string;
  inclusion: boolean;
  points: [number, number][];
}

export interface FenceCircle {
  key: string;
  inclusion: boolean;
  lat: number;
  lon: number;
  radius: number;
}

export interface FenceDoc {
  polygons: FencePolygon[];
  circles: FenceCircle[];
  returnPoint: { lat: number; lon: number } | null;
}

export interface RallyPoint {
  key: string;
  lat: number;
  lon: number;
  alt: number;
}

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `k${Date.now().toString(36)}${counter.toString(36)}`;
}

const FRAME_GLOBAL = 0;
const FRAME_REL = 3;

export function blankItem(cmd: number, lat: number, lon: number, alt: number, frame = FRAME_REL): PlanItem {
  const meta = cmdMeta(cmd);
  return {
    key: newKey(),
    cmd,
    frame,
    p1: meta?.defaults?.p1 ?? 0,
    p2: meta?.defaults?.p2 ?? 0,
    p3: meta?.defaults?.p3 ?? 0,
    p4: meta?.defaults?.p4 ?? 0,
    lat: meta?.loc ? lat : 0,
    lon: meta?.loc ? lon : 0,
    alt: meta?.loc ? alt : 0,
    ac: 1,
  };
}

// ---- mission -------------------------------------------------------------

export function missionToItems(doc: MissionDoc): MissionItem[] {
  const home: MissionItem = { seq: 0, cur: 1, frame: FRAME_GLOBAL, cmd: 16, p1: 0, p2: 0, p3: 0, p4: 0, lat: doc.home.lat, lon: doc.home.lon, alt: doc.home.alt, ac: 1 };
  return [home, ...doc.items.map((it, i) => ({ seq: i + 1, cur: 0, frame: it.frame, cmd: it.cmd, p1: it.p1, p2: it.p2, p3: it.p3, p4: it.p4, lat: it.lat, lon: it.lon, alt: it.alt, ac: it.ac }))];
}

export function itemsToMission(items: MissionItem[]): MissionDoc {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  const [first, ...rest] = sorted;
  const home: Home = first ? { lat: first.lat, lon: first.lon, alt: first.alt } : { lat: 0, lon: 0, alt: 0 };
  return {
    home,
    items: rest.map((it) => ({ key: newKey(), cmd: it.cmd, frame: it.frame, p1: it.p1, p2: it.p2, p3: it.p3, p4: it.p4, lat: it.lat, lon: it.lon, alt: it.alt, ac: it.ac })),
  };
}

// ---- fence -----------------------------------------------------------------

export function fenceToItems(doc: FenceDoc): MissionItem[] {
  const out: Omit<MissionItem, "seq">[] = [];
  const item = (cmd: number, lat: number, lon: number, p1 = 0) => ({ cur: 0, frame: FRAME_GLOBAL, cmd, p1, p2: 0, p3: 0, p4: 0, lat, lon, alt: 0, ac: 1 });
  for (const poly of doc.polygons) {
    if (poly.points.length < 3) continue;
    for (const [lat, lon] of poly.points) out.push(item(poly.inclusion ? 5001 : 5002, lat, lon, poly.points.length));
  }
  for (const c of doc.circles) out.push(item(c.inclusion ? 5003 : 5004, c.lat, c.lon, c.radius));
  if (doc.returnPoint) out.push(item(5000, doc.returnPoint.lat, doc.returnPoint.lon));
  return out.map((it, seq) => ({ ...it, seq }));
}

export function itemsToFence(items: MissionItem[]): FenceDoc {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  const doc: FenceDoc = { polygons: [], circles: [], returnPoint: null };
  let i = 0;
  while (i < sorted.length) {
    const it = sorted[i];
    if (it.cmd === 5001 || it.cmd === 5002) {
      const n = Math.max(1, Math.round(it.p1));
      const pts = sorted.slice(i, i + n).filter((v) => v.cmd === it.cmd);
      doc.polygons.push({ key: newKey(), inclusion: it.cmd === 5001, points: pts.map((v) => [v.lat, v.lon]) });
      i += pts.length;
      continue;
    }
    if (it.cmd === 5003 || it.cmd === 5004) doc.circles.push({ key: newKey(), inclusion: it.cmd === 5003, lat: it.lat, lon: it.lon, radius: it.p1 });
    else if (it.cmd === 5000) doc.returnPoint = { lat: it.lat, lon: it.lon };
    i += 1;
  }
  return doc;
}

// ---- rally -----------------------------------------------------------------

export function rallyToItems(points: RallyPoint[]): MissionItem[] {
  return points.map((p, seq) => ({ seq, cur: 0, frame: FRAME_REL, cmd: 5100, p1: 0, p2: 0, p3: 0, p4: 0, lat: p.lat, lon: p.lon, alt: p.alt, ac: 1 }));
}

export function itemsToRally(items: MissionItem[]): RallyPoint[] {
  return [...items]
    .sort((a, b) => a.seq - b.seq)
    .filter((it) => it.cmd === 5100)
    .map((it) => ({ key: newKey(), lat: it.lat, lon: it.lon, alt: it.alt }));
}

// ---- comparing what the vehicle holds with what we sent --------------------

/** Equal within eps; NaN ("unchanged") matches NaN or the 0 an autopilot may echo. */
const close = (a: number, b: number, eps: number) => {
  if (Number.isNaN(a) || Number.isNaN(b)) return (Number.isNaN(a) || a === 0) && (Number.isNaN(b) || b === 0);
  return Math.abs(a - b) <= eps;
};

/**
 * Items that differ between two lists, by sequence number. The mission's home
 * item (seq 0) is ignored: ArduPilot replaces it with its own home. Float32
 * round-trips are tolerated.
 */
export function diffItems(sent: MissionItem[], got: MissionItem[], kind: "mission" | "fence" | "rally"): number[] {
  const skipHome = kind === "mission";
  const n = Math.max(sent.length, got.length);
  const out: number[] = [];
  for (let i = skipHome ? 1 : 0; i < n; i++) {
    const a = sent[i];
    const b = got[i];
    if (!a || !b) {
      out.push(i);
      continue;
    }
    const same =
      a.cmd === b.cmd &&
      a.frame === b.frame &&
      close(a.lat, b.lat, 2e-7) &&
      close(a.lon, b.lon, 2e-7) &&
      close(a.alt, b.alt, 0.01) &&
      close(a.p1, b.p1, 1e-3) &&
      close(a.p2, b.p2, 1e-3) &&
      close(a.p3, b.p3, 1e-3) &&
      close(a.p4, b.p4, 1e-3);
    if (!same) out.push(i);
  }
  return out;
}
