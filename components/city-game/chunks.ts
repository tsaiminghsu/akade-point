import {
  GRID_SIZE,
  TILE_SIZE,
  TILE_3D,
  FLOOR_HEIGHT_3D,
  WORLD_3D_HALF,
  CHUNK_TILES,
  CHUNKS_PER_SIDE,
  CHUNK_3D,
  CHUNK_PX,
  chunkKey,
  Tile,
  TileType,
  BuildingType,
  Point,
  WorldData,
  ChunkIndex,
  ChunkLayerName,
  InstanceLayer,
} from './types';

/**
 * Chunk index: everything the renderer needs to stream the static city
 * (buildings, roofs, house details, trees, street lamps) is baked here once
 * per world, as raw Float32Array matrices and colours. No three.js import, so
 * it runs in node for tests and never allocates on the frame path.
 *
 * Layout rules (footprints, heights, colours, thinning, lamp stride) are the
 * same ones the old whole-map InstancedMeshes used, moved here verbatim so
 * the city looks identical after the switch to streaming.
 */

export const LAYER_NAMES: readonly ChunkLayerName[] = [
  'sky', 'off', 'com', 'hou',
  'roofBase', 'roofPeak',
  'houseWin', 'houseDoor',
  'treeTrunk', 'treeLeaf',
  'lampPole', 'lampHead',
];

/** Street lamps sit on every 4th sidewalk / intersection tile in both axes. */
export const LAMP_STRIDE = 4;

// ── Colour rules (RGB 0-1) ──────────────────────────────────────────────────

export function facadeTint(floors: number, seed: number, btype?: BuildingType): [number, number, number] {
  if (btype === BuildingType.HOUSE) {
    const v: [number, number, number][] = [
      [1.00, 0.88, 0.72], // warm tan brick
      [0.95, 0.72, 0.62], // red-brown brick
      [0.88, 0.88, 0.85], // light stone
      [1.00, 0.96, 0.80], // cream sandstone
    ];
    return v[seed % 4];
  }
  if (floors >= 15) {
    const t = (seed % 8) / 8;
    return [0.80 + t * 0.12, 0.90 + t * 0.06, 1.00];
  }
  if (floors >= 8) {
    const t = (seed % 6) / 6;
    return [0.82 + t * 0.10, 0.88 + t * 0.08, 0.96 + t * 0.04];
  }
  const t = (seed % 5) / 5;
  return [0.88 + t * 0.08, 0.84 + t * 0.10, 0.80 + t * 0.12];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function roofBaseTint(floors: number, seed: number, btype?: BuildingType): [number, number, number] {
  if (btype === BuildingType.HOUSE) return hexToRgb(seed % 2 === 0 ? '#5c2a18' : '#3d2810');
  if (floors >= 15) return hexToRgb('#0a1820');
  if (floors >= 8)  return hexToRgb('#1a2030');
  if (floors >= 4)  return hexToRgb('#2a2830');
  return hexToRgb('#222230');
}

export function roofPeakTint(seed: number): [number, number, number] {
  return hexToRgb(seed % 2 === 0 ? '#3d1a0a' : '#251808');
}

/** Building footprint in 3D units. */
export function buildingFootprint(btype?: BuildingType): number {
  return btype === BuildingType.HOUSE ? TILE_3D * 0.72 : TILE_3D * 0.88;
}

export function buildingCategory(floors: number, btype?: BuildingType): 'sky' | 'off' | 'com' | 'hou' {
  if (btype === BuildingType.HOUSE) return 'hou';
  if (floors >= 15) return 'sky';
  if (floors >= 8) return 'off';
  return 'com';
}

// ── Layer builder ────────────────────────────────────────────────────────────

class LayerBuilder {
  private mats: number[] = [];
  private colors: number[] = [];
  count = 0;

  /** Translation + non-uniform scale, no rotation (column-major). */
  add(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, r = 1, g = 1, b = 1): void {
    this.mats.push(
      sx, 0, 0, 0,
      0, sy, 0, 0,
      0, 0, sz, 0,
      tx, ty, tz, 1,
    );
    this.colors.push(r, g, b);
    this.count++;
  }

  build(): InstanceLayer {
    return {
      count: this.count,
      mats: Float32Array.from(this.mats),
      colors: Float32Array.from(this.colors),
    };
  }
}

function tileCentre3D(gx: number, gy: number): [number, number] {
  return [
    gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF,
    gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF,
  ];
}

function buildChunk(grid: Tile[][], cx: number, cy: number): ChunkIndex {
  const builders = {} as Record<ChunkLayerName, LayerBuilder>;
  for (const name of LAYER_NAMES) builders[name] = new LayerBuilder();

  const lampPositions: number[] = [];
  const roadTiles: Point[] = [];
  const sidewalkTiles: Point[] = [];
  const parkTiles: Point[] = [];
  const parkingBlockIds = new Set<number>();

  const gx0 = cx * CHUNK_TILES;
  const gy0 = cy * CHUNK_TILES;
  const gx1 = Math.min(GRID_SIZE, gx0 + CHUNK_TILES);
  const gy1 = Math.min(GRID_SIZE, gy0 + CHUNK_TILES);

  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const tile = grid[gy][gx];
      const [x3, z3] = tileCentre3D(gx, gy);
      const centre = { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };

      switch (tile.type) {
        case TileType.ROAD_H:
        case TileType.ROAD_V:
        case TileType.INTERSECTION:
          roadTiles.push(centre);
          break;
        case TileType.SIDEWALK:
          sidewalkTiles.push(centre);
          break;
        case TileType.PARK:
          parkTiles.push(centre);
          break;
        case TileType.PARKING:
          if (tile.blockId !== undefined) parkingBlockIds.add(tile.blockId);
          break;
        default:
          break;
      }

      // ── Buildings, roofs, house details ─────────────────────────────
      if (tile.type === TileType.BUILDING || tile.type === TileType.HELIPAD) {
        const floors = tile.floors ?? 1;
        const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
        const seed = tile.colorSeed ?? 0;
        const fp = buildingFootprint(tile.buildingType);
        const cat = buildingCategory(floors, tile.buildingType);

        const [r, g, b] = facadeTint(floors, seed, tile.buildingType);
        builders[cat].add(x3, h / 2, z3, fp, h, fp, r, g, b);

        const [rr, rg, rb] = roofBaseTint(floors, seed, tile.buildingType);
        builders.roofBase.add(x3, h + 0.25, z3, fp * 1.08, 0.5, fp * 1.08, rr, rg, rb);

        if (tile.buildingType === BuildingType.HOUSE) {
          const [pr, pg, pb] = roofPeakTint(seed);
          builders.roofPeak.add(x3, h + 0.75, z3, fp * 0.62, 0.5, fp * 0.62, pr, pg, pb);

          if (tile.type === TileType.BUILDING && floors === 1) {
            const faceZ = z3 + fp / 2 + 0.015; // south face
            for (const xOff of [-fp * 0.25, fp * 0.25]) {
              builders.houseWin.add(x3 + xOff, h * 0.62, faceZ, 0.5, 0.5, 0.01);
            }
            builders.houseDoor.add(x3, h * 0.35, faceZ, 0.42, 0.70, 0.01);
          }
        }
      }

      // ── Trees on park tiles (thinned to one in three) ────────────────
      if (tile.type === TileType.PARK && (gx + gy * 3) % 3 === 0) {
        const seed = tile.colorSeed ?? (gx * 7 + gy * 13);
        const off = (seed % 5) * 0.3 - 0.6;
        const tx = x3 + off;
        const tz = z3 + off;
        const tH = 1.2 + (seed % 5) * 0.3;
        const lH = 1.5 + (seed % 4) * 0.4;
        const lR = 0.9 + (seed % 3) * 0.3;
        builders.treeTrunk.add(tx, tH / 2, tz, 0.18, tH, 0.18);
        builders.treeLeaf.add(tx, tH + lH / 2, tz, lR * 2, lH, lR * 2);
      }

      // ── Street lamps ─────────────────────────────────────────────────
      if (
        gx % LAMP_STRIDE === 0 && gy % LAMP_STRIDE === 0 &&
        (tile.type === TileType.SIDEWALK || tile.type === TileType.INTERSECTION)
      ) {
        builders.lampPole.add(x3, 1.75, z3, 0.12, 3.5, 0.12);
        builders.lampHead.add(x3, 3.65, z3, 0.55, 0.28, 0.55);
        lampPositions.push(x3, z3);
      }
    }
  }

  const layers = {} as Record<ChunkLayerName, InstanceLayer>;
  for (const name of LAYER_NAMES) layers[name] = builders[name].build();

  return {
    cx, cy, key: chunkKey(cx, cy),
    minX3: gx0 * TILE_3D - WORLD_3D_HALF,
    maxX3: gx1 * TILE_3D - WORLD_3D_HALF,
    minZ3: gy0 * TILE_3D - WORLD_3D_HALF,
    maxZ3: gy1 * TILE_3D - WORLD_3D_HALF,
    minPx: gx0 * TILE_SIZE,
    maxPx: gx1 * TILE_SIZE,
    minPy: gy0 * TILE_SIZE,
    maxPy: gy1 * TILE_SIZE,
    layers,
    lampPositions: Float32Array.from(lampPositions),
    roadTiles,
    sidewalkTiles,
    parkTiles,
    parkingBlockIds: [...parkingBlockIds],
  };
}

/** Bake every chunk. Called once from `generateWorld`. */
export function buildChunkIndex(grid: Tile[][]): ChunkIndex[] {
  const out: ChunkIndex[] = [];
  for (let cy = 0; cy < CHUNKS_PER_SIDE; cy++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      out.push(buildChunk(grid, cx, cy));
    }
  }
  return out;
}

// ── Distance helpers ─────────────────────────────────────────────────────────

/** Squared distance from a 3D x/z point to a chunk's AABB (0 when inside). */
export function chunkDistSq3D(c: ChunkIndex, x3: number, z3: number): number {
  const dx = x3 < c.minX3 ? c.minX3 - x3 : x3 > c.maxX3 ? x3 - c.maxX3 : 0;
  const dz = z3 < c.minZ3 ? c.minZ3 - z3 : z3 > c.maxZ3 ? z3 - c.maxZ3 : 0;
  return dx * dx + dz * dz;
}

/** Squared distance from a world-px point to a chunk's px bounds. */
export function chunkDistSqPx(c: ChunkIndex, px: number, py: number): number {
  const dx = px < c.minPx ? c.minPx - px : px > c.maxPx ? px - c.maxPx : 0;
  const dy = py < c.minPy ? c.minPy - py : py > c.maxPy ? py - c.maxPy : 0;
  return dx * dx + dy * dy;
}

/**
 * Worst-case instance count of one layer inside a streaming window of
 * `radius3D` (plus one chunk of hysteresis margin), probed from every chunk
 * centre and corner. Replaces hand-tuned MAX_* caps: buffers are sized to
 * what can actually be visible, never to the whole map.
 */
export function capacityFor(chunks: ChunkIndex[], layer: ChunkLayerName, radius3D: number): number {
  const r = radius3D + CHUNK_3D;
  const r2 = r * r;
  let best = 0;
  const probes: [number, number][] = [];
  for (const c of chunks) {
    probes.push(
      [(c.minX3 + c.maxX3) / 2, (c.minZ3 + c.maxZ3) / 2],
      [c.minX3, c.minZ3], [c.maxX3, c.minZ3], [c.minX3, c.maxZ3], [c.maxX3, c.maxZ3],
    );
  }
  for (const [x, z] of probes) {
    let sum = 0;
    for (const c of chunks) {
      if (chunkDistSq3D(c, x, z) <= r2) sum += c.layers[layer].count;
    }
    if (sum > best) best = sum;
  }
  return Math.max(1, best);
}

// ── Spatial road queries ─────────────────────────────────────────────────────

export interface RingOpts {
  /** Reject tiles inside the forward cone of this heading (radians). */
  forwardAngle?: number;
  /** Cosine threshold for "in front"; tiles with dot >= this are rejected. */
  forwardDotMax?: number;
  rng?: () => number;
}

/**
 * Random road tile between `minD` and `maxD` px from a point, preferring
 * tiles outside the forward cone. Only chunks that intersect the ring's
 * bounding box are scanned, so the cost is bounded by ~3x3 chunks rather
 * than the whole road network.
 */
export function pickSpawnInRing(
  world: WorldData,
  px: number,
  py: number,
  minD: number,
  maxD: number,
  opts: RingOpts = {},
): Point | undefined {
  const rng = opts.rng ?? Math.random;
  const dotMax = opts.forwardDotMax ?? 0.2;
  const hasCone = opts.forwardAngle !== undefined;
  const fx = hasCone ? Math.sin(opts.forwardAngle!) : 0;
  const fy = hasCone ? -Math.cos(opts.forwardAngle!) : 0;
  const min2 = minD * minD;
  const max2 = maxD * maxD;

  const cx0 = Math.max(0, Math.floor((px - maxD) / CHUNK_PX));
  const cx1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((px + maxD) / CHUNK_PX));
  const cy0 = Math.max(0, Math.floor((py - maxD) / CHUNK_PX));
  const cy1 = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((py + maxD) / CHUNK_PX));

  // Reservoir sample two pools in one pass: cone-filtered and unfiltered.
  let coneN = 0;
  let anyN = 0;
  let conePick: Point | undefined;
  let anyPick: Point | undefined;

  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const tiles = world.roadTilesByChunk[chunkKey(cx, cy)];
      if (!tiles) continue;
      for (const t of tiles) {
        const dx = t.x - px;
        const dy = t.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < min2 || d2 > max2) continue;

        anyN++;
        if (rng() * anyN < 1) anyPick = t;

        if (hasCone && d2 > 0) {
          const d = Math.sqrt(d2);
          if ((dx / d) * fx + (dy / d) * fy >= dotMax) continue;
        }
        coneN++;
        if (rng() * coneN < 1) conePick = t;
      }
    }
  }

  return conePick ?? anyPick;
}

/** A random road tile whose chunk lies entirely farther than `minD` px away. */
export function pickRoadBeyond(
  world: WorldData,
  px: number,
  py: number,
  minD: number,
  rng: () => number = Math.random,
): Point | undefined {
  const min2 = minD * minD;
  let n = 0;
  let pick: ChunkIndex | undefined;
  for (const c of world.chunks) {
    if (c.roadTiles.length === 0) continue;
    if (chunkDistSqPx(c, px, py) <= min2) continue;
    n++;
    if (rng() * n < 1) pick = c;
  }
  if (!pick) {
    const all = world.roadTiles;
    return all[Math.floor(rng() * all.length)];
  }
  return pick.roadTiles[Math.floor(rng() * pick.roadTiles.length)];
}
