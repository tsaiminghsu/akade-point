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
 * Heights and footprints still come straight from the tile grid, so the
 * collision and flight-ceiling rules in worldGen match what is drawn; only the
 * detail on top (setbacks, storefronts, roofs, street furniture) is added here.
 */

export const LAYER_NAMES: readonly ChunkLayerName[] = [
  'sky', 'off', 'com', 'hou', 'shop',
  'roofBase', 'roofPeak', 'roofUnit',
  'houseDoor',
  'treeTrunk', 'treeLeaf',
  'pole', 'lampHead', 'lightPool', 'signalHead',
  'curb', 'prop',
];

/** Street furniture repeats every block along a road (BLOCK_INTERVAL). */
const STREET_PERIOD = 8;
/** Lamps stand at these offsets along the road, one per side, staggered. */
const LAMP_NEAR_SIDE = 2;
const LAMP_FAR_SIDE = 6;

/** Heights and reaches of the street furniture, 3D units. */
export const LAMP = { poleH: 5.4, reach: 1.8, headY: 5.2, inset: 0.3 } as const;
export const SIGNAL = { poleH: 4.8, reach: 2.3, headY: 4.15, inset: 0.35 } as const;
const CURB = { w: 0.22, h: 0.16 } as const;

type RGB = [number, number, number];

// ── Colour rules (RGB 0-1, multiplied onto the facade textures) ─────────────

const HOUSE_PAINT: RGB[] = [
  [0.96, 0.92, 0.84], // cream
  [0.80, 0.88, 0.95], // pale blue
  [0.84, 0.90, 0.78], // sage
  [0.98, 0.84, 0.76], // salmon
  [0.92, 0.92, 0.90], // light grey
  [0.98, 0.93, 0.72], // butter
];
const TOWER_GLASS: RGB[] = [
  [0.72, 0.86, 1.00], // blue
  [0.70, 0.95, 0.90], // teal
  [1.00, 0.86, 0.66], // bronze
  [0.90, 0.93, 0.97], // silver
  [0.62, 0.72, 0.85], // steel
];
const OFFICE_CONCRETE: RGB[] = [
  [1.00, 1.00, 1.00],
  [0.95, 0.92, 0.86],
  [0.86, 0.88, 0.90],
  [0.92, 0.86, 0.80],
];
const MASONRY: RGB[] = [
  [1.00, 1.00, 1.00], // limestone
  [0.95, 0.80, 0.68], // terracotta render
  [0.85, 0.85, 0.86], // grey
  [0.98, 0.92, 0.78], // sand
  [0.80, 0.70, 0.62], // brown brick
];
const SHOP_SIGN: RGB[] = [
  [0.90, 0.20, 0.18], [0.15, 0.45, 0.85], [0.95, 0.70, 0.10],
  [0.15, 0.65, 0.35], [0.70, 0.25, 0.75], [0.95, 0.95, 0.95],
];
const SHINGLE: RGB[] = [
  [0.28, 0.28, 0.30], [0.55, 0.25, 0.18], [0.36, 0.26, 0.20], [0.30, 0.34, 0.38],
];

export function facadeTint(floors: number, seed: number, btype?: BuildingType): RGB {
  if (btype === BuildingType.HOUSE) return HOUSE_PAINT[seed % HOUSE_PAINT.length];
  if (floors >= 15) return TOWER_GLASS[seed % TOWER_GLASS.length];
  if (floors >= 8) return OFFICE_CONCRETE[seed % OFFICE_CONCRETE.length];
  return MASONRY[seed % MASONRY.length];
}

export function roofBaseTint(floors: number, seed: number, btype?: BuildingType): RGB {
  if (btype === BuildingType.HOUSE) return [0.92, 0.92, 0.90]; // painted eaves
  // Flat roofs: grey membrane or pale gravel.
  return seed % 3 === 0 ? [0.62, 0.61, 0.58] : [0.42, 0.42, 0.43];
}

export function roofPeakTint(seed: number): RGB {
  return SHINGLE[seed % SHINGLE.length];
}

export function shopSignTint(seed: number): RGB {
  return SHOP_SIGN[seed % SHOP_SIGN.length];
}

/** Tall towers step back for their top quarter; the crown stays at full height. */
export function hasSetback(floors: number, seed: number): boolean {
  return floors >= 12 && seed % 3 !== 0;
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

/** sRGB → linear, the space instanceColor is multiplied in. */
function toLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

class LayerBuilder {
  private mats: number[] = [];
  private colors: number[] = [];
  count = 0;

  /**
   * Palette colours here are written as sRGB, like CSS. `data` layers carry
   * raw numbers in the colour channel instead (the signal phase) and are
   * stored untouched.
   */
  constructor(private readonly data = false) {}

  private pushColor(r: number, g: number, b: number): void {
    if (this.data) this.colors.push(r, g, b);
    else this.colors.push(toLinear(r), toLinear(g), toLinear(b));
  }

  /** Translation + non-uniform scale, no rotation (column-major). */
  add(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, r = 1, g = 1, b = 1): void {
    this.mats.push(
      sx, 0, 0, 0,
      0, sy, 0, 0,
      0, 0, sz, 0,
      tx, ty, tz, 1,
    );
    this.pushColor(r, g, b);
    this.count++;
  }

  /** Axis-aligned box from min/max corners. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, [r, g, b]: RGB = [1, 1, 1]): void {
    this.add((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, r, g, b);
  }

  /** Translation · rotation about Y · scale (column-major). */
  addRotY(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number,
    angle: number, [r, g, b]: RGB = [1, 1, 1]): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.mats.push(
      c * sx, 0, -s * sx, 0,
      0, sy, 0, 0,
      s * sz, 0, c * sz, 0,
      tx, ty, tz, 1,
    );
    this.pushColor(r, g, b);
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

// ── Street furniture placement (pure, shared with the tests) ────────────────

/** West, east, north, south as tile steps; north is −gy / −z. */
const DIRS: readonly [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function isRoadTile(t: Tile | undefined): boolean {
  return !!t && (t.type === TileType.ROAD_H || t.type === TileType.ROAD_V || t.type === TileType.INTERSECTION);
}

function roadSides(grid: Tile[][], gx: number, gy: number): [number, number][] {
  return DIRS.filter(([dx, dy]) => isRoadTile(grid[gy + dy]?.[gx + dx]));
}

/** Offset along the road, 0..STREET_PERIOD-1, for a tile beside a road on `dx`/`dy`. */
function alongRoad(gx: number, gy: number, dx: number): number {
  const a = dx !== 0 ? gy : gx;
  return ((a % STREET_PERIOD) + STREET_PERIOD) % STREET_PERIOD;
}

/** The sidewalk tile beside exactly one road: the direction of that road. */
function streetSide(grid: Tile[][], gx: number, gy: number): [number, number] | null {
  if (grid[gy]?.[gx]?.type !== TileType.SIDEWALK) return null;
  const sides = roadSides(grid, gx, gy);
  return sides.length === 1 ? sides[0] : null;
}

/** Near side = the road lies west or north of the tile. */
function isNearSide([dx, dy]: [number, number]): boolean {
  return dx < 0 || dy < 0;
}

/**
 * Street lamps: one per side of every block face, staggered between the two
 * sides of the road. Returns the direction the arm reaches (toward the road).
 */
export function lampDir(grid: Tile[][], gx: number, gy: number): [number, number] | null {
  const side = streetSide(grid, gx, gy);
  if (!side) return null;
  const want = isNearSide(side) ? LAMP_NEAR_SIDE : LAMP_FAR_SIDE;
  return alongRoad(gx, gy, side[0]) === want ? side : null;
}

/**
 * Traffic signals: on the sidewalk corner diagonal to an intersection.
 * Returns that diagonal direction.
 */
export function signalCorner(grid: Tile[][], gx: number, gy: number): [number, number] | null {
  if (grid[gy]?.[gx]?.type !== TileType.SIDEWALK) return null;
  const sides = roadSides(grid, gx, gy);
  if (sides.length !== 2) return null;
  const dx = sides[0][0] + sides[1][0];
  const dy = sides[0][1] + sides[1][1];
  if (dx === 0 || dy === 0) return null; // opposite sides, not a corner
  return grid[gy + dy]?.[gx + dx]?.type === TileType.INTERSECTION ? [dx, dy] : null;
}

/** Trees: every third park tile, some front yards, and mid-block street trees. */
export function treeAt(grid: Tile[][], gx: number, gy: number): boolean {
  const t = grid[gy]?.[gx];
  if (!t) return false;
  if (t.type === TileType.PARK) return (gx + gy * 3) % 3 === 0;
  if (t.type !== TileType.SIDEWALK) return false;
  const sides = roadSides(grid, gx, gy);
  if (sides.length === 0) return (gx * 7 + gy * 3) % 5 === 0; // front yard
  return sides.length === 1 && alongRoad(gx, gy, sides[0][0]) === 4;
}

function sameBuilding(a: Tile, b: Tile | undefined): boolean {
  return !!b
    && (b.type === TileType.BUILDING || b.type === TileType.HELIPAD)
    && a.buildingType !== BuildingType.HOUSE && b.buildingType !== BuildingType.HOUSE
    && (a.floors ?? 1) === (b.floors ?? 1)
    && a.colorSeed === b.colorSeed;
}

/** Small deterministic hash → [0,1). */
function hash01(a: number, b: number, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 17, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

type Builders = Record<ChunkLayerName, LayerBuilder>;

/**
 * Commercial, office and tower tiles. Tiles of one multi-tile building run
 * their walls to the shared tile edge, so a 2×2 block is one solid mass
 * instead of four towers with alleys between them.
 */
function bakeBlock(b: Builders, grid: Tile[][], tile: Tile, gx: number, gy: number, x3: number, z3: number): void {
  const floors = tile.floors ?? 1;
  const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
  const seed = tile.colorSeed ?? 0;
  const half = buildingFootprint(tile.buildingType) / 2;
  const edge = TILE_3D / 2;
  const merged: Record<'w' | 'e' | 'n' | 's', boolean> = {
    w: sameBuilding(tile, grid[gy]?.[gx - 1]),
    e: sameBuilding(tile, grid[gy]?.[gx + 1]),
    n: sameBuilding(tile, grid[gy - 1]?.[gx]),
    s: sameBuilding(tile, grid[gy + 1]?.[gx]),
  };
  /** Footprint with the open sides pulled in by `inset` (negative = out). */
  const ext = (inset: number) => ({
    x0: x3 - (merged.w ? edge : half - inset),
    x1: x3 + (merged.e ? edge : half - inset),
    z0: z3 - (merged.n ? edge : half - inset),
    z1: z3 + (merged.s ? edge : half - inset),
  });

  const cat = buildingCategory(floors, tile.buildingType);
  const tint = facadeTint(floors, seed, tile.buildingType);
  const roofTint = roofBaseTint(floors, seed, tile.buildingType);
  const isBuilding = tile.type === TileType.BUILDING;
  const tower = isBuilding && hasSetback(floors, seed);
  const hMain = tower ? Math.max(1, Math.floor(floors * 0.72)) * FLOOR_HEIGHT_3D : h;

  const body = ext(0);
  b[cat].box(body.x0, 0, body.z0, body.x1, hMain, body.z1, tint);
  const cap = ext(-0.06);
  b.roofBase.box(cap.x0, hMain, cap.z0, cap.x1, hMain + 0.3, cap.z1, roofTint);

  let top = body;
  if (tower) {
    top = ext(0.55);
    b[cat].box(top.x0, hMain, top.z0, top.x1, h, top.z1, tint);
    const cap2 = ext(0.49);
    b.roofBase.box(cap2.x0, h, cap2.z0, cap2.x1, h + 0.3, cap2.z1, roofTint);
  }

  if (!isBuilding) return; // helipad: keep the deck clear

  // Ground-floor storefront or lobby, proud of the wall.
  const shop = tile.buildingType === BuildingType.SHOP;
  const sign: RGB = shop ? shopSignTint(seed) : [0.86, 0.86, 0.84];
  const sf = ext(-0.05);
  b.shop.box(sf.x0, 0, sf.z0, sf.x1, Math.min(FLOOR_HEIGHT_3D, hMain), sf.z1, sign);

  // Awnings over the pavement.
  if (shop) {
    const aw: RGB = [sign[0] * 0.8, sign[1] * 0.8, sign[2] * 0.8];
    const y0 = 1.0, y1 = 1.08, depth = 0.8;
    const walk = (dx: number, dy: number) => grid[gy + dy]?.[gx + dx]?.type === TileType.SIDEWALK;
    if (!merged.w && walk(-1, 0)) b.prop.box(body.x0 - depth, y0, body.z0 + 0.2, body.x0, y1, body.z1 - 0.2, aw);
    if (!merged.e && walk(1, 0)) b.prop.box(body.x1, y0, body.z0 + 0.2, body.x1 + depth, y1, body.z1 - 0.2, aw);
    if (!merged.n && walk(0, -1)) b.prop.box(body.x0 + 0.2, y0, body.z0 - depth, body.x1 - 0.2, y1, body.z0, aw);
    if (!merged.s && walk(0, 1)) b.prop.box(body.x0 + 0.2, y0, body.z1, body.x1 - 0.2, y1, body.z1 + depth, aw);
  }

  // Rooftop plant: AC units, and a water tank on mid-rise blocks.
  if (floors >= 3) {
    const topY = h + 0.3;
    const spanX = top.x1 - top.x0;
    const spanZ = top.z1 - top.z0;
    const n = 1 + Math.floor(hash01(gx, gy, 1) * 2);
    for (let i = 0; i < n; i++) {
      const sx = 0.6 + hash01(gx, gy, 10 + i) * 0.5;
      const sz = 0.5 + hash01(gx, gy, 20 + i) * 0.5;
      const sy = 0.4 + hash01(gx, gy, 30 + i) * 0.35;
      const ux = top.x0 + 0.4 + sx / 2 + hash01(gx, gy, 40 + i) * Math.max(0, spanX - 0.8 - sx);
      const uz = top.z0 + 0.4 + sz / 2 + hash01(gx, gy, 50 + i) * Math.max(0, spanZ - 0.8 - sz);
      b.roofUnit.add(ux, topY + sy / 2, uz, sx, sy, sz, 0.70, 0.71, 0.72);
    }
    if (floors <= 9 && hash01(gx, gy, 2) < 0.25) {
      b.roofUnit.add((top.x0 + top.x1) / 2, topY + 0.9, (top.z0 + top.z1) / 2, 0.9, 1.2, 0.9, 0.42, 0.31, 0.22);
    }
  }
}

/** Detached house: painted siding, gable roof, a door toward the street. */
function bakeHouse(b: Builders, tile: Tile, gx: number, gy: number, x3: number, z3: number): void {
  const floors = tile.floors ?? 1;
  const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
  const seed = tile.colorSeed ?? 0;
  const fp = buildingFootprint(tile.buildingType);
  const [r, g, bl] = facadeTint(floors, seed, tile.buildingType);
  b.hou.add(x3, h / 2, z3, fp, h, fp, r, g, bl);

  const eave = fp * 1.14;
  const [er, eg, eb] = roofBaseTint(floors, seed, tile.buildingType);
  b.roofBase.add(x3, h + 0.05, z3, eave, 0.1, eave, er, eg, eb);
  b.roofPeak.addRotY(x3, h + 0.1 + 0.55, z3, eave, 1.1, eave, seed % 2 === 0 ? 0 : Math.PI / 2, roofPeakTint(seed));
  if (seed % 3 === 0) b.roofUnit.add(x3 + fp * 0.28, h + 0.9, z3 - fp * 0.2, 0.34, 1.2, 0.34, 0.55, 0.30, 0.24);

  // Houses sit mid-block; the door faces whichever road is nearer.
  const oy = ((gy % STREET_PERIOD) + STREET_PERIOD) % STREET_PERIOD;
  const north = oy < STREET_PERIOD / 2;
  const fz = z3 + (north ? -1 : 1) * (fp / 2 + 0.015);
  const doors: RGB[] = [[0.35, 0.20, 0.12], [0.15, 0.25, 0.40], [0.50, 0.10, 0.10], [0.95, 0.95, 0.92]];
  b.houseDoor.addRotY(x3 + (hash01(gx, gy, 6) - 0.5) * fp * 0.4, 0.45, fz, 0.5, 0.9, 1,
    north ? Math.PI : 0, doors[seed % doors.length]);
}

function bakeTree(b: Builders, grid: Tile[][], tile: Tile, gx: number, gy: number, x3: number, z3: number): void {
  const r1 = hash01(gx, gy, 3);
  const r2 = hash01(gx, gy, 4);
  const r3 = hash01(gx, gy, 5);
  let tx = x3 + (r1 - 0.5) * 1.4;
  let tz = z3 + (r2 - 0.5) * 1.4;
  if (tile.type === TileType.SIDEWALK) {
    const sides = roadSides(grid, gx, gy);
    // Street trees stand in a pit a step back from the kerb.
    if (sides.length === 1) {
      tx = x3 + sides[0][0] * 0.7;
      tz = z3 + sides[0][1] * 0.7;
    }
  }
  const trunkH = 1.3 + r3 * 0.9;
  const crownR = 0.9 + r1 * 0.6;
  const crownH = crownR * (1.3 + r2 * 0.4);
  b.treeTrunk.add(tx, trunkH / 2, tz, 0.16, trunkH, 0.16);
  b.treeLeaf.add(tx, trunkH + crownH * 0.35, tz, crownR, crownH / 2, crownR,
    0.20 + r2 * 0.10, 0.38 + r3 * 0.14, 0.16 + r1 * 0.06);
}

/** Cobra-head street lamp at the kerb, arm over the road. Returns the head x/z. */
function bakeLamp(b: Builders, [dx, dy]: [number, number], x3: number, z3: number): [number, number] {
  const edge = TILE_3D / 2 - LAMP.inset;
  const px3 = x3 + dx * edge;
  const pz3 = z3 + dy * edge;
  const metal: RGB = [0.24, 0.25, 0.27];
  b.pole.add(px3, LAMP.poleH / 2, pz3, 0.16, LAMP.poleH, 0.16, ...metal);
  b.pole.add(px3 + dx * LAMP.reach / 2, LAMP.poleH - 0.1, pz3 + dy * LAMP.reach / 2,
    dx ? LAMP.reach : 0.08, 0.08, dy ? LAMP.reach : 0.08, ...metal);
  const hx = px3 + dx * LAMP.reach;
  const hz = pz3 + dy * LAMP.reach;
  b.lampHead.add(hx, LAMP.headY, hz, dx ? 0.7 : 0.3, 0.14, dy ? 0.7 : 0.3);
  b.lightPool.add(hx, 0.03, hz, 7, 1, 7);
  return [hx, hz];
}

/**
 * Mast-arm traffic signal on an intersection corner. Two diagonal corners
 * reach over the north–south road, the other two over the east–west road,
 * and the two directions run opposite phases.
 */
function bakeSignal(b: Builders, [dx, dy]: [number, number], x3: number, z3: number): void {
  const edge = TILE_3D / 2 - SIGNAL.inset;
  const px3 = x3 + dx * edge;
  const pz3 = z3 + dy * edge;
  const metal: RGB = [0.16, 0.17, 0.15];
  b.pole.add(px3, SIGNAL.poleH / 2, pz3, 0.18, SIGNAL.poleH, 0.18, ...metal);
  const overNS = dx === dy;
  const ux = overNS ? dx : 0;
  const uz = overNS ? 0 : dy;
  b.pole.add(px3 + ux * SIGNAL.reach / 2, SIGNAL.poleH - 0.15, pz3 + uz * SIGNAL.reach / 2,
    ux ? SIGNAL.reach : 0.1, 0.1, uz ? SIGNAL.reach : 0.1, ...metal);
  const phase = overNS ? 0 : 0.5;
  b.signalHead.add(px3 + ux * SIGNAL.reach, SIGNAL.headY, pz3 + uz * SIGNAL.reach, 0.3, 0.9, 0.3, phase, phase, phase);
}

function buildChunk(grid: Tile[][], cx: number, cy: number): ChunkIndex {
  const builders = {} as Record<ChunkLayerName, LayerBuilder>;
  for (const name of LAYER_NAMES) builders[name] = new LayerBuilder(name === 'signalHead');

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

      if (tile.type === TileType.BUILDING || tile.type === TileType.HELIPAD) {
        if (tile.buildingType === BuildingType.HOUSE) bakeHouse(builders, tile, gx, gy, x3, z3);
        else bakeBlock(builders, grid, tile, gx, gy, x3, z3);
      }

      if (treeAt(grid, gx, gy)) bakeTree(builders, grid, tile, gx, gy, x3, z3);

      if (tile.type === TileType.SIDEWALK) {
        const sides = roadSides(grid, gx, gy);
        const half = TILE_3D / 2;

        // Kerbs along every edge that meets the carriageway.
        for (const [dx, dy] of sides) {
          const cx3 = x3 + dx * (half - CURB.w / 2);
          const cz3 = z3 + dy * (half - CURB.w / 2);
          const sx = dx !== 0 ? CURB.w : TILE_3D;
          const sz = dx !== 0 ? TILE_3D : CURB.w;
          builders.curb.add(cx3, CURB.h / 2, cz3, sx, CURB.h, sz, 0.78, 0.77, 0.74);
        }

        const lamp = lampDir(grid, gx, gy);
        if (lamp) {
          const [hx, hz] = bakeLamp(builders, lamp, x3, z3);
          lampPositions.push(hx, hz);
        }

        const corner = signalCorner(grid, gx, gy);
        if (corner) bakeSignal(builders, corner, x3, z3);

        // Hydrants and bins near the kerb, one each per block face.
        if (sides.length === 1) {
          const [dx, dy] = sides[0];
          const along = alongRoad(gx, gy, dx);
          const px3 = x3 + dx * (half - 0.55);
          const pz3 = z3 + dy * (half - 0.55);
          if (isNearSide(sides[0]) && along === 3) {
            builders.prop.add(px3, 0.3, pz3, 0.26, 0.6, 0.26, 0.78, 0.12, 0.10);
            builders.prop.add(px3, 0.62, pz3, 0.18, 0.1, 0.18, 0.65, 0.65, 0.62);
          } else if (!isNearSide(sides[0]) && along === 5) {
            builders.prop.add(px3, 0.38, pz3, 0.4, 0.76, 0.4, 0.16, 0.28, 0.20);
          }
        }
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
