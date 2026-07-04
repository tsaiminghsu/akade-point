import {
  GRID_SIZE,
  TILE_SIZE,
  WORLD_SIZE,
  Tile,
  TileType,
  BuildingType,
  Point,
  WorldData,
} from './types';

// Seeded pseudo-random number generator (mulberry32)
function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOP_NAMES = [
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
const BLOCK_INTERVAL = 8;


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

export function generateWorld(seed = 42): WorldData {
  const rand = makePRNG(seed);
  const grid: Tile[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ type: TileType.EMPTY }))
  );

  // Track collections
  const helipads: Point[] = [];
  const shopPositions: Point[] = [];
  const roadTiles: Point[] = [];
  const spawnPoints: Point[] = [];

  // Block type assignments (keyed by blockId)
  const blockTypes = new Map<number, string>();
  for (let bx = 0; bx <= Math.floor(GRID_SIZE / BLOCK_INTERVAL); bx++) {
    for (let by = 0; by <= Math.floor(GRID_SIZE / BLOCK_INTERVAL); by++) {
      const id = bx * 1000 + by;
      const r = rand();
      if (r < 0.4) blockTypes.set(id, 'commercial');
      else if (r < 0.75) blockTypes.set(id, 'residential');
      else if (r < 0.85) blockTypes.set(id, 'park');
      else blockTypes.set(id, 'parking');
    }
  }

  // Helipad block (fixed position near center-right)
  const heliBx = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2) + 2;
  const heliBy = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2);
  blockTypes.set(heliBx * 1000 + heliBy, 'commercial');

  // Small parks immediately surrounding the town hall (dist-1 blocks only)
  // Dist-2+ blocks keep their natural commercial/residential character (buildings)
  const thBx = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2); // 5
  const thBy = Math.floor(GRID_SIZE / BLOCK_INTERVAL / 2); // 5
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

  // Shop assignment tracker (one shop per block face on road)
  const shopBlocks = new Set<number>();
  // Assign ~30% of commercial blocks to have shops
  blockTypes.forEach((type, id) => {
    if (type === 'commercial' && rand() < 0.35) shopBlocks.add(id);
  });

  // Sub-building tracking: which tiles in a block have been used for large buildings
  const largeBuildings = new Set<string>();

  // Generate per-tile
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
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
          continue;
        }

        const blockId = getBlockId(gx, gy);
        const blockType = blockTypes.get(blockId) ?? 'residential';

        if (blockType === 'park') {
          grid[gy][gx] = { type: TileType.PARK };
        } else if (blockType === 'parking') {
          grid[gy][gx] = { type: TileType.PARKING };
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
  // Layout (tile coords, thCenter = 40,40):
  //   Building block  (south): tx=41-47, ty=42-46  → TOWN_HALL (solid)
  //   Lobby entrance           tx=43-45, ty=42-44  → TOWN_HALL_INTERIOR (walkable)
  //   Plaza / forecourt:       tx=42-46, ty=34-38  → TOWN_HALL_PLAZA (walkable)
  //   Road at ty=40 is preserved as ROAD_H — vehicles and players cross in front of building.
  const thCenterGx = Math.floor(GRID_SIZE / 2); // 40
  const thCenterGy = Math.floor(GRID_SIZE / 2); // 40

  // 1. Building body: full tile range of south block (ty=42-46, tx=41-47)
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

  // 2. Lobby entrance: walkable interior tiles (ty=42-44, tx=43-45)
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

  // 3. Plaza forecourt: inner tiles of north block (ty=34-38, tx=42-46)
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
    x: (thCenterGx + 4) * TILE_SIZE + TILE_SIZE / 2, // tile 44 → 1780
    y: (thCenterGy + 4) * TILE_SIZE + TILE_SIZE / 2, // tile 44 → 1780
  };

  return { grid, helipads, shopPositions, roadTiles, spawnPoints, townHallPos };
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

// BFS pathfinding on road tiles
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

  const key = (x: number, y: number) => x * 1000 + y;
  const visited = new Set<number>();
  const parent = new Map<number, { px: number; py: number }>();
  const queue: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
  visited.add(key(sx, sy));

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === ex && cur.y === ey) { found = true; break; }

    for (const { dx, dy } of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      if (visited.has(key(nx, ny))) continue;
      const tile = grid[ny][nx];
      const isDest = (nx === ex && ny === ey);
      if (
        !isDest &&
        tile.type !== TileType.ROAD_H &&
        tile.type !== TileType.ROAD_V &&
        tile.type !== TileType.INTERSECTION &&
        tile.type !== TileType.SIDEWALK &&
        tile.type !== TileType.PARKING
      ) continue;
      visited.add(key(nx, ny));
      parent.set(key(nx, ny), { px: cur.x, py: cur.y });
      queue.push({ x: nx, y: ny });
    }
  }

  if (!found) {
    // Fallback: direct line waypoints
    return [{ x: endWx, y: endWy }];
  }

  // Reconstruct path
  const path: Point[] = [];
  let cx = ex;
  let cy = ey;
  while (cx !== sx || cy !== sy) {
    path.unshift({ x: cx * TILE_SIZE + TILE_SIZE / 2, y: cy * TILE_SIZE + TILE_SIZE / 2 });
    const p = parent.get(key(cx, cy));
    if (!p) break;
    cx = p.px;
    cy = p.py;
  }
  return path;
}

export function worldToGrid(wx: number, wy: number): Point {
  return { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wy / TILE_SIZE) };
}

export function gridToWorld(gx: number, gy: number): Point {
  return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
}

export { ZONE_NAMES, WORLD_SIZE };
