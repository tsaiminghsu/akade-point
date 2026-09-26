// 搖骰子盒: a wooden frame on the 檯面, four posts with a bungee cord from
// each top to a top corner of a clear acrylic cube hung in the middle, so the
// cords cross over it in an X. The dice lie loose in the cube, and an iron
// plate is screwed to its lid. The magnet claw takes hold of the plate and
// hauls the cube up (or sideways), stretching the cords, until they pull
// harder than the magnet can hold (or the claw lets go at the top): then the
// cords snap it back and it bounces about on them, throwing the dice around
// inside. The points they come to rest on decide the round, by the rule the
// operator sets. Pure data and maths here; clawSim.ts runs it.

import type { Vec3 } from './physics';
import { TOWER, isRed } from './tower';

/** Where the rig stands and its parts' sizes (m, kg). */
export const SHAKER = {
  x: 0.1,
  z: -0.06,
  /** Wooden frame: posts' centres from the middle, post section and height, and the base rails' size. */
  frame: { hx: 0.2, hz: 0.17, post: 0.038, height: 0.38, rail: 0.038 },
  /**
   * The cube: half-width (it's as tall as it is wide), wall thickness, mass
   * with the dice in it, and the iron plate on the lid (half-width) the
   * magnet has to find.
   */
  box: { half: 0.07, h: 0.14, wall: 0.004, mass: 0.45, plate: 0.03 },
  /** The box's own damping as it swings (air, the cords' give), N·s/m. */
  drag: 1.5,
  /**
   * The box's floor, lid and walls are this thick to the physics, all of it
   * outside the box, so a die can't be punched through a 4 mm panel when the
   * cords snap the box back at a few m/s.
   */
  shell: 0.03,
  /** Bungee cords: stiffness at the factory 鬆緊 (N/m), unstretched length, and damping (N·s/m). */
  cord: { k: 120, rest: 0.08, damping: 1.2 },
  /**
   * The box rocking on its cords: natural frequency (Hz) and damping ratio,
   * and how hard (rad/s) the plate tearing off the magnet sets it rocking
   * after a full haul.
   */
  tilt: { freq: 6, damping: 0.08, kick: 8 },
  /** And how fast (m/s) it's flung sideways as the plate tears off, after a full haul. */
  fling: 0.5,
  /**
   * The magnet's pull on the plate, per grip unit (N). A flat iron plate
   * screwed to the lid takes the magnet far better than any prize does.
   */
  pull: 25,
} as const;

/** The dice: the same big 3.2 cm dice as the 大怒神's. */
export const SHAKER_DIE = TOWER.die;

export type ShakerRule = 'red' | 'same' | 'reds' | 'sum';
export const SHAKER_RULES: readonly ShakerRule[] = ['reds', 'red', 'same', 'sum'];
export const SHAKER_RULE_INFO: Record<ShakerRule, { label: string; hint: string }> = {
  reds: { label: '紅點數量', hint: '停在紅點（1 點或 4 點）的骰子達到顆數就中' },
  red: { label: '單色（全紅）', hint: '每顆都停在紅點才中' },
  same: { label: '豹子', hint: '每顆點數都一樣才中' },
  sum: { label: '總點數', hint: '全部加起來達到門檻就中' },
};

/**
 * What the operator sets: how many dice go in the box, what wins (and how
 * many reds or what total), and how tight the cords are (鬆緊, 1–10).
 */
export interface ShakerConfig { dice: number; rule: ShakerRule; reds: number; sum: number; tension: number }
export const SHAKER_DICE = { min: 1, max: 6 } as const;
export const SHAKER_TENSION = { min: 1, max: 10 } as const;
export const DEFAULT_SHAKER: ShakerConfig = { dice: 5, rule: 'reds', reds: 3, sum: 20, tension: 5 };

/** Accept anything (e.g. parsed localStorage) and return a valid setup. */
export function sanitizeShaker(raw: unknown): ShakerConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const int = (v: unknown, d: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d));
  const dice = int(obj.dice, DEFAULT_SHAKER.dice, SHAKER_DICE.min, SHAKER_DICE.max);
  const rule = SHAKER_RULES.includes(obj.rule as ShakerRule) ? (obj.rule as ShakerRule) : DEFAULT_SHAKER.rule;
  return {
    dice,
    rule,
    reds: int(obj.reds, DEFAULT_SHAKER.reds, 1, dice),
    sum: int(obj.sum, DEFAULT_SHAKER.sum, dice, dice * 6),
    tension: int(obj.tension, DEFAULT_SHAKER.tension, SHAKER_TENSION.min, SHAKER_TENSION.max),
  };
}

/** Do these points win under this setup? */
export function shakerWin(cfg: ShakerConfig, faces: number[]): boolean {
  if (faces.length === 0) return false;
  if (cfg.rule === 'red') return faces.every(isRed);
  if (cfg.rule === 'same') return faces.every((f) => f === faces[0]);
  if (cfg.rule === 'reds') return faces.filter(isRed).length >= cfg.reds;
  return faces.reduce((a, b) => a + b, 0) >= cfg.sum;
}

/** Chance a fair shake wins (every outcome counted). */
export function shakerChance(cfg: ShakerConfig): number {
  const n = cfg.dice;
  let wins = 0;
  const faces = new Array<number>(n).fill(1);
  const total = 6 ** n;
  for (let k = 0; k < total; k++) {
    let v = k;
    for (let i = 0; i < n; i++) { faces[i] = (v % 6) + 1; v = Math.floor(v / 6); }
    if (shakerWin(cfg, faces)) wins++;
  }
  return wins / total;
}

/** Cord stiffness at a 鬆緊 setting: each step tighter is a quarter stiffer. */
export function cordStiffness(tension: number) {
  return SHAKER.cord.k * 1.25 ** (tension - 5);
}

/** The tops of the four posts, where the cords are tied (the inner corner of each top). */
export function cordAnchors(): Vec3[] {
  const { hx, hz, post, height } = SHAKER.frame;
  const ax = hx - post / 2, az = hz - post / 2;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: SHAKER.x + sx * ax, y: height, z: SHAKER.z + sz * az }));
}

/** Where each cord meets the box: its lid corners, from the middle of its underside (same order as the anchors). */
export function cordTies(): Vec3[] {
  const { half, h } = SHAKER.box;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * half, y: h, z: sz * half }));
}

/**
 * Force of the four cords on the box (N), its underside's middle at `pos`
 * moving at `vel`. A cord only pulls, and only once it's stretched past its
 * own length.
 */
export function cordForce(pos: Vec3, vel: Vec3, tension: number): Vec3 {
  const k = cordStiffness(tension);
  const ties = cordTies();
  const f = { x: 0, y: 0, z: 0 };
  cordAnchors().forEach((a, i) => {
    const dx = a.x - (pos.x + ties[i].x), dy = a.y - (pos.y + ties[i].y), dz = a.z - (pos.z + ties[i].z);
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) return;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const stretch = len - SHAKER.cord.rest;
    if (stretch <= 0) return;
    // Lengthening while the box moves away from the post.
    const rate = -(vel.x * ux + vel.y * uy + vel.z * uz);
    const t = Math.max(0, k * stretch + SHAKER.cord.damping * rate);
    f.x += t * ux; f.y += t * uy; f.z += t * uz;
  });
  return f;
}

/** Where the box's underside hangs at rest on cords this tight: where they hold its weight. */
export function shakerRestY(tension: number): number {
  const W = SHAKER.box.mass * 9.81;
  const still = { x: 0, y: 0, z: 0 };
  let lo = 0, hi: number = SHAKER.frame.height;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const up = cordForce({ x: SHAKER.x, y: mid, z: SHAKER.z }, still, tension).y;
    // Lower down the cords pull up harder.
    if (up > W) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The cube's acrylic as boxes relative to its underside's middle: floor,
 * lid and four walls. `shell` is how thick they are, grown outward from the
 * inside faces: the acrylic's own 4 mm to draw, thicker for the physics
 * (see SHAKER.shell).
 */
export function shakerBoxParts(shell: number = SHAKER.box.wall): { offset: Vec3; half: Vec3 }[] {
  const { half: b, h, wall: w } = SHAKER.box;
  const inner = b - w, t = shell;
  const out = inner + t;
  return [
    { offset: { x: 0, y: w - t / 2, z: 0 }, half: { x: out, y: t / 2, z: out } },
    { offset: { x: 0, y: h - w + t / 2, z: 0 }, half: { x: out, y: t / 2, z: out } },
    { offset: { x: -inner - t / 2, y: h / 2, z: 0 }, half: { x: t / 2, y: h / 2 - w + t, z: out } },
    { offset: { x: inner + t / 2, y: h / 2, z: 0 }, half: { x: t / 2, y: h / 2 - w + t, z: out } },
    { offset: { x: 0, y: h / 2, z: -inner - t / 2 }, half: { x: out, y: h / 2 - w + t, z: t / 2 } },
    { offset: { x: 0, y: h / 2, z: inner + t / 2 }, half: { x: out, y: h / 2 - w + t, z: t / 2 } },
  ];
}

/** Where the operator sets the dice on the cube's floor (x, z from its middle): corners first, then the middle. */
export function shakerDiceSpots(): { x: number; z: number }[] {
  const o = SHAKER.box.half - SHAKER.box.wall - SHAKER_DIE.half - 0.006;
  return [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0], [0, -1]].map(([sx, sz]) => ({ x: sx * o, z: sz * o }));
}

/** One fixed piece of the frame (for the physics and for drawing). */
export interface FrameBox { part: 'post' | 'rail'; center: Vec3; half: Vec3 }

/** The frame: four posts, and rails round the bottom joining their feet. */
export function frameBoxes(): FrameBox[] {
  const { hx, hz, post, height, rail } = SHAKER.frame;
  const { x, z } = SHAKER;
  const out: FrameBox[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    out.push({ part: 'post', center: { x: x + sx * hx, y: height / 2, z: z + sz * hz }, half: { x: post / 2, y: height / 2, z: post / 2 } });
  }
  const between = (a: number) => a - post / 2;
  for (const sz of [-1, 1]) {
    out.push({ part: 'rail', center: { x, y: rail / 2, z: z + sz * hz }, half: { x: between(hx), y: rail / 2, z: post / 2 } });
  }
  for (const sx of [-1, 1]) {
    out.push({ part: 'rail', center: { x: x + sx * hx, y: rail / 2, z }, half: { x: post / 2, y: rail / 2, z: between(hz) } });
  }
  return out;
}

/** Top of the frame within r of (x, z): a post's top or a rail's, or 0 clear of it. */
export function frameTopUnder(x: number, z: number, r: number) {
  let top = 0;
  for (const b of frameBoxes()) {
    const near = Math.abs(x - b.center.x) < b.half.x + r && Math.abs(z - b.center.z) < b.half.z + r;
    if (near) top = Math.max(top, b.center.y + b.half.y);
  }
  return top;
}

/** The frame's footprint, for keeping it clear of the chute and drawing it on the gantry map. */
export function shakerFootprint() {
  const { hx, hz, post } = SHAKER.frame;
  return { minX: SHAKER.x - hx - post / 2, maxX: SHAKER.x + hx + post / 2, minZ: SHAKER.z - hz - post / 2, maxZ: SHAKER.z + hz + post / 2 };
}
