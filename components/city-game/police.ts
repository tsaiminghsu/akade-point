import {
  Vehicle,
  VehicleType,
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
  createLawVehicle,
  pickSpawnAwayFromPlayer,
} from './traffic';
import type { GroundCounts } from './dispatch';
import { decay, frameScale } from './timestep';

// Historically defined here; the road query now lives with the world helpers.
export { nearestRoadTile } from './worldGen';

/**
 * Ground pursuit: patrol cars, SWAT vans, army trucks and tanks.
 *
 * Units chase along the road graph, switch to a direct ram once close, and
 * arrest the player if they are stopped or on foot nearby. Tanks never arrest —
 * they ram, and the engine's gunnery pass shoots with their turrets.
 *
 * Path re-planning is the expensive part (BFS over the 160x160 grid), so it
 * is budgeted to at most one re-plan per frame across all units, staggered
 * on spawn, and skipped entirely when the goal tile has not changed.
 */

export type PoliceState = 'pursue' | 'ram' | 'arrest' | 'retreat';
export type UnitKind = keyof GroundCounts;

export const UNIT_TYPE: Record<UnitKind, VehicleType> = {
  police: VehicleType.POLICE,
  swat: VehicleType.SWAT,
  army: VehicleType.ARMY_TRUCK,
  tanks: VehicleType.TANK,
};

/** Heaviest first, so a fresh six-star alert rolls the tanks out promptly. */
const SPAWN_ORDER: UnitKind[] = ['tanks', 'army', 'swat', 'police'];

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

export const ARREST_RANGE = 45;
export const ARREST_TIME = 2.0;
/** Above this speed the player is not "stopped" and cannot be arrested. */
export const ARREST_MAX_SPEED = 15;

const STUCK_DIST = 10;
const STUCK_TIME = 2;

const RETREAT_TIME = 10;
const RETREAT_DIST = 500;

const BLIP_COLOR: Record<UnitKind, string> = {
  police: '#4488ff',
  swat: '#60a5fa',
  army: '#84cc16',
  tanks: '#ef4444',
};

export interface PoliceUnit {
  kind: UnitKind;
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
  /** What the player is driving, if anything. Nobody arrests a tank crew. */
  playerVehicleType?: VehicleType | null;
  /** The player is inside the military base: routes may cross its apron. */
  playerInBase?: boolean;
  dt: number;
  isSolidAt: (wx: number, wy: number) => boolean;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** An officer can only arrest a player who is on foot or effectively stopped. */
export function canArrest(
  d: number,
  player: { state: string },
  playerSpeed: number,
  playerVehicleType?: VehicleType | null,
): boolean {
  if (d > ARREST_RANGE) return false;
  if (playerVehicleType === VehicleType.TANK) return false;
  return player.state === 'onFoot' || Math.abs(playerSpeed) < ARREST_MAX_SPEED;
}

/**
 * Drive straight at a point, turning at a capped rate and sliding off walls.
 * `v.speed` is px/FRAME here, like every AI vehicle.
 */
export function steerDirect(
  v: Vehicle,
  tx: number,
  ty: number,
  dt: number,
  isSolidAt: (wx: number, wy: number) => boolean,
  speedMult = 1,
): void {
  const desired = Math.atan2(tx - v.x, -(ty - v.y));
  let diff = desired - v.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  v.angle += Math.max(-RAM_TURN_RATE * dt, Math.min(RAM_TURN_RATE * dt, diff));

  // Ease off for a hairpin rather than orbiting the target at full speed.
  const turnFactor = Math.abs(diff) > 1.2 ? 0.4 : 1;
  const target = v.maxSpeed * speedMult * turnFactor;
  v.speed = v.speed < target ? Math.min(target, v.speed + dt * 3) : Math.max(target, v.speed - dt * 6);

  // Same three-probe slide the player's car uses, so units cannot drive
  // through buildings the way waypoint-following NPCs would.
  const step = v.speed * frameScale(dt);
  const nx = v.x + Math.sin(v.angle) * step;
  const ny = v.y - Math.cos(v.angle) * step;
  const half = 10;
  if (!isSolidAt(nx, ny) && !isSolidAt(nx + half, ny) && !isSolidAt(nx - half, ny)) {
    v.x = nx;
    v.y = ny;
  } else if (!isSolidAt(nx, v.y) && !isSolidAt(nx + half, v.y)) {
    v.x = nx;
    v.speed *= decay(0.5, dt);
  } else if (!isSolidAt(v.x, ny) && !isSolidAt(v.x, ny + half)) {
    v.y = ny;
    v.speed *= decay(0.5, dt);
  } else {
    v.speed *= decay(0.1, dt);
  }
}

export class PoliceSystem {
  units: PoliceUnit[] = [];
  private targets: GroundCounts = { police: 0, swat: 0, army: 0, tanks: 0 };
  private spawnTimer = 0;

  /** How many of each unit should be on the street. Extra units retreat and despawn. */
  setTargets(t: Partial<GroundCounts>): void {
    this.targets = {
      police: Math.max(0, t.police ?? 0),
      swat: Math.max(0, t.swat ?? 0),
      army: Math.max(0, t.army ?? 0),
      tanks: Math.max(0, t.tanks ?? 0),
    };
  }

  clear(vehicles: Map<string, Vehicle>): void {
    for (const u of this.units) vehicles.delete(u.vehicleId);
    this.units.length = 0;
    this.targets = { police: 0, swat: 0, army: 0, tanks: 0 };
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

  count(kind: UnitKind): number {
    let n = 0;
    for (const u of this.units) if (u.kind === kind && u.state !== 'retreat') n++;
    return n;
  }

  getBlips(vehicles: Map<string, Vehicle>): MinimapBlip[] {
    const out: MinimapBlip[] = [];
    for (const u of this.units) {
      const v = vehicles.get(u.vehicleId);
      if (!v) continue;
      out.push({
        x: v.x, y: v.y,
        kind: u.kind === 'army' || u.kind === 'tanks' ? 'military' : 'police',
        color: BLIP_COLOR[u.kind],
        heading: v.angle,
        pulse: true,
      });
    }
    return out;
  }

  /**
   * Advance every unit. Returns 'busted' on the frame an arrest completes.
   */
  update(ctx: PoliceContext): 'busted' | null {
    const { vehicles, world, player, dt } = ctx;

    this.reap(vehicles);
    this.markExcess();
    this.spawnUpToTarget(ctx);

    // One BFS per frame across all units keeps the worst case bounded.
    let bfsBudget = 1;
    let busted = false;

    for (const u of this.units) {
      const v = vehicles.get(u.vehicleId);
      if (!v) continue;
      v.hostile = u.state !== 'retreat';

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
      const arrests = u.kind !== 'tanks';
      const mayArrest = arrests && canArrest(d, player, ctx.playerSpeed, ctx.playerVehicleType);

      switch (u.state) {
        case 'pursue': {
          u.replanTimer -= dt;
          if (u.replanTimer <= 0 && bfsBudget > 0) {
            if (this.replan(u, v, ctx)) bfsBudget--;
            u.replanTimer = REPLAN_INTERVAL;
          }
          moveVehicleTowardWaypoint(v, dt, 1);

          if (mayArrest) {
            u.state = 'arrest';
            u.arrestTimer = 0;
          } else if (d < RAM_RANGE && player.state === 'inCar') {
            u.state = 'ram';
          }
          break;
        }

        case 'ram': {
          this.steerRam(v, ctx);
          if (mayArrest) {
            u.state = 'arrest';
            u.arrestTimer = 0;
          } else if (d > RAM_BREAK) {
            u.state = 'pursue';
            u.replanTimer = 0;   // re-plan immediately
          }
          break;
        }

        case 'arrest': {
          v.speed *= decay(0.7, dt);
          if (!mayArrest) {
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

  private reap(vehicles: Map<string, Vehicle>): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = vehicles.get(u.vehicleId);
      const done = u.state === 'retreat' && u.retreatTimer <= 0;
      // A unit the player has stolen (or is stealing) is no longer ours to drive.
      const lost = !!v && (v.occupant !== 'npc' || v.npcState === 'hijacked');
      if (!v || done || lost || v.hp <= 0) {
        if (v) v.hostile = false;
        if (v && done) vehicles.delete(u.vehicleId);
        this.units.splice(i, 1);
      }
    }
  }

  /** Units beyond each kind's target peel off, newest first. */
  private markExcess(): void {
    for (const kind of SPAWN_ORDER) {
      let excess = this.count(kind) - this.targets[kind];
      for (let i = this.units.length - 1; i >= 0 && excess > 0; i--) {
        const u = this.units[i];
        if (u.kind !== kind || u.state === 'retreat') continue;
        u.state = 'retreat';
        u.retreatTimer = RETREAT_TIME;
        excess--;
      }
    }
  }

  private spawnUpToTarget(ctx: PoliceContext): void {
    const kind = SPAWN_ORDER.find(k => this.count(k) < this.targets[k]);
    if (!kind) return;
    this.spawnTimer -= ctx.dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = SPAWN_INTERVAL;

    const spawn = pickSpawnAwayFromPlayer(
      ctx.world, ctx.player.x, ctx.player.y, undefined, SPAWN_MIN, SPAWN_MAX,
    );
    if (!spawn) return;

    const v = createLawVehicle(UNIT_TYPE[kind], spawn);
    v.hostile = true;
    ctx.vehicles.set(v.id, v);
    this.units.push({
      kind,
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

    const path = findRoadPath(ctx.world.grid, v.x, v.y, goal.x, goal.y, {
      military: ctx.playerInBase ?? false,
    });
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
    const { player } = ctx;
    // Aim where the player will be, not where they are.
    const targetX = player.x + ctx.playerVx * RAM_LEAD_TIME;
    const targetY = player.y + ctx.playerVy * RAM_LEAD_TIME;
    steerDirect(v, targetX, targetY, ctx.dt, ctx.isSolidAt, RAM_SPEED_MULT);
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
