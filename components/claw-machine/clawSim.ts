// Claw machine simulation. No three.js / React imports, so it runs headless
// under vitest; ClawScene.tsx only reads this state to draw it. Prize motion
// is real rigid-body physics (physics.ts, Rapier); call initPhysics() once
// before createSim().
//
// Units are metres and seconds, y up, +z toward the player. The outcome is
// emergent: the board only decides claw *voltage* (飛絡力's 強 → 中 → 弱
// stages, or 保夾電壓 on a guaranteed round) and the winch timing; whether a
// prize is held comes from grab geometry vs. prize weight, and whether it is
// won from where it falls.
//
// The winch works in cable, like the board's motor timing: `claw.line` is how
// much is paid out below the top stop, and 下線長度, 中壓距離頂點 and 回停下降
// are all lengths of line. A swinging claw rides up its arc, so the same line
// reaches less deep than it would hanging straight.

import {
  MAX_POWER, defaultSettings, dropLineLength, gantrySpeed, homeLineLength, midLineLength, winchSpeed,
  type ClawSettings,
} from './settings';
import {
  CLAW_SPECS, armProfile, buildClawSpec, headRim, headTop, type ClawFit, type ClawSpec, type ClawType,
} from './claws';
import {
  DEFAULT_STOCK, MATERIALS, itemsIn, massFor, type ItemCategory, type PrizeKind, type PrizeShape, type Stock,
} from './items';
import {
  PrizeWorld, type BodyState, type ClawPose, type FieldBlock, type FieldDesc, type FieldRope, type Segment, type Vec3,
} from './physics';
import {
  DEFAULT_TOWER, TOWER, boxCells, boxParts, boxRest, cellWins, cellsOf, faceUp, faceUpRotation, inShaft, isRed,
  landingBounce, platformRest, sanitizeTower, shaftClearance, siteAt, springDamping, towerBoxes, towerRimUnder,
  towerSites, type TowerConfig, type TowerSetup, type TowerSite,
} from './tower';
import {
  SHAKER, SHAKER_DIE, cordForce, frameBoxes, frameTopUnder, sanitizeShaker, shakerBoxParts, shakerDiceSpots,
  shakerRestY, shakerWin, type ShakerConfig,
} from './shaker';

export { initPhysics, isPhysicsReady } from './physics';

export type { PrizeKind } from './items';

// ── Cabinet geometry ─────────────────────────────────────────────────────────

export const BOX = { minX: -0.45, maxX: 0.45, minZ: -0.32, maxZ: 0.32, height: 1.1 } as const;

/** Prize chute: a hole in the front-left corner of the floor, fenced by an acrylic 擋板. */
export interface Chute { minX: number; maxX: number; minZ: number; maxZ: number; wallH: number }

/**
 * What the operator sets on the chute: the opening (width left–right, depth
 * front–back, from the corner) and the 擋板 height around it. A smaller hole
 * (縮洞) or a taller 擋板 makes a prize harder to get in.
 */
export interface ChuteConfig { width: number; depth: number; wallH: number }

/** Adjustment ranges (m). The hole never shrinks below where the gantry can still park over it. */
export const CHUTE_LIMITS = {
  width: { min: 0.12, max: 0.3 },
  depth: { min: 0.12, max: 0.26 },
  wallH: { min: 0, max: 0.3 },
} as const;
export const DEFAULT_CHUTE: ChuteConfig = { width: 0.23, depth: 0.22, wallH: 0.15 };

export function chuteFrom(cfg: ChuteConfig): Chute {
  return { minX: BOX.minX, maxX: BOX.minX + cfg.width, minZ: BOX.maxZ - cfg.depth, maxZ: BOX.maxZ, wallH: cfg.wallH };
}

/** Accept anything (e.g. parsed localStorage) and return a valid chute setup, snapped to whole cm. */
export function sanitizeChute(raw: unknown): ChuteConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof ChuteConfig) => {
    const v = obj[key];
    const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_CHUTE[key];
    const { min, max } = CHUTE_LIMITS[key];
    return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  };
  return { width: pick('width'), depth: pick('depth'), wallH: pick('wallH') };
}

/** The factory chute. */
export const CHUTE: Chute = chuteFrom(DEFAULT_CHUTE);

// ── Play field (檯面) ────────────────────────────────────────────────────────

/**
 * 檯面: today's standard flat L around the hole; the old-style stepped floor
 * (tiers rising toward the back); a 3D 彈跳台, where the hard board is
 * swapped for a bed of trampoline mesh that throws prizes back up and runs
 * downhill into the hole; and a 火山口彈跳台, the same bed with the chute
 * raised into a crater of cords (see CRATER); a 大怒神, drop towers with
 * dice in a box (see tower.ts); and a 搖骰子盒, a box of dice hung on bungee
 * cords in a wooden frame (see shaker.ts).
 */
export type FieldType = 'flat' | 'steps' | 'bounce' | 'volcano' | 'tower' | 'shaker';
export const FIELD_TYPES: readonly FieldType[] = ['flat', 'steps', 'bounce', 'volcano', 'tower', 'shaker'];
export const FIELD_INFO: Record<FieldType, { label: string; hint: string }> = {
  flat: { label: 'L型平面', hint: '現在的標準檯面：平的，圍著出貨口成 L 型' },
  steps: { label: '老式階梯式', hint: '往後一階一階墊高；把東西推下一階就離洞口近一步' },
  bounce: {
    label: '3D彈跳台',
    hint: '硬底板換成繃緊的黑色彈跳網，左後、右後、右前三個角抬高，整面往洞口斜；四周拉衝繩，掉下去會彈、往洞口衝',
  },
  volcano: {
    label: '火山口彈跳台',
    hint: '3D彈跳網，出貨口做成火山口：木框四角斜撐，衝繩一圈圈往上收到洞口邊。要越過最上面那條繩，或打到斜繩彈進洞',
  },
  tower: {
    label: '大怒神',
    hint: '壓克力塔裡，彈簧升降台上放著裝骰子的壓克力盒：磁吸爪伸進去吸住盒蓋的鐵片往上拉，一放開盒子就自由落體砸在彈簧台上，骰子在盒裡亂滾，停下的點數中了就出貨',
  },
  shaker: {
    label: '搖骰子盒',
    hint: '木架四根柱子拉橡皮繩吊著九宮格壓克力盒：磁吸爪吸住盒蓋鐵片往上拉，繩子越拉越緊，吸不住就被彈回去上下亂晃，格子裡的骰子跟著翻，停下的點數連成線就出貨',
  },
};

/** 檯面 that hold only their dice, no prizes: the stock is what a win pays out. */
export function holdsDiceOnly(field: FieldType) {
  return field === 'tower' || field === 'shaker';
}

export function isFieldType(v: unknown): v is FieldType {
  return typeof v === 'string' && (FIELD_TYPES as readonly string[]).includes(v);
}

/** The bounce tables: a sprung bed with 衝繩 round it, a box round the hole with a 洞口網 to size the opening. */
export function isCorded(field: FieldType) {
  return field === 'bounce' || field === 'volcano';
}

/** 階梯式 tiers behind the front row (the front row, with the hole, stays at the felt). */
export const STEP_TIERS = [
  { minZ: -0.11, maxZ: 0.1, top: 0.07 },
  { minZ: BOX.minZ, maxZ: -0.11, top: 0.14 },
] as const;

/** Restitution of the floor: rubber cords throw things back up, felt doesn't. */
const FLOOR_BOUNCE: Record<FieldType, number> = {
  flat: 0.05, steps: 0.05, bounce: 0.75, volcano: 0.75, tower: 0.05, shaker: 0.05,
};
/** A 火山口's wall is bungee cord, as lively as the edge ropes. */
const CRATER_BOUNCE = 0.85;

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * How far a 3D 彈跳台's three far corners (back-left, back-right,
 * front-right) are raised above the hole's rim (m). 0 is a flat bed.
 */
export const BED_LIFT = { min: 0, max: 0.15, default: 0.08 } as const;

/** Accept anything (e.g. parsed localStorage) and return a valid lift, snapped to whole cm. */
export function sanitizeBedLift(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : BED_LIFT.default;
  return Math.round(Math.min(BED_LIFT.max, Math.max(BED_LIFT.min, n)) * 100) / 100;
}

/**
 * The box round the hole. On a bounce table it stays put: to make the hole
 * smaller the operator stretches a net (洞口網) across part of it, so the
 * opening (the chute setting) sits in the glass corner of a box at least the
 * factory size. Other 檯面 shrink the hole itself.
 */
export function holeBox(field: FieldType, chute: Chute): Chute {
  if (!isCorded(field)) return chute;
  return { ...chute, maxX: Math.max(chute.maxX, CHUTE.maxX), minZ: Math.min(chute.minZ, CHUTE.minZ) };
}

/** The 洞口網: the part of the box the opening leaves, as rectangles (none when the opening fills it). */
export function holeNets(field: FieldType, chute: Chute): Rect[] {
  const box = holeBox(field, chute);
  const nets: Rect[] = [];
  if (box.maxX > chute.maxX + 1e-6) nets.push({ minX: chute.maxX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ });
  if (chute.minZ > box.minZ + 1e-6) nets.push({ minX: box.minX, maxX: chute.maxX, minZ: box.minZ, maxZ: chute.minZ });
  return nets;
}

/**
 * A 3D 彈跳台's bed height at (x, z): level with the box's rim along its two
 * open sides, rising to `lift` at the three far corners and all along the
 * back and right walls, so the whole bed runs downhill into the hole.
 */
export function bedHeight(box: Chute, lift: number, x: number, z: number) {
  if (lift <= 0) return 0;
  const a = clamp01((x - box.maxX) / (BOX.maxX - box.maxX));
  const b = clamp01((box.minZ - z) / (box.minZ - BOX.minZ));
  return lift * (a + b - a * b);
}

/** Grid lines through every stop, no cell wider than `step`. */
function gridLines(stops: number[], step: number) {
  const s = [...new Set(stops.map((n) => Math.round(n * 1e5) / 1e5))].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    const n = Math.max(1, Math.ceil((s[i + 1] - s[i]) / step - 1e-9));
    for (let k = 0; k < n; k++) out.push(s[i] + ((s[i + 1] - s[i]) * k) / n);
  }
  out.push(s[s.length - 1]);
  return out;
}

/** The bed as a triangle mesh (normals up), open over the box: for the physics, and drawn as is. */
export function bedMesh(box: Chute, lift: number) {
  const xs = gridLines([BOX.minX, box.maxX, BOX.maxX], 0.05);
  const zs = gridLines([BOX.minZ, box.minZ, BOX.maxZ], 0.05);
  const vertices = new Float32Array(xs.length * zs.length * 3);
  zs.forEach((z, j) => xs.forEach((x, i) => vertices.set([x, bedHeight(box, lift, x, z), z], (j * xs.length + i) * 3)));
  const at = (i: number, j: number) => j * xs.length + i;
  const indices: number[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      if ((xs[i] + xs[i + 1]) / 2 < box.maxX && (zs[j] + zs[j + 1]) / 2 > box.minZ) continue; // the box
      indices.push(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i + 1, j));
    }
  }
  return { vertices, indices: new Uint32Array(indices) };
}

/**
 * 火山口, the chute of a 火山口彈跳台. The chute's wooden box carries a
 * slanted strut at each corner with a pulley per cord, and bungee cords wound
 * round them rise from the bed to the hole's edge, each ring a little further
 * in. The hole ends up at the top of a sloping cord wall like a volcano's
 * mouth: a prize has to be carried over the top cord, or land on the slope
 * and be bounced in. The 擋板 height setting is how tall the crater stands.
 *
 * `slope` is how far the foot reaches out onto the bed per metre of height
 * (at most `maxLean`), `spacing` the most room between cords, `low` the
 * bottom cord's height above the bed.
 */
export const CRATER = { slope: 0.45, maxLean: 0.06, spacing: 0.035, low: 0.015 } as const;

export interface Crater {
  /** The top cord's height, on the box's edge. */
  height: number;
  /** How far the foot of the cord wall reaches out from the box's edge onto the bed. */
  lean: number;
  /** Cord heights, bottom to top. */
  rings: number[];
}

/** The crater round this box, or null with no 擋板: then the hole is flush with the bed. */
export function craterOf(box: Chute): Crater | null {
  const height = box.wallH;
  if (height <= 0.001) return null;
  const lean = Math.min(CRATER.maxLean, height * CRATER.slope);
  const low = Math.min(CRATER.low, height / 2);
  const n = Math.max(2, Math.ceil((height - low) / CRATER.spacing) + 1);
  const rings = Array.from({ length: n }, (_, k) => low + ((height - low) * k) / (n - 1));
  return { height, lean, rings };
}

/** How far out from the box's edge the cord wall stands at height y. */
export function craterOffset(c: Crater, y: number) {
  return c.lean * (1 - y / c.height);
}

/**
 * How far (x, z) is out from the box's two open edges. The walls on those
 * sides meet in a hip over the corner, so it's whichever edge is further.
 * Negative inside the box.
 */
function craterDist(box: Chute, x: number, z: number) {
  return Math.max(x - box.maxX, box.minZ - z);
}

/** The crater slope's height `d` out from the box's edge; 0 past its foot. */
function craterSlope(c: Crater, d: number) {
  return d >= c.lean ? 0 : c.height * (1 - Math.max(0, d) / c.lean);
}

/**
 * Height of the fixed play surface at (x, z): 0 is the rim of the hole (and
 * a 洞口網 stretched level with it), -Infinity down the opening. `lift` is
 * the 3D bed's (bounce tables only), `towers` where a 大怒神's stand.
 */
export function fieldHeightAt(
  field: FieldType, x: number, z: number, chute: Chute = CHUTE, lift = 0, towers: readonly TowerSite[] = [],
): number {
  if (inChute(x, z, 0, chute)) return -Infinity;
  const box = holeBox(field, chute);
  if (inChute(x, z, 0, box)) return 0;
  if (field === 'steps') {
    for (const tier of STEP_TIERS) if (z >= tier.minZ && z < tier.maxZ) return tier.top;
  }
  if (field === 'tower') {
    // A shaft's base board (the platform moves), or a tower's rim.
    if (siteAt(towers, x, z)) return TOWER.baseTop;
    return towers.reduce((top, s) => Math.max(top, towerRimUnder(s, x, z, 0)), 0);
  }
  if (field === 'shaker') return frameTopUnder(x, z, 0);
  if (!isCorded(field)) return 0;
  const bed = bedHeight(box, lift, x, z);
  const c = field === 'volcano' ? craterOf(box) : null;
  return c ? Math.max(bed, craterSlope(c, craterDist(box, x, z))) : bed;
}

/** Highest point of a 火山口's cords within `r` of (x, z); 0 on other 檯面. */
function craterTopUnder(field: FieldType, x: number, z: number, r: number, chute: Chute) {
  if (field !== 'volcano') return 0;
  const box = holeBox(field, chute);
  const c = craterOf(box);
  const dist = craterDist(box, x, z);
  // Wholly inside the mouth it's clear; reaching the rim, it's the top cord.
  if (!c || dist < -r) return 0;
  return dist <= r ? c.height : craterSlope(c, dist - r);
}

/** Highest fixed surface within `r` of (x, z): how low a claw that wide can come down there. */
export function fieldTopUnder(
  field: FieldType, x: number, z: number, r: number, chute: Chute = CHUTE, lift = 0, towers: readonly TowerSite[] = [],
): number {
  let top = 0;
  if (field === 'steps') {
    for (const tier of STEP_TIERS) if (z + r > tier.minZ && z - r < tier.maxZ) top = Math.max(top, tier.top);
  } else if (isCorded(field)) {
    const box = holeBox(field, chute);
    // The bed only climbs away from the hole (+x, -z), so its highest point in reach is on that side.
    const d = r * Math.SQRT1_2;
    top = Math.max(bedHeight(box, lift, x + r, z), bedHeight(box, lift, x, z - r), bedHeight(box, lift, x + d, z - d));
    top = Math.max(top, craterTopUnder(field, x, z, r, chute));
  } else if (field === 'tower') {
    for (const s of towers) top = Math.max(top, towerRimUnder(s, x, z, r));
  } else if (field === 'shaker') {
    top = Math.max(top, frameTopUnder(x, z, r));
  }
  return top;
}

/** 衝繩 on a bounce table: heights above the bed, inset from the glass, and thickness (m). */
export const ROPES = { heights: [0.035, 0.075], inset: 0.015, r: 0.004 } as const;

/**
 * The bounce table's edge ropes, riding the bed's rise: round the back, the
 * right, and the front and left walls up to the box (its side is left open
 * so prizes can be flung in), or up to the foot of its crater.
 */
export function bedRopes(box: Chute, lean = 0, lift = 0): FieldRope[] {
  const i = ROPES.inset;
  const x0 = BOX.minX + i, x1 = BOX.maxX - i, z0 = BOX.minZ + i, z1 = BOX.maxZ - i;
  const runs: [number, number, number, number][] = [
    [x0, z0, x1, z0], // back
    [x1, z0, x1, z1], // right
    [box.maxX + lean, z1, x1, z1], // front, from the box to the right
    [x0, z0, x0, box.minZ - lean], // left, from the back to the box
  ];
  const at = (x: number, y: number, z: number) => ({ x, y: y + bedHeight(box, lift, x, z), z });
  return ROPES.heights.flatMap((y) => runs.map(([ax, az, bx, bz]) => ({ from: at(ax, y, az), to: at(bx, y, bz), r: ROPES.r })));
}

/** A crater's cords: a ring per height, from the front glass round the box's corner to the left glass. */
export function craterRopes(box: Chute): FieldRope[] {
  const c = craterOf(box);
  if (!c) return [];
  const i = ROPES.inset;
  return c.rings.flatMap((y) => {
    const o = craterOffset(c, y);
    const x = box.maxX + o, z = box.minZ - o;
    return [
      { from: { x, y, z: BOX.maxZ - i }, to: { x, y, z }, r: ROPES.r },
      { from: { x, y, z }, to: { x: BOX.minX + i, y, z }, r: ROPES.r },
    ];
  });
}

/** The crater's slanted struts, foot on the bed and head at the top cord: at the box's corner and at each glass. */
export function craterStruts(box: Chute): { foot: Vec3; head: Vec3 }[] {
  const c = craterOf(box);
  if (!c) return [];
  const i = ROPES.inset, l = c.lean, h = c.height;
  return [
    { foot: { x: box.maxX + l, y: 0, z: box.minZ - l }, head: { x: box.maxX, y: h, z: box.minZ } },
    { foot: { x: box.maxX + l, y: 0, z: BOX.maxZ - i }, head: { x: box.maxX, y: h, z: BOX.maxZ - i } },
    { foot: { x: BOX.minX + i, y: 0, z: box.minZ - l }, head: { x: BOX.minX + i, y: h, z: box.minZ } },
  ];
}

/**
 * The crater's cord walls for the physics, as two solid wedges (the right
 * side and the back) that meet in a hip over the corner. Each has a sheer
 * inside face on the box's edge. The cords are close enough that nothing
 * slips between them.
 */
function craterHulls(box: Chute): Float32Array[] {
  const c = craterOf(box);
  if (!c) return [];
  const { height: h, lean: l } = c;
  const x = box.maxX, z = box.minZ, x0 = BOX.minX, z1 = BOX.maxZ;
  return [
    new Float32Array([x, h, z1, x, h, z, x, 0, z1, x, 0, z, x + l, 0, z1, x + l, 0, z - l]),
    new Float32Array([x0, h, z, x, h, z, x0, 0, z, x, 0, z, x0, 0, z - l, x + l, 0, z - l]),
  ];
}

/** Floor slabs covering the cabinet except the chute and any other holes, as few rectangles as a grid allows. */
function floorRects(cuts: Rect[]): Rect[] {
  const uniq = (v: number[]) => [...new Set(v.map((n) => Math.round(n * 1e5) / 1e5))].sort((a, b) => a - b);
  const xs = uniq([BOX.minX, BOX.maxX, ...cuts.flatMap((c) => [c.minX, c.maxX])])
    .filter((x) => x >= BOX.minX && x <= BOX.maxX);
  const zs = uniq([BOX.minZ, BOX.maxZ, ...cuts.flatMap((c) => [c.minZ, c.maxZ])])
    .filter((z) => z >= BOX.minZ && z <= BOX.maxZ);
  const out: Rect[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run: Rect | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const cutOut = cuts.some((c) => cx > c.minX && cx < c.maxX && cz > c.minZ && cz < c.maxZ);
      if (cutOut) { run = null; continue; }
      if (run) run.maxX = xs[i + 1];
      else out.push((run = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] }));
    }
  }
  return out;
}

/**
 * The field's static pieces for the physics: floor slabs round the box,
 * stepped tiers clipped round the chute, a bounce table's sprung bed, edge
 * ropes and 洞口網, and a 火山口's cord walls in place of the 擋板. The
 * physics fences the box (`holeBox`), not the opening.
 */
export function fieldDesc(field: FieldType, chute: Chute, lift = 0, towers: readonly TowerSite[] = []): FieldDesc {
  const blocks: FieldBlock[] = [];
  if (field === 'steps') {
    for (const tier of STEP_TIERS) {
      blocks.push({ minX: chute.maxX, maxX: BOX.maxX, minZ: tier.minZ, maxZ: tier.maxZ, top: tier.top });
      const maxZ = Math.min(tier.maxZ, chute.minZ);
      if (maxZ > tier.minZ) blocks.push({ minX: BOX.minX, maxX: chute.maxX, minZ: tier.minZ, maxZ, top: tier.top });
    }
  }
  const corded = isCorded(field);
  const box = holeBox(field, chute);
  const crater = field === 'volcano' ? craterOf(box) : null;
  return {
    // Under a sprung bed the slabs are its solid base, meeting it along the box's rim.
    floor: floorRects([{ minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ }]),
    bed: corded ? bedMesh(box, lift) : undefined,
    ropes: corded ? [...bedRopes(box, crater?.lean ?? 0, lift), ...(crater ? craterRopes(box) : [])] : [],
    nets: holeNets(field, chute),
    blocks,
    boxes: field === 'tower'
      ? towers.flatMap(towerBoxes)
      : field === 'shaker' ? frameBoxes().map((b) => ({ center: b.center, half: b.half, friction: 0.5, bounce: 0.3 })) : [],
    hulls: crater ? craterHulls(box) : [],
    floorBounce: FLOOR_BOUNCE[field],
    pieceBounce: crater ? CRATER_BOUNCE : FLOOR_BOUNCE[field],
    barrier: !crater,
  };
}

/** Where the claw returns to drop its prize: straight over the middle of the hole. */
export function homeOf(chute: Chute) {
  return { x: (chute.minX + chute.maxX) / 2, z: (chute.minZ + chute.maxZ) / 2 };
}
export const HOME = homeOf(CHUTE);
/**
 * Underside of the 防甩片, the plate hung under the trolley. The claw rope
 * comes down through its hole, so this is where the claw swings from, and the
 * claw's housing is pulled up against it at the top stop.
 */
export const PLATE_Y = BOX.height - 0.125;
/** Kept for callers from before the plate: the swing pivot. */
export const CABLE_ANCHOR_Y = PLATE_Y;

/**
 * The 防甩片 as the operator sets it: how far below it the claw stops at the
 * top (gap; 0 = 鎖緊, the claw can't swing at all up there) and how far it is
 * bent (tilt; a bent plate throws the prize away from the hole, 內丟).
 */
export interface AntiSwing { gap: number; tilt: number }
export const ANTI_SWING_LIMITS = { gap: { min: 0, max: 0.05 }, tilt: { min: 0, max: 45 } } as const;
export const DEFAULT_ANTI_SWING: AntiSwing = { gap: 0.01, tilt: 0 };

export function sanitizeAntiSwing(raw: unknown): AntiSwing {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const { gap, tilt } = ANTI_SWING_LIMITS;
  return {
    gap: Math.round(Math.min(gap.max, Math.max(gap.min, num(obj.gap, DEFAULT_ANTI_SWING.gap))) * 1000) / 1000,
    tilt: Math.round(Math.min(tilt.max, Math.max(tilt.min, num(obj.tilt, DEFAULT_ANTI_SWING.tilt)))),
  };
}

/**
 * The lean a bent 防甩片 gives the claw (swing angles, rad): the plate's
 * bend, bottom away from the hole. Seated against the plate the housing
 * lines up with it; the gap under the plate lets it hang back toward
 * plumb by up to `plateFreePlay`.
 */
export function plateSeat(sim: Pick<ClawSim, 'antiSwing' | 'chute'>) {
  const bend = (sim.antiSwing.tilt * Math.PI) / 180;
  if (bend === 0) return { x: 0, z: 0 };
  const home = homeOf(sim.chute);
  const n = Math.hypot(home.x, home.z) || 1;
  return { x: (-home.x / n) * bend, z: (-home.z / n) * bend };
}

/** How far the claw can tilt off the plate's angle at the top stop (rad): what the gap under it allows. */
export function plateFreePlay(spec: ClawSpec, gap: number) {
  return Math.asin(Math.min(1, gap / headRim(spec)));
}

/** How far the claw hangs tilted at rest at the top stop (degrees): the bend, less the free play. */
export function topLean(spec: ClawSpec, anti: AntiSwing) {
  return Math.max(0, anti.tilt - (plateFreePlay(spec, anti.gap) * 180) / Math.PI);
}

/** Hub height at the top stop: the housing's cable eye `gap` below the 防甩片. */
export function topHubY(spec: ClawSpec, gap: number = DEFAULT_ANTI_SWING.gap) {
  return PLATE_Y - gap - headTop(spec);
}

/** The standard claw's top stop under the factory 防甩片. */
export const CLAW_TOP = PLATE_Y - DEFAULT_ANTI_SWING.gap - 0.125;
/** Below this voltage the coil can't pull the arms shut, so the claw hangs open. */
export const CLOSE_MIN_POWER = 4.8;
/** Restocked prizes stack no higher than this, whatever the claw. */
const FILL_TOP_MAX = 0.68;
/** A jolt (the claw slamming into the 防甩片, 上停上拉) dies away with this time constant (s). */
const JOLT_DECAY = 0.12;
/** Extra grip load per 上停上拉 段, as a fraction of the prize's weight. */
const JOLT_PER_PULL = 0.04;
/** Throw speed (m/s) a fully bent (45°) 防甩片 gives a prize slipping at the top. */
const TILT_THROW = 0.9;
const GANTRY_MARGIN = 0.06;
const GRAVITY = 9.8;
/** Claw centre of mass sits this far above the hub. */
const CLAW_COM = 0.04;
/** Air + cable friction on the swing (1/s); amplitude halves in ~1.7 s. */
const SWING_DAMP = 0.8;
const MAX_SWING = 1.0;
/** The hub stays this far inside the glass; a bigger swing bounces off it. */
const HUB_WALL_MARGIN = 0.05;
/** Prize centre below this height means it went down the chute. */
const WIN_Y = -0.15;

const CLOSE_TIME = 0.45;
const RELEASE_TIME = 0.9;
const RESET_TIME = 0.4;
/** A dodecahedron's half-extent as a fraction of its circumradius: its inradius (0.795), a hair over, as it lies on a face. */
const DODECA_HALF = 0.8;
/** The magnet grabs iron up to this far below its face (m). */
const MAGNET_REACH = 0.015;
/** Swing kick per 上停上拉 段 when the claw hits the top stop (rad/s); the 防甩片 then limits it. */
const TOP_PULL_KICK = 0.45;
const SUBSTEP = 1 / 240;
/** Physics step used while a fresh stock settles (no claw logic running). */
const SETTLE_STEP = 1 / 120;

export { gantrySpeed, winchSpeed } from './settings';

const STANDARD = CLAW_SPECS.standard;

/** Tip radius and depth below the hub for a given openness (0 closed .. 1 open). */
export function prongGeometry(open: number, spec: ClawSpec = STANDARD) {
  const reach = spec.reachClosed + (spec.reachOpen - spec.reachClosed) * clamp01(open);
  const angle = Math.asin(Math.min(1, Math.max(0, (reach - spec.pivotR) / spec.prongLen)));
  return { reach, angle, dy: spec.prongLen * Math.cos(angle) };
}

/** Pendulum length from the 防甩片 hole to the claw's centre of mass. */
export function pendulumLength(hubY: number) {
  return Math.max(0.04, PLATE_Y - hubY - CLAW_COM);
}

/** Lowest the hub can go: open tips just clear of the felt. */
export function floorHubY(spec: ClawSpec = STANDARD) {
  return prongGeometry(1, spec).dy + 0.005;
}

/** Lowest the hub can go at (x, z) with the arms this open: tips clear of the felt, a step or a 火山口's cords. */
function floorHubAt(sim: ClawSim, x: number, z: number, open: number) {
  const g = prongGeometry(open, sim.clawSpec);
  let top = fieldTopUnder(sim.field, x, z, g.reach, sim.chute, sim.bedLift, towerSitesOf(sim));
  // Down a 大怒神's shaft, the acrylic box's lid wherever it is now (unless it's on the magnet, which it follows).
  for (const t of sim.towers) {
    if (!t.held && inShaft(t.site, x, z, g.reach)) top = Math.max(top, t.boxY + TOWER.box.h);
  }
  // A 搖骰子盒's lid, wherever the cords have it (unless it's on the magnet).
  const s = sim.shaker;
  const B = SHAKER.box;
  if (s && !s.held && Math.abs(x - s.x) < B.half + g.reach && Math.abs(z - s.z) < B.half + g.reach) {
    top = Math.max(top, s.y + B.h);
  }
  return top + g.dy + 0.005;
}

/** Hub height where the 下線長度 runs out, hanging straight (no swing). */
export function dropLimitHubY(settings: ClawSettings, spec: ClawSpec = STANDARD, gap = DEFAULT_ANTI_SWING.gap) {
  return Math.max(floorHubY(spec), topHubY(spec, gap) - dropLineLength(settings));
}

/** This machine's top stop for its fitted claw and 防甩片. */
export function clawTop(sim: ClawSim) {
  return topHubY(sim.clawSpec, sim.antiSwing.gap);
}

/** From the 防甩片 hole down to the hub with the claw at the top stop. */
function topRod(sim: ClawSim) {
  return sim.antiSwing.gap + headTop(sim.clawSpec);
}

/** Pivot → centre of mass with `line` of rope out. */
function swingLength(sim: ClawSim, line: number) {
  return pendulumLength(clawTop(sim) - line);
}

/**
 * Hub height with `line` metres of cable out below the top stop. The cable is
 * the hypotenuse of a swinging claw, so the swing lifts it by (1 − cos θ).
 */
function hubYOnCable(sim: ClawSim, line: number) {
  const c = sim.claw;
  const s2 = Math.sin(c.swingX) ** 2 + Math.sin(c.swingZ) ** 2;
  const cos = Math.sqrt(Math.max(0, 1 - s2));
  return clawTop(sim) - line + (topRod(sim) + line) * (1 - cos);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Prize {
  id: number;
  kind: PrizeKind;
  category: ItemCategory;
  shape: PrizeShape;
  color: string;
  accent: string;
  /** Sphere radius; for boxes the bounding-sphere radius. */
  r: number;
  /** Half extents in the prize's own frame. Spheres have all three equal to r. */
  halfX: number; halfY: number; halfZ: number;
  /** Current world-axis half extents of the (possibly tumbled) shape. */
  extX: number; extY: number; extZ: number;
  /** Relative heft: grip needed to hold it (strong claw ≈ 1.1–1.5 when centred). */
  weight: number;
  /** Surface friction from the catalogue: plush 1, smooth plastic / cardboard less. */
  grip: number;
  /** Iron: the magnet claw can lift it. */
  magnetic: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Orientation quaternion (prizes tumble, roll and tip). */
  qx: number; qy: number; qz: number; qw: number;
  held: boolean;
  won: boolean;
}

export interface Claw {
  /** Trolley (gantry) position: where the cable is anchored. */
  x: number; z: number;
  /** Where the hub actually is: trolley plus the pendulum's swing offset. */
  hx: number; hz: number;
  /** Hub height. */
  y: number;
  /** Cable paid out below the top stop (m): what the winch motor measures. */
  line: number;
  /** Sitting on the pile with the cable slack, rather than hanging from it. */
  resting: boolean;
  vx: number; vz: number;
  open: number;
  /** Current claw power, 0..MAX_POWER; ramps toward targetPower. */
  power: number;
  targetPower: number;
  /** Pendulum angles (rad): the hub sits at trolley + L·sin(angle) on each axis. */
  swingX: number; swingZ: number;
  swingVX: number; swingVZ: number;
}

export type Phase =
  | 'idle' | 'moving' | 'dropping' | 'closing' | 'lifting'
  | 'top' | 'returning' | 'releasing' | 'resetting';

export type SimEvent =
  | { type: 'roundStart'; guaranteed: boolean }
  | { type: 'timeUp' }
  | { type: 'grab'; prizeId: number; quality: number }
  /** dx/dz: nearest prize centre minus claw centre (m), so the UI can say how far off the drop was. */
  | { type: 'miss'; nearest: { dx: number; dz: number } | null }
  /** The coil switched voltage: past 中壓距離頂點 (mid), or the gantry heading home (weak). */
  | { type: 'stage'; stage: 'mid' | 'weak' }
  /** weak: the claw had already dropped below strong power when it let go. */
  | { type: 'slip'; prizeId: number; weak: boolean }
  | { type: 'win'; prizeId: number; kind: PrizeKind }
  /**
   * 大怒神 (which tower): the magnet has its box; it let go (height fallen
   * from, m); the dice read, one list of points per cell, which cells won,
   * and whether it paid out.
   */
  | { type: 'lift'; tower: number }
  | { type: 'drop'; tower: number; height: number }
  | { type: 'dice'; tower: number; faces: number[][]; wins: boolean[]; win: boolean; guaranteed: boolean }
  /** 搖骰子盒: the magnet has the plate; it let go (how far it had hauled the box, m); the dice read. */
  | { type: 'shakeLift' }
  | { type: 'shakeDrop'; height: number }
  | { type: 'shakeDice'; faces: number[]; reds: number; win: boolean; guaranteed: boolean }
  | { type: 'roundEnd' };

export interface Stats { coins: number; plays: number; wins: number; guarantees: number }

/** Which of the board's voltages the coil is on. */
export type PowerStage = 'strong' | 'mid' | 'weak' | 'guarantee';

export interface ClawSim {
  settings: ClawSettings;
  /** Rapier world holding the cabinet, the prizes and the claw's colliders. */
  physics: PrizeWorld;
  /** The claw head currently fitted (operator-swappable). */
  clawSpec: ClawSpec;
  /** What restock() loads the cabinet with. */
  stock: Stock;
  /** The prize chute as the operator has set it. */
  chute: Chute;
  /** The 檯面 fitted. */
  field: FieldType;
  /** How far a 3D 彈跳台's far corners are raised (m); only the bounce tables use it. */
  bedLift: number;
  /** The 大怒神 setup (kept while another 檯面 is fitted), and the towers standing when it's in. */
  towerConfig: TowerConfig;
  towers: TowerState[];
  /** The 搖骰子盒 setup (kept while another 檯面 is fitted), and the box when it's in. */
  shakerConfig: ShakerConfig;
  shaker: ShakerState | null;
  /** The 防甩片 as the operator has set it. */
  antiSwing: AntiSwing;
  /** 限位器 and 起始點. */
  gantry: GantryConfig;
  /**
   * Extra load on the grip, as a fraction of the prize's weight, while a jolt
   * dies away: the claw slamming into the 防甩片 or the 上停上拉 tug.
   */
  jolt: number;
  /** Velocity a bent 防甩片 gives a prize that slips during the jolt (內丟), decaying with it. */
  throwX: number;
  throwZ: number;
  /** The last load stopped short: the pile reached the raised claw. */
  full: boolean;
  phase: Phase;
  phaseTime: number;
  time: number;
  timer: number;
  coins: number;
  credits: number;
  claw: Claw;
  prizes: Prize[];
  heldId: number | null;
  grip: { quality: number; jitter: number };
  powerStage: PowerStage;
  /** The claw has closed (or tried to) this round. */
  closed: boolean;
  /** Power when the claw closed; a slip below it counts as the claw going weak. */
  grabPower: number;
  guaranteed: boolean;
  /** Rounds played since the last guaranteed round (保夾 mode counter). */
  sinceGuarantee: number;
  midAirRequest: boolean;
  stats: Stats;
  events: SimEvent[];
  rng: number;
}

export interface Joystick { x: number; z: number }

// ── 天車限位 (limit switches and start point) ───────────────────────────────

const cm = (v: number) => Math.round(v * 100) / 100;

/** Where the gantry can go with its limit switches at the ends of the rails (m). */
export const GANTRY_RANGE = {
  minX: cm(BOX.minX + GANTRY_MARGIN), maxX: cm(BOX.maxX - GANTRY_MARGIN),
  minZ: cm(BOX.minZ + GANTRY_MARGIN), maxZ: cm(BOX.maxZ - GANTRY_MARGIN),
} as const;

/**
 * 限位器 and 起始點, as the operator sets them. The limit switches bound
 * where the gantry can run; moved in from the rail ends they fence the claw
 * into part of the cabinet, or, all the way in, pin it over one spot (say a
 * 大怒神's shaft). The start point is where the claw waits, starts each round
 * and comes back to to let go; null is over the chute. It always lies inside
 * the limits.
 */
export interface GantryConfig {
  minX: number; maxX: number; minZ: number; maxZ: number;
  home: { x: number; z: number } | null;
}

/** Accept anything (e.g. parsed localStorage) and return valid limits and start point, snapped to whole cm. */
export function sanitizeGantry(raw: unknown): GantryConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const R = GANTRY_RANGE;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const within = (v: number, lo: number, hi: number) => cm(Math.min(hi, Math.max(lo, v)));
  let minX = within(num(obj.minX, R.minX), R.minX, R.maxX), maxX = within(num(obj.maxX, R.maxX), R.minX, R.maxX);
  let minZ = within(num(obj.minZ, R.minZ), R.minZ, R.maxZ), maxZ = within(num(obj.maxZ, R.maxZ), R.minZ, R.maxZ);
  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minZ > maxZ) [minZ, maxZ] = [maxZ, minZ];
  const h = (obj.home && typeof obj.home === 'object' ? obj.home : null) as Record<string, unknown> | null;
  const home = h && Number.isFinite(h.x) && Number.isFinite(h.z)
    ? { x: within(h.x as number, minX, maxX), z: within(h.z as number, minZ, maxZ) }
    : null;
  return { minX, maxX, minZ, maxZ, home };
}

/** Factory setting: the whole rail range, starting over the chute. */
export const DEFAULT_GANTRY: GantryConfig = sanitizeGantry({});

/** Where the claw parks and comes back to: the start point, or over the chute, kept inside the limits. */
export function gantryHome(g: GantryConfig, chute: Chute) {
  const p = g.home ?? homeOf(chute);
  return { x: Math.min(g.maxX, Math.max(g.minX, p.x)), z: Math.min(g.maxZ, Math.max(g.minZ, p.z)) };
}

/** Limit switches closed in on (x, z), which is also the start point: the gantry can't move at all. */
export function pinnedGantry(x: number, z: number): GantryConfig {
  return sanitizeGantry({ minX: x, maxX: x, minZ: z, maxZ: z, home: { x, z } });
}

/** Move the limit switches or the start point. An idle claw goes straight to its new start point. */
export function setGantry(sim: ClawSim, cfg: GantryConfig) {
  sim.gantry = sanitizeGantry(cfg);
  if (sim.phase !== 'idle') return;
  const home = gantryHome(sim.gantry, sim.chute);
  Object.assign(sim.claw, { x: home.x, z: home.z, hx: home.x, hz: home.z, vx: 0, vz: 0 });
  seatClaw(sim);
}

// ── RNG (mulberry32; the sin-hash used elsewhere in the repo is biased) ─────

function rand(sim: { rng: number }): number {
  let t = (sim.rng = (sim.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }
function approach(cur: number, target: number, maxDelta: number) {
  return cur < target ? Math.min(target, cur + maxDelta) : Math.max(target, cur - maxDelta);
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function inChute(x: number, z: number, margin = 0, chute: Chute = CHUTE) {
  return x < chute.maxX + margin && z > chute.minZ - margin;
}

/**
 * Pile height limit for loading: a few cm under the tips of the raised,
 * closed claw, so a full cabinet still lets the claw travel over it.
 */
function fillTop(sim: ClawSim) {
  return Math.min(FILL_TOP_MAX, clawTop(sim) - prongGeometry(0, sim.clawSpec).dy - 0.04);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Roll a prize from the stocked categories (category first, so plush's five animals don't crowd out the rest). */
function makePrize(sim: ClawSim, id: number): Prize {
  const cats = sim.stock.categories;
  const defs = itemsIn(cats[Math.floor(rand(sim) * cats.length)]);
  const def = defs[Math.floor(rand(sim) * defs.length)];
  const [color, accent] = def.colors[Math.floor(rand(sim) * def.colors.length)];
  const t = rand(sim);
  let halfX: number, halfY: number, halfZ: number, r: number;
  if (def.shape === 'sphere' && def.r) {
    r = lerp(def.r[0], def.r[1], t);
    halfX = halfY = halfZ = r;
  } else if (def.shape === 'dodeca' && def.r) {
    // r is the circumradius; lying on a face it stands its inradius (~0.8 r) either side.
    r = lerp(def.r[0], def.r[1], t);
    halfX = halfY = halfZ = r * DODECA_HALF;
  } else if (def.half) {
    halfX = lerp(def.half.x[0], def.half.x[1], t);
    halfY = lerp(def.half.y[0], def.half.y[1], t);
    halfZ = lerp(def.half.z[0], def.half.z[1], t);
    r = Math.hypot(halfX, halfY, halfZ);
  } else {
    throw new Error(`item ${def.kind} has no size`);
  }
  // Mostly facing the player, but loaded by hand: a bit of random yaw.
  const yaw = (rand(sim) - 0.5) * 1.4;
  return {
    id, kind: def.kind, category: def.category, shape: def.shape, color, accent,
    r, halfX, halfY, halfZ, extX: halfX, extY: halfY, extZ: halfZ,
    weight: lerp(def.weight[0], def.weight[1], t) + rand(sim) * 0.15,
    grip: def.grip,
    magnetic: def.magnetic ?? false,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    qx: 0, qy: Math.sin(yaw / 2), qz: 0, qw: Math.cos(yaw / 2),
    held: false, won: false,
  };
}

function addBody(sim: ClawSim, p: Prize) {
  sim.physics.addPrize(p.id, {
    shape: p.shape, r: p.r, halfX: p.halfX, halfY: p.halfY, halfZ: p.halfZ,
    mass: massFor(p.weight), ...MATERIALS[p.category],
    pos: { x: p.x, y: p.y, z: p.z }, rot: { x: p.qx, y: p.qy, z: p.qz, w: p.qw },
  });
}

/** Top of the pile across a footprint of radius r (rays only see bodies that have been stepped). */
function columnTop(sim: ClawSim, x: number, z: number, r: number) {
  let top = 0;
  for (const [dx, dz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
    const hit = sim.physics.rayDown(x + dx * r, z + dz * r, BOX.height);
    if (hit !== null) top = Math.max(top, hit);
  }
  return top;
}

/**
 * Lower a prize in by hand at a random spot outside the chute, just above
 * whatever is already there. False when this layer has no room left.
 * `pending` holds prizes placed since the last physics step, which the rays
 * can't see yet.
 */
function dropIn(sim: ClawSim, p: Prize, pending: Prize[]): boolean {
  for (let tries = 0; tries < 60; tries++) {
    const x = BOX.minX + 0.01 + p.r + rand(sim) * (BOX.maxX - BOX.minX - 0.02 - 2 * p.r);
    const z = BOX.minZ + 0.01 + p.r + rand(sim) * (BOX.maxZ - BOX.minZ - 0.02 - 2 * p.r);
    // Kept back from the chute (and any 洞口網) so the pile slopes down to its divider instead of spilling over it.
    if (inChute(x, z, p.r + 0.07, holeBox(sim.field, sim.chute))) continue;
    const y = columnTop(sim, x, z, p.r) + p.r + 0.01 + rand(sim) * 0.03;
    if (y + p.r > fillTop(sim)) continue;
    if (pending.some((q) => Math.hypot(q.x - x, q.y - y, q.z - z) < q.r + p.r + 0.004)) continue;
    Object.assign(p, { x, y, z });
    sim.prizes.push(p);
    addBody(sim, p);
    pending.push(p);
    return true;
  }
  return false;
}

/**
 * Load n more prizes layer by layer, letting each layer fall into place.
 * Returns how many went in (fewer when the cabinet is full).
 */
function load(sim: ClawSim, n: number) {
  let id = sim.prizes.reduce((m, q) => Math.max(m, q.id + 1), 0);
  let pending: Prize[] = [];
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const p = makePrize(sim, id);
    if (!dropIn(sim, p, pending)) {
      // This layer is full: let it settle, then stack the next one on top.
      settle(sim, 0.6);
      pending = [];
      if (!dropIn(sim, p, pending)) break;
    }
    id++;
    placed++;
  }
  if (placed > 0) {
    // Balls keep rolling for a while; wait until the pile has stopped.
    settle(sim, 1.5);
    for (let t = 1.5; t < 6 && !prizesResting(sim); t += 0.5) settle(sim, 0.5);
  }
  return placed;
}

/**
 * Take out whatever went down the chute while loading, and anything that
 * bounced over the 擋板 and stuck in the box (on a 洞口網, or wedged in a
 * small opening): the operator doesn't leave prizes in the hole.
 */
function clearSpills(sim: ClawSim) {
  const box = holeBox(sim.field, sim.chute);
  // Down in the box, that is; one perched on the 擋板 or leaning in over its edge, propped by the pile, stays.
  const stuck = (p: Prize) => !p.won && !p.held && inChute(p.x, p.z, -0.7 * p.r, box) && p.y - p.extY < 0.02;
  for (const p of sim.prizes) if (stuck(p)) sim.physics.remove(p.id);
  sim.prizes = sim.prizes.filter((p) => !p.won && !stuck(p));
}

/** Load until `target` prizes are inside, replacing any that tumble into the chute while the pile settles. */
function fillTo(sim: ClawSim, target: number) {
  for (let pass = 0; pass < 3; pass++) {
    clearSpills(sim);
    const missing = target - sim.prizes.length;
    if (missing <= 0 || load(sim, missing) === 0) break;
  }
  clearSpills(sim);
  sim.full = sim.prizes.length < target;
}

/** How many a restock loads: the set count, or a fresh roll in countMin..count. */
function rollCount(sim: ClawSim) {
  const { count, random, countMin } = sim.stock;
  if (!random) return count;
  const lo = Math.min(countMin, count);
  return lo + Math.floor(rand(sim) * (count - lo + 1));
}

/**
 * Empty the cabinet and load it again. Pass a stock to change what (and how
 * many) the operator loads.
 */
export function restock(sim: ClawSim, stock: Partial<Stock> = {}) {
  sim.stock = { ...sim.stock, ...stock };
  sim.physics.clearPrizes();
  sim.prizes = [];
  sim.heldId = null;
  if (holdsDiceOnly(sim.field)) {
    // A 大怒神 or 搖骰子盒 cabinet holds only its dice; the stock is what a win pays out.
    for (const t of sim.towers) placeDice(sim, t);
    placeShakerDice(sim);
    sim.full = false;
    return;
  }
  fillTo(sim, rollCount(sim));
}

/**
 * 補貨: add prizes on top of the pile until the cabinet holds the stocked
 * amount again. What's already inside stays where it is.
 */
export function topUp(sim: ClawSim, stock: Partial<Stock> = {}) {
  sim.stock = { ...sim.stock, ...stock };
  if (holdsDiceOnly(sim.field)) return;
  fillTo(sim, rollCount(sim));
}

/**
 * Bring the cabinet to exactly n prizes now: more are lowered in on top of
 * the pile, extras are lifted off the top (a held prize stays in the claw).
 */
export function setPrizeCount(sim: ClawSim, n: number, stock: Partial<Stock> = {}) {
  sim.stock = { ...sim.stock, ...stock };
  sim.prizes = sim.prizes.filter((p) => !p.won);
  sim.full = false;
  if (holdsDiceOnly(sim.field)) return;
  if (n > sim.prizes.length) {
    fillTo(sim, n);
    return;
  }
  const extra = sim.prizes.length - n;
  if (extra <= 0) return;
  const out = sim.prizes.filter((p) => !p.held).sort((a, b) => (b.y + b.extY) - (a.y + a.extY)).slice(0, extra);
  const gone = new Set(out.map((p) => p.id));
  for (const id of gone) sim.physics.remove(id);
  sim.prizes = sim.prizes.filter((p) => !gone.has(p.id));
  settle(sim, 0.5);
}

/**
 * Refit the prize chute (擋板 height, hole size). Prizes the new hole opens up
 * under drop straight through without scoring, and are replaced on top of the
 * pile so the cabinet keeps its count. An idle claw moves over the new hole.
 */
export function setChute(sim: ClawSim, cfg: ChuteConfig) {
  sim.chute = chuteFrom(sanitizeChute(cfg));
  refitField(sim);
}

/**
 * Raise or lower a 3D 彈跳台's far corners. The prizes stay; any the bed
 * would rise through go back in on top.
 */
export function setBedLift(sim: ClawSim, lift: number) {
  sim.bedLift = sanitizeBedLift(lift);
  refitField(sim);
}

/**
 * Change the 檯面. As on a real machine the prizes come out while the floor
 * is swapped, then the same number go back in on the new surface.
 */
export function setField(sim: ClawSim, field: FieldType) {
  // Coming off a 大怒神 (which holds no prizes), load the stocked amount.
  const count = holdsDiceOnly(sim.field) ? rollCount(sim) : prizesLeft(sim);
  sim.field = isFieldType(field) ? field : 'flat';
  removeTowers(sim);
  fitShaker(sim, false);
  sim.physics.clearPrizes();
  sim.prizes = [];
  sim.heldId = null;
  refitField(sim); // stands the towers on a 大怒神
  fitShaker(sim, sim.field === 'shaker');
  if (!holdsDiceOnly(sim.field)) fillTo(sim, count);
}

function refitField(sim: ClawSim) {
  fitTowers(sim);
  const before = prizesLeft(sim);
  // A bed or 火山口 rising through a prize would fling it; take those out,
  // and they go back in on top of the pile. (A prize resting on a slope has
  // its bottom above the slope under its centre, so it stays.)
  const buried = new Set(sim.prizes
    .filter((p) => !p.won && !p.held)
    .filter((p) => {
      const under = Math.max(
        fieldHeightAt(sim.field, p.x, p.z, sim.chute, sim.bedLift, towerSitesOf(sim)),
        craterTopUnder(sim.field, p.x, p.z, p.r, sim.chute),
      );
      return p.y - p.extY < under - 0.005;
    })
    .map((p) => p.id));
  for (const id of buried) sim.physics.remove(id);
  sim.prizes = sim.prizes.filter((p) => !buried.has(p.id));
  sim.physics.setChute(holeBox(sim.field, sim.chute), fieldDesc(sim.field, sim.chute, sim.bedLift, towerSitesOf(sim)));
  if (sim.phase === 'idle') {
    const home = gantryHome(sim.gantry, sim.chute);
    Object.assign(sim.claw, { x: home.x, z: home.z, hx: home.x, hz: home.z, vx: 0, vz: 0 });
    seatClaw(sim);
  }
  settle(sim, 1);
  if (prizesLeft(sim) < before) fillTo(sim, before);
}

/** Prizes still in the cabinet. */
export function prizesLeft(sim: ClawSim) {
  return sim.prizes.reduce((n, p) => n + (p.won ? 0 : 1), 0);
}

/** Run prize physics only (claw parked), so a fresh layout comes to rest before play. */
export function settle(sim: ClawSim, seconds: number) {
  for (let t = 0; t < seconds; t += SETTLE_STEP) {
    sim.physics.poseClaw(clawPose(sim));
    sim.physics.step(SETTLE_STEP);
  }
  syncPrizes(sim, false);
  readDice(sim);
}

/**
 * Put a specific prize in the cabinet (tests, and anything that stages a
 * scene). Ray queries (surfaceHeightAt) see it after the next physics step.
 */
export function spawnPrize(sim: ClawSim, props: Partial<Prize> & { x: number; z: number }): Prize {
  const shape = props.shape ?? 'sphere';
  const r0 = props.r ?? 0.07;
  const round = shape === 'dodeca' ? r0 * DODECA_HALF : r0;
  const halfX = props.halfX ?? round, halfY = props.halfY ?? round, halfZ = props.halfZ ?? round;
  const category = props.category ?? (shape === 'box' ? 'figure' : 'plush');
  const def = itemsIn(category)[0];
  const p: Prize = {
    id: sim.prizes.reduce((m, q) => Math.max(m, q.id + 1), 0),
    kind: def.kind, category, shape, color: '#ffffff', accent: '#111111',
    weight: 0.6, grip: def.grip, magnetic: def.magnetic ?? false,
    y: halfY, vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, held: false, won: false,
    ...props,
    r: shape === 'box' ? Math.hypot(halfX, halfY, halfZ) : r0,
    halfX, halfY, halfZ, extX: halfX, extY: halfY, extZ: halfZ,
  };
  sim.prizes.push(p);
  addBody(sim, p);
  return p;
}

/** Release the physics world's (WASM) memory. The sim is unusable afterwards. */
export function disposeSim(sim: ClawSim) {
  sim.physics.free();
}

/** Deepest overlap between any two prizes, or a prize and the cabinet (m). */
export function maxPenetration(sim: ClawSim) {
  return sim.physics.maxPenetration();
}

/** True once every loose prize has stopped moving. */
export function prizesResting(sim: ClawSim, speed = 0.02) {
  return sim.physics.allResting(speed);
}

export interface CreateOptions {
  seed?: number;
  /** Load exactly this many (overrides the stock's count and random mode). */
  prizeCount?: number;
  claw?: ClawType;
  /** Size (號數), 直/彎 and 爪位 of the claw. */
  clawFit?: Partial<ClawFit>;
  chute?: ChuteConfig;
  field?: FieldType;
  /** A 3D 彈跳台's corner lift (m). */
  bedLift?: number;
  /** The 大怒神 setup: how many towers, each one's cells, the springs. */
  tower?: Partial<TowerConfig>;
  /** The 搖骰子盒 setup: dice, rule, cords. */
  shaker?: Partial<ShakerConfig>;
  antiSwing?: AntiSwing;
  /** 限位器 and 起始點. */
  gantry?: GantryConfig;
  categories?: ItemCategory[];
  stock?: Partial<Stock>;
}

export function createSim(settings: ClawSettings = defaultSettings(), opts: CreateOptions = {}): ClawSim {
  const chute = chuteFrom(sanitizeChute(opts.chute));
  const field = isFieldType(opts.field) ? opts.field : 'flat';
  const bedLift = sanitizeBedLift(opts.bedLift);
  const towerConfig = sanitizeTower({ ...DEFAULT_TOWER, ...opts.tower });
  const towers = layoutTowers(field, towerConfig, chute);
  const sim: ClawSim = {
    settings,
    physics: new PrizeWorld({ ...BOX, chute: holeBox(field, chute), field: fieldDesc(field, chute, bedLift, towers) }),
    clawSpec: buildClawSpec(opts.claw ?? 'standard', opts.clawFit),
    stock: { ...DEFAULT_STOCK, ...opts.stock },
    chute,
    field,
    bedLift,
    towerConfig,
    towers: [],
    shakerConfig: sanitizeShaker({ ...opts.shaker }),
    shaker: null,
    antiSwing: sanitizeAntiSwing(opts.antiSwing),
    gantry: sanitizeGantry(opts.gantry),
    jolt: 0, throwX: 0, throwZ: 0,
    full: false,
    phase: 'idle', phaseTime: 0, time: 0, timer: 0,
    coins: 0, credits: 0,
    claw: {
      x: 0, z: 0, hx: 0, hz: 0, y: 0, line: 0, resting: false,
      vx: 0, vz: 0, open: 0,
      power: settings.strongPower, targetPower: settings.strongPower,
      swingX: 0, swingZ: 0, swingVX: 0, swingVZ: 0,
    },
    prizes: [], heldId: null, grip: { quality: 0, jitter: 1 },
    powerStage: 'strong', closed: false, grabPower: 0,
    guaranteed: false, sinceGuarantee: 0, midAirRequest: false,
    stats: { coins: 0, plays: 0, wins: 0, guarantees: 0 },
    events: [],
    rng: (opts.seed ?? 20260925) | 0,
  };
  const home = gantryHome(sim.gantry, sim.chute);
  Object.assign(sim.claw, { x: home.x, z: home.z, hx: home.x, hz: home.z, y: clawTop(sim) });
  seatClaw(sim);
  fitTowers(sim);
  fitShaker(sim, field === 'shaker');
  restock(sim, {
    ...(opts.prizeCount !== undefined ? { count: opts.prizeCount, random: false } : {}),
    ...(opts.categories ? { categories: opts.categories } : {}),
  });
  return sim;
}

/** Fit a different claw head, size or 爪位. Safe at any time; a held prize stays held. */
export function setClaw(sim: ClawSim, type: ClawType, fit: Partial<ClawFit> = {}) {
  sim.clawSpec = buildClawSpec(type, fit);
  if (sim.phase === 'idle') sim.claw.y = hubYOnCable(sim, sim.claw.line);
}

/** Refit the 防甩片 (gap, bend). An idle claw settles to the new top stop. */
export function setAntiSwing(sim: ClawSim, cfg: AntiSwing) {
  sim.antiSwing = sanitizeAntiSwing(cfg);
  if (sim.phase === 'idle') seatClaw(sim);
}

/**
 * Park the claw at rest the way the 防甩片 holds it: plumb, or leaning as
 * far toward a bent plate's angle as the gap makes it (so the service panel
 * shows the change while the game is paused).
 */
function seatClaw(sim: ClawSim) {
  const c = sim.claw;
  const seat = plateSeat(sim);
  const bend = Math.hypot(seat.x, seat.z);
  const lean = Math.max(0, bend - plateFreePlay(sim.clawSpec, sim.antiSwing.gap + c.line));
  const k = bend > 0 ? lean / bend : 0;
  c.swingX = seat.x * k;
  c.swingZ = seat.z * k;
  c.swingVX = c.swingVZ = 0;
  const L = swingLength(sim, c.line);
  c.hx = c.x + L * Math.sin(c.swingX);
  c.hz = c.z + L * Math.sin(c.swingZ);
  c.y = hubYOnCable(sim, c.line);
  sim.physics.poseClaw(clawPose(sim), true);
}

/** How open the claw hangs between rounds and while the gantry moves (待機爪子). */
export function idleOpenness(settings: Pick<ClawSettings, 'idleOpen'>) {
  return settings.idleOpen === 1 ? 1 : 0;
}

/**
 * Drive the arms open or shut directly, for the service panel while the game
 * is paused (the 待機爪子 setting takes effect in the scene right away).
 */
export function jogArms(sim: ClawSim, open: boolean, dt: number) {
  const c = sim.claw;
  c.open = approach(c.open, open ? 1 : 0, Math.max(0, Math.min(dt, 0.05)) / CLOSE_TIME);
}

// ── Player input ─────────────────────────────────────────────────────────────

export function insertCoin(sim: ClawSim) {
  sim.coins++;
  sim.stats.coins++;
  const per = sim.settings.coinsPerPlay;
  if (sim.coins >= per) {
    sim.coins -= per;
    sim.credits++;
  }
}

export function pressDrop(sim: ClawSim) {
  if (sim.phase === 'moving') beginDrop(sim);
  else if (sim.phase === 'dropping' && sim.settings.midAirGrab === 1) sim.midAirRequest = true;
}

export function drainEvents(sim: ClawSim): SimEvent[] {
  const out = sim.events;
  sim.events = [];
  return out;
}

export function heldPrize(sim: ClawSim): Prize | null {
  return sim.heldId === null ? null : sim.prizes.find((p) => p.id === sim.heldId) ?? null;
}

// ── 大怒神 (drop tower) ──────────────────────────────────────────────────────

/** One 大怒神's moving parts, while the towers are fitted. */
export interface TowerState {
  /** Where it stands and how big it is. */
  site: TowerSite;
  /** Its cells' dice and rules. */
  setup: TowerSetup;
  /** The 升降台's underside (m) and its speed up (m/s), on the springs. */
  y: number;
  vy: number;
  /** The 壓克力盒's underside and its speed up. */
  boxY: number;
  boxVy: number;
  /** The magnet has the box, and how squarely it's on the iron disc (0–1). */
  held: boolean;
  grip: number;
  /** Highest the box's underside got while held this time. */
  peak: number;
  /** The round that lifted it was a 保夾 round. */
  guaranteed: boolean;
  /** A drop is under way; its dice are read once everything is still. */
  pending: boolean;
  /** Seconds since the drop, and how long everything has been still. */
  since: number;
  still: number;
  dice: TowerDie[];
  /** The last drop's read-out, or null before the first. */
  result: TowerResult | null;
}

export interface TowerDie {
  id: number;
  /** Which of the box's cells it's in. */
  cell: number;
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
  vx: number; vy: number; vz: number;
}

/**
 * A drop's points, one list per cell, which cells won, whether it paid out,
 * whether only because it was a 保夾 round, and when (sim time).
 */
export interface TowerResult {
  faces: number[][];
  wins: boolean[];
  win: boolean;
  guaranteed: boolean;
  at: number;
}

/** Physics ids for the towers' dice, clear of the prizes': 100 to a tower. */
const DIE_ID = 1_000_000;
/** Hard plastic dice: they bounce and tumble in the box. */
const DIE_MATERIAL = { friction: 0.4, restitution: 0.45, linearDamping: 0.05, angularDamping: 0.3 };
/** Lifted less than this, a let-go isn't a drop worth reading. */
const MIN_DROP = 0.03;
/** Still for this long, the dice are read; after this long they're read anyway. */
const DICE_STILL = 0.4;
const DICE_TIMEOUT = 6;

const platformName = (t: TowerState) => `platform-${t.site.index}`;
const boxName = (t: TowerState) => `box-${t.site.index}`;

function platformCentre(t: TowerState): Vec3 {
  return { x: t.site.x, y: t.y + TOWER.platform.thick / 2, z: t.site.z };
}

function boxBase(t: TowerState): Vec3 {
  return { x: t.site.x, y: t.boxY, z: t.site.z };
}

/** Where the towers stand in this cabinet as set up now (none off the 大怒神 檯面). */
function layoutTowers(field: FieldType, cfg: TowerConfig, chute: Chute): TowerSite[] {
  return field === 'tower' ? towerSites(cfg, BOX, chute) : [];
}

/** The towers standing now. */
export function towerSitesOf(sim: ClawSim): TowerSite[] {
  return sim.towers.map((t) => t.site);
}

/** Take every tower out: their dice, platforms and boxes. */
function removeTowers(sim: ClawSim) {
  for (const t of sim.towers) {
    for (const d of t.dice) sim.physics.remove(d.id);
    sim.physics.setMover(platformName(t), null);
    sim.physics.setMover(boxName(t), null);
  }
  sim.towers = [];
}

/** Do the towers standing now differ from where the setup puts them? */
function towersMoved(sim: ClawSim) {
  const sites = layoutTowers(sim.field, sim.towerConfig, sim.chute);
  return sites.length !== sim.towers.length || sites.some((s, i) => {
    const o = sim.towers[i].site;
    return o.kind !== s.kind || Math.abs(o.x - s.x) > 1e-9 || Math.abs(o.z - s.z) > 1e-9;
  });
}

/**
 * Stand the towers where the setup puts them, with their dice set out
 * afresh. Towers already standing just so are left alone (their dice where
 * they lie), so this is safe to call after any change.
 */
function fitTowers(sim: ClawSim) {
  if (!towersMoved(sim)) return;
  const sites = layoutTowers(sim.field, sim.towerConfig, sim.chute);
  removeTowers(sim);
  for (const site of sites) {
    const rest = platformRest(site.size);
    const t: TowerState = {
      site, setup: sim.towerConfig.towers[site.index],
      y: rest, vy: 0, boxY: rest + TOWER.platform.thick, boxVy: 0,
      held: false, grip: 0, peak: 0, guaranteed: false,
      pending: false, since: 0, still: 0, dice: [], result: null,
    };
    const P = site.size.platform;
    sim.physics.setMover(platformName(t), {
      parts: [{ offset: { x: 0, y: 0, z: 0 }, half: { x: P.x, y: TOWER.platform.thick / 2, z: P.z } }],
      pos: platformCentre(t),
    });
    sim.physics.setMover(boxName(t), { parts: boxParts(site), pos: boxBase(t) });
    sim.towers.push(t);
    placeDice(sim, t);
  }
}

/** Where the operator sets the dice in a cell: in its corners, then the middle. */
const DIE_SPOTS = [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0]] as const;

/** Set a tower's dice out on its box's floor, cell by cell, each on a random face, as the operator does. */
function placeDice(sim: ClawSim, t: TowerState) {
  for (const d of t.dice) sim.physics.remove(d.id);
  t.dice = [];
  const h = TOWER.die.half;
  const y = t.boxY + TOWER.box.wall + h + 0.002;
  const cells = cellsOf(t.setup);
  boxCells(t.site).forEach((cell, ci) => {
    const ox = cell.halfX - h - 0.006, oz = cell.halfZ - h - 0.006;
    for (let i = 0; i < (cells[ci]?.dice ?? 0); i++) {
      const [sx, sz] = DIE_SPOTS[i % DIE_SPOTS.length];
      const x = t.site.x + cell.x + sx * ox;
      const z = t.site.z + sz * oz;
      const q = faceUpRotation(1 + Math.floor(rand(sim) * 6), (rand(sim) - 0.5) * 0.6);
      const die: TowerDie = {
        id: DIE_ID + t.site.index * 100 + t.dice.length, cell: ci,
        x, y, z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: 0, vy: 0, vz: 0,
      };
      sim.physics.addPrize(die.id, {
        shape: 'box', r: h * Math.sqrt(3), halfX: h, halfY: h, halfZ: h, mass: TOWER.die.mass, ...DIE_MATERIAL,
        pos: { x, y, z }, rot: q,
      });
      t.dice.push(die);
    }
  });
}

/**
 * Change the 大怒神 setup. Taking a tower out, adding one or making it 雙格
 * stands them all afresh; a cell given a new number of dice has its tower's
 * dice set out again; a new rule or 彈性 just applies from now on.
 */
export function setTowerConfig(sim: ClawSim, cfg: Partial<TowerConfig>) {
  const next = sanitizeTower({ ...sim.towerConfig, ...cfg });
  sim.towerConfig = next;
  if (towersMoved(sim)) {
    // A new layout: stand them afresh, and the physics needs their walls where they stand now.
    refitField(sim);
    return;
  }
  for (const t of sim.towers) {
    const setup = next.towers[t.site.index];
    const counts = (s: TowerSetup) => cellsOf(s).map((c) => c.dice).join();
    const recount = counts(setup) !== counts(t.setup);
    t.setup = setup;
    if (recount) placeDice(sim, t);
  }
}

/** Copy the dice's physics state into the sim (for reading faces and drawing them), the 搖骰子盒's too. */
function readDice(sim: ClawSim) {
  for (const t of sim.towers) for (const d of t.dice) sim.physics.read(d.id, d);
  if (sim.shaker) for (const d of sim.shaker.dice) sim.physics.read(d.id, d);
}

/**
 * 大怒神: the magnet's face on (or just over) a box's lid takes hold of it
 * by the iron disc, the more squarely the stronger. Over the bare acrylic
 * near the edge it hasn't enough iron under it to lift the box.
 */
function grabBox(sim: ClawSim): boolean {
  const c = sim.claw;
  const t = sim.towers.find((w) => inShaft(w.site, c.hx, c.hz, sim.clawSpec.reachOpen));
  if (!t) return false;
  const gap = c.y - sim.clawSpec.prongLen - (t.boxY + TOWER.box.h);
  if (gap > MAGNET_REACH || gap < -0.01) return false;
  const off = Math.hypot(c.hx - t.site.x, c.hz - t.site.z);
  const grip = clamp01(1 - Math.max(0, off - 0.01) / (TOWER.box.disc + 0.015));
  if (grip < 0.2) return false;
  t.held = true;
  t.grip = grip;
  t.peak = t.boxY;
  t.guaranteed = sim.guaranteed;
  sim.events.push({ type: 'lift', tower: t.site.index });
  return true;
}

/** The magnet lets go of the box: it falls, and a real drop gets its dice read once they're still. */
function dropBox(sim: ClawSim, t: TowerState) {
  if (!t.held) return;
  t.held = false;
  const height = t.peak - boxRest(t.site.size);
  if (height < MIN_DROP) return;
  t.pending = true;
  t.since = 0;
  t.still = 0;
  sim.events.push({ type: 'drop', tower: t.site.index, height });
  // The lid tears off the magnet a little crooked, which sets the dice spinning.
  for (const d of t.dice) {
    sim.physics.spin(d.id, { x: (rand(sim) - 0.5) * 10, y: (rand(sim) - 0.5) * 4, z: (rand(sim) - 0.5) * 10 });
  }
}

/**
 * Move the towers' parts one substep. Held, a box rides the magnet's face
 * up the shaft (to the lip at the top, which tears it off). The magnet lets
 * go when the voltage can't hold the box any more (so 中壓距離頂點 and the
 * 中/弱 voltages set how high it falls from), or when the claw is taken
 * away. Free, the box falls onto the platform, which rides its springs.
 */
function stepTower(sim: ClawSim, h: number) {
  for (const t of sim.towers) stepOneTower(sim, t, h);
}

function stepOneTower(sim: ClawSim, t: TowerState, h: number) {
  const c = sim.claw;
  const { size } = t.site;
  const P = size.platform, B = size.box, S = TOWER.spring;
  if (t.held) {
    const face = c.y - sim.clawSpec.prongLen;
    const hold = (c.power / MAX_POWER) * 1.95 * sim.clawSpec.gripSphere * (0.4 + 0.6 * t.grip);
    const need = B.load * (1 + sim.jolt);
    const away = shaftClearance(t.site, c.hx, c.hz) < sim.clawSpec.reachOpen * 0.5;
    const done = sim.phase === 'releasing' || sim.phase === 'resetting' || sim.phase === 'idle';
    if (hold < need || face >= TOWER.lip || away || done) {
      dropBox(sim, t);
    } else {
      const y = Math.max(t.boxY, face - TOWER.box.h);
      t.boxVy = (y - t.boxY) / h;
      t.boxY = y;
      t.peak = Math.max(t.peak, y);
    }
  }
  if (!t.held) {
    t.boxVy -= GRAVITY * h;
    t.boxY += t.boxVy * h;
  }
  // The platform on its springs (which only push; they aren't fixed to it).
  const springTop = TOWER.baseTop + S.free;
  const k = S.k * size.springs, damping = springDamping(sim.towerConfig.spring) * size.springs;
  const push = t.y < springTop ? Math.max(0, k * (springTop - t.y) - damping * t.vy) : 0;
  t.vy += (push / P.mass - GRAVITY) * h;
  t.y += t.vy * h;
  const floor = TOWER.baseTop + S.solid; // coils touching
  if (t.y < floor) { t.y = floor; if (t.vy < 0) t.vy *= -0.3; }
  // A free box lands on the platform: a hard landing bounces, then they ride the springs together.
  const top = t.y + TOWER.platform.thick;
  if (!t.held && t.boxY < top) {
    const rel = t.boxVy - t.vy;
    if (rel < 0) {
      // A hard landing bounces as springily as the operator set; a gentle touch just settles.
      const e = rel < -0.3 ? landingBounce(sim.towerConfig.spring) : 0;
      const j = (-(1 + e) * rel) / (1 / B.mass + 1 / P.mass);
      t.boxVy += j / B.mass;
      t.vy -= j / P.mass;
    }
    // Share out the overlap so neither sinks into the other.
    const over = top - t.boxY;
    const share = P.mass / (B.mass + P.mass);
    t.boxY += over * share;
    t.y -= over * (1 - share);
  }
  const ceiling = TOWER.lip - TOWER.box.h;
  if (t.boxY > ceiling) { t.boxY = ceiling; if (t.boxVy > 0) t.boxVy = 0; }
  sim.physics.moveMover(platformName(t), platformCentre(t));
  sim.physics.moveMover(boxName(t), boxBase(t));
}

/** After a physics substep: follow the dice, and once a drop has settled, read them. */
function syncTower(sim: ClawSim, h: number) {
  readDice(sim);
  for (const t of sim.towers) {
    if (!t.pending || t.held) continue;
    t.since += h;
    const still = Math.abs(t.vy) < 0.03 && Math.abs(t.boxVy) < 0.03
      && t.dice.every((d) => Math.hypot(d.vx, d.vy, d.vz) < 0.03);
    t.still = still ? t.still + h : 0;
    if (t.still >= DICE_STILL || t.since >= DICE_TIMEOUT) finishDrop(sim, t);
  }
}

/** Read a tower's dice, cell by cell: pay out if either cell wins, or on any drop in a 保夾 round. */
function finishDrop(sim: ClawSim, t: TowerState) {
  t.pending = false;
  const faces = cellsOf(t.setup).map((_, ci) => t.dice
    .filter((d) => d.cell === ci)
    .map((d) => faceUp({ x: d.qx, y: d.qy, z: d.qz, w: d.qw })));
  const wins = cellWins(t.setup, faces);
  const win = wins.some(Boolean);
  const guaranteed = !win && t.guaranteed;
  t.result = { faces, wins, win: win || guaranteed, guaranteed, at: sim.time };
  t.guaranteed = false;
  sim.events.push({ type: 'dice', tower: t.site.index, faces, wins, win: win || guaranteed, guaranteed });
  if (win || guaranteed) dispense(sim);
}

/** A read-out stays in the close-up this long (s), unless a round is under way. */
const DICE_SHOWN = 4;

/** Where to look for a close-up of dice: the box's middle, its underside and height, and how far in front of it to stand. */
export interface DiceView { x: number; z: number; boxY: number; h: number; standoff: number }

/**
 * The dice worth a close look now (a 大怒神's box or the 搖骰子盒): tumbling
 * after a drop, or read in the last few seconds while the claw isn't being played.
 */
export function diceFocus(sim: ClawSim): DiceView | null {
  const tower = (t: TowerState): DiceView => ({
    x: t.site.x, z: t.site.z, boxY: t.boxY, h: TOWER.box.h, standoff: t.site.size.inner.z + 0.08,
  });
  const s = sim.shaker;
  const shaker = (b: ShakerState): DiceView => ({ x: b.x, z: b.z, boxY: b.y, h: SHAKER.box.h, standoff: SHAKER.box.half + 0.1 });
  if (s?.pending && !s.held) return shaker(s);
  const tumbling = sim.towers.find((t) => t.pending && !t.held);
  if (tumbling) return tower(tumbling);
  const playing = sim.phase === 'moving' || sim.phase === 'dropping' || sim.phase === 'closing' || sim.phase === 'lifting';
  if (playing) return null;
  let best: { at: number; view: DiceView } | null = null;
  for (const t of sim.towers) {
    if (t.result && sim.time - t.result.at < DICE_SHOWN && (!best || t.result.at > best.at)) best = { at: t.result.at, view: tower(t) };
  }
  if (s?.result && sim.time - s.result.at < DICE_SHOWN && (!best || s.result.at > best.at)) best = { at: s.result.at, view: shaker(s) };
  return best?.view ?? null;
}

/** The latest drop read on any tower, and which tower it was. */
export function lastTowerResult(sim: ClawSim): (TowerResult & { tower: number; double: boolean }) | null {
  let best: TowerState | null = null;
  for (const t of sim.towers) if (t.result && (!best?.result || t.result.at >= best.result.at)) best = t;
  return best?.result ? { ...best.result, tower: best.site.index, double: best.site.kind === 'double' } : null;
}

/** 出貨 for a 大怒神 win: one of the stocked prizes drops out through the chute. */
function dispense(sim: ClawSim) {
  const id = sim.prizes.reduce((m, q) => Math.max(m, q.id + 1), 0);
  const p = makePrize(sim, id);
  const home = homeOf(sim.chute);
  Object.assign(p, { x: home.x, y: -0.02 - p.extY, z: home.z });
  sim.prizes.push(p);
  addBody(sim, p);
}

/** Before a round, put a tower's dice back if any got out of its box (they shouldn't: it's closed). */
function collectDice(sim: ClawSim) {
  for (const t of sim.towers) {
    if (t.pending || t.held) continue;
    const B = t.site.size.box;
    const stray = t.dice.some((d) => Math.abs(d.x - t.site.x) > B.x || Math.abs(d.z - t.site.z) > B.z
      || d.y < t.boxY || d.y > t.boxY + TOWER.box.h);
    if (stray) placeDice(sim, t);
  }
}

// ── 搖骰子盒 (dice box on bungee cords) ─────────────────────────────────────

/** The 搖骰子盒's moving parts, while it's fitted. */
export interface ShakerState {
  /** The box's underside middle (m) and its velocity (m/s). */
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Where its underside hangs at rest on the cords as tight as they are now. */
  restY: number;
  /** How far it's rocked about the x and z axes (rad), and how fast. */
  tx: number; tz: number;
  wx: number; wz: number;
  /** The magnet has the plate, how squarely (0–1), and where the box sat from under it when it took hold. */
  held: boolean;
  grip: number;
  ox: number;
  oz: number;
  /** Furthest the magnet hauled it from rest this time (m). */
  peak: number;
  guaranteed: boolean;
  pending: boolean;
  since: number;
  still: number;
  dice: TowerDie[];
  result: ShakerResult | null;
}

/** A shake's points, how many came up red, whether it paid out, and when. */
export interface ShakerResult {
  faces: number[];
  reds: number;
  win: boolean;
  guaranteed: boolean;
  at: number;
}

/** Physics ids for the box's dice, clear of the prizes' and the towers'. */
const SHAKER_DIE_ID = 2_000_000;
const SHAKER_MOVER = 'shaker-box';

function shakerPos(s: ShakerState): Vec3 {
  return { x: s.x, y: s.y, z: s.z };
}

/** How the box is turned as it rocks: about x, then z, pivoting on its underside's middle. */
export function shakerRotation(s: ShakerState) {
  const sx = Math.sin(s.tx / 2), cx = Math.cos(s.tx / 2), sz = Math.sin(s.tz / 2), cz = Math.cos(s.tz / 2);
  return { x: sx * cz, y: -sx * sz, z: cx * sz, w: cx * cz };
}

/** Hang the 搖骰子盒 in its frame (on) or take it out. */
function fitShaker(sim: ClawSim, on: boolean) {
  const old = sim.shaker;
  if (old) for (const d of old.dice) sim.physics.remove(d.id);
  sim.physics.setMover(SHAKER_MOVER, null);
  sim.shaker = null;
  if (!on) return;
  const restY = shakerRestY(sim.shakerConfig.tension);
  const s: ShakerState = {
    x: SHAKER.x, y: restY, z: SHAKER.z, vx: 0, vy: 0, vz: 0, restY, tx: 0, tz: 0, wx: 0, wz: 0,
    held: false, grip: 0, ox: 0, oz: 0, peak: 0, guaranteed: false, pending: false, since: 0, still: 0, dice: [], result: null,
  };
  sim.shaker = s;
  sim.physics.setMover(SHAKER_MOVER, { parts: shakerBoxParts(SHAKER.shell), pos: shakerPos(s) });
  placeShakerDice(sim);
}

/** Set the dice out on the cube's floor, each on a random face, as the operator does. */
function placeShakerDice(sim: ClawSim) {
  const s = sim.shaker;
  if (!s) return;
  for (const d of s.dice) sim.physics.remove(d.id);
  s.dice = [];
  const h = SHAKER_DIE.half;
  const y = s.y + SHAKER.box.wall + h + 0.002;
  shakerDiceSpots().slice(0, sim.shakerConfig.dice).forEach((spot, i) => {
    const x = s.x + spot.x, z = s.z + spot.z;
    const q = faceUpRotation(1 + Math.floor(rand(sim) * 6), (rand(sim) - 0.5) * 0.6);
    const die: TowerDie = { id: SHAKER_DIE_ID + i, cell: i, x, y, z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: 0, vy: 0, vz: 0 };
    sim.physics.addPrize(die.id, {
      shape: 'box', r: h * Math.sqrt(3), halfX: h, halfY: h, halfZ: h, mass: SHAKER_DIE.mass, ...DIE_MATERIAL,
      pos: { x, y, z }, rot: q,
    });
    s.dice.push(die);
  });
}

/**
 * Change the 搖骰子盒 setup. A new number of dice is set out afresh; tighter
 * or slacker cords hang the cube at a new height; a new rule just applies
 * from now on.
 */
export function setShakerConfig(sim: ClawSim, cfg: Partial<ShakerConfig>) {
  const next = sanitizeShaker({ ...sim.shakerConfig, ...cfg });
  const before = sim.shakerConfig;
  sim.shakerConfig = next;
  if (!sim.shaker) return;
  if (next.dice !== before.dice || next.tension !== before.tension) {
    fitShaker(sim, true);
    settle(sim, 0.5);
  }
}

/**
 * 搖骰子盒: the magnet's face on (or just over) the lid takes hold of the iron
 * plate, the more squarely the stronger. Off the plate, over bare acrylic,
 * it can't get a grip.
 */
function grabShaker(sim: ClawSim): boolean {
  const s = sim.shaker;
  const c = sim.claw;
  if (!s) return false;
  const off = Math.hypot(c.hx - s.x, c.hz - s.z);
  if (off > SHAKER.box.half) return false;
  const gap = c.y - sim.clawSpec.prongLen - (s.y + SHAKER.box.h);
  if (gap > MAGNET_REACH || gap < -0.01) return false;
  const grip = clamp01(1 - Math.max(0, off - 0.01) / (SHAKER.box.plate + 0.015));
  if (grip < 0.2) return false;
  s.held = true;
  s.grip = grip;
  s.ox = s.x - c.hx;
  s.oz = s.z - c.hz;
  s.peak = 0;
  s.guaranteed = sim.guaranteed;
  sim.events.push({ type: 'shakeLift' });
  return true;
}

/** The magnet lets go: the cords snap the box back, and a real haul gets its dice read once they're still. */
function releaseShaker(sim: ClawSim) {
  const s = sim.shaker;
  if (!s?.held) return;
  s.held = false;
  if (s.peak < MIN_DROP) return;
  s.pending = true;
  s.since = 0;
  s.still = 0;
  sim.events.push({ type: 'shakeDrop', height: s.peak });
  // The plate tears off the magnet one edge first, more so held off-centre:
  // that sets the box rocking on its cords, and the dice spinning.
  const haul = Math.min(1, s.peak / 0.15);
  const kick = SHAKER.tilt.kick * haul + (1 - s.grip) * 2;
  const dir = rand(sim) * Math.PI * 2, size = kick * (0.6 + 0.8 * rand(sim));
  s.wx = Math.cos(dir) * size;
  s.wz = Math.sin(dir) * size;
  const side = rand(sim) * Math.PI * 2, fling = SHAKER.fling * haul * (0.5 + rand(sim));
  s.vx += Math.cos(side) * fling;
  s.vz += Math.sin(side) * fling;
  for (const d of s.dice) {
    sim.physics.spin(d.id, { x: (rand(sim) - 0.5) * 10, y: (rand(sim) - 0.5) * 4, z: (rand(sim) - 0.5) * 10 });
  }
}

/**
 * Move the box one substep. Held, it follows the magnet, and the magnet
 * lets go once the cords and the box's weight pull harder than it can hold
 * (so the voltages set how far it's hauled), at the release, or when the
 * round ends. Free, the cords and gravity swing it about until it settles.
 */
function stepShaker(sim: ClawSim, h: number) {
  const s = sim.shaker;
  if (!s) return;
  const c = sim.claw;
  const B = SHAKER.box;
  const weight = { x: 0, y: -B.mass * GRAVITY, z: 0 };
  if (s.held) {
    const hold = (c.power / MAX_POWER) * 1.95 * sim.clawSpec.gripSphere * (0.4 + 0.6 * s.grip) * SHAKER.pull;
    const pull = cordForce(shakerPos(s), { x: s.vx, y: s.vy, z: s.vz }, sim.shakerConfig.tension);
    const need = Math.hypot(pull.x + weight.x, pull.y + weight.y, pull.z + weight.z) * (1 + sim.jolt);
    const done = sim.phase === 'releasing' || sim.phase === 'resetting' || sim.phase === 'idle';
    if (hold < need || done) {
      releaseShaker(sim);
    } else {
      // The magnet holds the plate flat.
      s.tx = s.tz = s.wx = s.wz = 0;
      const x = c.hx + s.ox, y = Math.max(s.restY - 0.05, c.y - sim.clawSpec.prongLen - B.h), z = c.hz + s.oz;
      s.vx = (x - s.x) / h; s.vy = (y - s.y) / h; s.vz = (z - s.z) / h;
      s.x = x; s.y = y; s.z = z;
      s.peak = Math.max(s.peak, Math.hypot(s.x - SHAKER.x, s.y - s.restY, s.z - SHAKER.z));
    }
  }
  if (!s.held) {
    const f = cordForce(shakerPos(s), { x: s.vx, y: s.vy, z: s.vz }, sim.shakerConfig.tension);
    const drag = SHAKER.drag;
    s.vx += ((f.x - drag * s.vx) / B.mass) * h;
    s.vy += ((f.y - drag * s.vy) / B.mass - GRAVITY) * h;
    s.vz += ((f.z - drag * s.vz) / B.mass) * h;
    s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
    // It can't go through the floor.
    const floor = 0.002;
    if (s.y < floor) { s.y = floor; if (s.vy < 0) s.vy *= -0.3; }
    // Rocking on the cords, dying away.
    const wn = 2 * Math.PI * SHAKER.tilt.freq, zeta = SHAKER.tilt.damping;
    s.wx += (-wn * wn * s.tx - 2 * zeta * wn * s.wx) * h;
    s.wz += (-wn * wn * s.tz - 2 * zeta * wn * s.wz) * h;
    s.tx += s.wx * h;
    s.tz += s.wz * h;
  }
  sim.physics.moveMover(SHAKER_MOVER, shakerPos(s), shakerRotation(s));
}

/** After a physics substep: follow the dice, and once a shake has settled, read them. */
function syncShaker(sim: ClawSim, h: number) {
  const s = sim.shaker;
  if (!s) return;
  for (const d of s.dice) sim.physics.read(d.id, d);
  if (!s.pending || s.held) return;
  s.since += h;
  const still = Math.hypot(s.vx, s.vy, s.vz) < 0.03 && Math.hypot(s.wx, s.wz) < 0.1
    && s.dice.every((d) => Math.hypot(d.vx, d.vy, d.vz) < 0.03);
  s.still = still ? s.still + h : 0;
  if (s.still >= DICE_STILL || s.since >= DICE_TIMEOUT) finishShake(sim);
}

/** Read the dice: pay out on a winning shake, or on any real haul in a 保夾 round. */
function finishShake(sim: ClawSim) {
  const s = sim.shaker;
  if (!s) return;
  s.pending = false;
  const faces = s.dice.map((d) => faceUp({ x: d.qx, y: d.qy, z: d.qz, w: d.qw }));
  const cfg = sim.shakerConfig;
  const win = shakerWin(cfg, faces);
  const guaranteed = !win && s.guaranteed;
  const reds = faces.filter(isRed).length;
  s.result = { faces, reds, win: win || guaranteed, guaranteed, at: sim.time };
  s.guaranteed = false;
  sim.events.push({ type: 'shakeDice', faces, reds, win: win || guaranteed, guaranteed });
  if (win || guaranteed) dispense(sim);
}

/** Before a round, put the dice back if any got out of the cube (they shouldn't: it's closed). */
function collectShakerDice(sim: ClawSim) {
  const s = sim.shaker;
  if (!s || s.pending || s.held) return;
  const B = SHAKER.box;
  const stray = s.dice.some((d) => Math.abs(d.x - s.x) > B.half || Math.abs(d.z - s.z) > B.half
    || d.y < s.y - 0.01 || d.y > s.y + B.h + 0.01);
  if (stray) placeShakerDice(sim);
}

// ── State machine ────────────────────────────────────────────────────────────

function setPhase(sim: ClawSim, phase: Phase) {
  sim.phase = phase;
  sim.phaseTime = 0;
}

function startRound(sim: ClawSim) {
  const s = sim.settings;
  sim.credits--;
  sim.stats.plays++;
  sim.timer = s.playTime;
  sim.heldId = null;
  sim.closed = false;
  sim.grabPower = 0;
  sim.midAirRequest = false;
  collectDice(sim);
  collectShakerDice(sim);

  let guaranteed = false;
  if (s.guaranteeN > 0) {
    if (s.payoutMode === 0) {
      sim.sinceGuarantee++;
      if (sim.sinceGuarantee >= s.guaranteeN) guaranteed = true;
    } else {
      guaranteed = rand(sim) < 1 / s.guaranteeN;
    }
  }
  if (guaranteed) {
    sim.sinceGuarantee = 0;
    sim.stats.guarantees++;
  }
  sim.guaranteed = guaranteed;
  sim.powerStage = guaranteed ? 'guarantee' : 'strong';
  sim.claw.power = sim.claw.targetPower = guaranteed ? s.guaranteePower : s.strongPower;
  sim.events.push({ type: 'roundStart', guaranteed });
  setPhase(sim, 'moving');
}

/**
 * Switch the coil to the board's mid or weak voltage. A guaranteed round
 * stays on 保夾電壓 throughout, and weak never steps back up to mid.
 */
function setStage(sim: ClawSim, stage: 'mid' | 'weak') {
  if (sim.guaranteed || sim.powerStage === stage || (stage === 'mid' && sim.powerStage === 'weak')) return;
  sim.powerStage = stage;
  sim.claw.targetPower = stage === 'mid' ? sim.settings.midPower : sim.settings.weakPower;
  sim.events.push({ type: 'stage', stage });
}

function beginDrop(sim: ClawSim) {
  sim.midAirRequest = false;
  setPhase(sim, 'dropping');
}

/** The claw stops on the way down; it closes once 延遲收爪 is up (closing phase). */
function beginClose(sim: ClawSim, resting: boolean) {
  sim.claw.resting = resting;
  setPhase(sim, 'closing');
}

function beginLift(sim: ClawSim) {
  sim.claw.resting = false;
  setPhase(sim, 'lifting');
}

/** Horizontal half-size the prongs have to close around. */
function footprint(p: Prize) {
  if (p.shape === 'sphere') return p.r;
  if (p.shape === 'dodeca') return p.halfX;
  return Math.max(p.extX, p.extZ);
}

/**
 * Half-width the open prongs must get around. Three or more prongs encircle
 * the item; a two-prong claw (tips on ±z) only spans its depth.
 */
function spanNeeded(p: Pick<Prize, 'shape' | 'r' | 'extX' | 'extZ'>, spec: ClawSpec) {
  if (p.shape === 'sphere') return p.r * 0.9;
  if (p.shape === 'dodeca') return p.extX * 0.95;
  return spec.prongs === 2 ? p.extZ : Math.max(p.extX, p.extZ) * 1.1;
}

/**
 * Room the fully open claw has around an upright item (m). Negative means
 * the arms can't get around it and land on top instead.
 */
export function clawClearance(spec: ClawSpec, item: { shape: PrizeShape; r: number; halfX: number; halfZ: number }) {
  return spec.reachOpen - spanNeeded({ shape: item.shape, r: item.r, extX: item.halfX, extZ: item.halfZ }, spec);
}

/** Where the nearest prize was when the claw closed on nothing. */
function missEvent(sim: ClawSim): SimEvent {
  const c = sim.claw;
  let nearest: { dx: number; dz: number } | null = null;
  let best = Infinity;
  for (const p of sim.prizes) {
    if (p.won) continue;
    const d2 = (p.x - c.hx) ** 2 + (p.z - c.hz) ** 2;
    if (d2 < best) { best = d2; nearest = { dx: p.x - c.hx, dz: p.z - c.hz }; }
  }
  return { type: 'miss', nearest };
}

/** The magnet claw switches on: it lifts the iron prize its face is on or just above. */
function magnetOn(sim: ClawSim) {
  const c = sim.claw;
  const spec = sim.clawSpec;
  const face = c.y - spec.prongLen;
  let best: Prize | null = null;
  let bestQ = 0;
  for (const p of sim.prizes) {
    if (p.won || p.held || !p.magnetic) continue;
    const h = Math.hypot(p.x - c.hx, p.z - c.hz);
    const gap = face - (p.y + p.extY);
    if (gap > MAGNET_REACH || p.y > face || h > spec.reachOpen + p.r) continue;
    // Pulled straight: full strength centred and touching, weaker off to the side or across a gap.
    const q = clamp01(1 - h / (spec.reachOpen + p.r)) * clamp01(1 - Math.max(0, gap) / MAGNET_REACH);
    if (q > bestQ) { bestQ = q; best = p; }
  }
  if (best && bestQ >= 0.12) {
    best.held = true;
    sim.heldId = best.id;
    sim.physics.grab(best.id);
    sim.grip = { quality: bestQ, jitter: 0.9 + rand(sim) * 0.2 };
    sim.events.push({ type: 'grab', prizeId: best.id, quality: bestQ });
    return;
  }
  sim.events.push(missEvent(sim));
}

/** The coil pulls the arms in: take hold of whatever is inside them. */
function closeOn(sim: ClawSim) {
  const c = sim.claw;
  const spec = sim.clawSpec;
  sim.closed = true;
  sim.grabPower = c.power;
  if (spec.prongs === 0) {
    if (grabBox(sim) || grabShaker(sim)) return;
    magnetOn(sim);
    return;
  }
  const openDy = prongGeometry(1, spec).dy;
  const closedTipY = c.y - prongGeometry(0, spec).dy;
  let best: Prize | null = null;
  let bestQ = 0;
  for (const p of sim.prizes) {
    if (p.won || p.held) continue;
    const h = Math.hypot(p.x - c.hx, p.z - c.hz);
    const foot = footprint(p);
    if (h > spec.reachOpen + foot * 0.3) continue;
    if (p.y + p.extY < c.y - openDy) continue; // entirely below the open tips
    if (p.y - p.extY > c.y) continue;
    const centred = clamp01(1 - h / (foot + 0.015));
    // Prongs that close below the prize's middle cradle it; above it they
    // only pinch the top.
    const depth = clamp01((p.y - closedTipY) / p.extY);
    // Too wide for this claw's mouth: the tips land on top instead of around it.
    const fit = clamp01((spec.reachOpen - spanNeeded(p, spec)) / 0.02);
    const q = centred * (0.35 + 0.65 * depth) * fit;
    if (q > bestQ) { bestQ = q; best = p; }
  }
  if (best && bestQ >= 0.12) {
    best.held = true;
    sim.heldId = best.id;
    sim.physics.grab(best.id);
    sim.grip = { quality: bestQ, jitter: 0.85 + rand(sim) * 0.3 };
    sim.events.push({ type: 'grab', prizeId: best.id, quality: bestQ });
    return;
  }
  sim.events.push(missEvent(sim));
}

/**
 * How far the coil lets the arms sag open at this voltage: a little at low
 * power, and all the way below CLOSE_MIN_POWER (the arms fall open).
 */
function coilSlack(power: number) {
  const f = power / MAX_POWER;
  const minF = CLOSE_MIN_POWER / MAX_POWER;
  const atMin = (1 - minF) * 0.25;
  return f >= minF ? (1 - f) * 0.25 : 1 - (1 - atMin) * (f / minF);
}

/** Drive the arms to where the coil holds them: open until the claw has closed, then around the prize (or shut). */
function driveArms(sim: ClawSim, h: number) {
  const c = sim.claw;
  const spec = sim.clawSpec;
  let target = 1;
  if (sim.closed) {
    const p = heldPrize(sim);
    const wrap = p ? (p.shape === 'sphere' ? p.r * 0.8 : spanNeeded(p, spec) * 0.9) : 0;
    if (spec.prongs === 0) return; // a magnet has no arms to move
    const around = p ? clamp01((wrap - spec.reachClosed) / (spec.reachOpen - spec.reachClosed)) : 0;
    target = clamp01(around + coilSlack(c.power));
  }
  c.open = approach(c.open, target, h / CLOSE_TIME);
}

function releaseHeld(sim: ClawSim, slipped: boolean) {
  const p = heldPrize(sim);
  if (!p) return;
  const c = sim.claw;
  p.held = false;
  const L = swingLength(sim, c.line);
  // Leaves the claw with the swinging hub's velocity, plus the flick from a
  // bent 防甩片 if it slips while the claw is slamming into it (內丟).
  sim.physics.release(p.id, {
    x: c.vx + L * c.swingVX * Math.cos(c.swingX) + sim.throwX,
    y: sim.phase === 'lifting' ? winchSpeed(sim.settings.upSpeed) * 0.5 : 0,
    z: c.vz + L * c.swingVZ * Math.cos(c.swingZ) + sim.throwZ,
  });
  sim.heldId = null;
  if (slipped) {
    sim.events.push({ type: 'slip', prizeId: p.id, weak: c.power < sim.grabPower - 0.5 });
  }
}

/** Grip force against the prize's weight, made harder by sway. */
export function gripMargin(sim: ClawSim): number {
  const p = heldPrize(sim);
  if (!p) return 0;
  const c = sim.claw;
  const magnet = sim.clawSpec.prongs === 0;
  const clawGrip = magnet || p.shape !== 'box' ? sim.clawSpec.gripSphere : sim.clawSpec.gripBox;
  // Arms hold by friction; a magnet holds iron by its pull, and nothing else at all.
  const surface = magnet ? (p.magnetic ? 1 : 0) : p.grip;
  const hold = (c.power / MAX_POWER) * (0.45 + 0.55 * sim.grip.quality) * 1.95 * sim.grip.jitter
    * clawGrip * surface;
  // A swinging claw loads the grip with the cable tension (cos θ + Lω²/g,
  // largest at the bottom of each swing), plus a little for the jerk.
  const omega2 = c.swingVX ** 2 + c.swingVZ ** 2;
  const L = swingLength(sim, c.line);
  const tension = Math.cos(Math.hypot(c.swingX, c.swingZ)) + (L * omega2) / GRAVITY;
  // Plus a little for the jerk, by how fast the hub itself is moving (a short
  // pendulum's quick wobble barely moves the prize).
  const hubSpeed = Math.sqrt(omega2) * L;
  const need = p.weight * (tension + 0.24 * hubSpeed + sim.jolt);
  return hold - need;
}

function checkHold(sim: ClawSim) {
  if (sim.heldId !== null && gripMargin(sim) < 0) releaseHeld(sim, true);
}

function endRound(sim: ClawSim) {
  sim.events.push({ type: 'roundEnd' });
  sim.guaranteed = false;
  sim.powerStage = 'strong';
  sim.claw.power = sim.claw.targetPower = sim.settings.strongPower;
  setPhase(sim, 'idle');
}

/**
 * Height of whatever is directly below (x, z): a prize's top, the felt, or
 * the chute's drop. Used by the renderer for the aiming marker and claw cam.
 */
export function surfaceHeightAt(sim: ClawSim, x: number, z: number): number {
  return sim.physics.rayDown(x, z, BOX.height, sim.heldId) ?? -0.4;
}

/** Top of the pile under the claw's base disc: the highest of five rays across it. */
function pileHeightUnder(sim: ClawSim, x: number, z: number): number {
  const r = sim.clawSpec.hubR * 0.9;
  let top = -Infinity;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const hit = sim.physics.rayDown(x + dx, z + dz, BOX.height, sim.heldId);
    if (hit !== null) top = Math.max(top, hit);
  }
  return top;
}

function stepMachine(sim: ClawSim, h: number, joy: Joystick) {
  const s = sim.settings;
  const c = sim.claw;
  sim.time += h;
  sim.phaseTime += h;
  c.power = approach(c.power, c.targetPower, 200 * h);

  let tvx = 0, tvz = 0;
  const prevLine = c.line;
  const gs = gantrySpeed(s.gantrySpeed);
  const down = winchSpeed(s.dropSpeed);
  const up = winchSpeed(s.upSpeed);
  /** 回停下降: after the gantry is home the claw is let down this far and waits there. */
  const parkLine = () => {
    const home = homeLineLength(s);
    c.line = approach(c.line, home, (c.line > home ? up : down) * h);
  };

  switch (sim.phase) {
    case 'idle':
      c.open = approach(c.open, idleOpenness(s), h / RESET_TIME);
      parkLine();
      if (sim.credits > 0) startRound(sim);
      break;

    case 'moving':
      c.open = approach(c.open, idleOpenness(s), h / RESET_TIME);
      parkLine();
      tvx = Math.max(-1, Math.min(1, joy.x)) * gs;
      tvz = Math.max(-1, Math.min(1, joy.z)) * gs;
      sim.timer = Math.max(0, sim.timer - h);
      if (sim.timer === 0) {
        sim.events.push({ type: 'timeUp' });
        if (s.autoDrop === 1) beginDrop(sim);
        else endRound(sim);
      }
      break;

    case 'dropping': {
      if (s.dropSteer === 1) {
        tvx = Math.max(-1, Math.min(1, joy.x)) * gs;
        tvz = Math.max(-1, Math.min(1, joy.z)) * gs;
      }
      c.open = approach(c.open, 1, h * 3);
      if (sim.midAirRequest) {
        // 空中取物: stop where it is and close, still hanging from the cable.
        beginClose(sim, false);
        break;
      }
      if (sim.phaseTime < s.dropDelay) break; // 下爪延遲
      if (sim.physics.clawSupported()) {
        // An arm or the base has come to rest on something: the cable goes slack.
        beginClose(sim, true);
        break;
      }
      const limit = dropLineLength(s);
      const nextLine = Math.max(c.line, Math.min(limit, c.line + down * h));
      const nextY = hubYOnCable(sim, nextLine);
      const pile = pileHeightUnder(sim, c.hx, c.hz);
      const floor = floorHubAt(sim, c.hx, c.hz, 1);
      c.line = nextLine;
      if (nextY <= pile || nextY <= floor) {
        c.y = Math.max(pile, floor);
        beginClose(sim, true);
      } else if (c.line >= limit) {
        // 下線長度 used up before touching anything: close in mid-air.
        beginClose(sim, false);
      }
      break;
    }

    case 'closing': {
      // 延遲收爪: sit open for a moment first. With 強電壓 below what the coil
      // needs, the arms stay open until a later stage brings the voltage up.
      const t = sim.phaseTime - s.closeDelay;
      if (t >= 0 && !sim.closed && c.power >= CLOSE_MIN_POWER) closeOn(sim);
      driveArms(sim, h);
      if (c.resting) {
        // Closing arms reach lower; on the felt they lever the claw up instead
        // of driving their tips into the floor.
        c.y = Math.max(c.y, floorHubAt(sim, c.hx, c.hz, c.open));
      }
      if (t >= CLOSE_TIME + s.liftDelay) beginLift(sim); // 下停上拉延遲
      break;
    }

    case 'lifting':
      c.line = Math.max(0, c.line - up * h);
      if (c.line <= midLineLength(s)) setStage(sim, 'mid'); // 中壓距離頂點
      if (!sim.closed && c.power >= CLOSE_MIN_POWER) closeOn(sim);
      driveArms(sim, h);
      checkHold(sim);
      if (c.line === 0) {
        // The housing seats against the 防甩片 and trips the top switch; 上停上拉
        // keeps the motor pulling, so the claw jerks against the plate.
        if (s.topPull > 0) {
          const a = rand(sim) * Math.PI * 2;
          c.swingVX += Math.cos(a) * s.topPull * TOP_PULL_KICK;
          c.swingVZ += Math.sin(a) * s.topPull * TOP_PULL_KICK;
          sim.jolt += s.topPull * JOLT_PER_PULL;
        }
        // A bent plate shoves the housing sideways as it seats: the claw's
        // bottom, and anything slipping out of it, goes away from the hole.
        const tilt = sim.antiSwing.tilt / ANTI_SWING_LIMITS.tilt.max;
        if (tilt > 0) {
          const home = homeOf(sim.chute);
          const ax = -home.x, az = -home.z;
          const n = Math.hypot(ax, az) || 1;
          sim.throwX = (ax / n) * tilt * TILT_THROW;
          sim.throwZ = (az / n) * tilt * TILT_THROW;
          sim.jolt += tilt * 0.15;
        }
        setPhase(sim, 'top');
      }
      break;

    case 'top':
      if (!sim.closed && c.power >= CLOSE_MIN_POWER) closeOn(sim);
      driveArms(sim, h);
      checkHold(sim);
      if (sim.phaseTime >= s.topDelay) { // 上停延遲
        setStage(sim, 'weak');
        setPhase(sim, 'returning');
      }
      break;

    case 'returning': {
      if (!sim.closed && c.power >= CLOSE_MIN_POWER) closeOn(sim);
      driveArms(sim, h);
      checkHold(sim);
      // Back to the start point (over the hole, unless the operator moved it).
      const home = gantryHome(sim.gantry, sim.chute);
      const dx = home.x - c.x, dz = home.z - c.z;
      // Brake so the gantry lands over it instead of coasting past.
      tvx = Math.sign(dx) * Math.min(gs, Math.abs(dx) * 10);
      tvz = Math.sign(dz) * Math.min(gs, Math.abs(dz) * 10);
      if (Math.abs(dx) < 0.004 && Math.abs(dz) < 0.004 && Math.hypot(c.vx, c.vz) < 0.01) {
        setPhase(sim, 'releasing');
      }
      break;
    }

    case 'releasing':
      if (!sim.closed) {
        // Never had the voltage to close all round.
        sim.closed = true;
        sim.events.push(missEvent(sim));
      }
      c.open = approach(c.open, 1, h / 0.35);
      if (c.open > 0.5 && sim.heldId !== null) releaseHeld(sim, false);
      if (sim.phaseTime >= RELEASE_TIME) setPhase(sim, 'resetting');
      break;

    case 'resetting':
      c.open = approach(c.open, idleOpenness(s), h / RESET_TIME);
      if (sim.phaseTime >= RESET_TIME) endRound(sim);
      break;
  }

  const fade = Math.exp(-h / JOLT_DECAY);
  sim.jolt *= fade;
  sim.throwX *= fade;
  sim.throwZ *= fade;

  // Gantry motors: quick exponential spin-up, clamped to the rails.
  const prevVx = c.vx, prevVz = c.vz;
  const k = 1 - Math.exp(-14 * h);
  c.vx += (tvx - c.vx) * k;
  c.vz += (tvz - c.vz) * k;
  c.x += c.vx * h;
  c.z += c.vz * h;
  // The limit switches (限位器) cut the motors.
  const { minX, maxX, minZ, maxZ } = sim.gantry;
  if (c.x < minX || c.x > maxX) { c.x = Math.min(maxX, Math.max(minX, c.x)); c.vx = 0; }
  if (c.z < minZ || c.z > maxZ) { c.z = Math.min(maxZ, Math.max(minZ, c.z)); c.vz = 0; }

  // Claw pendulum hung from the trolley, driven by the gantry's acceleration.
  // The length follows the cable, so a claw lowered mid-swing keeps swinging
  // on the way down (甩爪), and one lifted mid-swing speeds up.
  const resting = sim.phase === 'closing' && c.resting;
  if (resting) {
    // On the pile with the cable slack: the claw stays where it landed, even
    // as the arms lever it up. The cable out and its angle follow from where
    // the hub sits, so the lift starts from here without a jump.
    c.swingVX = 0;
    c.swingVZ = 0;
    const dx = c.hx - c.x, dz = c.hz - c.z;
    c.line = Math.max(0, Math.hypot(dx, dz, PLATE_Y - c.y) - topRod(sim));
    const L = swingLength(sim, c.line);
    c.swingX = Math.asin(Math.max(-1, Math.min(1, dx / L)));
    c.swingZ = Math.asin(Math.max(-1, Math.min(1, dz / L)));
  } else {
    const ax = (c.vx - prevVx) / h, az = (c.vz - prevVz) / h;
    const L = swingLength(sim, c.line);
    const Ldot = (c.line - prevLine) / h;
    const accel = (th: number, om: number, a: number) =>
      -(GRAVITY / L) * Math.sin(th) - (a / L) * Math.cos(th) - (2 * Ldot / L) * om - SWING_DAMP * om;
    c.swingVX += accel(c.swingX, c.swingVX, ax) * h;
    c.swingVZ += accel(c.swingZ, c.swingVZ, az) * h;
    c.swingX = Math.max(-MAX_SWING, Math.min(MAX_SWING, c.swingX + c.swingVX * h));
    c.swingZ = Math.max(-MAX_SWING, Math.min(MAX_SWING, c.swingZ + c.swingVZ * h));
    // 防甩片: near the top the housing's rim catches on the plate, so the
    // claw can only tilt as far off the plate's angle as the gap under it
    // allows (not at all when it's 鎖緊). A bent plate so holds it leaning,
    // bottom away from the hole, until it's let down clear of the plate.
    // Hitting the plate stops the swing dead and jolts the grip.
    const maxTilt = plateFreePlay(sim.clawSpec, sim.antiSwing.gap + c.line);
    const seat = plateSeat(sim);
    const ex = c.swingX - seat.x, ez = c.swingZ - seat.z;
    const off = Math.hypot(ex, ez);
    if (off > maxTilt) {
      const k = maxTilt / off;
      const omega = Math.hypot(c.swingVX, c.swingVZ);
      c.swingX = seat.x + ex * k;
      c.swingZ = seat.z + ez * k;
      c.swingVX *= -0.15;
      c.swingVZ *= -0.15;
      sim.jolt = Math.max(sim.jolt, Math.min(0.3, ((omega * L) / GRAVITY) * 4));
    }
  }
  const L = swingLength(sim, c.line);
  c.hx = c.x + L * Math.sin(c.swingX);
  c.hz = c.z + L * Math.sin(c.swingZ);
  // The glass stops a big swing: pin the hub inside and bounce the swing back.
  const hMinX = BOX.minX + HUB_WALL_MARGIN, hMaxX = BOX.maxX - HUB_WALL_MARGIN;
  const hMinZ = BOX.minZ + HUB_WALL_MARGIN, hMaxZ = BOX.maxZ - HUB_WALL_MARGIN;
  if (c.hx < hMinX || c.hx > hMaxX) {
    c.hx = Math.min(hMaxX, Math.max(hMinX, c.hx));
    c.swingX = Math.asin(Math.max(-1, Math.min(1, (c.hx - c.x) / L)));
    c.swingVX *= -0.3;
  }
  if (c.hz < hMinZ || c.hz > hMaxZ) {
    c.hz = Math.min(hMaxZ, Math.max(hMinZ, c.hz));
    c.swingZ = Math.asin(Math.max(-1, Math.min(1, (c.hz - c.z) / L)));
    c.swingVZ *= -0.3;
  }
  // Down inside a 大怒神's shaft the acrylic walls keep the claw off them the same way.
  const shaft = siteAt(towerSitesOf(sim), c.hx, c.hz);
  if (shaft && c.y - prongGeometry(c.open, sim.clawSpec).dy < TOWER.height) {
    const limX = Math.max(0, shaft.size.inner.x - sim.clawSpec.reachOpen - 0.002);
    const limZ = Math.max(0, shaft.size.inner.z - sim.clawSpec.reachOpen - 0.002);
    const x = Math.min(shaft.x + limX, Math.max(shaft.x - limX, c.hx));
    const z = Math.min(shaft.z + limZ, Math.max(shaft.z - limZ, c.hz));
    if (x !== c.hx) {
      c.hx = x;
      c.swingX = Math.asin(Math.max(-1, Math.min(1, (c.hx - c.x) / L)));
      c.swingVX *= -0.3;
    }
    if (z !== c.hz) {
      c.hz = z;
      c.swingZ = Math.asin(Math.max(-1, Math.min(1, (c.hz - c.z) / L)));
      c.swingVZ *= -0.3;
    }
  }
  // Hanging from the cable, the hub's height is set by the line and the swing.
  if (!resting) c.y = hubYOnCable(sim, c.line);
}

// ── Prize physics ────────────────────────────────────────────────────────────

/** Where each prong tip is (straight-arm model used by the capture rules). */
export function prongTips(sim: ClawSim) {
  const claw = sim.claw;
  const spec = sim.clawSpec;
  const g = prongGeometry(claw.open, spec);
  return Array.from({ length: spec.prongs }, (_, i) => {
    const a = (i * Math.PI * 2) / spec.prongs + Math.PI / 2;
    return { x: claw.hx + Math.cos(a) * g.reach, y: claw.y - g.dy, z: claw.hz + Math.sin(a) * g.reach };
  });
}

/**
 * The claw's colliders for its current pose: the base disc plus each arm's
 * rubber-sleeved lower segment (knee → tip), placed along the same bow
 * ClawHead draws and hinged outward by the prong angle.
 *
 * The upper arms deliberately don't collide, and the tips splay around round
 * prizes inside the mouth (physics.ts contact hook): open arms are
 * spring-loaded, so on a real claw only the base and the tips bear on things.
 * Rigid arms made the claw perch on a plush's shoulders or crush it.
 */
function clawPose(sim: ClawSim): ClawPose {
  const c = sim.claw;
  const spec = sim.clawSpec;
  const { angle } = prongGeometry(c.open, spec);
  // Arm in the hinge frame (x outward, y up), the same profile ClawHead draws;
  // only the knee → tip stretch collides.
  const profile = armProfile(spec);
  const local = [profile[2], profile[4]];

  const cos = Math.cos(angle), sin = Math.sin(angle);
  const segments: Segment[] = [];
  for (let i = 0; i < spec.prongs; i++) {
    const a = (i * Math.PI * 2) / spec.prongs + Math.PI / 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    const pts = local.map(([lx, ly]) => {
      const radial = spec.pivotR + lx * cos - ly * sin;
      return { x: c.hx + ux * radial, y: c.y + lx * sin + ly * cos, z: c.hz + uz * radial };
    });
    segments.push({ from: pts[0], to: pts[1], r: spec.sleeveRadius });
  }
  const s = spec.headScale;
  if (spec.prongs === 0) {
    // The magnet: a solid pot below the base, face down.
    segments.push({
      from: { x: c.hx, y: c.y - 0.005, z: c.hz },
      to: { x: c.hx, y: c.y - spec.prongLen + spec.reachOpen, z: c.hz },
      r: spec.reachOpen,
      solid: true,
    });
  }
  return {
    hub: { x: c.hx, y: c.y + 0.012 * s, z: c.hz },
    hubR: spec.hubR * 1.3,
    hubHalfH: 0.009 * s,
    segments,
    mouthR: prongGeometry(c.open, spec).reach,
  };
}

const body: BodyState = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 };

/** World-axis half extents of a box rotated by q. */
function rotatedExtents(p: Prize) {
  const { qx: x, qy: y, qz: z, qw: w } = p;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
  const m10 = 2 * (x * y + w * z), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
  const m20 = 2 * (x * z - w * y), m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
  p.extX = Math.abs(m00) * p.halfX + Math.abs(m01) * p.halfY + Math.abs(m02) * p.halfZ;
  p.extY = Math.abs(m10) * p.halfX + Math.abs(m11) * p.halfY + Math.abs(m12) * p.halfZ;
  p.extZ = Math.abs(m20) * p.halfX + Math.abs(m21) * p.halfY + Math.abs(m22) * p.halfZ;
}

/** Copy body transforms into the prize records; anything down the chute is won. */
function syncPrizes(sim: ClawSim, scoreWins = true) {
  for (const p of sim.prizes) {
    if (p.won || !sim.physics.read(p.id, body)) continue;
    p.x = body.x; p.y = body.y; p.z = body.z;
    p.vx = body.vx; p.vy = body.vy; p.vz = body.vz;
    p.qx = body.qx; p.qy = body.qy; p.qz = body.qz; p.qw = body.qw;
    if (p.shape === 'box') rotatedExtents(p);
    if (p.y < WIN_Y) {
      p.won = true;
      sim.physics.remove(p.id);
      if (!scoreWins) continue;
      sim.stats.wins++;
      if (sim.settings.resetOnWin === 1) sim.sinceGuarantee = 0;
      sim.events.push({ type: 'win', prizeId: p.id, kind: p.kind });
    }
  }
}

export function stepPrizes(sim: ClawSim, h: number) {
  const c = sim.claw;
  sim.physics.poseClaw(clawPose(sim));

  // The held prize hangs under the hub along the cable, eased into place.
  const held = heldPrize(sim);
  if (held) {
    // Between the arms just under the base, or stuck to the magnet's face.
    const d = (sim.clawSpec.prongs === 0 ? sim.clawSpec.prongLen : 0.015) + held.extY;
    const tx = c.hx + Math.sin(c.swingX) * d;
    const ty = c.y - Math.cos(Math.hypot(c.swingX, c.swingZ)) * d;
    const tz = c.hz + Math.sin(c.swingZ) * d;
    const k = 1 - Math.exp(-20 * h);
    sim.physics.carry(held.id, {
      x: held.x + (tx - held.x) * k, y: held.y + (ty - held.y) * k, z: held.z + (tz - held.z) * k,
    });
  }

  stepTower(sim, h);
  stepShaker(sim, h);
  sim.physics.step(h);
  syncPrizes(sim);
  syncTower(sim, h);
  syncShaker(sim, h);
}

// ── Main step ────────────────────────────────────────────────────────────────

/** Advance the machine by one rendered frame (dt clamped, fixed substeps). */
export function stepSim(sim: ClawSim, dt: number, joy: Joystick = { x: 0, z: 0 }) {
  const clamped = Math.min(Math.max(dt, 0), 0.033);
  // r3f can hand us dt = 0 (first frame, tab refocus); the sway integrator
  // divides by the substep, so a zero step would poison every value with NaN.
  if (!(clamped > 0)) return;
  const n = Math.max(1, Math.round(clamped / SUBSTEP));
  const h = clamped / n;
  for (let i = 0; i < n; i++) {
    stepMachine(sim, h, joy);
    stepPrizes(sim, h);
  }
}
