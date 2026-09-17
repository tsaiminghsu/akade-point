import { Point, Vehicle, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { buildLanePath, getForwardBlockDistance } from './traffic';
import { shortestArc } from './orbitCamera';
import type { PedestrianSystem } from './pedestrians';

/**
 * Autopilot for the player's car.
 *
 * It does not move the car itself. Each tick it decides a steering delta and
 * a fake throttle/brake, and the engine feeds those into the exact same
 * `updateCarPhysics` the player uses — so wall collisions, damage, the px/s
 * speed unit and the collision system all behave identically to manual
 * driving. Any manual input disengages it (the engine handles that).
 *
 * Driving style is "law-abiding": 65% of top speed, slow into corners, brake
 * for cars and pedestrians ahead, come to a full stop at the destination.
 */

export const AUTOPILOT_SPEED_FRACTION = 0.65;
/** px — within this of the final point the car brakes to a stop. */
export const AUTOPILOT_ARRIVE_RADIUS = 30;
/** px — advance to the next lane point once this close. */
export const AUTOPILOT_WAYPOINT_RADIUS = 14;
/** px — farther than this from the current point means we left the route. */
export const AUTOPILOT_OFFPATH_DIST = 120;
/** s — sampling interval for stuck detection. */
export const AUTOPILOT_STUCK_TIME = 3;
/** px — moving less than this per sample counts as stuck. */
export const AUTOPILOT_STUCK_DIST = 10;
/** px/s — speed cap when a sharp turn is coming up. */
export const AUTOPILOT_CORNER_SPEED = 55;
/** rad — a bend sharper than this is a "corner". */
export const AUTOPILOT_CORNER_ANGLE = Math.PI / 4;
/** px — start easing off this far before the destination. */
export const AUTOPILOT_SLOWDOWN_DIST = 80;
/** px — look-ahead for cars / pedestrians. */
export const AUTOPILOT_LOOKAHEAD = 90;
/** px/s — below this the car counts as stopped on arrival. */
export const AUTOPILOT_STOPPED_SPEED = 2;

export interface AutopilotState {
  active: boolean;
  path: Point[];
  index: number;
  destX: number;
  destY: number;
  /** Tile key of the destination; a change triggers a re-plan. */
  destKey: number;
  arrived: boolean;
  stuckTimer: number;
  stuckX: number;
  stuckY: number;
  /** Re-plans forced by stuck detection since the last plan. */
  replans: number;
}

export interface AutopilotCtx {
  vehicles: Map<string, Vehicle>;
  peds?: Pick<PedestrianSystem, 'forwardPedDistance'>;
  /** Car top speed, px/s. */
  maxSpeed: number;
  /** Manual steering rate, rad/s — the autopilot never turns faster than a player. */
  steerRate: number;
  dt: number;
}

export interface AutopilotDrive {
  up: boolean;
  brake: boolean;
  /** Steering delta to apply to `car.angle` this tick (already rate-limited). */
  steer: number;
  /** Stopped within the arrival radius. */
  arrived: boolean;
  /** Gave up (stuck twice); the engine should hand control back. */
  lost: boolean;
  /** Target speed this tick, px/s — exposed for tests and the HUD. */
  targetSpeed: number;
}

export function tileKeyOf(p: Point): number {
  return Math.floor(p.y / TILE_SIZE) * GRID_SIZE + Math.floor(p.x / TILE_SIZE);
}

export function createAutopilot(): AutopilotState {
  return {
    active: false,
    path: [],
    index: 0,
    destX: 0,
    destY: 0,
    destKey: -1,
    arrived: false,
    stuckTimer: 0,
    stuckX: 0,
    stuckY: 0,
    replans: 0,
  };
}

/** Plan (or re-plan) a lane-following route from the car to `dest`. */
export function planAutopilot(s: AutopilotState, world: WorldData, car: Point, dest: Point): void {
  const path = buildLanePath(world, { x: car.x, y: car.y }, dest);
  s.path = path.length > 0 ? path : [{ x: dest.x, y: dest.y }];
  s.index = 0;
  s.destX = dest.x;
  s.destY = dest.y;
  s.destKey = tileKeyOf(dest);
  s.arrived = false;
  s.stuckTimer = 0;
  s.stuckX = car.x;
  s.stuckY = car.y;
}

const IDLE: AutopilotDrive = { up: false, brake: true, steer: 0, arrived: false, lost: false, targetSpeed: 0 };

function headingTo(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

export function stepAutopilot(s: AutopilotState, car: Vehicle, ctx: AutopilotCtx): AutopilotDrive {
  if (!s.active || s.path.length === 0) return IDLE;
  const { dt } = ctx;
  const speed = car.speed; // px/s for the player's car

  // ── Stuck detection ──────────────────────────────────────────────────────
  let lost = false;
  let needReplan = false;
  s.stuckTimer += dt;
  if (s.stuckTimer >= AUTOPILOT_STUCK_TIME) {
    const moved = Math.hypot(car.x - s.stuckX, car.y - s.stuckY);
    if (!s.arrived && moved < AUTOPILOT_STUCK_DIST) {
      if (s.replans >= 1) lost = true;
      else { needReplan = true; s.replans++; }
    }
    s.stuckX = car.x;
    s.stuckY = car.y;
    s.stuckTimer = 0;
  }

  // ── Advance along the route ──────────────────────────────────────────────
  while (
    s.index < s.path.length - 1 &&
    Math.hypot(s.path[s.index].x - car.x, s.path[s.index].y - car.y) < AUTOPILOT_WAYPOINT_RADIUS
  ) {
    s.index++;
  }
  const target = s.path[s.index];
  const isLast = s.index === s.path.length - 1;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const d = Math.hypot(dx, dy);

  if (!isLast && d > AUTOPILOT_OFFPATH_DIST) needReplan = true;
  if (isLast && d < AUTOPILOT_ARRIVE_RADIUS) s.arrived = true;

  if (needReplan && !lost) {
    // Signal by leaving the route empty at the current index; the engine
    // re-plans when it sees `replans` bumped or the path exhausted. Simplest:
    // rebuild in place from the current position.
    s.path = [];
  }

  // ── Steering ─────────────────────────────────────────────────────────────
  let steer = 0;
  if (!s.arrived && d > 0.5) {
    const desired = headingTo(car, target);
    const diff = shortestArc(car.angle, desired);
    // Same rate as manual steering, but keep a floor so the car can turn while
    // pulling away from a stop instead of driving straight off the road.
    const rate = ctx.steerRate * Math.max(0.35, Math.min(1, Math.abs(speed) / 50)) * dt;
    steer = Math.max(-rate, Math.min(rate, diff));
  }

  // ── Target speed ─────────────────────────────────────────────────────────
  let limit = ctx.maxSpeed * AUTOPILOT_SPEED_FRACTION;

  if (!isLast && s.index + 1 < s.path.length) {
    const next = s.path[s.index + 1];
    const bend = Math.abs(shortestArc(headingTo(car, target), headingTo(target, next)));
    if (bend > AUTOPILOT_CORNER_ANGLE && d < 60) limit = Math.min(limit, AUTOPILOT_CORNER_SPEED);
  }

  if (isLast) {
    const ramp = Math.max(0, Math.min(1, (d - AUTOPILOT_ARRIVE_RADIUS * 0.4) / AUTOPILOT_SLOWDOWN_DIST));
    limit = Math.min(limit, Math.max(limit * ramp, s.arrived ? 0 : 18));
  }
  if (s.arrived) limit = 0;

  let fwd = getForwardBlockDistance(car, ctx.vehicles, AUTOPILOT_LOOKAHEAD);
  if (ctx.peds) fwd = Math.min(fwd, ctx.peds.forwardPedDistance(car, AUTOPILOT_LOOKAHEAD));
  const brakeCap = fwd < 26 ? 0 : fwd < 70 ? (fwd - 26) / 44 : 1;
  const targetSpeed = limit * brakeCap;

  // ── Throttle / brake ─────────────────────────────────────────────────────
  const up = !s.arrived && speed < targetSpeed - 5;
  const brake = !up && speed > targetSpeed + 8;

  return {
    up,
    brake,
    steer,
    arrived: s.arrived && Math.abs(speed) < AUTOPILOT_STOPPED_SPEED,
    lost,
    targetSpeed,
  };
}
