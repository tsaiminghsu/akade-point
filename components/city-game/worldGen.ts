import {
  GRID_SIZE,
  TILE_SIZE,
  WORLD_SIZE,
  WORLD_CENTER_TILE,
  CHUNKS_PER_SIDE,
  chunkKey,
  chunkOfTile,
  Tile,
  TileType,
  BuildingType,
  Point,
  WorldData,
  ParkingBlock,
} from './types';
import { buildChunkIndex } from './chunks';
import { DRONE_PAD, inArenaTile } from './droneArena';

// Seeded pseudo-random number generator (mulberry32)
export function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export const SHOP_NAMES = [
  '7-ELEVEN', '全家便利', '萊爾富', 'OK超商',
  '麥當勞', '肯德基', '摩斯漢堡', '星巴克',
  '全聯超市', '頂好超市', '大潤發',
  '藥妝城', '康是美', '屈臣氏',
  'Pizza Hut', '達美樂', '必勝客',
  '誠品書店', '燦坤3C', '大同電器',
  '金鑛咖啡', '路易莎', '早午餐',
  '加油站', '停車場', '修車廠',
];

const ZONE_NAMES: Record<string, string> = {
  commercial: '商業區',
  residential: '住宅區',
  office: '辦公區',
  park: '公園區',
  industrial: '工業區',
};

// Road interval: major road every 8 tiles
export const BLOCK_INTERVAL = 8;


function isRoadTile(gx: number, gy: number): boolean {
  return gx % BLOCK_INTERVAL === 0 || gy % BLOCK_INTERVAL === 0;
}

function isSidewalkTile(gx: number, gy: number): boolean {
  const ox = gx % BLOCK_INTERVAL;
  const oy = gy % BLOCK_INTERVAL;
  return (ox === 1 || ox === BLOCK_INTERVAL - 1 || oy === 1 || oy === BLOCK_INTERVAL - 1);
}

function getBlockId(gx: number, gy: number): number {
  return Math.floor(gx / BLOCK_INTERVAL) * 1000 + Math.floor(gy / BLOCK_INTERVAL);
}

/**
 * Every block draws from its own PRNG stream, so a block's layout is a pure
 * function of (seed, bx, by). Changing GRID_SIZE or the generation order of
 * other blocks never reshuffles it, and a district can be regenerated on its
 * own for debugging.
 */
function blockSeed(seed: number, bx: number, by: number): number {
  return (Math.imul(seed, 0x9e3779b1) ^ Math.imul(bx + 1, 73856093) ^ Math.imul(by + 1, 19349663)) >>> 0;
}

export function generateWorld(seed = 42): WorldData {
  const grid: Tile[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ type: TileType.EMPTY }))
  );

  const blockRngs = new Map<number, () => number>();
  const rngFor = (bx: number, by: number): (() => number) => {
    const id = bx * 1000 + by;
    let r = blockRngs.get(id);
    if (!r) {
      r = makePRNG(blockSeed(seed, bx, by));
      blockRngs.set(id, r);
    }
    return r;
  };
  const rngForTile = (gx: number, gy: number) =>
    rngFor(Math.floor(gx / BLOCK_INTERVAL), Math.floor(gy / BLOCK_INTERVAL));

  // Track collections
  const helipads: Point[] = [];
  const shopPositions: Point[] = [];
  const roadTiles: Point[] = [];
  const spawnPoints: Point[] = [];
  const sidewalkTiles: Point[] = [];
  // PARKING tiles accumulated per block id, converted to ParkingBlock[] at the end.
  const parkingTilesByBlock = new Map<number, Point[]>();

  // Block type assignments (keyed by blockId)
  const blockTypes = new Map<number, string>();
  const blocksPerSide = Math.floor(GRID_SIZE / BLOCK_INTERVAL);
  for (let bx = 0; bx <= blocksPerSide; bx++) {
    for (let by = 0; by <= blocksPerSide; by++) {
      const id = bx * 1000 + by;
      const r = rngFor(bx, by)();
      if (r < 0.4) blockTypes.set(id, 'commercial');
      else if (r < 0.75) blockTypes.set(id, 'residential');
      else if (r < 0.85) blockTypes.set(id, 'park');
      else blockTypes.set(id, 'parking');
    }
  }

  // Helipad block: two blocks east of the town hall
  const heliBx = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2) + 2;
  const heliBy = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2);
  blockTypes.set(heliBx * 1000 + heliBy, 'commercial');

  // Small parks immediately surrounding the town hall (dist-1 blocks only)
  // Dist-2+ blocks keep their natural commercial/residential character (buildings)
  const thBx = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2);
  const thBy = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2);
  const civicParks: [number, number][] = [
    [thBx - 1, thBy - 1], // NW of plaza  (dist 1)
    [thBx - 1, thBy],     // W  of building (dist 1)
    [thBx + 1, thBy - 1], // NE of plaza  (dist 1)
    [thBx + 1, thBy],     // E  of building (dist 1)
    [thBx,     thBy + 1], // S  of building (dist 1)
  ];
  for (const [bx, by] of civicParks) {
    if (bx >= 0 && by >= 0) blockTypes.set(bx * 1000 + by, 'park');
  }

  // Shop assignment: ~35% of commercial blocks carry shops
  const shopBlocks = new Set<number>();
  blockTypes.forEach((type, id) => {
    if (type !== 'commercial') return;
    const bx = Math.floor(id / 1000);
    const by = id % 1000;
    if (rngFor(bx, by)() < 0.35) shopBlocks.add(id);
  });

  // Sub-building tracking: which tiles in a block have been used for large buildings
  const largeBuildings = new Set<string>();

  // Generate per-tile
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      // The drone arena swallows its blocks whole, interior roads included.
      // Bailing out here rather than filtering later is what keeps roadTiles,
      // spawnPoints, sidewalkTiles and shopPositions free of stale points
      // aimed into the field — missions draw their objectives from those.
      if (inArenaTile(gx, gy)) {
        grid[gy][gx] = { type: TileType.DRONE_FIELD };
        continue;
      }

      const onRoadX = gx % BLOCK_INTERVAL === 0;
      const onRoadY = gy % BLOCK_INTERVAL === 0;

      if (onRoadX && onRoadY) {
        grid[gy][gx] = { type: TileType.INTERSECTION };
        roadTiles.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
      } else if (onRoadX) {
        grid[gy][gx] = { type: TileType.ROAD_V };
        roadTiles.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
        // spawn points on roads
        if (gy % (BLOCK_INTERVAL * 2) === 3) {
          spawnPoints.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
        }
      } else if (onRoadY) {
        grid[gy][gx] = { type: TileType.ROAD_H };
        roadTiles.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
        if (gx % (BLOCK_INTERVAL * 2) === 3) {
          spawnPoints.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
        }
      } else {
        // Interior block tile
        const sidewalk = isSidewalkTile(gx, gy);
        if (sidewalk) {
          grid[gy][gx] = { type: TileType.SIDEWALK };
          sidewalkTiles.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
          continue;
        }

        const blockId = getBlockId(gx, gy);
        const blockType = blockTypes.get(blockId) ?? 'residential';
        const rand = rngForTile(gx, gy);

        if (blockType === 'park') {
          grid[gy][gx] = { type: TileType.PARK };
        } else if (blockType === 'parking') {
          grid[gy][gx] = { type: TileType.PARKING, blockId };
          const list = parkingTilesByBlock.get(blockId);
          const pt = { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
          if (list) list.push(pt); else parkingTilesByBlock.set(blockId, [pt]);
        } else if (blockType === 'residential') {
          // Residential: small houses 1-3 floors, random spacing
          const internalX = gx % BLOCK_INTERVAL;
          const internalY = gy % BLOCK_INTERVAL;
          // Place houses on every other 2x2 grid within block
          if (internalX % 2 === 0 && internalY % 2 === 0) {
            const floors = Math.max(1, Math.round(rand() * 3));
            grid[gy][gx] = {
              type: TileType.BUILDING,
              floors,
              buildingType: BuildingType.HOUSE,
              colorSeed: Math.floor(rand() * 1000),
              blockId,
            };
          } else {
            grid[gy][gx] = { type: TileType.SIDEWALK };
            sidewalkTiles.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
          }
        } else {
          // Commercial / office
          const tileKey = `${gx},${gy}`;
          if (largeBuildings.has(tileKey)) continue;

          // Decide building size (1x1 to 2x2)
          const bigBuilding = rand() < 0.3 && gx + 1 < GRID_SIZE && gy + 1 < GRID_SIZE;
          const floors = bigBuilding
            ? Math.max(5, Math.round(rand() * 20))
            : Math.max(2, Math.round(rand() * 10));

          const isShop = shopBlocks.has(blockId) && rand() < 0.4;
          const shopName = isShop ? SHOP_NAMES[Math.floor(rand() * SHOP_NAMES.length)] : undefined;

          grid[gy][gx] = {
            type: TileType.BUILDING,
            floors,
            buildingType: isShop ? BuildingType.SHOP : BuildingType.COMMERCIAL,
            shopName,
            colorSeed: Math.floor(rand() * 1000),
            blockId,
          };

          if (isShop) shopPositions.push({ x: gx * TILE_SIZE, y: gy * TILE_SIZE });

          if (bigBuilding) {
            // Mark adjacent tiles as part of this building
            for (let dy = 0; dy <= 1; dy++) {
              for (let dx = 0; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = gx + dx;
                const ny = gy + dy;
                if (nx < GRID_SIZE && ny < GRID_SIZE && !isRoadTile(nx, ny)) {
                  largeBuildings.add(`${nx},${ny}`);
                  grid[ny][nx] = {
                    type: TileType.BUILDING,
                    floors,
                    buildingType: isShop ? BuildingType.SHOP : BuildingType.COMMERCIAL,
                    colorSeed: grid[gy][gx].colorSeed,
                    blockId,
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  // Place helipad on a tall building near center
  const hpGx = heliBx * BLOCK_INTERVAL + 4;
  const hpGy = heliBy * BLOCK_INTERVAL + 4;
  if (hpGx < GRID_SIZE && hpGy < GRID_SIZE) {
    grid[hpGy][hpGx] = {
      type: TileType.HELIPAD,
      floors: 15,
      buildingType: BuildingType.OFFICE,
      colorSeed: 500,
      isHelipad: true,
      blockId: 0,
    };
    helipads.push({ x: hpGx * TILE_SIZE + TILE_SIZE / 2, y: hpGy * TILE_SIZE + TILE_SIZE / 2 });
  }

  // ─── Town Hall: two-block civic campus at world centre ────────────────────
  // Layout relative to the centre tile C = WORLD_CENTER_TILE:
  //   Building block  (south): tx=C+1..C+7, ty=C+2..C+6  → TOWN_HALL (solid)
  //   Lobby entrance           tx=C+3..C+5, ty=C+2..C+4  → TOWN_HALL_INTERIOR (walkable)
  //   Plaza / forecourt:       tx=C+2..C+6, ty=C-6..C-2  → TOWN_HALL_PLAZA (walkable)
  //   Road at ty=C is preserved as ROAD_H — vehicles and players cross in front of building.
  const thCenterGx = WORLD_CENTER_TILE;
  const thCenterGy = WORLD_CENTER_TILE;

  // 1. Building body
  for (let dy = 2; dy <= 6; dy++) {
    for (let dx = 1; dx <= 7; dx++) {
      const tx = thCenterGx + dx;
      const ty = thCenterGy + dy;
      if (tx >= GRID_SIZE || ty >= GRID_SIZE) continue;
      const t = grid[ty][tx];
      if (t.type === TileType.ROAD_V || t.type === TileType.ROAD_H || t.type === TileType.INTERSECTION) continue;
      grid[ty][tx] = {
        type: TileType.TOWN_HALL,
        floors: 8,
        buildingType: BuildingType.OFFICE,
        colorSeed: 999,
        blockId: 9999,
      };
    }
  }

  // 2. Lobby entrance: walkable interior tiles
  for (let dy = 2; dy <= 4; dy++) {
    for (let dx = 3; dx <= 5; dx++) {
      const tx = thCenterGx + dx;
      const ty = thCenterGy + dy;
      if (tx >= GRID_SIZE || ty >= GRID_SIZE) continue;
      grid[ty][tx] = {
        type: TileType.TOWN_HALL_INTERIOR,
        floors: 8,
        buildingType: BuildingType.OFFICE,
        colorSeed: 999,
        blockId: 9999,
      };
    }
  }

  // 3. Plaza forecourt: inner tiles of north block
  for (let dy = -6; dy <= -2; dy++) {
    for (let dx = 2; dx <= 6; dx++) {
      const tx = thCenterGx + dx;
      const ty = thCenterGy + dy;
      if (tx >= GRID_SIZE || ty < 0) continue;
      const t = grid[ty][tx];
      if (t.type === TileType.ROAD_V || t.type === TileType.ROAD_H || t.type === TileType.INTERSECTION) continue;
      grid[ty][tx] = { type: TileType.TOWN_HALL_PLAZA, blockId: 9999 };
    }
  }

  const townHallPos: Point = {
    x: (thCenterGx + 4) * TILE_SIZE + TILE_SIZE / 2,
    y: (thCenterGy + 4) * TILE_SIZE + TILE_SIZE / 2,
  };

  // Busted respawn: townHallPos itself is a solid TOWN_HALL tile, so use the
  // walkable lobby (TOWN_HALL_INTERIOR spans tx C+3..C+5, ty C+2..C+4).
  const respawnPos: Point = gridToWorld(thCenterGx + 4, thCenterGy + 3);

  const parkingBlocks: ParkingBlock[] = [];
  parkingTilesByBlock.forEach((tiles, id) => {
    if (tiles.length === 0) return;
    let sx = 0;
    let sy = 0;
    for (const t of tiles) { sx += t.x; sy += t.y; }
    parkingBlocks.push({ id, center: { x: sx / tiles.length, y: sy / tiles.length }, tiles });
  });

  // Chunk index and road buckets, baked after the town hall overwrites so the
  // baked geometry matches the final grid.
  const chunks = buildChunkIndex(grid);
  const roadTilesByChunk: Point[][] = Array.from({ length: CHUNKS_PER_SIDE * CHUNKS_PER_SIDE }, () => []);
  for (const t of roadTiles) {
    const { cx, cy } = chunkOfTile(Math.floor(t.x / TILE_SIZE), Math.floor(t.y / TILE_SIZE));
    roadTilesByChunk[chunkKey(cx, cy)].push(t);
  }

  const dronePad: Point = { x: DRONE_PAD.x, y: DRONE_PAD.y };

  return {
    grid, helipads, shopPositions, roadTiles, spawnPoints, townHallPos,
    dronePad,
    sidewalkTiles, parkingBlocks, respawnPos,
    chunks, roadTilesByChunk,
  };
}

export function getZoneName(grid: Tile[][], wx: number, wy: number): string {
  const gx = Math.floor(wx / TILE_SIZE);
  const gy = Math.floor(wy / TILE_SIZE);
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return '城市外';
  const tile = grid[gy]?.[gx];
  if (!tile) return '未知區域';
  if (tile.type === TileType.TOWN_HALL || tile.type === TileType.TOWN_HALL_INTERIOR) return '城鎮中心辦事處';
  if (tile.type === TileType.TOWN_HALL_PLAZA) return '市政廣場';
  if (tile.type === TileType.HELIPAD) return '直升機停機坪';
  if (tile.type === TileType.PARK) return '公園區';
  if (tile.type === TileType.ROAD_H || tile.type === TileType.ROAD_V || tile.type === TileType.INTERSECTION) return '道路';
  if (tile.buildingType === BuildingType.SHOP) return '商業區';
  if (tile.buildingType === BuildingType.HOUSE) return '住宅區';
  if (tile.buildingType === BuildingType.COMMERCIAL) return '商業區';
  if (tile.buildingType === BuildingType.OFFICE) return '辦公區';
  return '城市區';
}

export function getTileAt(grid: Tile[][], wx: number, wy: number): Tile | null {
  const gx = Math.floor(wx / TILE_SIZE);
  const gy = Math.floor(wy / TILE_SIZE);
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return null;
  return grid[gy]?.[gx] ?? null;
}

export function isWalkable(grid: Tile[][], wx: number, wy: number): boolean {
  const tile = getTileAt(grid, wx, wy);
  if (!tile) return false;
  // TOWN_HALL_PLAZA and TOWN_HALL_INTERIOR are walkable; TOWN_HALL is solid
  return tile.type !== TileType.BUILDING
    && tile.type !== TileType.HELIPAD
    && tile.type !== TileType.TOWN_HALL;
}

export function isDrivable(grid: Tile[][], wx: number, wy: number): boolean {
  const tile = getTileAt(grid, wx, wy);
  if (!tile) return false;
  return (
    tile.type === TileType.ROAD_H ||
    tile.type === TileType.ROAD_V ||
    tile.type === TileType.INTERSECTION ||
    tile.type === TileType.PARKING
  );
}

/** Nearest drivable tile centre to a point, searched in expanding rings (≤ 4 tiles). */
export function nearestRoadTile(world: WorldData, p: Point): Point {
  const gx = Math.floor(p.x / TILE_SIZE);
  const gy = Math.floor(p.y / TILE_SIZE);
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        const wx = nx * TILE_SIZE + TILE_SIZE / 2;
        const wy = ny * TILE_SIZE + TILE_SIZE / 2;
        if (isDrivable(world.grid, wx, wy)) return { x: wx, y: wy };
      }
    }
  }
  return { x: p.x, y: p.y };
}

/** Altitude units per floor: FLOOR_HEIGHT_3D (1.4) / (TILE_3D / TILE_SIZE) (0.1). */
export const ALT_PER_FLOOR = 14;
/** Extra clearance above a roof before it stops being solid. */
export const ALT_ROOF_BUFFER = 5;

/**
 * Altitude-aware solidity. Out of bounds is solid. A building stops being
 * solid once you are above its roof plus a small buffer.
 */
export function isSolidAtAltitude(grid: Tile[][], wx: number, wy: number, altitude: number): boolean {
  const gx = Math.floor(wx / TILE_SIZE);
  const gy = Math.floor(wy / TILE_SIZE);
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return true;
  const tile = grid[gy]?.[gx];
  if (!tile) return false;
  if (tile.type === TileType.BUILDING) {
    return altitude < (tile.floors ?? 1) * ALT_PER_FLOOR + ALT_ROOF_BUFFER;
  }
  if (tile.type === TileType.HELIPAD) {
    return altitude < (tile.floors ?? 15) * ALT_PER_FLOOR + ALT_ROOF_BUFFER;
  }
  if (tile.type === TileType.TOWN_HALL) {
    return altitude < (tile.floors ?? 8) * ALT_PER_FLOOR + ALT_ROOF_BUFFER;
  }
  return false;
}

// ── BFS pathfinding on road tiles ────────────────────────────────────────────
// Module-level typed arrays sized to the grid and reused across calls, with a
// generation stamp instead of clearing: a 160x160 grid is 25 600 tiles and a
// fresh Set/Map per search would churn the GC every time an NPC re-routes.
const BFS_N = GRID_SIZE * GRID_SIZE;
const bfsStamp = new Int32Array(BFS_N);
const bfsParent = new Int32Array(BFS_N);
const bfsQueue = new Int32Array(BFS_N);
let bfsGeneration = 0;

function isPassable(t: Tile): boolean {
  return t.type === TileType.ROAD_H
    || t.type === TileType.ROAD_V
    || t.type === TileType.INTERSECTION
    || t.type === TileType.SIDEWALK
    || t.type === TileType.PARKING;
}

/**
 * Shortest road path between two world points, as tile centres (excluding the
 * start tile). Returns `[]` when start and end share a tile, and the raw
 * destination point when unreachable (a straight-line fallback).
 */
export function findRoadPath(
  grid: Tile[][],
  startWx: number,
  startWy: number,
  endWx: number,
  endWy: number
): Point[] {
  const sx = Math.floor(startWx / TILE_SIZE);
  const sy = Math.floor(startWy / TILE_SIZE);
  const ex = Math.floor(endWx / TILE_SIZE);
  const ey = Math.floor(endWy / TILE_SIZE);

  if (sx < 0 || sx >= GRID_SIZE || sy < 0 || sy >= GRID_SIZE) return [{ x: endWx, y: endWy }];
  if (ex < 0 || ex >= GRID_SIZE || ey < 0 || ey >= GRID_SIZE) return [{ x: endWx, y: endWy }];

  const gen = ++bfsGeneration;
  const startKey = sy * GRID_SIZE + sx;
  const endKey = ey * GRID_SIZE + ex;

  bfsStamp[startKey] = gen;
  bfsParent[startKey] = -1;
  bfsQueue[0] = startKey;
  let head = 0;
  let tail = 1;
  let found = startKey === endKey;

  while (!found && head < tail) {
    const cur = bfsQueue[head++];
    const cx = cur % GRID_SIZE;
    const cy = (cur - cx) / GRID_SIZE;

    // 4-neighbourhood, unrolled so no per-step allocation happens.
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? cx + 1 : d === 1 ? cx - 1 : cx;
      const ny = d === 2 ? cy + 1 : d === 3 ? cy - 1 : cy;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      const nk = ny * GRID_SIZE + nx;
      if (bfsStamp[nk] === gen) continue;
      if (nk !== endKey && !isPassable(grid[ny][nx])) continue;
      bfsStamp[nk] = gen;
      bfsParent[nk] = cur;
      bfsQueue[tail++] = nk;
      if (nk === endKey) { found = true; break; }
    }
  }

  if (!found) {
    // Fallback: direct line waypoints
    return [{ x: endWx, y: endWy }];
  }

  // Reconstruct path (push then reverse: unshift would be O(n^2)).
  const path: Point[] = [];
  let k = endKey;
  while (k !== startKey && k >= 0) {
    const gx = k % GRID_SIZE;
    const gy = (k - gx) / GRID_SIZE;
    path.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
    k = bfsParent[k];
  }
  path.reverse();
  return path;
}

export function worldToGrid(wx: number, wy: number): Point {
  return { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wy / TILE_SIZE) };
}

export function gridToWorld(gx: number, gy: number): Point {
  return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
}

export { ZONE_NAMES, WORLD_SIZE };
