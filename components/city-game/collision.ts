import { Vehicle } from './types';
import { armorOf, isAirVehicle, isLawGround, specOf } from './vehicleSpecs';

/**
 * Arcade vehicle collision.
 *
 * No physics engine is involved — the whole simulation is a 2D grid with a fake
 * altitude axis, so this is a hand-rolled impulse solver over two-circle
 * capsules. It is deliberately forgiving: the goal is a satisfying shunt, not
 * accurate rigid-body dynamics.
 *
 * UNITS: `Vehicle.speed` is px/SECOND for the car the player drives and
 * px/FRAME for AI-driven cars (see moveVehicleTowardWaypoint in traffic.ts).
 * Never compare those directly — this module works in px/second throughout,
 * using the `vx`/`vy` the engine derives from position deltas, and converts
 * back on write via `speedScale`.
 */

/** Bounciness. Low, so cars shunt rather than ping apart. */
const RESTITUTION = 0.3;

/** Impacts below this closing speed leave no dent. */
const DAMAGE_FLOOR = 25;
const DAMAGE_SCALE = 0.3;
const DAMAGE_MAX = 60;

/** Rotational kick applied on off-centre hits. */
const SPIN_SCALE = 0.0015;
const SPIN_MAX = 0.3;

/** AI vehicles move per frame; assume 60fps when converting back. */
const FRAMES_PER_SEC = 60;

/** A tank rolling into a car: flat damage plus this much per px/s of closing speed. */
const CRUSH_BASE = 40;
const CRUSH_PER_SPEED = 0.6;
/** Below this closing speed a tank only nudges. */
const CRUSH_MIN_SPEED = 15;

export interface Impact {
  a: Vehicle;
  b: Vehicle;
  /** Contact normal pointing from a to b. */
  nx: number;
  ny: number;
  /** Closing speed along the normal, px/s. Always positive. */
  relSpeed: number;
}

export function isGroundVehicle(v: Vehicle): boolean {
  return !isAirVehicle(v.type);
}

function radiusOf(v: Vehicle): number {
  return specOf(v.type).radius;
}

/** A wreck is immovable; parked cars shove more easily than driven ones. */
export function massOf(v: Vehicle): number {
  if (v.hp <= 0) return Infinity;
  if (v.mass !== undefined) return v.mass;
  const specMass = specOf(v.type).mass;
  if (specMass !== 1) return specMass;
  if (v.isParked) return 0.6;
  return 1;
}

/** Damage from a closing speed, in hp. */
export function damageFor(relSpeed: number): number {
  return Math.max(0, Math.min(DAMAGE_MAX, (relSpeed - DAMAGE_FLOOR) * DAMAGE_SCALE));
}

/** Extra damage `victim` takes from being run into by `by`. */
export function crushDamage(by: Vehicle, victim: Vehicle, relSpeed: number): number {
  if (!specOf(by.type).crushes || specOf(victim.type).crushes) return 0;
  if (relSpeed < CRUSH_MIN_SPEED) return 0;
  return CRUSH_BASE + relSpeed * CRUSH_PER_SPEED;
}

/** Multiplier from true px/s into this vehicle's own `speed` unit. */
function speedScale(v: Vehicle): number {
  return v.occupant === 'player' ? 1 : 1 / FRAMES_PER_SEC;
}

/** Circle centres of the two-circle capsule for `v`, written into `out`. */
function capsuleCentres(v: Vehicle, out: number[]): void {
  const offset = specOf(v.type).offset;
  const fx = Math.sin(v.angle);
  const fy = -Math.cos(v.angle);
  out[0] = v.x + fx * offset;
  out[1] = v.y + fy * offset;
  out[2] = v.x - fx * offset;
  out[3] = v.y - fy * offset;
}

const capA: number[] = [0, 0, 0, 0];
const capB: number[] = [0, 0, 0, 0];

export interface Overlap {
  nx: number;
  ny: number;
  pen: number;
}

/**
 * Deepest overlap between two vehicles' capsules, or false if they are apart.
 * The normal points from `a` towards `b`.
 */
export function capsuleOverlap(a: Vehicle, b: Vehicle, out: Overlap): boolean {
  // Cheap reject before the 2x2 circle test (two tanks nose to nose reach ~40).
  if (Math.abs(a.x - b.x) > 44 || Math.abs(a.y - b.y) > 44) return false;

  capsuleCentres(a, capA);
  capsuleCentres(b, capB);
  const ra = radiusOf(a);
  const rb = radiusOf(b);
  const minDist = ra + rb;

  let bestPen = 0;
  let bestNx = 0;
  let bestNy = 0;

  for (let i = 0; i < 2; i++) {
    const ax = capA[i * 2];
    const ay = capA[i * 2 + 1];
    for (let j = 0; j < 2; j++) {
      const bx = capB[j * 2];
      const by = capB[j * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.hypot(dx, dy);
      if (d >= minDist) continue;
      const pen = minDist - d;
      if (pen > bestPen) {
        bestPen = pen;
        if (d > 0.0001) {
          bestNx = dx / d;
          bestNy = dy / d;
        } else {
          // Exactly coincident: push apart along a stable arbitrary axis.
          bestNx = 1;
          bestNy = 0;
        }
      }
    }
  }

  if (bestPen <= 0) return false;
  out.nx = bestNx;
  out.ny = bestNy;
  out.pen = bestPen;
  return true;
}

/**
 * Separate two overlapping vehicles and apply an impulse.
 * Returns the impact when they were actually closing, otherwise null.
 */
export function resolveImpact(a: Vehicle, b: Vehicle, o: Overlap): Impact | null {
  const ma = massOf(a);
  const mb = massOf(b);
  const invA = ma === Infinity ? 0 : 1 / ma;
  const invB = mb === Infinity ? 0 : 1 / mb;
  const invSum = invA + invB;
  if (invSum === 0) return null;   // two wrecks, nothing to do

  // Positional correction, weighted so the lighter body moves more.
  const corr = o.pen / invSum;
  a.x -= o.nx * corr * invA;
  a.y -= o.ny * corr * invA;
  b.x += o.nx * corr * invB;
  b.y += o.ny * corr * invB;

  const avx = a.vx ?? 0;
  const avy = a.vy ?? 0;
  const bvx = b.vx ?? 0;
  const bvy = b.vy ?? 0;

  // Closing speed along the normal. Positive means separating already.
  const vn = (bvx - avx) * o.nx + (bvy - avy) * o.ny;
  if (vn > 0) return null;

  const j = (-(1 + RESTITUTION) * vn) / invSum;

  const navx = avx - j * o.nx * invA;
  const navy = avy - j * o.ny * invA;
  const nbvx = bvx + j * o.nx * invB;
  const nbvy = bvy + j * o.ny * invB;

  // Project back onto each vehicle's own forward axis. The lateral component is
  // discarded on purpose: the visible sideways shove comes from the positional
  // correction above, and keeping it would let cars drift sideways forever.
  writeBackSpeed(a, navx, navy);
  writeBackSpeed(b, nbvx, nbvy);

  applySpin(a, o.nx, o.ny, j, invA);
  applySpin(b, -o.nx, -o.ny, j, invB);

  a.vx = navx; a.vy = navy;
  b.vx = nbvx; b.vy = nbvy;

  return { a, b, nx: o.nx, ny: o.ny, relSpeed: Math.abs(vn) };
}

function writeBackSpeed(v: Vehicle, vx: number, vy: number): void {
  if (massOf(v) === Infinity) return;
  const fx = Math.sin(v.angle);
  const fy = -Math.cos(v.angle);
  const along = vx * fx + vy * fy;          // px/s
  // Back into the vehicle's own unit: px/s for the player, px/frame for AI.
  v.speed = along * speedScale(v);
}

/** Off-centre hits twist the car, which reads as a much heavier impact. */
function applySpin(v: Vehicle, nx: number, ny: number, j: number, invMass: number): void {
  if (invMass === 0) return;
  const fx = Math.sin(v.angle);
  const fy = -Math.cos(v.angle);
  const cross = nx * fy - ny * fx;
  const kick = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, cross * Math.abs(j) * invMass * SPIN_SCALE));
  v.angle += kick;
}

export interface CollisionContext {
  vehicles: Map<string, Vehicle>;
  /** The vehicle the player is driving, if any. */
  playerVehicleId: string | null;
  nowMs: number;
  /** Called for every damaging impact involving the player or the police. */
  onImpact?: (imp: Impact) => void;
  /** Called once when a vehicle's hp reaches zero, with the vehicle that hit it. */
  onDestroyed?: (v: Vehicle, by: Vehicle | null) => void;
}

/** Police, SWAT and the army ram the player, so their impacts are simulated too. */
function isTracked(v: Vehicle, playerVehicleId: string | null): boolean {
  return v.id === playerVehicleId || isLawGround(v.type);
}

export class CollisionSystem {
  private overlap: Overlap = { nx: 0, ny: 0, pen: 0 };
  /** Reused every update instead of a fresh array per frame. */
  private tracked: Vehicle[] = [];

  /**
   * Resolve collisions for the player's vehicle and every police unit against
   * everything else. NPC-vs-NPC is left to the cheap push-apart in traffic.ts,
   * which keeps this O(tracked x n) rather than O(n^2).
   */
  update(ctx: CollisionContext): void {
    const { vehicles, playerVehicleId } = ctx;

    const tracked = this.tracked;
    tracked.length = 0;
    vehicles.forEach(v => {
      if (isGroundVehicle(v) && isTracked(v, playerVehicleId)) tracked.push(v);
    });
    if (tracked.length === 0) return;

    for (const a of tracked) {
      vehicles.forEach(b => {
        if (b.id === a.id) return;
        if (!isGroundVehicle(b)) return;
        // Avoid resolving a police-vs-police pair twice.
        if (isTracked(b, playerVehicleId) && b.id < a.id) return;
        if (!capsuleOverlap(a, b, this.overlap)) return;

        const imp = resolveImpact(a, b, this.overlap);
        if (!imp) return;

        const dmg = damageFor(imp.relSpeed);
        const toA = dmg + crushDamage(b, a, imp.relSpeed);
        const toB = dmg + crushDamage(a, b, imp.relSpeed);
        if (toA > 0) this.damage(a, toA, b, ctx);
        if (toB > 0) this.damage(b, toB, a, ctx);
        ctx.onImpact?.(imp);
      });
    }
  }

  private damage(v: Vehicle, dmg: number, by: Vehicle, ctx: CollisionContext): void {
    if (v.hp <= 0) return;
    v.hp = Math.max(0, v.hp - dmg * armorOf(v.type));
    v.lastHitTime = ctx.nowMs;
    if (v.hp <= 0) ctx.onDestroyed?.(v, by);
  }
}
