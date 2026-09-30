import { MinimapBlip, Vehicle, VehicleType, WORLD_SIZE } from './types';
import { createLawVehicle } from './traffic';
import { bulletHitChance, headingTo, turnToward } from './combat';

/**
 * Police helicopters.
 *
 * They fly straight over the city (no road graph), circle the player and hold
 * a searchlight on them. While a helicopter is close enough it counts as a
 * sighting, which is what makes three stars and up so hard to shake: the only
 * escapes are outrunning it or getting under a roof.
 *
 * From four stars the crew's gunner fires short bursts, but only while the
 * searchlight is actually on the player — a fast car drags the light behind it
 * and spoils the aim.
 */

/** Cruise altitude, world px (14 per building floor). */
export const HELI_ALT = 160;
/** Clearance kept above whatever roof is below. */
const ROOF_CLEARANCE = 40;
/** Horizontal speed, px/s. A touch slower than a car flat out. */
export const HELI_SPEED = 150;
const HELI_ACCEL = 120;
const HELI_TURN = 2.2;
const CLIMB_RATE = 60;

const ORBIT_RADIUS = 150;
const ORBIT_RATE = 0.35;

/** How far a helicopter can see the player, horizontally. */
export const HELI_SIGHT = 400;
/** Searchlight tracking rate (1/s): lower lags further behind a fast target. */
const SPOT_TRACK = 2.2;
/** The light is "on" the player within this radius of its centre, px. */
export const SPOT_RADIUS = 55;

const SPAWN_DIST = 700;
const SPAWN_INTERVAL = 4;
/** Beyond this the helicopter gives up and a new one is sent closer. */
const LEASH = 1500;
const RETREAT_TIME = 12;

const BURST_ROUNDS = 6;
const ROUND_INTERVAL = 0.12;
const BURST_COOLDOWN = 3.2;

export interface HeliUnit {
  vehicleId: string;
  state: 'pursue' | 'retreat';
  orbitPhase: number;
  /** Searchlight centre on the ground, world px. */
  spotX: number;
  spotY: number;
  /** Current horizontal velocity, px/s. */
  vx: number;
  vy: number;
  burstLeft: number;
  roundTimer: number;
  cooldown: number;
  retreatTimer: number;
  retreatAngle: number;
}

export interface HeliContext {
  vehicles: Map<string, Vehicle>;
  player: { x: number; y: number };
  /** True px/s speed of the player (drives the hit chance). */
  playerSpeed: number;
  /** Under a roof: helicopters cannot see in. */
  covered: boolean;
  dt: number;
  /** Roof height at a point, altitude units. */
  roofAltAt: (x: number, y: number) => number;
}

export interface HeliHooks {
  /** One round fired from `from` at the player; `hit` already rolled. */
  fire(from: { x: number; y: number; alt: number }, hit: boolean): void;
}

export class HeliSystem {
  units: HeliUnit[] = [];
  private target = 0;
  private gunner = false;
  private spawnTimer = 0;
  private sees = false;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  setTarget(n: number, gunner: boolean): void {
    this.target = Math.max(0, n);
    this.gunner = gunner;
  }

  /** Any helicopter had the player in view on the last update. */
  get seesPlayer(): boolean {
    return this.sees;
  }

  clear(vehicles: Map<string, Vehicle>): void {
    for (const u of this.units) vehicles.delete(u.vehicleId);
    this.units.length = 0;
    this.target = 0;
    this.spawnTimer = 0;
    this.sees = false;
  }

  activeCount(): number {
    return this.units.filter(u => u.state !== 'retreat').length;
  }

  getBlips(vehicles: Map<string, Vehicle>): MinimapBlip[] {
    const out: MinimapBlip[] = [];
    for (const u of this.units) {
      const v = vehicles.get(u.vehicleId);
      if (!v) continue;
      out.push({ x: v.x, y: v.y, kind: 'heli', color: '#4488ff', heading: v.angle, pulse: true });
    }
    return out;
  }

  update(ctx: HeliContext, hooks: HeliHooks): void {
    const { vehicles, player, dt } = ctx;
    this.sees = false;

    // Reap vanished or finished helicopters.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = vehicles.get(u.vehicleId);
      if (!v || (u.state === 'retreat' && u.retreatTimer <= 0)) {
        if (v) vehicles.delete(u.vehicleId);
        this.units.splice(i, 1);
      }
    }

    // Too many: the newest peel away.
    let excess = this.activeCount() - this.target;
    for (let i = this.units.length - 1; i >= 0 && excess > 0; i--) {
      const u = this.units[i];
      if (u.state === 'retreat') continue;
      u.state = 'retreat';
      u.retreatTimer = RETREAT_TIME;
      const v = vehicles.get(u.vehicleId);
      u.retreatAngle = v ? headingTo(player.x, player.y, v.x, v.y) : this.rng() * Math.PI * 2;
      excess--;
    }

    // Too few: send one, spaced out.
    if (this.activeCount() < this.target) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        this.spawn(ctx);
      }
    } else {
      this.spawnTimer = 0;
    }

    for (const u of this.units) {
      const v = vehicles.get(u.vehicleId);
      if (!v) continue;
      v.hostile = u.state === 'pursue';

      let goalX: number;
      let goalY: number;
      if (u.state === 'retreat') {
        u.retreatTimer -= dt;
        goalX = v.x + Math.sin(u.retreatAngle) * 400;
        goalY = v.y - Math.cos(u.retreatAngle) * 400;
      } else {
        const d = Math.hypot(v.x - player.x, v.y - player.y);
        if (d > LEASH) {
          this.placeNear(v, u, player);
          continue;
        }
        u.orbitPhase += ORBIT_RATE * dt;
        goalX = player.x + Math.cos(u.orbitPhase) * ORBIT_RADIUS;
        goalY = player.y + Math.sin(u.orbitPhase) * ORBIT_RADIUS;
      }

      this.fly(v, u, goalX, goalY, ctx);

      if (u.state !== 'pursue') continue;

      // Searchlight trails the player; it lags further the faster they go.
      const k = 1 - Math.exp(-SPOT_TRACK * dt);
      u.spotX += (player.x - u.spotX) * k;
      u.spotY += (player.y - u.spotY) * k;

      const horiz = Math.hypot(v.x - player.x, v.y - player.y);
      const sees = !ctx.covered && horiz < HELI_SIGHT;
      if (sees) this.sees = true;
      const lit = sees && Math.hypot(u.spotX - player.x, u.spotY - player.y) < SPOT_RADIUS;

      this.stepGunner(u, v, lit, horiz, ctx, hooks);
    }
  }

  /** Is the searchlight of this unit currently on the player? (renderer + tests) */
  spotOn(u: HeliUnit, player: { x: number; y: number }): boolean {
    return Math.hypot(u.spotX - player.x, u.spotY - player.y) < SPOT_RADIUS;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private spawn(ctx: HeliContext): void {
    const a = this.rng() * Math.PI * 2;
    const at = {
      x: clamp(ctx.player.x + Math.cos(a) * SPAWN_DIST),
      y: clamp(ctx.player.y + Math.sin(a) * SPAWN_DIST),
    };
    const v = createLawVehicle(VehicleType.POLICE_HELI, at);
    v.altitude = HELI_ALT;
    v.angle = headingTo(at.x, at.y, ctx.player.x, ctx.player.y);
    v.hostile = true;
    ctx.vehicles.set(v.id, v);
    this.units.push({
      vehicleId: v.id,
      state: 'pursue',
      orbitPhase: a,
      spotX: at.x,
      spotY: at.y,
      vx: 0,
      vy: 0,
      burstLeft: 0,
      roundTimer: 0,
      // A few seconds' grace before the first burst.
      cooldown: BURST_COOLDOWN,
      retreatTimer: 0,
      retreatAngle: 0,
    });
  }

  private placeNear(v: Vehicle, u: HeliUnit, player: { x: number; y: number }): void {
    const a = this.rng() * Math.PI * 2;
    v.x = clamp(player.x + Math.cos(a) * SPAWN_DIST);
    v.y = clamp(player.y + Math.sin(a) * SPAWN_DIST);
    u.vx = 0;
    u.vy = 0;
    u.spotX = v.x;
    u.spotY = v.y;
  }

  private fly(v: Vehicle, u: HeliUnit, gx: number, gy: number, ctx: HeliContext): void {
    const { dt } = ctx;
    const dx = gx - v.x;
    const dy = gy - v.y;
    const d = Math.hypot(dx, dy);
    // Slow into the orbit point instead of overshooting it.
    const want = Math.min(HELI_SPEED, d * 1.2);
    const tvx = d > 0.001 ? (dx / d) * want : 0;
    const tvy = d > 0.001 ? (dy / d) * want : 0;
    const maxDv = HELI_ACCEL * dt;
    u.vx += Math.max(-maxDv, Math.min(maxDv, tvx - u.vx));
    u.vy += Math.max(-maxDv, Math.min(maxDv, tvy - u.vy));
    // Per-axis easing can overshoot the speed limit on a turn; clamp the vector.
    const sp = Math.hypot(u.vx, u.vy);
    if (sp > HELI_SPEED) {
      u.vx *= HELI_SPEED / sp;
      u.vy *= HELI_SPEED / sp;
    }
    v.x = clamp(v.x + u.vx * dt);
    v.y = clamp(v.y + u.vy * dt);
    // AI convention: `speed` is px/frame.
    v.speed = Math.hypot(u.vx, u.vy) / 60;

    const moving = Math.hypot(u.vx, u.vy) > 20;
    const face = moving ? Math.atan2(u.vx, -u.vy) : headingTo(v.x, v.y, ctx.player.x, ctx.player.y);
    v.angle = turnToward(v.angle, face, HELI_TURN, dt);

    // Hold a clearance over rooftops; tall towers push the cruise height up.
    const roof = Math.max(
      ctx.roofAltAt(v.x, v.y),
      ctx.roofAltAt(v.x + u.vx * 0.8, v.y + u.vy * 0.8),
    );
    const targetAlt = Math.max(HELI_ALT, roof + ROOF_CLEARANCE);
    const alt = v.altitude ?? HELI_ALT;
    v.altitude = alt + Math.max(-CLIMB_RATE * dt, Math.min(CLIMB_RATE * 1.5 * dt, targetAlt - alt));
  }

  private stepGunner(
    u: HeliUnit,
    v: Vehicle,
    lit: boolean,
    horiz: number,
    ctx: HeliContext,
    hooks: HeliHooks,
  ): void {
    if (!this.gunner) {
      u.burstLeft = 0;
      return;
    }
    if (u.burstLeft > 0) {
      u.roundTimer -= ctx.dt;
      if (u.roundTimer > 0) return;
      u.roundTimer = ROUND_INTERVAL;
      u.burstLeft--;
      if (u.burstLeft === 0) u.cooldown = BURST_COOLDOWN;
      if (!lit) return;   // lost the light mid-burst: the gunner holds fire
      const hit = this.rng() < bulletHitChance(ctx.playerSpeed, horiz);
      hooks.fire({ x: v.x, y: v.y, alt: v.altitude ?? HELI_ALT }, hit);
      return;
    }
    u.cooldown -= ctx.dt;
    if (u.cooldown <= 0 && lit) {
      u.burstLeft = BURST_ROUNDS;
      u.roundTimer = 0;
    }
  }
}

function clamp(v: number): number {
  return Math.max(5, Math.min(WORLD_SIZE - 5, v));
}
