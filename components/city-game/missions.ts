import {
  Point,
  TileType,
  VehicleType,
  WorldData,
  TILE_SIZE,
  GRID_SIZE,
} from './types';
import { getTileAt, getZoneName } from './worldGen';
import { nearestRoadTile } from './police';

/**
 * Mission catalogue.
 *
 * Definitions are pure data plus two functions: where the pickup marker sits,
 * and how to generate a run's objectives. Keeping generation seedable means the
 * tests can assert that every generated objective lands somewhere reachable.
 */

export type MissionKind = 'taxi' | 'delivery' | 'courier' | 'sightseeing' | 'getaway';

export type ObjectiveKind =
  | 'enterVehicle'
  | 'reach'
  | 'pickup'
  | 'dropoff'
  | 'loseWanted';

export interface MissionObjective {
  id: string;
  text: string;
  kind: ObjectiveKind;
  x: number;
  y: number;
  radius: number;
  /** The player must be nearly stationary, not just inside the radius. */
  requireStopped?: boolean;
  /** For enterVehicle objectives. */
  vehicleType?: VehicleType;
  done: boolean;
}

export interface MissionDef {
  id: string;
  kind: MissionKind;
  title: string;
  description: string;
  icon: string;
  color: string;
  baseReward: number;
  /** Seconds, or null for untimed. */
  timeLimit: number | null;
  /** Seconds before the marker can be used again after a run ends. */
  cooldown: number;
  /** The job requires this vehicle; leaving it fails the run. */
  requiredVehicle: VehicleType | null;
  /** Passive missions have no marker and are always progressing. */
  passive?: boolean;
  /** World position of the pickup marker, or null for passive missions. */
  markerAt: (world: WorldData) => Point | null;
  build: (world: WorldData, rng: () => number, playerPos: Point) => MissionObjective[];
}

/** Deterministic PRNG so a seeded run generates the same objectives. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Road tile nearest to a shop entrance, so markers never sit inside a wall. */
function shopRoad(world: WorldData, index: number): Point {
  const shop = world.shopPositions[index % Math.max(1, world.shopPositions.length)]
    ?? { x: TILE_SIZE * 20, y: TILE_SIZE * 20 };
  // shopPositions are tile corners, so nudge to the tile centre first.
  return nearestRoadTile(world, { x: shop.x + TILE_SIZE / 2, y: shop.y + TILE_SIZE / 2 });
}

/** All HOUSE tiles, used as delivery destinations. */
function houseTiles(world: WorldData): Point[] {
  const out: Point[] = [];
  for (let gy = 0; gy < GRID_SIZE; gy += 2) {
    for (let gx = 0; gx < GRID_SIZE; gx += 2) {
      const t = world.grid[gy]?.[gx];
      if (t?.type === TileType.BUILDING && t.buildingType === 'HOUSE') {
        out.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
      }
    }
  }
  return out;
}

/**
 * Pick `n` checkpoints from the road network that are spread out.
 * Falls back to accepting closer tiles rather than returning too few.
 */
export function pickCheckpoints(
  roadTiles: Point[],
  n: number,
  minGap: number,
  rng: () => number,
  start: Point,
): Point[] {
  const chosen: Point[] = [];
  let guard = 0;
  let gap = minGap;

  while (chosen.length < n && guard < 4000) {
    guard++;
    const candidate = pick(roadTiles, rng);
    if (!candidate) break;
    const prev = chosen[chosen.length - 1] ?? start;
    if (dist(prev, candidate) < gap) {
      // Relax the constraint if the map is too crowded to satisfy it.
      if (guard % 500 === 0) gap *= 0.8;
      continue;
    }
    chosen.push(candidate);
  }
  return chosen;
}

/** A delivery destination `minD`..`maxD` away from `from`. */
function pickHouse(world: WorldData, rng: () => number, from: Point, minD: number, maxD: number): Point {
  const houses = houseTiles(world);
  const inRange = houses.filter(h => {
    const d = dist(from, h);
    return d >= minD && d <= maxD;
  });
  const pool = inRange.length > 0 ? inRange : houses;
  const target = pick(pool, rng) ?? from;
  return nearestRoadTile(world, target);
}

let objSeq = 0;
function obj(o: Omit<MissionObjective, 'id' | 'done'>): MissionObjective {
  objSeq += 1;
  return { ...o, id: `o${objSeq}`, done: false };
}

// ── Landmarks for the sightseeing job ────────────────────────────────────────

export interface Landmark {
  id: string;
  label: string;
  /** Null means "discovered by entering a named zone" rather than by position. */
  at: ((w: WorldData) => Point) | null;
  radius: number;
  /** Zone name from getZoneName that unlocks this landmark. */
  zone?: string;
}

export const LANDMARKS: Landmark[] = [
  { id: 'town_hall', label: '城鎮辦事處', at: w => w.townHallPos, radius: 220 },
  { id: 'helipad', label: '直升機停機坪', at: w => w.helipads[0] ?? w.townHallPos, radius: 90 },
  { id: 'zone_commercial', label: '商業區', at: null, radius: 0, zone: '商業區' },
  { id: 'zone_residential', label: '住宅區', at: null, radius: 0, zone: '住宅區' },
  { id: 'zone_office', label: '辦公區', at: null, radius: 0, zone: '辦公區' },
  { id: 'zone_park', label: '公園區', at: null, radius: 0, zone: '公園區' },
  { id: 'zone_plaza', label: '市政廣場', at: null, radius: 0, zone: '市政廣場' },
  { id: 'zone_road', label: '城市道路', at: null, radius: 0, zone: '道路' },
];

export const SIGHTSEEING_PER_LANDMARK = 50;
export const SIGHTSEEING_COMPLETE_BONUS = 500;

/** Landmarks discovered by standing near them, checked against a position. */
export function positionalLandmarks(): Landmark[] {
  return LANDMARKS.filter(l => l.at !== null);
}

export function zoneLandmarkId(world: WorldData, wx: number, wy: number): string | null {
  const zone = getZoneName(world.grid, wx, wy);
  const found = LANDMARKS.find(l => l.zone === zone);
  return found ? found.id : null;
}

// ── Mission definitions ──────────────────────────────────────────────────────

const COURIER_CHECKPOINTS = 5;
const DELIVERY_DROPS = 3;

export const MISSIONS: MissionDef[] = [
  {
    id: 'courier_civic',
    kind: 'courier',
    title: '市政快遞',
    description: '依序抵達 5 個檢查點，越快送達獎金越高。',
    icon: '📮',
    color: '#38bdf8',
    baseReward: 150,
    timeLimit: null,          // computed per run from the route length
    cooldown: 25,
    requiredVehicle: null,
    markerAt: w => nearestRoadTile(w, { x: w.townHallPos.x, y: w.townHallPos.y - TILE_SIZE * 6 }),
    build: (world, rng, playerPos) => {
      const points = pickCheckpoints(world.roadTiles, COURIER_CHECKPOINTS, 300, rng, playerPos);
      return points.map((p, i) =>
        obj({
          text: `抵達檢查點 ${i + 1}/${points.length}`,
          kind: 'reach',
          x: p.x, y: p.y,
          radius: 45,
        }),
      );
    },
  },

  {
    id: 'delivery_shop',
    kind: 'delivery',
    title: '外送員',
    description: '騎上外送機車，到店取餐並完成 3 筆外送。',
    icon: '🍱',
    color: '#fb923c',
    baseReward: 60,
    timeLimit: 180,
    cooldown: 30,
    requiredVehicle: VehicleType.DELIVERY_SCOOTER,
    markerAt: w => shopRoad(w, 0),
    build: (world, rng) => {
      const shop = shopRoad(world, 0);
      const list: MissionObjective[] = [
        obj({
          text: '騎上外送機車',
          kind: 'enterVehicle',
          x: shop.x, y: shop.y, radius: 60,
          vehicleType: VehicleType.DELIVERY_SCOOTER,
        }),
        obj({ text: '到店取餐', kind: 'pickup', x: shop.x, y: shop.y, radius: 50 }),
      ];
      let from = shop;
      for (let i = 0; i < DELIVERY_DROPS; i++) {
        const drop = pickHouse(world, rng, from, 300, 800);
        list.push(obj({
          text: `外送 ${i + 1}/${DELIVERY_DROPS}`,
          kind: 'dropoff',
          x: drop.x, y: drop.y, radius: 50,
          requireStopped: true,
        }));
        from = drop;
      }
      return list;
    },
  },

  {
    id: 'taxi_job',
    kind: 'taxi',
    title: '計程車司機',
    description: '開計程車載客，時間越短小費越多。',
    icon: '🚕',
    color: '#facc15',
    baseReward: 80,
    timeLimit: null,          // per fare
    cooldown: 20,
    requiredVehicle: VehicleType.TAXI,
    markerAt: w => shopRoad(w, 2),
    build: (world, rng) => {
      const stand = shopRoad(world, 2);
      const rider = nearestRoadTile(world, pick(world.roadTiles, rng) ?? stand);
      return [
        obj({
          text: '上計程車',
          kind: 'enterVehicle',
          x: stand.x, y: stand.y, radius: 60,
          vehicleType: VehicleType.TAXI,
        }),
        obj({ text: '前往接客', kind: 'pickup', x: rider.x, y: rider.y, radius: 45, requireStopped: true }),
      ];
    },
  },

  {
    id: 'getaway',
    kind: 'getaway',
    title: '通緝逃脫',
    description: '從 2 星通緝下脫身，90 秒內甩掉警方。',
    icon: '🚨',
    color: '#f87171',
    baseReward: 400,
    timeLimit: 90,
    cooldown: 45,
    requiredVehicle: null,
    markerAt: w => {
      // A parking lot far from the civic centre, so the chase has room.
      let best: Point | null = null;
      let bestD = -1;
      for (const block of w.parkingBlocks) {
        const d = Math.hypot(block.center.x - w.townHallPos.x, block.center.y - w.townHallPos.y);
        if (d > bestD) { bestD = d; best = block.center; }
      }
      return nearestRoadTile(w, best ?? w.townHallPos);
    },
    build: () => [
      obj({ text: '甩掉所有警察', kind: 'loseWanted', x: 0, y: 0, radius: 0 }),
    ],
  },

  {
    id: 'sightseeing',
    kind: 'sightseeing',
    title: '城市導覽',
    description: `探索 ${LANDMARKS.length} 個地標與分區，每發現一個都有獎金。`,
    icon: '🗺️',
    color: '#a78bfa',
    baseReward: SIGHTSEEING_PER_LANDMARK,
    timeLimit: null,
    cooldown: 0,
    requiredVehicle: null,
    passive: true,
    markerAt: () => null,
    build: () => [],
  },
];

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS.find(m => m.id === id);
}

/** Estimated seconds to drive a route, used to set the courier time limit. */
export function estimateDriveTime(points: Point[], start: Point): number {
  let total = 0;
  let from = start;
  for (const p of points) {
    total += dist(from, p);
    from = p;
  }
  // ~90 px/s average with traffic, plus slack and a fixed grace period.
  return (total / 90) * 1.4 + 20;
}

/** True when the point is not inside solid geometry. */
export function isPlaceable(world: WorldData, p: Point): boolean {
  const t = getTileAt(world.grid, p.x, p.y);
  if (!t) return false;
  return t.type !== TileType.BUILDING
    && t.type !== TileType.HELIPAD
    && t.type !== TileType.TOWN_HALL;
}
