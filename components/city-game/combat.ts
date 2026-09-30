import { Vehicle } from './types';
import { isAirVehicle } from './vehicleSpecs';

/**
 * Weapons: tank shells, helicopter gunfire and the explosions they cause.
 *
 * The simulation is 2D with a fake altitude axis, so shells fly flat at barrel
 * height and explode on the first building, vehicle or person they touch.
 * Helicopter fire is hitscan: each round is rolled against the player's speed
 * and range, and leaves a tracer so misses are visible too.
 *
 * Framework-free. Damage is not applied here — the engine owns health, armour,
 * wrecks and crimes, and receives every hit through `CombatHooks`.
 */

export type Shooter = 'player' | 'law';

/** Shell flight, px/s, and how far it flies before detonating anyway. */
export const SHELL_SPEED = 420;
export const SHELL_RANGE = 650;
/** Barrel height the shell travels at, altitude units. */
export const SHELL_ALT = 18;
/** Contact radii, px. */
const SHELL_HIT_VEHICLE = 14;
const SHELL_HIT_PERSON = 12;

export const EXPLOSION_RADIUS = 70;
/** Vehicle damage at ground zero, before armour. */
export const EXPLOSION_VEHICLE_DMG = 90;
/** Health lost by a person at ground zero. */
export const EXPLOSION_PLAYER_DMG = 85;

/** Per round. Vehicles absorb gunfire; only people on foot lose health. */
export const BULLET_VEHICLE_DMG = 2.2;
export const BULLET_PLAYER_DMG = 7;

/** Tank gunnery. */
export const TANK_RANGE = 620;
export const TANK_TURRET_RATE = 1.6;
export const TANK_RELOAD = 4.2;
export const PLAYER_TANK_RELOAD = 1.4;
export const PLAYER_TURRET_RATE = 2.4;
/** Barrel tip distance from the hull centre, px. */
export const BARREL_LENGTH = 22;
/** Aim tolerance before an AI tank will fire, radians. */
const FIRE_TOLERANCE = 0.07;

/** Visual lifetimes, seconds. */
const EXPLOSION_LIFE = 0.9;
const TRACER_LIFE = 0.08;

export interface Shell {
  id: number;
  x: number;
  y: number;
  angle: number;
  travelled: number;
  owner: Shooter;
  shooterId: string | null;
}

export interface Explosion {
  id: number;
  x: number;
  y: number;
  /** Seconds since detonation. */
  t: number;
  life: number;
  radius: number;
}

export interface Tracer {
  id: number;
  x0: number;
  y0: number;
  alt0: number;
  x1: number;
  y1: number;
  t: number;
}

export interface CombatHooks {
  vehicles: Map<string, Vehicle>;
  isSolidAt(x: number, y: number): boolean;
  /** Where the player is. `onFoot` people take damage directly; drivers do not. */
  player: { x: number; y: number; onFoot: boolean };
  damageVehicle(v: Vehicle, amount: number, by: Shooter): void;
  damagePlayer(amount: number, by: Shooter): void;
  /** Knock down and scatter pedestrians; returns how many went down. */
  blast?(x: number, y: number, radius: number): number;
  /** Something the player fired went off near a target. */
  onPlayerExplosion?(x: number, y: number, hitSomething: boolean): void;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Heading from one point to another, in the sim's convention (0 = North). */
export function headingTo(fx: number, fy: number, tx: number, ty: number): number {
  return Math.atan2(tx - fx, -(ty - fy));
}

/** Turn `current` towards `target` by at most `rate * dt`. */
export function turnToward(current: number, target: number, rate: number, dt: number): number {
  const diff = wrapAngle(target - current);
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  return current + step;
}

/** True when nothing solid lies on the straight line between two points. */
export function hasLineOfSight(
  isSolidAt: (x: number, y: number) => boolean,
  x0: number, y0: number, x1: number, y1: number,
  step = 16,
): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/** Chance a helicopter round hits: moving fast and far away both help. */
export function bulletHitChance(playerSpeed: number, distance: number): number {
  return Math.max(0.15, Math.min(0.85, 0.8 - playerSpeed / 260 - distance / 1500));
}

let nextId = 1;

export class CombatSystem {
  shells: Shell[] = [];
  explosions: Explosion[] = [];
  tracers: Tracer[] = [];

  clear(): void {
    this.shells.length = 0;
    this.explosions.length = 0;
    this.tracers.length = 0;
  }

  /** Fire from a tank's barrel tip along its turret heading. */
  fireShell(from: Vehicle, owner: Shooter): Shell {
    const angle = from.turretAngle ?? from.angle;
    const shell: Shell = {
      id: nextId++,
      x: from.x + Math.sin(angle) * BARREL_LENGTH,
      y: from.y - Math.cos(angle) * BARREL_LENGTH,
      angle,
      travelled: 0,
      owner,
      shooterId: from.id,
    };
    this.shells.push(shell);
    // Muzzle blast: a small flash with no damage.
    this.addExplosionVisual(shell.x, shell.y, 12, 0.25);
    return shell;
  }

  /**
   * One helicopter round. `hit` is decided by the caller (it knows the odds);
   * a miss still kicks up dirt a short way from the target.
   */
  fireRound(
    from: { x: number; y: number; alt: number },
    target: { x: number; y: number },
    hit: boolean,
    hooks: CombatHooks,
    scatter: () => number = Math.random,
  ): void {
    let tx = target.x;
    let ty = target.y;
    if (!hit) {
      const a = scatter() * Math.PI * 2;
      const r = 8 + scatter() * 22;
      tx += Math.cos(a) * r;
      ty += Math.sin(a) * r;
    }
    this.tracers.push({ id: nextId++, x0: from.x, y0: from.y, alt0: from.alt, x1: tx, y1: ty, t: 0 });
    if (this.tracers.length > 48) this.tracers.shift();
    if (!hit) return;

    const p = hooks.player;
    if (p.onFoot) {
      hooks.damagePlayer(BULLET_PLAYER_DMG, 'law');
      return;
    }
    // Driving: the vehicle underneath takes the round.
    for (const v of hooks.vehicles.values()) {
      if (v.occupant !== 'player' || v.hp <= 0) continue;
      hooks.damageVehicle(v, BULLET_VEHICLE_DMG, 'law');
      return;
    }
  }

  addExplosionVisual(x: number, y: number, radius = EXPLOSION_RADIUS, life = EXPLOSION_LIFE): void {
    this.explosions.push({ id: nextId++, x, y, t: 0, life, radius });
    if (this.explosions.length > 16) this.explosions.shift();
  }

  /** Detonate at a point: damage falls off linearly to the edge of the blast. */
  explode(x: number, y: number, owner: Shooter, hooks: CombatHooks): void {
    this.addExplosionVisual(x, y);
    let hitSomething = false;

    hooks.vehicles.forEach(v => {
      if (v.hp <= 0 || isAirVehicle(v.type)) return;
      const d = Math.hypot(v.x - x, v.y - y);
      if (d >= EXPLOSION_RADIUS) return;
      hooks.damageVehicle(v, EXPLOSION_VEHICLE_DMG * (1 - d / EXPLOSION_RADIUS), owner);
      if (v.occupant !== 'player') hitSomething = true;
    });

    const p = hooks.player;
    if (p.onFoot) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < EXPLOSION_RADIUS) hooks.damagePlayer(EXPLOSION_PLAYER_DMG * (1 - d / EXPLOSION_RADIUS), owner);
    }

    if ((hooks.blast?.(x, y, EXPLOSION_RADIUS) ?? 0) > 0) hitSomething = true;
    if (owner === 'player') hooks.onPlayerExplosion?.(x, y, hitSomething);
  }

  update(dt: number, hooks: CombatHooks): void {
    // Shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      const step = SHELL_SPEED * dt;
      const nx = s.x + Math.sin(s.angle) * step;
      const ny = s.y - Math.cos(s.angle) * step;
      s.travelled += step;

      let detonateAt: { x: number; y: number } | null = null;
      if (hooks.isSolidAt(nx, ny)) {
        detonateAt = { x: s.x, y: s.y };   // on the face of the wall, not inside it
      } else if (this.hitsVehicle(nx, ny, s, hooks) || this.hitsPlayer(nx, ny, s, hooks)) {
        detonateAt = { x: nx, y: ny };
      } else if (s.travelled >= SHELL_RANGE) {
        detonateAt = { x: nx, y: ny };
      }

      if (detonateAt) {
        this.shells.splice(i, 1);
        this.explode(detonateAt.x, detonateAt.y, s.owner, hooks);
      } else {
        s.x = nx;
        s.y = ny;
      }
    }

    // Visual decay
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      if (e.t >= e.life) this.explosions.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t >= TRACER_LIFE) this.tracers.splice(i, 1);
    }
  }

  private hitsVehicle(x: number, y: number, s: Shell, hooks: CombatHooks): boolean {
    for (const v of hooks.vehicles.values()) {
      if (v.id === s.shooterId || v.hp <= 0 || isAirVehicle(v.type)) continue;
      if (Math.abs(v.x - x) > SHELL_HIT_VEHICLE || Math.abs(v.y - y) > SHELL_HIT_VEHICLE) continue;
      if (Math.hypot(v.x - x, v.y - y) < SHELL_HIT_VEHICLE) return true;
    }
    return false;
  }

  private hitsPlayer(x: number, y: number, s: Shell, hooks: CombatHooks): boolean {
    if (s.owner === 'player' || !hooks.player.onFoot) return false;
    return Math.hypot(hooks.player.x - x, hooks.player.y - y) < SHELL_HIT_PERSON;
  }
}

// ── Tank gunnery ──────────────────────────────────────────────────────────────

export interface GunneryTarget {
  x: number;
  y: number;
  /** px/s, used to lead the shot. */
  vx: number;
  vy: number;
}

/**
 * Traverse an AI tank's turret onto the player and fire when it is lined up,
 * loaded, in range and has a clear shot. Returns true on the frame it fires.
 */
export function stepTankGunner(
  tank: Vehicle,
  target: GunneryTarget,
  dt: number,
  isSolidAt: (x: number, y: number) => boolean,
  combat: CombatSystem,
  jitter: () => number = Math.random,
): boolean {
  if (tank.turretAngle === undefined) tank.turretAngle = tank.angle;
  tank.gunCooldown = Math.max(0, (tank.gunCooldown ?? TANK_RELOAD * jitter()) - dt);

  const d = Math.hypot(target.x - tank.x, target.y - tank.y);
  const flight = d / SHELL_SPEED;
  const aimX = target.x + target.vx * flight;
  const aimY = target.y + target.vy * flight;
  const want = headingTo(tank.x, tank.y, aimX, aimY);
  tank.turretAngle = turnToward(tank.turretAngle, want, TANK_TURRET_RATE, dt);

  if (tank.gunCooldown > 0 || d > TANK_RANGE) return false;
  if (Math.abs(wrapAngle(want - tank.turretAngle)) > FIRE_TOLERANCE) return false;
  if (!hasLineOfSight(isSolidAt, tank.x, tank.y, target.x, target.y)) return false;

  // A little spread so a stationary target is not a guaranteed kill.
  const saved = tank.turretAngle;
  tank.turretAngle += (jitter() - 0.5) * 0.08;
  combat.fireShell(tank, 'law');
  tank.turretAngle = saved;
  tank.gunCooldown = TANK_RELOAD + jitter();
  return true;
}
