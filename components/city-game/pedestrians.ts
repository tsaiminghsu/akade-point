import {
  Pedestrian,
  Point,
  Tile,
  TileType,
  Vehicle,
  VehicleType,
  WorldData,
  TILE_SIZE,
  GRID_SIZE,
} from './types';
import { getTileAt, isWalkable } from './worldGen';

/**
 * Pedestrian crowd simulation.
 *
 * Design constraints that shaped this:
 *  - Fixed pool, no allocation in `update` — this runs every frame alongside
 *    traffic and (later) police AI.
 *  - Neighbour queries go through a tile-keyed spatial hash rebuilt each frame
 *    as an intrusive linked list, so separation stays O(n) rather than O(n^2).
 *  - Rendering is instanced (see PedestrianMeshes.tsx); this module only owns
 *    simulation state. Poses are derived from `state`/`phase`/`fallT`.
 */

// Movement
const WALK_SPEED = 28;          // px/s
const IDLE_CHANCE = 0.06;
const FLEE_SPEED = 78;          // px/s
const PED_RADIUS = 6;           // px

// Spawn / despawn ring around the player
const DESPAWN_DIST = 640;
const SPAWN_MIN = 300;
const SPAWN_MAX = 560;
const MAX_SPAWNS_PER_FRAME = 4;
const SPAWN_ATTEMPTS = 8;
const DESPAWN_CHECK_INTERVAL = 10;   // frames

// Reactions
const KNOCK_SPEED = 40;         // px/s — below this a vehicle only shoves
const FLEE_TRIGGER_SPEED = 60;  // px/s
const FLEE_TRIGGER_DIST = 55;   // px
const PANIC_RADIUS = 120;       // px
const HIT_COOLDOWN = 4;         // s before the same ped scores as a fresh hit
const FLING_DECAY = 0.85;       // per frame at 60fps

// Car body half-extents used for the knockdown test (matches Vehicle 16x26).
const CAR_HALF_W = 8;
const CAR_HALF_L = 13;

const CROSSING_CHANCE = 0.15;
const BLOCK_INTERVAL = 8;

export const PED_SHIRT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f',
  '#e67e22', '#1abc9c', '#34495e', '#ecf0f1', '#d35400',
];
export const PED_SKIN_COLORS = ['#f0c8a0', '#d9a066', '#a8703c', '#6b4423'];

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Tiles a wandering pedestrian may stand on (roads excluded). */
function isPedTile(grid: Tile[][], wx: number, wy: number): boolean {
  const t = getTileAt(grid, wx, wy);
  if (!t) return false;
  return t.type === TileType.SIDEWALK
    || t.type === TileType.PARK
    || t.type === TileType.PARKING
    || t.type === TileType.TOWN_HALL_PLAZA
    || t.type === TileType.TOWN_HALL_INTERIOR;
}

function isRoadTile(grid: Tile[][], wx: number, wy: number): boolean {
  const t = getTileAt(grid, wx, wy);
  if (!t) return false;
  return t.type === TileType.ROAD_H || t.type === TileType.ROAD_V || t.type === TileType.INTERSECTION;
}

function tileCentre(gx: number, gy: number): Point {
  return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
}

export interface PedContext {
  player: { x: number; y: number; angle: number; state: string };
  /** Vehicle the player currently occupies, if any — used to attribute crimes. */
  playerVehicleId: string | null;
  vehicles: Map<string, Vehicle>;
  world: WorldData;
  /** Target population; the ring tops up towards this. */
  maxPeds: number;
  /** Called when the player's own vehicle knocks a pedestrian down. */
  onHitByPlayer?: (ped: Pedestrian) => void;
}

function makePed(): Pedestrian {
  return {
    active: false,
    x: 0, y: 0, angle: 0, speed: 0,
    state: 'walk', stateTimer: 0,
    targetX: 0, targetY: 0,
    fleeX: 0, fleeY: 0,
    phase: 0,
    fallT: 0, fallDir: 1,
    flingVx: 0, flingVy: 0,
    colorIdx: 0, skinIdx: 0,
    hitCooldown: 0,
  };
}

export class PedestrianSystem {
  readonly peds: Pedestrian[];
  readonly capacity: number;
  /** Bumped whenever a slot is (re)spawned so the renderer refreshes colours. */
  spawnVersion = 0;
  count = 0;

  private world: WorldData;
  // Intrusive linked list per tile: cellHead[key] -> ped index, nextIdx[i] -> next.
  private cellHead = new Map<number, number>();
  private nextIdx: Int32Array;
  private frame = 0;

  constructor(world: WorldData, capacity = 128) {
    this.world = world;
    this.capacity = capacity;
    this.peds = Array.from({ length: capacity }, makePed);
    this.nextIdx = new Int32Array(capacity).fill(-1);
  }

  /** Drop everyone (engine reset). */
  clear(): void {
    for (const p of this.peds) p.active = false;
    this.count = 0;
    this.cellHead.clear();
    this.spawnVersion++;
  }

  /** Fill the ring around a starting point so the world is not empty on load. */
  populate(px: number, py: number, target: number): void {
    for (let i = 0; i < target; i++) this.trySpawn(px, py, undefined);
  }

  // ── Spatial hash ──────────────────────────────────────────────────────────

  private static key(gx: number, gy: number): number {
    return gy * GRID_SIZE + gx;
  }

  private rebuildHash(): void {
    this.cellHead.clear();
    const peds = this.peds;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (!p.active) continue;
      const gx = Math.floor(p.x / TILE_SIZE);
      const gy = Math.floor(p.y / TILE_SIZE);
      if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) continue;
      const k = PedestrianSystem.key(gx, gy);
      this.nextIdx[i] = this.cellHead.get(k) ?? -1;
      this.cellHead.set(k, i);
    }
  }

  /**
   * Indices of pedestrians within `r` px of a point. Writes into `out` and
   * returns the count, so callers can reuse a scratch array.
   */
  queryCircle(x: number, y: number, r: number, out: number[]): number {
    const minGx = Math.max(0, Math.floor((x - r) / TILE_SIZE));
    const maxGx = Math.min(GRID_SIZE - 1, Math.floor((x + r) / TILE_SIZE));
    const minGy = Math.max(0, Math.floor((y - r) / TILE_SIZE));
    const maxGy = Math.min(GRID_SIZE - 1, Math.floor((y + r) / TILE_SIZE));
    const r2 = r * r;
    let n = 0;

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        let i = this.cellHead.get(PedestrianSystem.key(gx, gy)) ?? -1;
        while (i !== -1) {
          const p = this.peds[i];
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy <= r2) out[n++] = i;
          i = this.nextIdx[i];
        }
      }
    }
    return n;
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  private freeSlot(): number {
    for (let i = 0; i < this.peds.length; i++) {
      if (!this.peds[i].active) return i;
    }
    return -1;
  }

  private trySpawn(px: number, py: number, playerAngle: number | undefined): boolean {
    const slot = this.freeSlot();
    if (slot === -1) return false;

    const fx = playerAngle === undefined ? 0 : Math.sin(playerAngle);
    const fy = playerAngle === undefined ? 0 : -Math.cos(playerAngle);

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const wx = px + Math.cos(ang) * rad;
      const wy = py + Math.sin(ang) * rad;
      if (wx < TILE_SIZE || wy < TILE_SIZE) continue;
      if (!isPedTile(this.world.grid, wx, wy)) continue;

      // Prefer spawning outside the player's forward cone so people do not
      // pop into existence in plain sight.
      if (playerAngle !== undefined) {
        const d = Math.hypot(wx - px, wy - py);
        if (d > 0) {
          const dot = ((wx - px) / d) * fx + ((wy - py) / d) * fy;
          if (dot > 0.2 && attempt < SPAWN_ATTEMPTS - 2) continue;
        }
      }

      const gx = Math.floor(wx / TILE_SIZE);
      const gy = Math.floor(wy / TILE_SIZE);
      const c = tileCentre(gx, gy);
      const p = this.peds[slot];
      p.active = true;
      p.x = c.x;
      p.y = c.y;
      p.angle = Math.random() * Math.PI * 2;
      p.speed = WALK_SPEED;
      p.state = 'walk';
      p.stateTimer = 0;
      p.targetX = c.x;
      p.targetY = c.y;
      p.phase = Math.random() * Math.PI * 2;
      p.fallT = 0;
      p.fallDir = 1;
      p.flingVx = 0;
      p.flingVy = 0;
      p.colorIdx = Math.floor(Math.random() * PED_SHIRT_COLORS.length);
      p.skinIdx = Math.floor(Math.random() * PED_SKIN_COLORS.length);
      p.hitCooldown = 0;
      this.pickNextTarget(p);
      this.count++;
      this.spawnVersion++;
      return true;
    }
    return false;
  }

  /**
   * Eject the driver of a carjacked vehicle as a fleeing pedestrian.
   * Returns null when the pool is full and no distant ped could be evicted.
   */
  spawnEjectedDriver(v: Vehicle, fleeFrom: Point): Pedestrian | null {
    let slot = this.freeSlot();
    if (slot === -1) {
      // Evict the farthest ped from the ejection point.
      let worst = -1;
      let worstD = -1;
      for (let i = 0; i < this.peds.length; i++) {
        const p = this.peds[i];
        if (!p.active) continue;
        const d = dist(p.x, p.y, v.x, v.y);
        if (d > worstD) { worstD = d; worst = i; }
      }
      if (worst === -1) return null;
      slot = worst;
      this.count--;
    }

    // Place on the first walkable side of the car: left, right, then behind.
    const rightX = Math.cos(v.angle);
    const rightY = Math.sin(v.angle);
    const backX = -Math.sin(v.angle);
    const backY = Math.cos(v.angle);
    const offsets: Array<[number, number]> = [
      [-rightX * 16, -rightY * 16],
      [rightX * 16, rightY * 16],
      [backX * 20, backY * 20],
    ];
    let sx = v.x;
    let sy = v.y;
    for (const [ox, oy] of offsets) {
      if (isWalkable(this.world.grid, v.x + ox, v.y + oy)) {
        sx = v.x + ox;
        sy = v.y + oy;
        break;
      }
    }

    const p = this.peds[slot];
    p.active = true;
    p.x = sx;
    p.y = sy;
    p.speed = FLEE_SPEED;
    p.state = 'flee';
    p.stateTimer = 4;
    p.fleeX = fleeFrom.x;
    p.fleeY = fleeFrom.y;
    p.angle = Math.atan2(sx - fleeFrom.x, -(sy - fleeFrom.y));
    p.phase = 0;
    p.fallT = 0;
    p.fallDir = 1;
    p.flingVx = 0;
    p.flingVy = 0;
    p.colorIdx = v.driverColorIdx ?? Math.floor(Math.random() * PED_SHIRT_COLORS.length);
    p.skinIdx = Math.floor(Math.random() * PED_SKIN_COLORS.length);
    p.hitCooldown = 0;
    p.targetX = p.x;
    p.targetY = p.y;
    this.count++;
    this.spawnVersion++;
    this.panicAround(v.x, v.y, PANIC_RADIUS);
    return p;
  }

  /**
   * A mission passenger: a stationary pedestrian who waits to be collected.
   * Placed on the nearest walkable spot so they are never inside a wall.
   */
  spawnPassenger(x: number, y: number): Pedestrian | null {
    const slot = this.freeSlot();
    if (slot === -1) return null;

    let sx = x;
    let sy = y;
    if (!isWalkable(this.world.grid, sx, sy)) {
      const offsets: Array<[number, number]> = [
        [16, 0], [-16, 0], [0, 16], [0, -16], [24, 24], [-24, -24],
      ];
      for (const [ox, oy] of offsets) {
        if (isWalkable(this.world.grid, x + ox, y + oy)) {
          sx = x + ox;
          sy = y + oy;
          break;
        }
      }
    }

    const p = this.peds[slot];
    p.active = true;
    p.x = sx;
    p.y = sy;
    p.angle = 0;
    p.speed = 0;
    p.state = 'waiting';
    p.stateTimer = 0;
    p.targetX = sx;
    p.targetY = sy;
    p.phase = 0;
    p.fallT = 0;
    p.fallDir = 1;
    p.flingVx = 0;
    p.flingVy = 0;
    p.colorIdx = 4;                    // distinctive yellow so they stand out
    p.skinIdx = Math.floor(Math.random() * PED_SKIN_COLORS.length);
    p.hitCooldown = 0;
    this.count++;
    this.spawnVersion++;
    return p;
  }

  /** Scare everyone near a point (a knockdown, a carjack, gunless mayhem). */
  panicAround(x: number, y: number, r: number): void {
    const scratch: number[] = [];
    const n = this.queryCircle(x, y, r, scratch);
    for (let i = 0; i < n; i++) {
      const p = this.peds[scratch[i]];
      if (p.state === 'knocked' || p.state === 'getup') continue;
      if (p.state === 'waiting') continue;   // mission passengers hold their spot
      p.state = 'flee';
      p.stateTimer = 2.5 + Math.random() * 1.5;
      p.fleeX = x;
      p.fleeY = y;
    }
  }

  // ── Wander targets ────────────────────────────────────────────────────────

  private pickNextTarget(p: Pedestrian): void {
    const gx = Math.floor(p.x / TILE_SIZE);
    const gy = Math.floor(p.y / TILE_SIZE);
    const grid = this.world.grid;

    // Occasionally cross the street at a block corner: step onto the road and
    // continue to the sidewalk on the far side.
    const ox = gx % BLOCK_INTERVAL;
    const oy = gy % BLOCK_INTERVAL;
    const atCorner = (ox === 1 || ox === BLOCK_INTERVAL - 1) && (oy === 1 || oy === BLOCK_INTERVAL - 1);
    if (atCorner && p.state !== 'crossing' && Math.random() < CROSSING_CHANCE) {
      const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const midX = (gx + dx) * TILE_SIZE + TILE_SIZE / 2;
        const midY = (gy + dy) * TILE_SIZE + TILE_SIZE / 2;
        const farGx = gx + dx * 2;
        const farGy = gy + dy * 2;
        if (farGx < 0 || farGx >= GRID_SIZE || farGy < 0 || farGy >= GRID_SIZE) continue;
        const far = tileCentre(farGx, farGy);
        if (isRoadTile(grid, midX, midY) && isPedTile(grid, far.x, far.y)) {
          p.state = 'crossing';
          p.stateTimer = 6;
          p.targetX = far.x;
          p.targetY = far.y;
          return;
        }
      }
    }

    // Prefer carrying straight on; otherwise turn.
    const fwdGx = Math.round(Math.sin(p.angle));
    const fwdGy = Math.round(-Math.cos(p.angle));
    const candidates: Array<[number, number]> = [];
    if (fwdGx !== 0 || fwdGy !== 0) candidates.push([fwdGx, fwdGy]);
    candidates.push([1, 0], [-1, 0], [0, 1], [0, -1]);

    const straightFirst = Math.random() < 0.65;
    const order = straightFirst ? candidates : candidates.slice(1).concat(candidates.slice(0, 1));

    for (const [dx, dy] of order) {
      const ngx = gx + dx;
      const ngy = gy + dy;
      if (ngx < 0 || ngx >= GRID_SIZE || ngy < 0 || ngy >= GRID_SIZE) continue;
      const c = tileCentre(ngx, ngy);
      if (!isPedTile(grid, c.x, c.y)) continue;
      p.targetX = c.x;
      p.targetY = c.y;
      if (p.state === 'crossing') p.state = 'walk';
      return;
    }

    // Dead end: stand still for a moment.
    p.state = 'idle';
    p.stateTimer = 1 + Math.random() * 2;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(dt: number, ctx: PedContext): void {
    this.frame++;
    const { player, world, maxPeds } = ctx;

    this.rebuildHash();

    // Despawn far-away peds periodically rather than every frame.
    if (this.frame % DESPAWN_CHECK_INTERVAL === 0) {
      for (const p of this.peds) {
        if (!p.active) continue;
        if (dist(p.x, p.y, player.x, player.y) > DESPAWN_DIST) {
          p.active = false;
          this.count--;
        }
      }
    }

    // Top up the population.
    let spawned = 0;
    while (this.count < maxPeds && spawned < MAX_SPAWNS_PER_FRAME) {
      if (!this.trySpawn(player.x, player.y, player.angle)) break;
      spawned++;
    }

    // Vehicle interactions (knockdowns, panic) before per-ped movement so a
    // ped knocked this frame does not also walk this frame.
    this.updateVehicleInteractions(dt, ctx);

    const grid = world.grid;
    const frameDecay = Math.pow(FLING_DECAY, dt * 60);

    for (const p of this.peds) {
      if (!p.active) continue;

      if (p.hitCooldown > 0) p.hitCooldown = Math.max(0, p.hitCooldown - dt);

      // Post-impact fling applies in every state.
      if (p.flingVx !== 0 || p.flingVy !== 0) {
        const nx = p.x + p.flingVx * dt;
        const ny = p.y + p.flingVy * dt;
        if (isWalkable(grid, nx, ny)) {
          p.x = nx;
          p.y = ny;
        }
        p.flingVx *= frameDecay;
        p.flingVy *= frameDecay;
        if (Math.abs(p.flingVx) < 1 && Math.abs(p.flingVy) < 1) {
          p.flingVx = 0;
          p.flingVy = 0;
        }
      }

      switch (p.state) {
        case 'knocked': {
          p.fallT = Math.min(1, p.fallT + dt / 0.25);
          p.speed = 0;
          p.stateTimer -= dt;
          if (p.stateTimer <= 0) {
            p.state = 'getup';
            p.stateTimer = 0.6;
          }
          break;
        }
        case 'getup': {
          p.stateTimer -= dt;
          p.fallT = Math.max(0, p.stateTimer / 0.6);
          p.speed = 0;
          if (p.stateTimer <= 0) {
            p.fallT = 0;
            p.state = 'flee';
            p.stateTimer = 3;
          }
          break;
        }
        case 'idle': {
          p.speed = 0;
          p.stateTimer -= dt;
          if (p.stateTimer <= 0) {
            p.state = 'walk';
            this.pickNextTarget(p);
          }
          break;
        }
        case 'flee': {
          p.speed = FLEE_SPEED;
          p.stateTimer -= dt;
          this.stepFlee(p, dt, grid);
          if (p.stateTimer <= 0) {
            p.state = 'walk';
            this.pickNextTarget(p);
          }
          break;
        }
        case 'waiting': {
          // Mission passenger: hold position until collected.
          p.speed = 0;
          break;
        }
        default: {
          // walk / crossing
          p.speed = WALK_SPEED;
          if (p.state === 'crossing') {
            p.stateTimer -= dt;
            if (p.stateTimer <= 0) p.state = 'walk';
          }
          this.stepWalk(p, dt, grid);
          break;
        }
      }

      // Walk-cycle phase: faster while fleeing.
      p.phase += (p.speed / 18) * dt * (p.state === 'flee' ? 2.2 : 1) * Math.PI;
    }

    this.separate();
    this.pushAwayFromPlayer(ctx);
  }

  private stepWalk(p: Pedestrian, dt: number, grid: Tile[][]): void {
    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const d = Math.hypot(dx, dy);

    if (d < 4) {
      if (Math.random() < IDLE_CHANCE) {
        p.state = 'idle';
        p.stateTimer = 1 + Math.random() * 2;
        return;
      }
      this.pickNextTarget(p);
      return;
    }

    const targetAngle = Math.atan2(dx, -dy);
    let diff = targetAngle - p.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.angle += diff * Math.min(1, dt * 8);

    const step = p.speed * dt;
    const nx = p.x + (dx / d) * step;
    const ny = p.y + (dy / d) * step;
    // Crossing peds are allowed on roads; wandering peds are not.
    const ok = p.state === 'crossing' ? isWalkable(grid, nx, ny) : isPedTile(grid, nx, ny);
    if (ok) {
      p.x = nx;
      p.y = ny;
    } else {
      this.pickNextTarget(p);
    }
  }

  private stepFlee(p: Pedestrian, dt: number, grid: Tile[][]): void {
    const awayX = p.x - p.fleeX;
    const awayY = p.y - p.fleeY;
    const mag = Math.hypot(awayX, awayY) || 1;
    const baseAngle = Math.atan2(awayX / mag, -(awayY / mag));

    // Try straight away first, then progressively wider detours.
    const step = p.speed * dt;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0]) {
      const a = baseAngle + off;
      const nx = p.x + Math.sin(a) * step;
      const ny = p.y - Math.cos(a) * step;
      if (isWalkable(grid, nx, ny)) {
        p.x = nx;
        p.y = ny;
        p.angle = a;
        return;
      }
    }
    // Cornered — just face away.
    p.angle = baseAngle;
  }

  private scratch: number[] = [];

  private updateVehicleInteractions(dt: number, ctx: PedContext): void {
    const { vehicles, playerVehicleId, onHitByPlayer } = ctx;

    vehicles.forEach(v => {
      if (v.type === VehicleType.RC_DRONE || v.type === VehicleType.HELICOPTER) return;
      const vx = v.vx ?? 0;
      const vy = v.vy ?? 0;
      const vmag = Math.hypot(vx, vy);
      if (vmag < 1) return;

      const n = this.queryCircle(v.x, v.y, 30, this.scratch);
      for (let i = 0; i < n; i++) {
        const p = this.peds[this.scratch[i]];
        if (!p.active) continue;

        // Transform into the car's frame: forward is (sin a, -cos a).
        const relX = p.x - v.x;
        const relY = p.y - v.y;
        const fx = Math.sin(v.angle);
        const fy = -Math.cos(v.angle);
        const rx = Math.cos(v.angle);
        const ry = Math.sin(v.angle);
        const along = relX * fx + relY * fy;
        const side = relX * rx + relY * ry;

        const inside = Math.abs(side) < CAR_HALF_W + PED_RADIUS
          && Math.abs(along) < CAR_HALF_L + PED_RADIUS;

        if (inside) {
          if (p.state === 'knocked' || p.state === 'getup') continue;   // non-solid while down

          if (vmag >= KNOCK_SPEED) {
            p.state = 'knocked';
            p.stateTimer = 2.0 + Math.min(2, vmag / 80);
            p.fallT = 0;
            p.fallDir = along >= 0 ? 1 : -1;
            const fling = Math.min(90, vmag * 0.6);
            p.flingVx = (vx / vmag) * fling;
            p.flingVy = (vy / vmag) * fling;
            v.speed *= 0.93;
            v.hp = Math.max(0, v.hp - 2);

            if (p.hitCooldown <= 0) {
              p.hitCooldown = HIT_COOLDOWN;
              if (playerVehicleId && v.id === playerVehicleId) onHitByPlayer?.(p);
            }
            this.panicAround(p.x, p.y, PANIC_RADIUS);
          } else {
            // Slow contact: shove clear along the shortest axis and scare them.
            const pushSide = side >= 0 ? 1 : -1;
            const nx = p.x + rx * pushSide * 6;
            const ny = p.y + ry * pushSide * 6;
            if (isWalkable(ctx.world.grid, nx, ny)) {
              p.x = nx;
              p.y = ny;
            }
            if (p.state !== 'flee') {
              p.state = 'flee';
              p.stateTimer = 2.5;
              p.fleeX = v.x;
              p.fleeY = v.y;
            }
          }
          continue;
        }

        // Near miss at speed: get out of the road.
        if (vmag > FLEE_TRIGGER_SPEED && p.state !== 'flee') {
          const d = Math.hypot(relX, relY);
          if (d < FLEE_TRIGGER_DIST && d > 0) {
            const approaching = (-relX / d) * (vx / vmag) + (-relY / d) * (vy / vmag);
            if (approaching > 0.5) {
              p.state = 'flee';
              p.stateTimer = 2.5 + Math.random();
              p.fleeX = v.x;
              p.fleeY = v.y;
            }
          }
        }
      }
    });
  }

  /** Keep pedestrians from stacking; only checks hash neighbours. */
  private separate(): void {
    const peds = this.peds;
    const minSep = PED_RADIUS * 2;
    for (let i = 0; i < peds.length; i++) {
      const a = peds[i];
      if (!a.active || a.state === 'knocked' || a.state === 'getup') continue;
      const n = this.queryCircle(a.x, a.y, minSep, this.scratch);
      for (let k = 0; k < n; k++) {
        const j = this.scratch[k];
        if (j === i) continue;
        const b = peds[j];
        if (!b.active) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < minSep) {
          const push = ((minSep - d) / minSep) * 0.5;
          a.x += (dx / d) * push;
          a.y += (dy / d) * push;
        }
      }
    }
  }

  /** The on-foot player displaces people instead of walking through them. */
  private pushAwayFromPlayer(ctx: PedContext): void {
    if (ctx.player.state !== 'onFoot') return;
    const r = PED_RADIUS + 6;
    const n = this.queryCircle(ctx.player.x, ctx.player.y, r, this.scratch);
    for (let i = 0; i < n; i++) {
      const p = this.peds[this.scratch[i]];
      if (!p.active || p.state === 'knocked' || p.state === 'getup') continue;
      const dx = p.x - ctx.player.x;
      const dy = p.y - ctx.player.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < r) {
        const push = (r - d) * 0.5;
        const nx = p.x + (dx / d) * push;
        const ny = p.y + (dy / d) * push;
        if (isWalkable(ctx.world.grid, nx, ny)) {
          p.x = nx;
          p.y = ny;
        }
      }
    }
  }

  /**
   * Distance to the nearest pedestrian inside a forward cone — lets NPC traffic
   * brake for people (and therefore lets the player body-block a car).
   */
  forwardPedDistance(v: Vehicle, lookAhead: number): number {
    const fx = Math.sin(v.angle);
    const fy = -Math.cos(v.angle);
    const n = this.queryCircle(v.x, v.y, lookAhead, this.scratch);
    let closest = lookAhead;
    for (let i = 0; i < n; i++) {
      const p = this.peds[this.scratch[i]];
      if (!p.active || p.state === 'knocked' || p.state === 'getup') continue;
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const d = Math.hypot(dx, dy);
      if (d < 1) continue;
      const dot = (dx / d) * fx + (dy / d) * fy;
      if (dot < 0.55) continue;
      const cross = Math.abs((dx / d) * fy - (dy / d) * fx);
      if (cross > 0.5) continue;
      if (d < closest) closest = d;
    }
    return closest;
  }
}
