// 大怒神: a drop tower that stands on the 檯面. At the bottom a wooden
// 升降台 sits on coil springs; on it rests a closed acrylic box (壓克力盒)
// with dice inside and an iron disc on its lid. The magnet claw goes down
// the tower, takes hold of the disc and lifts the box, dice and all; when the
// magnet lets go the box free-falls onto the sprung platform (like the ride
// it's named after) and the dice are thrown about inside it. The points they
// come to rest on decide the round, by the rule the operator sets.
//
// A cabinet can hold one to three towers (座數). Each is a 單格, a square
// box, or a 雙格, the wider 加大 box split down the middle by an acrylic
// divider, with dice and a rule of its own in each cell; a 雙格 pays out when
// either cell wins. Pure data and maths here; clawSim.ts runs it.

import type { Vec3 } from './physics';

/**
 * What every tower shares (m): acrylic walls, their height, the wooden
 * collar round the top, the base board, the lip under the mouth that stops
 * the box, one coil spring (N/m; its damping comes from the 彈性 setting),
 * the platform's thickness, the box's height, walls and iron disc, and the dice.
 */
export const TOWER = {
  wall: 0.006,
  height: 0.5,
  /** The collar: how far it stands out past the walls, its boards' height above them, and their thickness. */
  collar: { out: 0.02, h: 0.05, t: 0.012 },
  baseTop: 0.012,
  lip: 0.485,
  spring: { free: 0.07, solid: 0.018, k: 1600 },
  platform: { thick: 0.03 },
  box: { h: 0.12, wall: 0.004, disc: 0.035 },
  /** Die half-edge (m) and mass (kg): big 3.2 cm dice, easy to read through the acrylic. */
  die: { half: 0.016, mass: 0.02 },
} as const;

export type TowerKind = 'single' | 'double';

/** A tower's size by kind: its shaft, box (with its heft to the magnet), platform and springs. */
export interface TowerSize {
  /** Inner half-extents of the shaft. */
  inner: { x: number; z: number };
  /** Outer half-extents of the box, its mass (kg), and how heavy it is to the magnet (grip units, dice included). */
  box: { x: number; z: number; mass: number; load: number };
  platform: { x: number; z: number; mass: number };
  springs: number;
}

export const TOWER_SIZES: Record<TowerKind, TowerSize> = {
  single: {
    inner: { x: 0.08, z: 0.08 },
    box: { x: 0.07, z: 0.07, mass: 0.35, load: 1 },
    platform: { x: 0.075, z: 0.075, mass: 0.45 },
    springs: 1,
  },
  // 雙格 (加大): half as wide again, the platform on a spring at each end.
  double: {
    inner: { x: 0.13, z: 0.08 },
    box: { x: 0.12, z: 0.07, mass: 0.5, load: 1.1 },
    platform: { x: 0.125, z: 0.075, mass: 0.65 },
    springs: 2,
  },
};

/** Outer half-extents of a tower's collar: its footprint on the 檯面. */
export function collarOf(size: TowerSize) {
  const o = TOWER.wall + TOWER.collar.out;
  return { x: size.inner.x + o, z: size.inner.z + o };
}

/** Where the platform's underside settles on its springs, with the box resting on it. */
export function platformRest(size: TowerSize) {
  return TOWER.baseTop + TOWER.spring.free
    - ((size.platform.mass + size.box.mass) * 9.81) / (TOWER.spring.k * size.springs);
}

/** Where the box's underside settles: on the platform. */
export function boxRest(size: TowerSize) {
  return platformRest(size) + TOWER.platform.thick;
}

/** One tower as placed in the cabinet: which it is, where it stands, and its size. */
export interface TowerSite {
  index: number;
  x: number;
  z: number;
  kind: TowerKind;
  size: TowerSize;
  collar: { x: number; z: number };
}

export function siteOf(index: number, x: number, z: number, kind: TowerKind): TowerSite {
  const size = TOWER_SIZES[kind];
  return { index, x, z, kind, size, collar: collarOf(size) };
}

export interface Area { minX: number; maxX: number; minZ: number; maxZ: number }

/** Towers keep this far off the glass and apart from each other (m). */
const ROOM_MARGIN = 0.02;
const TOWER_GAP = 0.01;
/** A single row of towers stands just behind the middle, clear of any chute's hole. */
const ROW_Z = -0.06;

/**
 * Where the operator stands the towers: in a row across the middle, left to
 * right, when they fit; otherwise as many as fit in a row along the back
 * and the rest along the front, right of the chute.
 */
export function towerSites(cfg: TowerConfig, cabinet: Area, chute: { maxX: number }): TowerSite[] {
  const kinds: TowerKind[] = cfg.towers.slice(0, cfg.count).map((t) => (t.double ? 'double' : 'single'));
  const widths = kinds.map((k) => collarOf(TOWER_SIZES[k]).x * 2);
  const depth = collarOf(TOWER_SIZES.single).z * 2;
  const left = cabinet.minX + ROOM_MARGIN, right = cabinet.maxX - ROOM_MARGIN;
  const rowWidth = (ids: number[]) => ids.reduce((a, i) => a + widths[i], 0) + TOWER_GAP * Math.max(0, ids.length - 1);
  const sites: TowerSite[] = [];
  const place = (ids: number[], from: number, to: number, z: number) => {
    let x = (from + to) / 2 - rowWidth(ids) / 2;
    for (const i of ids) {
      sites[i] = siteOf(i, x + widths[i] / 2, z, kinds[i]);
      x += widths[i] + TOWER_GAP;
    }
  };
  const all = kinds.map((_, i) => i);
  if (rowWidth(all) <= right - left) {
    place(all, left, right, ROW_Z);
    return sites;
  }
  const back: number[] = [];
  for (const i of all) if (rowWidth([...back, i]) <= right - left) back.push(i); else break;
  const front = all.slice(back.length);
  place(back, left, right, cabinet.minZ + ROOM_MARGIN + depth / 2);
  place(front, chute.maxX + TOWER_GAP, right, cabinet.maxZ - ROOM_MARGIN - depth / 2);
  return sites;
}

/**
 * The box as boxes relative to the middle of its underside: floor, lid, four
 * walls and, in a 雙格, the divider down the middle, all acrylic.
 */
export function boxParts(site: Pick<TowerSite, 'kind' | 'size'>): { offset: Vec3; half: Vec3 }[] {
  const { x: bx, z: bz } = site.size.box;
  const { h, wall: w } = TOWER.box;
  const parts = [
    { offset: { x: 0, y: w / 2, z: 0 }, half: { x: bx, y: w / 2, z: bz } },
    { offset: { x: 0, y: h - w / 2, z: 0 }, half: { x: bx, y: w / 2, z: bz } },
    { offset: { x: -bx + w / 2, y: h / 2, z: 0 }, half: { x: w / 2, y: h / 2, z: bz } },
    { offset: { x: bx - w / 2, y: h / 2, z: 0 }, half: { x: w / 2, y: h / 2, z: bz } },
    { offset: { x: 0, y: h / 2, z: -bz + w / 2 }, half: { x: bx, y: h / 2, z: w / 2 } },
    { offset: { x: 0, y: h / 2, z: bz - w / 2 }, half: { x: bx, y: h / 2, z: w / 2 } },
  ];
  if (site.kind === 'double') {
    parts.push({ offset: { x: 0, y: h / 2, z: 0 }, half: { x: w / 2, y: h / 2 - w, z: bz - w } });
  }
  return parts;
}

/** The inside of each of a box's cells: centre (x offset from the box's middle) and half-extents. */
export function boxCells(site: Pick<TowerSite, 'kind' | 'size'>): { x: number; halfX: number; halfZ: number }[] {
  const { x: bx, z: bz } = site.size.box;
  const w = TOWER.box.wall;
  if (site.kind === 'single') return [{ x: 0, halfX: bx - w, halfZ: bz - w }];
  const halfX = (bx - w - w / 2) / 2;
  const x = w / 2 + halfX;
  return [{ x: -x, halfX, halfZ: bz - w }, { x, halfX, halfZ: bz - w }];
}

export type DiceRule = 'red' | 'same' | 'sum';
export const DICE_RULES: readonly DiceRule[] = ['red', 'same', 'sum'];
export const DICE_RULE_INFO: Record<DiceRule, { label: string; hint: string }> = {
  red: { label: '單色（全紅）', hint: '每顆都停在紅點（1 點或 4 點）才中' },
  same: { label: '豹子', hint: '每顆點數都一樣才中' },
  sum: { label: '總點數', hint: '加起來達到門檻就中' },
};

/** One cell's dice and what wins in it. */
export interface CellConfig { dice: number; rule: DiceRule; sum: number }
/** One tower: 單格 or 雙格, and each cell's dice (the second is kept, unused, on a 單格). */
export interface TowerSetup { double: boolean; cells: [CellConfig, CellConfig] }
/**
 * What the operator sets on the 大怒神: how many towers stand in the
 * cabinet, each one's setup (kept for all three, so taking one out and
 * putting it back keeps its setup), and how springy the springs under the
 * platforms are (彈跳彈性, 1–10).
 */
export interface TowerConfig { count: number; towers: TowerSetup[]; spring: number }
export const TOWER_COUNT = { min: 1, max: 3 } as const;
export const TOWER_DICE = { min: 1, max: 5 } as const;
export const TOWER_SPRING = { min: 1, max: 10 } as const;

export const DEFAULT_CELL: CellConfig = { dice: 3, rule: 'red', sum: 14 };
function defaultSetup(): TowerSetup {
  return { double: false, cells: [{ ...DEFAULT_CELL }, { ...DEFAULT_CELL }] };
}
export const DEFAULT_TOWER: TowerConfig = {
  count: 1,
  towers: Array.from({ length: TOWER_COUNT.max }, defaultSetup),
  spring: 5,
};

/** The cells a tower actually has. */
export function cellsOf(setup: TowerSetup): CellConfig[] {
  return setup.double ? setup.cells : [setup.cells[0]];
}

/**
 * One spring's damping (N·s/m) at a 彈性 setting: 5 is the factory spring,
 * each 2 steps up halves it (livelier), each 2 down doubles it (deader).
 */
export function springDamping(level: number) {
  return 12 * 2 ** ((5 - level) / 2);
}

/** How bouncily the box comes off the platform on a hard landing at a 彈性 setting (0.3 at the factory 5). */
export function landingBounce(level: number) {
  return Math.min(0.8, 0.3 * 1.2 ** (level - 5));
}

const int = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);
const clampInt = (v: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, int(v, d)));
const record = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

export function sanitizeCell(raw: unknown): CellConfig {
  const obj = record(raw);
  const dice = clampInt(obj.dice, DEFAULT_CELL.dice, TOWER_DICE.min, TOWER_DICE.max);
  const rule = DICE_RULES.includes(obj.rule as DiceRule) ? (obj.rule as DiceRule) : DEFAULT_CELL.rule;
  const sum = clampInt(obj.sum, DEFAULT_CELL.sum, dice, dice * 6);
  return { dice, rule, sum };
}

function sanitizeSetup(raw: unknown): TowerSetup {
  const obj = record(raw);
  const cells = Array.isArray(obj.cells) ? obj.cells : [];
  return { double: obj.double === true, cells: [sanitizeCell(cells[0]), sanitizeCell(cells[1])] };
}

/**
 * Accept anything (e.g. parsed localStorage) and return a valid setup. One
 * saved before 座數 and 雙格 (dice and rule straight on it) becomes one 單格 tower.
 */
export function sanitizeTower(raw: unknown): TowerConfig {
  const obj = record(raw);
  const spring = clampInt(obj.spring, DEFAULT_TOWER.spring, TOWER_SPRING.min, TOWER_SPRING.max);
  if (!Array.isArray(obj.towers)) {
    const towers = Array.from({ length: TOWER_COUNT.max }, defaultSetup);
    towers[0].cells[0] = sanitizeCell(obj);
    return { count: 1, towers, spring };
  }
  const list = obj.towers;
  return {
    count: clampInt(obj.count, DEFAULT_TOWER.count, TOWER_COUNT.min, TOWER_COUNT.max),
    towers: Array.from({ length: TOWER_COUNT.max }, (_, i) => sanitizeSetup(list[i])),
    spring,
  };
}

/** Points on a die's faces, in box-face order: +x, -x, +y, -y, +z, -z (opposite faces make 7). */
export const DIE_FACES = [3, 4, 1, 6, 2, 5] as const;

/** On Taiwanese dice the 1 and the 4 are red. */
export function isRed(points: number) {
  return points === 1 || points === 4;
}

/** The points showing on top of a die turned by q. */
export function faceUp(q: { x: number; y: number; z: number; w: number }): number {
  const { x, y, z, w } = q;
  // How far up each of the die's own axes points (the y row of its rotation).
  const ups = [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)];
  let axis = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(ups[i]) > Math.abs(ups[axis])) axis = i;
  return DIE_FACES[axis * 2 + (ups[axis] >= 0 ? 0 : 1)];
}

/** A rotation that puts `points` on top, turned `yaw` about the vertical. */
export function faceUpRotation(points: number, yaw: number) {
  const i = DIE_FACES.indexOf(points as (typeof DIE_FACES)[number]);
  const h = Math.SQRT1_2;
  // Takes that face's axis to +y: about z for ±x, x for ±z, a half turn for -y.
  const tip = [
    { x: 0, y: 0, z: h, w: h }, { x: 0, y: 0, z: -h, w: h },
    { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 0, z: 0, w: 0 },
    { x: -h, y: 0, z: 0, w: h }, { x: h, y: 0, z: 0, w: h },
  ][i < 0 ? 2 : i];
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2);
  // yaw ∘ tip
  return {
    x: cy * tip.x + sy * tip.z,
    y: sy * tip.w + cy * tip.y,
    z: cy * tip.z - sy * tip.x,
    w: cy * tip.w - sy * tip.y,
  };
}

/** Do these points win in a cell set up like this? */
export function diceWin(cfg: CellConfig, faces: number[]): boolean {
  if (faces.length === 0) return false;
  if (cfg.rule === 'red') return faces.every(isRed);
  if (cfg.rule === 'same') return faces.every((f) => f === faces[0]);
  return faces.reduce((a, b) => a + b, 0) >= cfg.sum;
}

/** Which of a tower's cells win with these points (one list of faces per cell). */
export function cellWins(setup: TowerSetup, faces: number[][]): boolean[] {
  return cellsOf(setup).map((c, i) => diceWin(c, faces[i] ?? []));
}

/** Chance a fair throw wins in a cell (every outcome counted). */
export function winChance(cfg: CellConfig): number {
  const n = cfg.dice;
  let wins = 0;
  const faces = new Array<number>(n).fill(1);
  const total = 6 ** n;
  for (let k = 0; k < total; k++) {
    let v = k;
    for (let i = 0; i < n; i++) { faces[i] = (v % 6) + 1; v = Math.floor(v / 6); }
    if (diceWin(cfg, faces)) wins++;
  }
  return wins / total;
}

/** Chance a fair throw pays out on a tower: either cell of a 雙格 winning will do. */
export function towerChance(setup: TowerSetup): number {
  return 1 - cellsOf(setup).reduce((miss, c) => miss * (1 - winChance(c)), 1);
}

/** How far inside a tower's shaft (x, z) is: the distance to the nearest wall, negative outside. */
export function shaftClearance(site: TowerSite, x: number, z: number) {
  return Math.min(site.size.inner.x - Math.abs(x - site.x), site.size.inner.z - Math.abs(z - site.z));
}

/** Is a claw of reach r at (x, z) clear of the walls, i.e. wholly inside the shaft? */
export function inShaft(site: TowerSite, x: number, z: number, r: number) {
  return shaftClearance(site, x, z) >= r;
}

/** The tower whose shaft (x, z) is in, if any. */
export function siteAt(sites: readonly TowerSite[], x: number, z: number): TowerSite | null {
  return sites.find((s) => shaftClearance(s, x, z) > 0) ?? null;
}

/**
 * A tower's fixed top within r of (x, z): the collar boards, the tray round
 * the mouth (and the wall tops), or 0 clear of it or wholly inside the shaft
 * (where the box, which moves, is the sim's business).
 */
export function towerRimUnder(site: TowerSite, x: number, z: number, r: number) {
  const dx = Math.abs(x - site.x), dz = Math.abs(z - site.z);
  const { collar } = site, { inner } = site.size;
  if (dx - r >= collar.x || dz - r >= collar.z) return 0;
  if (dx + r <= inner.x && dz + r <= inner.z) return 0;
  const t = TOWER.collar.t;
  return dx + r > collar.x - t || dz + r > collar.z - t ? TOWER.height + TOWER.collar.h : TOWER.height;
}

/** One fixed box of a tower; `part` says what it is (for drawing). */
export interface TowerBox {
  part: 'wall' | 'base' | 'tray' | 'collar';
  center: Vec3; half: Vec3; friction: number; bounce: number;
}

/** A tower's fixed parts as boxes: acrylic walls, base board, the collar's tray and boards. */
export function towerBoxes(site: TowerSite): TowerBox[] {
  const { x, z, collar } = site;
  const { x: ix, z: iz } = site.size.inner;
  const { wall, height: H, baseTop } = TOWER;
  const acrylic = { friction: 0.2, bounce: 0.3 };
  const wood = { friction: 0.5, bounce: 0.3 };
  const out: TowerBox[] = [];
  let part: TowerBox['part'] = 'wall';
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, m: typeof wood) =>
    out.push({ part, center: { x: cx, y: cy, z: cz }, half: { x: hx, y: hy, z: hz }, ...m });
  // Walls, the side ones overlapping the front and back at the corners.
  box(x - ix - wall / 2, H / 2, z, wall / 2, H / 2, iz + wall, acrylic);
  box(x + ix + wall / 2, H / 2, z, wall / 2, H / 2, iz + wall, acrylic);
  box(x, H / 2, z - iz - wall / 2, ix, H / 2, wall / 2, acrylic);
  box(x, H / 2, z + iz + wall / 2, ix, H / 2, wall / 2, acrylic);
  part = 'base';
  box(x, baseTop / 2, z, ix, baseTop / 2, iz, wood);
  // Tray round the mouth, level with the wall tops.
  const t = TOWER.collar.t;
  const wx = ix + wall, wz = iz + wall;
  const bandX = (collar.x - wx) / 2, bandZ = (collar.z - wz) / 2;
  part = 'tray';
  box(x - wx - bandX, H - t / 2, z, bandX, t / 2, collar.z, wood);
  box(x + wx + bandX, H - t / 2, z, bandX, t / 2, collar.z, wood);
  box(x, H - t / 2, z - wz - bandZ, wx, t / 2, bandZ, wood);
  box(x, H - t / 2, z + wz + bandZ, wx, t / 2, bandZ, wood);
  // The collar's boards round the tray.
  const ch = TOWER.collar.h;
  part = 'collar';
  box(x - collar.x + t / 2, H + ch / 2, z, t / 2, ch / 2, collar.z, wood);
  box(x + collar.x - t / 2, H + ch / 2, z, t / 2, ch / 2, collar.z, wood);
  box(x, H + ch / 2, z - collar.z + t / 2, collar.x, ch / 2, t / 2, wood);
  box(x, H + ch / 2, z + collar.z - t / 2, collar.x, ch / 2, t / 2, wood);
  return out;
}
