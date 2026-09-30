import { Point, TileType, Vehicle, VehicleType, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { createLawVehicle } from './traffic';
import { isInsideBase } from './militaryBase';
import { specOf } from './vehicleSpecs';

/**
 * Roadblocks and spike strips, GTA III style.
 *
 * From two stars the police park a pair of cruisers across the road the
 * player is racing down, far enough ahead to be a choice rather than a
 * surprise: ram through (another star), or swing out onto the pavement.
 * From five stars a spike strip is laid in front of the block; driving over it
 * shreds the tyres until the car is resprayed.
 *
 * Roadblock cars are ordinary parked POLICE vehicles, so collisions, the
 * instanced renderer and the parked-car recycler all handle them unchanged.
 */

/** Distance ahead of the player a block is placed, px. */
export const BLOCK_MIN_DIST = 380;
export const BLOCK_MAX_DIST = 560;
/** Seconds between attempts, by severity. */
const COOLDOWN_LOW = 16;
const COOLDOWN_HIGH = 11;
const RETRY = 2;
const MAX_BLOCKS = 2;
const MAX_AGE = 45;
const DESPAWN_DIST = 850;
/** The player must be moving at least this fast (px/s) for a block to be worth it. */
const MIN_SPEED = 70;
/** How far in front of the cars the strip lies, px. */
const STRIP_LEAD = 70;
/** Half-extents of a strip: across the road, and along it (plus a car's half-length). */
const STRIP_HALF_ACROSS = 22;
const STRIP_HALF_ALONG = 13;
/** Cars sit this far either side of the road centre line, px. */
const CAR_SPREAD = 11;
const CAR_SPLAY = 0.3;

export type RoadAxis = 'h' | 'v';

export interface SpikeStrip {
  x: number;
  y: number;
  /** Direction the road runs; the strip lies across it. */
  axis: RoadAxis;
}

export interface Roadblock {
  id: number;
  x: number;
  y: number;
  axis: RoadAxis;
  vehicleIds: string[];
  strip: SpikeStrip | null;
  age: number;
}

export interface BlockSite {
  x: number;
  y: number;
  axis: RoadAxis;
  /** Unit step from the player towards the block. */
  dx: number;
  dy: number;
}

function tileType(world: WorldData, gx: number, gy: number): TileType | null {
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return null;
  return world.grid[gy][gx].type;
}

function isRoad(t: TileType | null): boolean {
  return t === TileType.ROAD_H || t === TileType.ROAD_V || t === TileType.INTERSECTION;
}

/**
 * A straight stretch of the road the player is on, `minDist..maxDist` ahead
 * along their heading snapped to the grid. Null when they are not on a road,
 * or the road turns or ends before that.
 */
export function findBlockSite(
  world: WorldData,
  x: number,
  y: number,
  angle: number,
  minDist = BLOCK_MIN_DIST,
  maxDist = BLOCK_MAX_DIST,
): BlockSite | null {
  const fx = Math.sin(angle);
  const fy = -Math.cos(angle);
  const dx = Math.abs(fx) > Math.abs(fy) ? Math.sign(fx) : 0;
  const dy = dx === 0 ? Math.sign(fy) || -1 : 0;
  const axis: RoadAxis = dx === 0 ? 'v' : 'h';
  const straight = axis === 'v' ? TileType.ROAD_V : TileType.ROAD_H;

  const gx0 = Math.floor(x / TILE_SIZE);
  const gy0 = Math.floor(y / TILE_SIZE);
  if (!isRoad(tileType(world, gx0, gy0))) return null;

  const steps = Math.floor(maxDist / TILE_SIZE);
  for (let k = 1; k <= steps; k++) {
    const gx = gx0 + dx * k;
    const gy = gy0 + dy * k;
    const t = tileType(world, gx, gy);
    if (!isRoad(t)) return null;
    if (k * TILE_SIZE < minDist || t !== straight) continue;
    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const cy = gy * TILE_SIZE + TILE_SIZE / 2;
    if (isInsideBase(cx, cy)) return null;
    return { x: cx, y: cy, axis, dx, dy };
  }
  return null;
}

/** Is a point on the strip (widened by half a car along the road)? */
export function onStrip(s: SpikeStrip, x: number, y: number): boolean {
  const across = s.axis === 'v' ? Math.abs(x - s.x) : Math.abs(y - s.y);
  const along = s.axis === 'v' ? Math.abs(y - s.y) : Math.abs(x - s.x);
  return across < STRIP_HALF_ACROSS && along < STRIP_HALF_ALONG;
}

export interface RoadblockContext {
  world: WorldData;
  vehicles: Map<string, Vehicle>;
  player: { x: number; y: number; angle: number; state: string };
  /** True px/s. */
  playerSpeed: number;
  playerVehicle: Vehicle | null;
  dt: number;
}

export interface RoadblockLevel {
  roadblocks: boolean;
  spikeStrips: boolean;
  /** Current stars, for the placement cadence. */
  stars: number;
}

let nextBlockId = 1;

export class RoadblockSystem {
  blocks: Roadblock[] = [];
  private timer = 0;

  clear(vehicles: Map<string, Vehicle>): void {
    for (const b of this.blocks) this.removeCars(b, vehicles);
    this.blocks.length = 0;
    this.timer = 0;
  }

  strips(): SpikeStrip[] {
    const out: SpikeStrip[] = [];
    for (const b of this.blocks) if (b.strip) out.push(b.strip);
    return out;
  }

  /** Distance to the nearest roadblock officer, or Infinity. */
  nearestDist(vehicles: Map<string, Vehicle>, p: Point): number {
    let best = Infinity;
    for (const b of this.blocks) {
      for (const id of b.vehicleIds) {
        const v = vehicles.get(id);
        if (!v || v.occupant !== 'npc') continue;
        best = Math.min(best, Math.hypot(v.x - p.x, v.y - p.y));
      }
    }
    return best;
  }

  /**
   * Place, age and remove blocks. Returns true on the frame the player's tyres
   * are shredded.
   */
  update(ctx: RoadblockContext, level: RoadblockLevel): boolean {
    const { vehicles, player, dt } = ctx;

    if (!level.roadblocks) {
      if (this.blocks.length > 0) this.clear(vehicles);
      this.timer = 0;
      return false;
    }

    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.age += dt;
      const far = Math.hypot(b.x - player.x, b.y - player.y) > DESPAWN_DIST;
      if (b.age > MAX_AGE || far) {
        this.removeCars(b, vehicles);
        this.blocks.splice(i, 1);
      }
    }

    this.timer -= dt;
    if (this.timer <= 0 && this.blocks.length < MAX_BLOCKS
      && player.state === 'inCar' && ctx.playerSpeed > MIN_SPEED
      && !isInsideBase(player.x, player.y)) {
      const placed = this.place(ctx, level.spikeStrips);
      this.timer = placed ? (level.stars >= 4 ? COOLDOWN_HIGH : COOLDOWN_LOW) : RETRY;
    }

    return this.checkSpikes(ctx);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private place(ctx: RoadblockContext, spikes: boolean): boolean {
    const { world, vehicles, player } = ctx;
    const site = findBlockSite(world, player.x, player.y, player.angle);
    if (!site) return false;
    for (const b of this.blocks) {
      if (Math.hypot(b.x - site.x, b.y - site.y) < 300) return false;
    }

    const ids: string[] = [];
    for (const side of [-1, 1]) {
      const at = site.axis === 'v'
        ? { x: site.x + side * CAR_SPREAD, y: site.y }
        : { x: site.x, y: site.y + side * CAR_SPREAD };
      const v = createLawVehicle(VehicleType.POLICE, at);
      // Broadside across the lane, splayed into a V.
      v.angle = (site.axis === 'v' ? Math.PI / 2 : 0) + side * CAR_SPLAY;
      v.isParked = true;
      v.npcState = undefined;
      v.mass = 2;
      vehicles.set(v.id, v);
      ids.push(v.id);
    }

    const strip: SpikeStrip | null = spikes
      ? { x: site.x - site.dx * STRIP_LEAD, y: site.y - site.dy * STRIP_LEAD, axis: site.axis }
      : null;

    this.blocks.push({
      id: nextBlockId++,
      x: site.x,
      y: site.y,
      axis: site.axis,
      vehicleIds: ids,
      strip,
      age: 0,
    });
    return true;
  }

  private checkSpikes(ctx: RoadblockContext): boolean {
    const v = ctx.playerVehicle;
    if (!v || v.tiresPopped || ctx.player.state !== 'inCar') return false;
    if (specOf(v.type).pivot) return false;   // tracks, not tyres
    for (const b of this.blocks) {
      if (b.strip && onStrip(b.strip, v.x, v.y)) {
        v.tiresPopped = true;
        return true;
      }
    }
    return false;
  }

  /** Remove the block's cars, unless the player has taken one. */
  private removeCars(b: Roadblock, vehicles: Map<string, Vehicle>): void {
    for (const id of b.vehicleIds) {
      const v = vehicles.get(id);
      if (v && v.occupant === 'npc') vehicles.delete(id);
    }
  }
}
