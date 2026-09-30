import {
  CHUNK_TILES,
  GRID_SIZE,
  Tile,
  TileType,
  BuildingType,
  WorldData,
} from './types';

/**
 * Ground painting, one tile at a time onto a 2D canvas. Chunk textures are
 * rasterised lazily from this, so the painter must be deterministic in
 * (grid, gx, gy) — never read Math.random here. Surface grain comes from
 * patterns built once from a fixed seed, anchored to the canvas origin; the
 * chunk size is a multiple of the pattern size so they tile across chunks.
 *
 * `px` is the pixel size of one tile in the target canvas and `ox`/`oy` is
 * the canvas-pixel origin of the chunk being painted.
 *
 * Runs on the main thread and inside groundWorker (on an OffscreenCanvas), so
 * nothing here may touch `document` unguarded.
 */

/** A 2D context on either kind of canvas. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas that works on the main thread and in a worker. */
function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

export function tileColor(type: TileType, buildingType?: BuildingType): string {
  switch (type) {
    case TileType.ROAD_H:
    case TileType.ROAD_V:
    case TileType.INTERSECTION: return '#3b3c40';
    case TileType.SIDEWALK: return '#a4a29b';
    case TileType.PARK: return '#3f6a2f';
    case TileType.PARKING: return '#43444a';
    case TileType.BUILDING: return buildingType === BuildingType.HOUSE ? '#4f7036' : '#8c8a84';
    case TileType.HELIPAD: return '#553f00';
    case TileType.DRONE_FIELD: return '#1b3a3f';
    case TileType.MILITARY_BASE: return '#4a4d3c';
    case TileType.MILITARY_WALL:
    case TileType.MILITARY_HANGAR: return '#33362a';
    default: return '#1d1d2d';
  }
}

function isRoad(t: Tile | undefined): boolean {
  return !!t && (t.type === TileType.ROAD_H || t.type === TileType.ROAD_V || t.type === TileType.INTERSECTION);
}

/** A sidewalk tile that touches a road; the rest are front yards. */
export function isStreetSidewalk(grid: Tile[][], gx: number, gy: number): boolean {
  return isRoad(grid[gy]?.[gx - 1]) || isRoad(grid[gy]?.[gx + 1])
    || isRoad(grid[gy - 1]?.[gx]) || isRoad(grid[gy + 1]?.[gx]);
}

// ── Surface patterns ────────────────────────────────────────────────────────

const PATTERN = 64;

function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Surface = 'asphalt' | 'concrete' | 'grass' | 'lawn';

const patternCanvases = new Map<Surface, HTMLCanvasElement | OffscreenCanvas>();

function surfaceCanvas(kind: Surface): HTMLCanvasElement | OffscreenCanvas {
  const cached = patternCanvases.get(kind);
  if (cached) return cached;
  const c = makeCanvas(PATTERN, PATTERN);
  const ctx = c.getContext('2d') as Ctx2D;
  const r = rngFrom(kind.length * 977 + kind.charCodeAt(0));
  const base = { asphalt: '#3b3c40', concrete: '#a4a29b', grass: '#3f6a2f', lawn: '#4f7a36' }[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PATTERN, PATTERN);

  if (kind === 'asphalt') {
    for (let i = 0; i < 700; i++) {
      const v = r() < 0.5 ? 20 : 120;
      ctx.fillStyle = `rgba(${v},${v},${v + 5},${0.15 + r() * 0.25})`;
      ctx.fillRect(Math.floor(r() * PATTERN), Math.floor(r() * PATTERN), 1, 1);
    }
    // Sealed cracks.
    ctx.strokeStyle = 'rgba(15,15,18,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      let x = r() * PATTERN;
      let y = r() * PATTERN;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * 16;
        y += (r() - 0.5) * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'concrete') {
    for (let i = 0; i < 500; i++) {
      const v = r() < 0.5 ? 90 : 200;
      ctx.fillStyle = `rgba(${v},${v},${v - 4},${0.1 + r() * 0.2})`;
      ctx.fillRect(Math.floor(r() * PATTERN), Math.floor(r() * PATTERN), 1, 1);
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(60,55,45,0.10)';
      ctx.beginPath();
      ctx.arc(r() * PATTERN, r() * PATTERN, 2 + r() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const greens = kind === 'lawn'
      ? ['#5a8a3c', '#43702c', '#6b9447', '#3b6628']
      : ['#4d7a38', '#335a25', '#5b8740', '#2c4f20'];
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = greens[Math.floor(r() * greens.length)];
      ctx.globalAlpha = 0.35 + r() * 0.5;
      ctx.fillRect(Math.floor(r() * PATTERN), Math.floor(r() * PATTERN), 1, 1 + Math.floor(r() * 2));
    }
    ctx.globalAlpha = 1;
  }
  patternCanvases.set(kind, c);
  return c;
}

const patternCache = new WeakMap<Ctx2D, Map<Surface, CanvasPattern>>();

function surface(ctx: Ctx2D, kind: Surface): CanvasPattern | string {
  let m = patternCache.get(ctx);
  if (!m) { m = new Map(); patternCache.set(ctx, m); }
  let p = m.get(kind);
  if (!p) {
    const made = ctx.createPattern(surfaceCanvas(kind), 'repeat');
    if (!made) return tileColor(TileType.ROAD_H);
    p = made;
    m.set(kind, p);
  }
  return p;
}

// ── Markings ────────────────────────────────────────────────────────────────

const WHITE_PAINT = 'rgba(235,235,228,0.85)';
const YELLOW_PAINT = 'rgba(232,190,40,0.9)';

/**
 * A straight road tile. `along` is true for ROAD_H (traffic runs along x).
 * Drawn in the tile's own frame: `u` runs with traffic, `v` across it.
 */
function paintRoad(
  ctx: Ctx2D, grid: Tile[][], gx: number, gy: number,
  x: number, y: number, px: number, horizontal: boolean,
): void {
  const rect = (u: number, v: number, du: number, dv: number) => {
    if (horizontal) ctx.fillRect(x + u * px, y + v * px, du * px, dv * px);
    else ctx.fillRect(x + v * px, y + u * px, dv * px, du * px);
  };
  const line = Math.max(1, px * 0.035) / px;

  // Tyre polish down the middle of each lane.
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  rect(0, 0.18, 1, 0.14);
  rect(0, 0.68, 1, 0.14);

  // Crosswalk on the tiles either side of an intersection.
  const prev = horizontal ? grid[gy]?.[gx - 1] : grid[gy - 1]?.[gx];
  const next = horizontal ? grid[gy]?.[gx + 1] : grid[gy + 1]?.[gx];
  const nearPrev = prev?.type === TileType.INTERSECTION;
  const nearNext = next?.type === TileType.INTERSECTION;

  if (nearPrev || nearNext) {
    // Zebra bars run with the traffic, stacked across the carriageway.
    const u0 = nearPrev ? 0.08 : 0.42;
    ctx.fillStyle = WHITE_PAINT;
    for (let i = 0; i < 6; i++) rect(u0, 0.07 + i * 0.15, 0.5, 0.08);
    // Stop line behind the crossing.
    rect(nearPrev ? 0.66 : 0.3, 0.04, line * 1.6, 0.92);
    return;
  }

  // Double yellow centre line, white edge lines.
  ctx.fillStyle = YELLOW_PAINT;
  rect(0, 0.47 - line, 1, line);
  rect(0, 0.53, 1, line);
  ctx.fillStyle = WHITE_PAINT;
  rect(0, 0.05, 1, line);
  rect(0, 0.95 - line, 1, line);
}

export function paintTile(
  ctx: Ctx2D,
  grid: Tile[][],
  gx: number,
  gy: number,
  px: number,
  ox = 0,
  oy = 0,
): void {
  const tile = grid[gy]?.[gx];
  if (!tile) return;
  const x = ox + (gx % CHUNK_TILES) * px;
  const y = oy + (gy % CHUNK_TILES) * px;
  const w = px + 0.5;

  switch (tile.type) {
    case TileType.ROAD_H:
    case TileType.ROAD_V:
      ctx.fillStyle = surface(ctx, 'asphalt');
      ctx.fillRect(x, y, w, w);
      paintRoad(ctx, grid, gx, gy, x, y, px, tile.type === TileType.ROAD_H);
      break;

    case TileType.INTERSECTION:
      ctx.fillStyle = surface(ctx, 'asphalt');
      ctx.fillRect(x, y, w, w);
      // Patched box where the traffic turns.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + px * 0.1, y + px * 0.1, px * 0.8, px * 0.8);
      break;

    case TileType.SIDEWALK:
      if (isStreetSidewalk(grid, gx, gy)) {
        ctx.fillStyle = surface(ctx, 'concrete');
        ctx.fillRect(x, y, w, w);
        // Paving slab joints, two by two per tile.
        ctx.fillStyle = 'rgba(40,38,34,0.28)';
        const j = Math.max(1, px * 0.02);
        ctx.fillRect(x, y, px, j);
        ctx.fillRect(x, y + px / 2, px, j);
        ctx.fillRect(x, y, j, px);
        ctx.fillRect(x + px / 2, y, j, px);
      } else {
        // Front yards between the houses.
        ctx.fillStyle = surface(ctx, 'lawn');
        ctx.fillRect(x, y, w, w);
      }
      break;

    case TileType.PARK:
      ctx.fillStyle = surface(ctx, 'grass');
      ctx.fillRect(x, y, w, w);
      // Gravel path through every other park row.
      if (gy % 2 === 0) {
        ctx.fillStyle = 'rgba(190,175,140,0.55)';
        ctx.fillRect(x, y + px * 0.44, w, px * 0.12);
      }
      break;

    case TileType.PARKING:
      ctx.fillStyle = surface(ctx, 'asphalt');
      ctx.fillRect(x, y, w, w);
      ctx.fillStyle = WHITE_PAINT;
      for (const u of [0, 0.5]) {
        ctx.fillRect(x + u * px, y + px * 0.08, Math.max(1, px * 0.03), px * 0.36);
        ctx.fillRect(x + u * px, y + px * 0.56, Math.max(1, px * 0.03), px * 0.36);
      }
      break;

    case TileType.BUILDING:
      ctx.fillStyle = tile.buildingType === BuildingType.HOUSE
        ? surface(ctx, 'lawn')
        : surface(ctx, 'concrete');
      ctx.fillRect(x, y, w, w);
      break;

    default:
      ctx.fillStyle = tileColor(tile.type, tile.buildingType);
      ctx.fillRect(x, y, w, w);
  }

  // Base apron: concrete slab joints, plus a yellow taxi line down the
  // swallowed road column and row so the gates read as lanes.
  if (tile.type === TileType.MILITARY_BASE) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, px, Math.max(1, px * 0.03));
    ctx.fillRect(x, y, Math.max(1, px * 0.03), px);
    ctx.fillStyle = 'rgba(250,204,21,0.55)';
    if (gx % 8 === 0) ctx.fillRect(x + px * 0.46, y, Math.max(1, px * 0.08), px);
    if (gy % 8 === 0) ctx.fillRect(x, y + px * 0.46, px, Math.max(1, px * 0.08));
  }

  // Helipad H marker
  if (tile.type === TileType.HELIPAD) {
    ctx.fillStyle = 'rgba(255,220,0,0.7)';
    ctx.font = `bold ${Math.round(px * 0.7)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('H', x + px / 2, y + px * 0.8);
  }
}

/** Paint one chunk's ground onto a `texSize` square context. */
export function paintChunk(ctx: Ctx2D, grid: Tile[][], cx: number, cy: number, texSize: number): void {
  const px = texSize / CHUNK_TILES;
  const gx0 = cx * CHUNK_TILES;
  const gy0 = cy * CHUNK_TILES;
  const gx1 = Math.min(GRID_SIZE, gx0 + CHUNK_TILES);
  const gy1 = Math.min(GRID_SIZE, gy0 + CHUNK_TILES);

  ctx.fillStyle = '#1d1d2d';
  ctx.fillRect(0, 0, texSize, texSize);

  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      paintTile(ctx, grid, gx, gy, px, 0, 0);
    }
  }
}

/** Rasterise one chunk's ground into a fresh canvas of `texSize` px (main thread). */
export function renderChunkCanvas(
  world: WorldData,
  cx: number,
  cy: number,
  texSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = texSize;
  canvas.height = texSize;
  paintChunk(canvas.getContext('2d')!, world.grid, cx, cy, texSize);
  return canvas;
}

// ── Grid hand-off to the ground worker ──────────────────────────────────────

/**
 * Just what the painter reads — tile type and whether a building is a house —
 * as two typed arrays: 50 KB to post instead of 25,600 cloned Tile objects.
 */
export interface PackedGroundGrid {
  size: number;
  types: Uint8Array;
  houses: Uint8Array;
}

const TILE_TYPES = Object.values(TileType) as TileType[];

export function packGroundGrid(grid: Tile[][]): PackedGroundGrid {
  const size = grid.length;
  const types = new Uint8Array(size * size);
  const houses = new Uint8Array(size * size);
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const t = grid[gy][gx];
      const i = gy * size + gx;
      types[i] = TILE_TYPES.indexOf(t.type);
      houses[i] = t.buildingType === BuildingType.HOUSE ? 1 : 0;
    }
  }
  return { size, types, houses };
}

export function unpackGroundGrid(p: PackedGroundGrid): Tile[][] {
  const grid: Tile[][] = [];
  for (let gy = 0; gy < p.size; gy++) {
    const row: Tile[] = [];
    for (let gx = 0; gx < p.size; gx++) {
      const i = gy * p.size + gx;
      const tile: Tile = { type: TILE_TYPES[p.types[i]] };
      if (p.houses[i]) tile.buildingType = BuildingType.HOUSE;
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}
