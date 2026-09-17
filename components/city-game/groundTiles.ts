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
 * (grid, gx, gy) — never read Math.random here.
 *
 * `px` is the pixel size of one tile in the target canvas and `ox`/`oy` is
 * the canvas-pixel origin of the chunk being painted.
 */

export function tileColor(type: TileType, buildingType?: BuildingType): string {
  switch (type) {
    case TileType.ROAD_H:
    case TileType.ROAD_V:
    case TileType.INTERSECTION: return '#606078';
    case TileType.SIDEWALK: return '#747488';
    case TileType.PARK: return '#22442d';
    case TileType.PARKING: return '#3d3d52';
    case TileType.BUILDING: return buildingType === BuildingType.HOUSE ? '#3d2e27' : '#252538';
    case TileType.HELIPAD: return '#553f00';
    default: return '#1d1d2d';
  }
}

export function paintTile(
  ctx: CanvasRenderingContext2D,
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

  ctx.fillStyle = tileColor(tile.type, tile.buildingType);
  ctx.fillRect(x, y, px + 0.5, px + 0.5);

  // Road center line
  if (tile.type === TileType.ROAD_H) {
    ctx.fillStyle = 'rgba(255,220,0,0.35)';
    ctx.fillRect(x, y + px * 0.47, px, Math.max(1, px * 0.06));
  } else if (tile.type === TileType.ROAD_V) {
    ctx.fillStyle = 'rgba(255,220,0,0.35)';
    ctx.fillRect(x + px * 0.47, y, Math.max(1, px * 0.06), px);
  }

  // Helipad H marker
  if (tile.type === TileType.HELIPAD) {
    ctx.fillStyle = 'rgba(255,220,0,0.7)';
    ctx.font = `bold ${Math.round(px * 0.7)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('H', x + px / 2, y + px * 0.8);
  }

  // Shop sign colour strip
  if (tile.shopName) {
    ctx.fillStyle = 'rgba(255,100,0,0.5)';
    ctx.fillRect(x, y + px - px * 0.18, px, px * 0.18);
  }
}

/** Rasterise one chunk's ground into a fresh canvas of `texSize` px. */
export function renderChunkCanvas(
  world: WorldData,
  cx: number,
  cy: number,
  texSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = texSize;
  canvas.height = texSize;
  const ctx = canvas.getContext('2d')!;
  const px = texSize / CHUNK_TILES;

  const gx0 = cx * CHUNK_TILES;
  const gy0 = cy * CHUNK_TILES;
  const gx1 = Math.min(GRID_SIZE, gx0 + CHUNK_TILES);
  const gy1 = Math.min(GRID_SIZE, gy0 + CHUNK_TILES);

  ctx.fillStyle = '#1d1d2d';
  ctx.fillRect(0, 0, texSize, texSize);

  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      paintTile(ctx, world.grid, gx, gy, px, 0, 0);
    }
  }
  return canvas;
}
