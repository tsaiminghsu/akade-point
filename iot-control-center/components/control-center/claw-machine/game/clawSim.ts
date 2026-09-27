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
import { CLAW_SPECS, armProfile, buildClawSpec, type ClawFit, type ClawSpec, type ClawType } from './claws';
import {
  DEFAULT_STOCK, MATERIALS, itemsIn, massFor, type ItemCategory, type PrizeKind, type PrizeShape, type Stock,
} from './items';
import { PrizeWorld, type BodyState, type ClawPose, type Segment } from './physics';
import { DEFAULT_CHUTE, sanitizeChute, type ChuteConfig } from './chute';

export { initPhysics, isPhysicsReady } from './physics';
export { CHUTE_LIMITS, DEFAULT_CHUTE, sanitizeChute, type ChuteConfig } from './chute';

export type { PrizeKind } from './items';

// ── Cabinet geometry ─────────────────────────────────────────────────────────

export const BOX = { minX: -0.45, maxX: 0.45, minZ: -0.32, maxZ: 0.32, height: 1.1 } as const;

/** Prize chute: a hole in the front-left corner of the floor, fenced by an acrylic 擋板. */
export interface Chute { minX: number; maxX: number; minZ: number; maxZ: number; wallH: number }

// ChuteConfig, CHUTE_LIMITS, DEFAULT_CHUTE and sanitizeChute live in chute.ts
// (Control Center split, so the server can use them without Rapier).
export function chuteFrom(cfg: ChuteConfig): Chute {
  return { minX: BOX.minX, maxX: BOX.minX + cfg.width, minZ: BOX.maxZ - cfg.depth, maxZ: BOX.maxZ, wallH: cfg.wallH };
}

/** The factory chute. */
export const CHUTE: Chute = chuteFrom(DEFAULT_CHUTE);

/** Where the claw returns to drop its prize: straight over the middle of the hole. */
export function homeOf(chute: Chute) {
  return { x: (chute.minX + chute.maxX) / 2, z: (chute.minZ + chute.maxZ) / 2 };
}
export const HOME = homeOf(CHUTE);
/**
 * Hub height with the claw fully raised. It hangs well below the trolley, as
 * on a real machine, so there is cable to swing on (甩爪).
 */
export const CLAW_TOP = 0.78;
/** Cable anchor under the trolley: the claw is a pendulum hung from here. */
export const CABLE_ANCHOR_Y = BOX.height - 0.07;
/** Cable from the anchor down to the hub with the claw at the top stop. */
const TOP_ROD = CABLE_ANCHOR_Y - CLAW_TOP;
/** Below this voltage the coil can't pull the arms shut, so the claw hangs open. */
export const CLOSE_MIN_POWER = 4.8;
/** Restocked prizes stack no higher than this, whatever the claw. */
const FILL_TOP_MAX = 0.62;
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
/** Swing kick per 上停上拉 段 when the claw hits the top stop (rad/s). */
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

/** Pendulum length from the cable anchor to the claw's centre of mass. */
export function pendulumLength(hubY: number) {
  return Math.max(0.08, CABLE_ANCHOR_Y - hubY - CLAW_COM);
}

/** Lowest the hub can go: open tips just clear of the felt. */
export function floorHubY(spec: ClawSpec = STANDARD) {
  return prongGeometry(1, spec).dy + 0.005;
}

/** Hub height where the 下線長度 runs out, hanging straight (no swing). */
export function dropLimitHubY(settings: ClawSettings, spec: ClawSpec = STANDARD) {
  return Math.max(floorHubY(spec), CLAW_TOP - dropLineLength(settings));
}

/**
 * Hub height with `line` metres of cable out below the top stop. The cable is
 * the hypotenuse of a swinging claw, so the swing lifts it by (1 − cos θ).
 */
function hubYOnCable(c: Claw, line: number) {
  const s2 = Math.sin(c.swingX) ** 2 + Math.sin(c.swingZ) ** 2;
  const cos = Math.sqrt(Math.max(0, 1 - s2));
  return CLAW_TOP - line + (TOP_ROD + line) * (1 - cos);
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
  return Math.min(FILL_TOP_MAX, CLAW_TOP - prongGeometry(0, sim.clawSpec).dy - 0.04);
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
    // Kept back from the chute so the pile slopes down to its divider instead of spilling over it.
    if (inChute(x, z, p.r + 0.07, sim.chute)) continue;
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

/** Load until `target` prizes are inside, replacing any that tumble into the chute while the pile settles. */
function fillTo(sim: ClawSim, target: number) {
  for (let pass = 0; pass < 3; pass++) {
    sim.prizes = sim.prizes.filter((p) => !p.won);
    const missing = target - sim.prizes.length;
    if (missing <= 0 || load(sim, missing) === 0) break;
  }
  sim.prizes = sim.prizes.filter((p) => !p.won);
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
  fillTo(sim, rollCount(sim));
}

/**
 * 補貨: add prizes on top of the pile until the cabinet holds the stocked
 * amount again. What's already inside stays where it is.
 */
export function topUp(sim: ClawSim, stock: Partial<Stock> = {}) {
  sim.stock = { ...sim.stock, ...stock };
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
  const before = prizesLeft(sim);
  sim.chute = chuteFrom(sanitizeChute(cfg));
  sim.physics.setChute(sim.chute);
  if (sim.phase === 'idle') {
    const home = homeOf(sim.chute);
    Object.assign(sim.claw, { x: home.x, z: home.z, hx: home.x, hz: home.z, vx: 0, vz: 0 });
    sim.physics.poseClaw(clawPose(sim), true);
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
}

/**
 * Put a specific prize in the cabinet (tests, and anything that stages a
 * scene). Ray queries (surfaceHeightAt) see it after the next physics step.
 */
export function spawnPrize(sim: ClawSim, props: Partial<Prize> & { x: number; z: number }): Prize {
  const shape = props.shape ?? 'sphere';
  const r0 = props.r ?? 0.07;
  const halfX = props.halfX ?? r0, halfY = props.halfY ?? r0, halfZ = props.halfZ ?? r0;
  const category = props.category ?? (shape === 'box' ? 'figure' : 'plush');
  const def = itemsIn(category)[0];
  const p: Prize = {
    id: sim.prizes.reduce((m, q) => Math.max(m, q.id + 1), 0),
    kind: def.kind, category, shape, color: '#ffffff', accent: '#111111',
    weight: 0.6, grip: def.grip,
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
  categories?: ItemCategory[];
  stock?: Partial<Stock>;
}

export function createSim(settings: ClawSettings = defaultSettings(), opts: CreateOptions = {}): ClawSim {
  const sim: ClawSim = {
    settings,
    physics: new PrizeWorld({ ...BOX, chute: chuteFrom(sanitizeChute(opts.chute)) }),
    clawSpec: buildClawSpec(opts.claw ?? 'standard', opts.clawFit),
    stock: { ...DEFAULT_STOCK, ...opts.stock },
    chute: chuteFrom(sanitizeChute(opts.chute)),
    full: false,
    phase: 'idle', phaseTime: 0, time: 0, timer: 0,
    coins: 0, credits: 0,
    claw: {
      x: 0, z: 0, hx: 0, hz: 0, y: CLAW_TOP, line: 0, resting: false,
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
  const home = homeOf(sim.chute);
  Object.assign(sim.claw, { x: home.x, z: home.z, hx: home.x, hz: home.z });
  sim.physics.poseClaw(clawPose(sim), true);
  restock(sim, {
    ...(opts.prizeCount !== undefined ? { count: opts.prizeCount, random: false } : {}),
    ...(opts.categories ? { categories: opts.categories } : {}),
  });
  return sim;
}

/** Fit a different claw head, size or 爪位. Safe at any time; a held prize stays held. */
export function setClaw(sim: ClawSim, type: ClawType, fit: Partial<ClawFit> = {}) {
  sim.clawSpec = buildClawSpec(type, fit);
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
  return p.shape === 'sphere' ? p.r : Math.max(p.extX, p.extZ);
}

/**
 * Half-width the open prongs must get around. Three or more prongs encircle
 * the item; a two-prong claw (tips on ±z) only spans its depth.
 */
function spanNeeded(p: Pick<Prize, 'shape' | 'r' | 'extX' | 'extZ'>, spec: ClawSpec) {
  if (p.shape === 'sphere') return p.r * 0.9;
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

/** The coil pulls the arms in: take hold of whatever is inside them. */
function closeOn(sim: ClawSim) {
  const c = sim.claw;
  const spec = sim.clawSpec;
  sim.closed = true;
  sim.grabPower = c.power;
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
  const L = pendulumLength(CLAW_TOP - c.line);
  // Leaves the claw with the swinging hub's velocity.
  sim.physics.release(p.id, {
    x: c.vx + L * c.swingVX * Math.cos(c.swingX),
    y: sim.phase === 'lifting' ? winchSpeed(sim.settings.upSpeed) * 0.5 : 0,
    z: c.vz + L * c.swingVZ * Math.cos(c.swingZ),
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
  const clawGrip = p.shape === 'box' ? sim.clawSpec.gripBox : sim.clawSpec.gripSphere;
  const hold = (c.power / MAX_POWER) * (0.45 + 0.55 * sim.grip.quality) * 1.95 * sim.grip.jitter
    * clawGrip * p.grip;
  // A swinging claw loads the grip with the cable tension (cos θ + Lω²/g,
  // largest at the bottom of each swing), plus a little for the jerk.
  const omega2 = c.swingVX ** 2 + c.swingVZ ** 2;
  const tension = Math.cos(Math.hypot(c.swingX, c.swingZ)) + (pendulumLength(CLAW_TOP - c.line) * omega2) / GRAVITY;
  const need = p.weight * (tension + 0.05 * Math.sqrt(omega2));
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
      const nextY = hubYOnCable(c, nextLine);
      const pile = pileHeightUnder(sim, c.hx, c.hz);
      const floor = floorHubY(sim.clawSpec);
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
        c.y = Math.max(c.y, prongGeometry(c.open, sim.clawSpec).dy + 0.005);
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
        // 上停上拉: the motor keeps pulling after the top switch, and the
        // claw jerks against the stop.
        if (s.topPull > 0) {
          const a = rand(sim) * Math.PI * 2;
          c.swingVX += Math.cos(a) * s.topPull * TOP_PULL_KICK;
          c.swingVZ += Math.sin(a) * s.topPull * TOP_PULL_KICK;
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
      const home = homeOf(sim.chute);
      const dx = home.x - c.x, dz = home.z - c.z;
      // Brake so the gantry lands over the hole instead of coasting past it.
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

  // Gantry motors: quick exponential spin-up, clamped to the rails.
  const prevVx = c.vx, prevVz = c.vz;
  const k = 1 - Math.exp(-14 * h);
  c.vx += (tvx - c.vx) * k;
  c.vz += (tvz - c.vz) * k;
  c.x += c.vx * h;
  c.z += c.vz * h;
  const minX = BOX.minX + GANTRY_MARGIN, maxX = BOX.maxX - GANTRY_MARGIN;
  const minZ = BOX.minZ + GANTRY_MARGIN, maxZ = BOX.maxZ - GANTRY_MARGIN;
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
    c.line = Math.max(0, Math.hypot(dx, dz, CABLE_ANCHOR_Y - c.y) - TOP_ROD);
    const L = pendulumLength(CLAW_TOP - c.line);
    c.swingX = Math.asin(Math.max(-1, Math.min(1, dx / L)));
    c.swingZ = Math.asin(Math.max(-1, Math.min(1, dz / L)));
  } else {
    const ax = (c.vx - prevVx) / h, az = (c.vz - prevVz) / h;
    const L = pendulumLength(CLAW_TOP - c.line);
    const Ldot = (c.line - prevLine) / h;
    const accel = (th: number, om: number, a: number) =>
      -(GRAVITY / L) * Math.sin(th) - (a / L) * Math.cos(th) - (2 * Ldot / L) * om - SWING_DAMP * om;
    c.swingVX += accel(c.swingX, c.swingVX, ax) * h;
    c.swingVZ += accel(c.swingZ, c.swingVZ, az) * h;
    c.swingX = Math.max(-MAX_SWING, Math.min(MAX_SWING, c.swingX + c.swingVX * h));
    c.swingZ = Math.max(-MAX_SWING, Math.min(MAX_SWING, c.swingZ + c.swingVZ * h));
  }
  const L = pendulumLength(CLAW_TOP - c.line);
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
  // Hanging from the cable, the hub's height is set by the line and the swing.
  if (!resting) c.y = hubYOnCable(c, c.line);
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
    const d = 0.015 + held.extY;
    const tx = c.hx + Math.sin(c.swingX) * d;
    const ty = c.y - Math.cos(Math.hypot(c.swingX, c.swingZ)) * d;
    const tz = c.hz + Math.sin(c.swingZ) * d;
    const k = 1 - Math.exp(-20 * h);
    sim.physics.carry(held.id, {
      x: held.x + (tx - held.x) * k, y: held.y + (ty - held.y) * k, z: held.z + (tz - held.z) * k,
    });
  }

  sim.physics.step(h);
  syncPrizes(sim);
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
