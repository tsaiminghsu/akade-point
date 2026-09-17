import {
  Vehicle,
  WorldData,
  MinimapBlip,
  TILE_SIZE,
  GRID_SIZE,
} from './types';
import { findRoadPath, nearestRoadTile } from './worldGen';
import { pickRoadBeyond } from './chunks';
import {
  applyTrafficLanes,
  moveVehicleTowardWaypoint,
  createPoliceCar,
  pickSpawnAwayFromPlayer,
} from './traffic';

// Historically defined here; the road query now lives with the world helpers.
export { nearestRoadTile } from './worldGen';

/**
 * Police pursuit.
 *
 * Units chase along the road graph, switch to a direct ram once close, and
 * arrest the player if they are stopped or on foot nearby. There are no
 * weapons: the only outcome is Busted.
 *
 * Path re-planning is the expensive part (BFS over the 160x160 grid), so it
 * is budgeted to at most one re-plan per frame across all units, staggered
 * on spawn, and skipped entirely when the goal tile has not changed.
 */

export type PoliceState = 'pursue' | 'ram' | 'arrest' | 'retreat';

/** How far a unit can see the player. */
export const SIGHT_RANGE = 280;

const REPLAN_INTERVAL = 1.0;
const SPAWN_INTERVAL = 1.5;
const SPAWN_MIN = 400;
const SPAWN_MAX = 650;
const LEASH = 900;

const RAM_RANGE = 110;
const RAM_BREAK = 160;
const RAM_SPEED_MULT = 1.15;
const RAM_TURN_RATE = 3.0;
const RAM_LEAD_TIME = 0.35;

const ARREST_RANGE = 45;
const ARREST_TIME = 2.0;
/** Above this speed the player is not "stopped" and cannot be arrested. */
const ARREST_MAX_SPEED = 15;

const STUCK_DIST = 10;
const STUCK_TIME = 2;

const RETREAT_TIME = 10;
const RETREAT_DIST = 500;

export interface PoliceUnit {
  vehicleId: string;
  state: PoliceState;
  replanTimer: number;
  arrestTimer: number;
  stuckX: number;
  stuckY: number;
  stuckTimer: number;
  retreatTimer: number;
  /** Tile key of the last pursuit goal, so identical re-plans are skipped. */
  lastGoalKey: number;
}

export interface PoliceContext {
  world: WorldData;
  vehicles: Map<string, Vehicle>;
  player: { x: number; y: number; state: string; speed: number };
  /** True px/s speed of the player's vehicle (or 0 on foot). */
  playerSpeed: number;
  /** True px/s velocity of the player, used to lead the intercept. */
  playerVx: number;
  playerVy: number;
  dt: number;
  isSolidAt: (wx: number, wy: number) => boolean;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export class PoliceSystem {
  units: PoliceUnit[] = [];
  private targetCount = 0;
  private spawnTimer = 0;

  /** How many units should be on the street. Extra units retreat and despawn. */
  setTarget(n: number): void {
    this.targetCount = Math.max(0, n);
  }

  clear(vehicles: Map<string, Vehicle>): void {
    for (const u of this.units) vehicles.delete(u.vehicleId);
    this.units.length = 0;
    this.targetCount = 0;
    this.spawnTimer = 0;
  }

  /** Distance to the closest live unit, or Infinity. */
  nearestDist(ctx: { vehicles: Map<string, Vehicle>; player: { x: number; y: number } }): number {
    let best = Infinity;
    for (const u of this.units) {
      const v = ctx.vehicles.get(u.vehicleId);
      if (!v) continue;
      const d = dist(v.x, v.y, ctx.player.x, ctx.player.y);
      if (d < best) best = d;
    }
    return best;
  }

  /** Progress of the most advanced arrest in flight, 0-1. */
  arrestProgress(): number {
    let best = 0;
    for (const u of this.units) {
      if (u.state === 'arrest') best = Math.max(best, u.arrestTimer / ARREST_TIME);
    }
    return Math.min(1, best);
  }

  getBlips(vehicles: Map<string, Vehicle>): MinimapBlip[] {
    const out: MinimapBlip[] = [];
    for (const u of this.units) {
      const v = vehicles.get(u.vehicleId);
      if (!v) continue;
      out.push({ x: v.x, y: v.y, kind: 'police', color: '#4488ff', heading: v.angle, pulse: true });
    }
    return out;
  }

  /**
   * Advance every unit. Returns 'busted' on the frame an arrest completes.
   */
  update(ctx: PoliceContext): 'busted' | null {
    const { vehicles, world, player, dt } = ctx;

    this.reap(vehicles);
    this.spawnUpToTarget(ctx);

    // One BFS per frame across all units keeps the worst case bounded.
    let bfsBudget = 1;
    let busted = false;

    const excess = Math.max(0, this.units.length - this.targetCount);
    let retreated = 0;

    for (const u of this.units) {
      const v = vehicles.get(u.vehicleId);
      if (!v) continue;

      // Units beyond the current target peel off, newest first.
      if (retreated < excess && u.state !== 'retreat') {
        u.state = 'retreat';
        u.retreatTimer = RETREAT_TIME;
        retreated++;
      }

      const d = dist(v.x, v.y, player.x, player.y);

      if (u.state === 'retreat') {
        u.retreatTimer -= dt;
        moveVehicleTowardWaypoint(v, dt, 1);
        if (v.waypointIndex >= v.waypoints.length) this.routeAway(v, world, player);
        continue;
      }

      // Keep units from drifting out of the world while still wanted.
      if (d > LEASH) {
        this.respawnNear(v, ctx);
        continue;
      }

      this.updateStuck(u, v, ctx);

      switch (u.state) {
        case 'pursue': {
          u.replanTimer -= dt;
          if (u.replanTimer <= 0 && bfsBudget > 0) {
            if (this.replan(u, v, ctx)) bfsBudget--;
            u.replanTimer = REPLAN_INTERVAL;
          }
          moveVehicleTowardWaypoint(v, dt, 1);

          if (this.canArrest(d, ctx)) {
            u.state = 'arrest';
            u.arrestTimer = 0;
          } else if (d < RAM_RANGE && player.state === 'inCar') {
            u.state = 'ram';
          }
          break;
        }

        case 'ram': {
          this.steerRam(v, ctx);
          if (this.canArrest(d, ctx)) {
            u.state = 'arrest';
            u.arrestTimer = 0;
          } else if (d > RAM_BREAK) {
            u.state = 'pursue';
            u.replanTimer = 0;   // re-plan immediately
          }
          break;
        }

        case 'arrest': {
          v.speed *= 0.7;
          if (!this.canArrest(d, ctx)) {
            u.state = 'pursue';
            u.arrestTimer = 0;
            u.replanTimer = 0;
            break;
          }
          u.arrestTimer += dt;
          if (u.arrestTimer >= ARREST_TIME) busted = true;
          break;
        }
      }
    }

    return busted ? 'busted' : null;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** An officer can only arrest a player who is on foot or effectively stopped. */
  private canArrest(d: number, ctx: PoliceContext): boolean {
    if (d > ARREST_RANGE) return false;
    return ctx.player.state === 'onFoot' || Math.abs(ctx.playerSpeed) < ARREST_MAX_SPEED;
  }

  private reap(vehicles: Map<string, Vehicle>): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = vehicles.get(u.vehicleId);
      const gone = !v
        || (u.state === 'retreat' && u.retreatTimer <= 0)
        || (v.hp <= 0);
      if (gone) {
        if (v && u.state === 'retreat') vehicles.delete(u.vehicleId);
        this.units.splice(i, 1);
      }
    }
  }

  private spawnUpToTarget(ctx: PoliceContext): void {
    if (this.units.length >= this.targetCount) return;
    this.spawnTimer -= ctx.dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = SPAWN_INTERVAL;

    const spawn = pickSpawnAwayFromPlayer(
      ctx.world, ctx.player.x, ctx.player.y, undefined, SPAWN_MIN, SPAWN_MAX,
    );
    if (!spawn) return;

    const v = createPoliceCar(spawn);
    ctx.vehicles.set(v.id, v);
    this.units.push({
      vehicleId: v.id,
      state: 'pursue',
      // Stagger re-plans so units never all BFS on the same frame.
      replanTimer: (this.units.length % 4) * 0.25,
      arrestTimer: 0,
      stuckX: v.x,
      stuckY: v.y,
      stuckTimer: STUCK_TIME,
      retreatTimer: 0,
      lastGoalKey: -1,
    });
  }

  private respawnNear(v: Vehicle, ctx: PoliceContext): void {
    const spawn = pickSpawnAwayFromPlayer(
      ctx.world, ctx.player.x, ctx.player.y, undefined, SPAWN_MIN, SPAWN_MAX,
    );
    if (!spawn) return;
    v.x = spawn.x;
    v.y = spawn.y;
    v.speed = 0;
    v.waypoints = [];
    v.waypointIndex = 0;
  }

  private updateStuck(u: PoliceUnit, v: Vehicle, ctx: PoliceContext): void {
    u.stuckTimer -= ctx.dt;
    if (u.stuckTimer > 0) return;
    const moved = dist(v.x, v.y, u.stuckX, u.stuckY);
    if (moved < STUCK_DIST) {
      // Wedged: force a fresh route, and teleport if that already failed once.
      if (u.lastGoalKey === -2) {
        this.respawnNear(v, ctx);
        u.lastGoalKey = -1;
      } else {
        u.replanTimer = 0;
        u.lastGoalKey = -2;
      }
    }
    u.stuckX = v.x;
    u.stuckY = v.y;
    u.stuckTimer = STUCK_TIME;
  }

  /** Re-route towards the player. Returns true when a BFS was actually run. */
  private replan(u: PoliceUnit, v: Vehicle, ctx: PoliceContext): boolean {
    const goal = nearestRoadTile(ctx.world, ctx.player);
    const key = Math.floor(goal.y / TILE_SIZE) * GRID_SIZE + Math.floor(goal.x / TILE_SIZE);
    if (key === u.lastGoalKey && v.waypointIndex < v.waypoints.length) return false;

    const path = findRoadPath(ctx.world.grid, v.x, v.y, goal.x, goal.y);
    const laned = applyTrafficLanes(path, { x: v.x, y: v.y });
    // Drop the lane offset on the final approach so units converge on the
    // player rather than politely stopping in their own lane.
    if (laned.length >= 2) {
      laned[laned.length - 1] = path[path.length - 1];
      laned[laned.length - 2] = path[path.length - 2];
    }
    v.waypoints = laned;
    v.waypointIndex = 0;
    u.lastGoalKey = key;
    return true;
  }

  /** Direct interception: aim where the player will be, and slide off walls. */
  private steerRam(v: Vehicle, ctx: PoliceContext): void {
    const { player, dt, isSolidAt } = ctx;
    // Aim where the player will be, not where they are.
    const targetX = player.x + ctx.playerVx * RAM_LEAD_TIME;
    const targetY = player.y + ctx.playerVy * RAM_LEAD_TIME;

    const desired = Math.atan2(targetX - v.x, -(targetY - v.y));
    let diff = desired - v.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    v.angle += Math.max(-RAM_TURN_RATE * dt, Math.min(RAM_TURN_RATE * dt, diff));

    v.speed = Math.min(v.maxSpeed * RAM_SPEED_MULT, v.speed + dt * 3);

    // Same three-probe slide the player's car uses, so police cannot drive
    // through buildings the way waypoint-following NPCs would.
    const nx = v.x + Math.sin(v.angle) * v.speed;
    const ny = v.y - Math.cos(v.angle) * v.speed;
    const half = 10;
    if (!isSolidAt(nx, ny) && !isSolidAt(nx + half, ny) && !isSolidAt(nx - half, ny)) {
      v.x = nx;
      v.y = ny;
    } else if (!isSolidAt(nx, v.y) && !isSolidAt(nx + half, v.y)) {
      v.x = nx;
      v.speed *= 0.5;
    } else if (!isSolidAt(v.x, ny) && !isSolidAt(v.x, ny + half)) {
      v.y = ny;
      v.speed *= 0.5;
    } else {
      v.speed *= 0.1;
    }
  }

  private routeAway(v: Vehicle, world: WorldData, player: { x: number; y: number }): void {
    const dest = pickRoadBeyond(world, player.x, player.y, RETREAT_DIST);
    if (!dest) return;
    v.waypoints = applyTrafficLanes(
      findRoadPath(world.grid, v.x, v.y, dest.x, dest.y),
      { x: v.x, y: v.y },
    );
    v.waypointIndex = 0;
  }
}
