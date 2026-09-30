/**
 * Fort Akade: a walled army base in the north-east corner of the city.
 *
 * Like the drone arena it swallows whole blocks (interior roads included) and
 * keeps the perimeter roads outside the wall, so it is reachable by car
 * through two gates. Setting foot or wheel inside raises the wanted level to
 * four stars; the army guards it with tanks and trucks, and one tank parked
 * on the apron can be stolen.
 *
 * Pure geometry and predicates only: shared by world generation, physics,
 * the AI and the renderer, and unit tested without three.js.
 */

import { Point, Tile, TileType, TILE_SIZE } from './types';

/** Block coordinates consumed by the base (BLOCK_INTERVAL = 8 tiles). */
export const BASE_BLOCK_X0 = 15;
export const BASE_BLOCK_X1 = 17;
export const BASE_BLOCK_Y0 = 2;
export const BASE_BLOCK_Y1 = 4;

/** Footprint in tiles, inclusive. The outermost ring is the wall. */
export const BASE_TILE_X0 = BASE_BLOCK_X0 * 8 + 1;  // 121
export const BASE_TILE_X1 = BASE_BLOCK_X1 * 8 + 7;  // 143
export const BASE_TILE_Y0 = BASE_BLOCK_Y0 * 8 + 1;  // 17
export const BASE_TILE_Y1 = BASE_BLOCK_Y1 * 8 + 7;  // 39

/** Footprint in world px, walls included. */
export const BASE_X0 = BASE_TILE_X0 * TILE_SIZE;
export const BASE_X1 = (BASE_TILE_X1 + 1) * TILE_SIZE;
export const BASE_Y0 = BASE_TILE_Y0 * TILE_SIZE;
export const BASE_Y1 = (BASE_TILE_Y1 + 1) * TILE_SIZE;

export const BASE_CENTER: Point = {
  x: (BASE_X0 + BASE_X1) / 2,
  y: (BASE_Y0 + BASE_Y1) / 2,
};

/** Wall height in altitude units (world px). Low enough to fly over. */
export const WALL_ALT = 24;

/** Wanted level the base imposes on anyone inside it. */
export const TRESPASS_STARS = 4;

/** How close to the fence the "restricted area" warning fires, px. */
export const WARNING_DIST = 140;

export type GateSide = 'S' | 'W';

export interface Gate {
  side: GateSide;
  /** Tile span of the opening in the wall, inclusive. */
  gx0: number;
  gy0: number;
  gx1: number;
  gy1: number;
}

/**
 * Gates line up with the swallowed road column (gx 128) and row (gy 32), so
 * each opens straight onto an intersection of the perimeter road.
 */
export const GATES: Gate[] = [
  { side: 'S', gx0: 127, gy0: BASE_TILE_Y1, gx1: 129, gy1: BASE_TILE_Y1 },
  { side: 'W', gx0: BASE_TILE_X0, gy0: 31, gx1: BASE_TILE_X0, gy1: 33 },
];

export type StructureKind = 'hangar' | 'tower';

export interface Structure {
  kind: StructureKind;
  gx0: number;
  gy0: number;
  gx1: number;
  gy1: number;
  /** Solid height in floors (14 altitude units each). */
  floors: number;
}

/** Hangar doors face south, onto the apron. */
export const STRUCTURES: Structure[] = [
  { kind: 'hangar', gx0: 124, gy0: 20, gx1: 127, gy1: 22, floors: 6 },
  { kind: 'hangar', gx0: 130, gy0: 20, gx1: 133, gy1: 22, floors: 6 },
  { kind: 'hangar', gx0: 136, gy0: 20, gx1: 139, gy1: 22, floors: 6 },
  { kind: 'tower',  gx0: 140, gy0: 35, gx1: 140, gy1: 35, floors: 5 },
];

export interface Post {
  x: number;
  y: number;
  /** Heading while idle, radians (0 = North). */
  angle: number;
}

function tileCentre(gx: number, gy: number): Point {
  return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
}

/** The unguarded tank on the apron in front of the middle hangar. */
export const STEALABLE_TANK: Post = { x: 132 * TILE_SIZE, y: 25 * TILE_SIZE + TILE_SIZE / 2, angle: Math.PI };

/** Guard posts: a tank and a truck covering each gate from the inside. */
export const TANK_POSTS: Post[] = [
  { ...tileCentre(128, 35), angle: Math.PI },
  { ...tileCentre(125, 32), angle: Math.PI * 1.5 },
];
export const TRUCK_POSTS: Post[] = [
  { ...tileCentre(131, 36), angle: Math.PI },
  { ...tileCentre(125, 28), angle: Math.PI * 1.5 },
];

export function inBaseTile(gx: number, gy: number): boolean {
  return gx >= BASE_TILE_X0 && gx <= BASE_TILE_X1
    && gy >= BASE_TILE_Y0 && gy <= BASE_TILE_Y1;
}

export function isGateTile(gx: number, gy: number): boolean {
  return GATES.some(g => gx >= g.gx0 && gx <= g.gx1 && gy >= g.gy0 && gy <= g.gy1);
}

function structureAt(gx: number, gy: number): Structure | null {
  for (const s of STRUCTURES) {
    if (gx >= s.gx0 && gx <= s.gx1 && gy >= s.gy0 && gy <= s.gy1) return s;
  }
  return null;
}

/** The tile world generation puts at (gx, gy), or null outside the base. */
export function baseTile(gx: number, gy: number): Tile | null {
  if (!inBaseTile(gx, gy)) return null;
  const onRing = gx === BASE_TILE_X0 || gx === BASE_TILE_X1
    || gy === BASE_TILE_Y0 || gy === BASE_TILE_Y1;
  if (onRing && !isGateTile(gx, gy)) return { type: TileType.MILITARY_WALL };
  const s = structureAt(gx, gy);
  if (s) return { type: TileType.MILITARY_HANGAR, floors: s.floors };
  return { type: TileType.MILITARY_BASE };
}

/** Is this world-px point inside the base footprint (gates included)? */
export function isInsideBase(x: number, y: number): boolean {
  return x >= BASE_X0 && x < BASE_X1 && y >= BASE_Y0 && y < BASE_Y1;
}

/** Distance from a point to the base footprint, 0 when inside. */
export function distanceToBase(x: number, y: number): number {
  const dx = Math.max(BASE_X0 - x, 0, x - BASE_X1);
  const dy = Math.max(BASE_Y0 - y, 0, y - BASE_Y1);
  return Math.hypot(dx, dy);
}

/** Clamp a point to the drivable interior, inside the wall ring. */
export function clampToBaseInterior(x: number, y: number, inset = 14): Point {
  const minX = BASE_X0 + TILE_SIZE + inset;
  const maxX = BASE_X1 - TILE_SIZE - inset;
  const minY = BASE_Y0 + TILE_SIZE + inset;
  const maxY = BASE_Y1 - TILE_SIZE - inset;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}
