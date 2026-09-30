import { Vehicle, VehicleType } from './types';
import { createLawVehicle } from './traffic';
import {
  BASE_CENTER,
  Post,
  STEALABLE_TANK,
  TANK_POSTS,
  TRUCK_POSTS,
  clampToBaseInterior,
} from './militaryBase';
import { ARREST_TIME, canArrest, steerDirect } from './police';
import { turnToward } from './combat';
import { decay } from './timestep';

/**
 * The base garrison: a tank and a truck behind each gate, plus one unattended
 * tank on the apron for the player to steal.
 *
 * Guards only exist while the player is in the neighbourhood, and they never
 * leave the wall: inside it they hunt the player (trucks ram and arrest, tanks
 * close in and shoot — the engine's gunnery pass handles the turret), and when
 * the player gets out they drive back to their posts. Chasing across the city
 * is the wanted level's job, not theirs.
 */

const ACTIVATE_DIST = 1500;
const DEACTIVATE_DIST = 2000;
/** Tanks hold off at this range and let the gun do the work, px. */
const TANK_STANDOFF = 140;
const POST_TOLERANCE = 8;
const TANK_SPEED_MULT = 1;
const TRUCK_SPEED_MULT = 1.1;

export type GuardKind = 'tank' | 'truck';

export interface Guard {
  kind: GuardKind;
  vehicleId: string;
  post: Post;
  engaged: boolean;
  arrestTimer: number;
}

export interface GuardContext {
  vehicles: Map<string, Vehicle>;
  player: { x: number; y: number; state: string };
  playerSpeed: number;
  playerVehicleType: VehicleType | null;
  playerInBase: boolean;
  dt: number;
  isSolidAt: (x: number, y: number) => boolean;
}

export class BaseGuards {
  guards: Guard[] = [];
  /** The apron tank, until someone drives off in it. */
  stealableId: string | null = null;
  active = false;

  /** Any guard is currently hunting the player. */
  engaged(): boolean {
    return this.guards.some(g => g.engaged);
  }

  arrestProgress(): number {
    let best = 0;
    for (const g of this.guards) best = Math.max(best, g.arrestTimer / ARREST_TIME);
    return Math.min(1, best);
  }

  /**
   * The player boarded `vehicleId`. Returns true when that was the apron tank,
   * which is then no longer the base's to look after.
   */
  onBoarded(vehicleId: string): boolean {
    if (vehicleId !== this.stealableId) return false;
    this.stealableId = null;
    return true;
  }

  /** Remove every base vehicle the player is not using. */
  despawn(vehicles: Map<string, Vehicle>): void {
    for (const g of this.guards) {
      const v = vehicles.get(g.vehicleId);
      if (v && v.occupant === 'npc') vehicles.delete(g.vehicleId);
    }
    this.guards.length = 0;
    if (this.stealableId) {
      const t = vehicles.get(this.stealableId);
      if (t && t.occupant === null) vehicles.delete(this.stealableId);
      this.stealableId = null;
    }
    this.active = false;
  }

  /** Stand everyone down (after a bust or a restart). */
  standDown(): void {
    for (const g of this.guards) {
      g.engaged = false;
      g.arrestTimer = 0;
    }
  }

  update(ctx: GuardContext): 'busted' | null {
    const { vehicles, player } = ctx;
    const d = Math.hypot(player.x - BASE_CENTER.x, player.y - BASE_CENTER.y);

    if (!this.active && d < ACTIVATE_DIST) {
      this.active = true;
      this.garrison(vehicles);
    } else if (this.active && d > DEACTIVATE_DIST) {
      this.despawn(vehicles);
      return null;
    }
    if (!this.active) return null;

    let busted = false;
    for (let i = this.guards.length - 1; i >= 0; i--) {
      const g = this.guards[i];
      const v = vehicles.get(g.vehicleId);
      // Wrecked, stolen, or being stolen: no longer a guard.
      if (!v || v.hp <= 0 || v.occupant !== 'npc' || v.npcState === 'hijacked') {
        if (v) v.hostile = false;
        this.guards.splice(i, 1);
        continue;
      }
      g.engaged = ctx.playerInBase;
      v.hostile = g.engaged;
      if (g.engaged) {
        if (this.hunt(g, v, ctx)) busted = true;
      } else {
        g.arrestTimer = 0;
        this.returnToPost(g, v, ctx);
      }
    }
    return busted ? 'busted' : null;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private garrison(vehicles: Map<string, Vehicle>): void {
    const posts: Array<[GuardKind, Post]> = [
      ...TANK_POSTS.map(p => ['tank', p] as [GuardKind, Post]),
      ...TRUCK_POSTS.map(p => ['truck', p] as [GuardKind, Post]),
    ];
    for (const [kind, post] of posts) {
      if (this.guards.some(g => g.post === post)) continue;
      const v = createLawVehicle(kind === 'tank' ? VehicleType.TANK : VehicleType.ARMY_TRUCK, post);
      v.angle = post.angle;
      v.turretAngle = post.angle;
      v.npcState = undefined;
      v.hostile = false;
      vehicles.set(v.id, v);
      this.guards.push({ kind, vehicleId: v.id, post, engaged: false, arrestTimer: 0 });
    }

    const existing = this.stealableId ? vehicles.get(this.stealableId) : undefined;
    if (!existing) {
      const t = createLawVehicle(VehicleType.TANK, STEALABLE_TANK);
      t.angle = STEALABLE_TANK.angle;
      t.turretAngle = STEALABLE_TANK.angle;
      t.occupant = null;
      // Deliberately not `isParked`: the parked-car recycler deletes parked
      // cars 900px from the player, well inside the garrison's radius. The
      // base owns this tank's lifetime; traffic already ignores law vehicles.
      t.npcState = undefined;
      vehicles.set(t.id, t);
      this.stealableId = t.id;
    }
  }

  /** Close on the player inside the wall. Returns true when an arrest completes. */
  private hunt(g: Guard, v: Vehicle, ctx: GuardContext): boolean {
    const { player, dt } = ctx;
    const d = Math.hypot(player.x - v.x, player.y - v.y);
    const goal = clampToBaseInterior(player.x, player.y);

    if (g.kind === 'tank') {
      if (d > TANK_STANDOFF) steerDirect(v, goal.x, goal.y, dt, ctx.isSolidAt, TANK_SPEED_MULT);
      else v.speed *= decay(0.8, dt);
      this.keepInside(v, dt);
      return false;
    }

    if (canArrest(d, player, ctx.playerSpeed, ctx.playerVehicleType)) {
      v.speed *= decay(0.7, dt);
      g.arrestTimer += dt;
      return g.arrestTimer >= ARREST_TIME;
    }
    g.arrestTimer = 0;
    steerDirect(v, goal.x, goal.y, dt, ctx.isSolidAt, TRUCK_SPEED_MULT);
    this.keepInside(v, dt);
    return false;
  }

  private returnToPost(g: Guard, v: Vehicle, ctx: GuardContext): void {
    const d = Math.hypot(g.post.x - v.x, g.post.y - v.y);
    if (d > POST_TOLERANCE) {
      steerDirect(v, g.post.x, g.post.y, ctx.dt, ctx.isSolidAt, d < 60 ? 0.4 : 0.8);
      this.keepInside(v, ctx.dt);
      return;
    }
    v.speed = 0;
    v.angle = turnToward(v.angle, g.post.angle, 1.5, ctx.dt);
    if (v.turretAngle !== undefined) v.turretAngle = turnToward(v.turretAngle, v.angle, 1, ctx.dt);
  }

  private keepInside(v: Vehicle, dt: number): void {
    const c = clampToBaseInterior(v.x, v.y, 0);
    if (c.x !== v.x || c.y !== v.y) {
      v.x = c.x;
      v.y = c.y;
      v.speed *= decay(0.3, dt);
    }
  }
}
