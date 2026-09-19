/**
 * The drone arena: a fenced field carved out of the south-west suburbs.
 *
 * Free flight is confined here so the drone never ends up buzzing the streets
 * or clipping through rooftops. Racing deliberately lifts the confinement —
 * the three FPV courses are laid out across the real city and could not fit in
 * a field this size.
 *
 * Pure geometry and predicates only: no three.js, no engine, so the bounds can
 * be unit tested and shared between world generation, physics and rendering.
 */

import { TILE_SIZE } from './types';
import type { RaceSession } from './types';

/** Block coordinates consumed by the arena (BLOCK_INTERVAL = 8 tiles). */
export const ARENA_BLOCK_X0 = 2;
export const ARENA_BLOCK_X1 = 4;
export const ARENA_BLOCK_Y0 = 14;
export const ARENA_BLOCK_Y1 = 16;

/**
 * Arena tiles, inclusive. The perimeter roads (gx 16/40, gy 112/136) are
 * deliberately left outside so the field is still reachable by car; the roads
 * *inside* this rectangle are what gets swallowed.
 */
export const ARENA_TILE_X0 = ARENA_BLOCK_X0 * 8 + 1;  // 17
export const ARENA_TILE_X1 = ARENA_BLOCK_X1 * 8 + 7;  // 39
export const ARENA_TILE_Y0 = ARENA_BLOCK_Y0 * 8 + 1;  // 113
export const ARENA_TILE_Y1 = ARENA_BLOCK_Y1 * 8 + 7;  // 135

/** Outer edge of the field in world px. */
export const ARENA_X0 = ARENA_TILE_X0 * TILE_SIZE;         // 680
export const ARENA_X1 = (ARENA_TILE_X1 + 1) * TILE_SIZE;   // 1600
export const ARENA_Y0 = ARENA_TILE_Y0 * TILE_SIZE;         // 4520
export const ARENA_Y1 = (ARENA_TILE_Y1 + 1) * TILE_SIZE;   // 5440

/** Half the drone's body plus a little slack, so it stops before it visibly clips. */
const WALL_INSET = 12;

/**
 * Altitude ceiling, same unit as `Vehicle.altitude` (world px; 14 per building
 * floor). Below the global 0..200 clamp, so it is a real lid rather than a
 * restatement of the existing limit.
 */
export const ARENA_CEILING = 160;

/** Take-off point, at the centre of the field. */
export const DRONE_PAD = {
  x: (ARENA_TILE_X0 + ARENA_TILE_X1 + 1) / 2 * TILE_SIZE,
  y: (ARENA_TILE_Y0 + ARENA_TILE_Y1 + 1) / 2 * TILE_SIZE,
};

export interface DroneBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ceiling: number;
}

export const DRONE_ARENA: DroneBounds = {
  minX: ARENA_X0 + WALL_INSET,
  maxX: ARENA_X1 - WALL_INSET,
  minY: ARENA_Y0 + WALL_INSET,
  maxY: ARENA_Y1 - WALL_INSET,
  ceiling: ARENA_CEILING,
};

/** Is this tile part of the arena floor? Used while generating the world. */
export function inArenaTile(gx: number, gy: number): boolean {
  return gx >= ARENA_TILE_X0 && gx <= ARENA_TILE_X1
    && gy >= ARENA_TILE_Y0 && gy <= ARENA_TILE_Y1;
}

/** Is this world-px point inside the field footprint (walls included)? */
export function isInsideArena(x: number, y: number): boolean {
  return x >= ARENA_X0 && x <= ARENA_X1 && y >= ARENA_Y0 && y <= ARENA_Y1;
}

export interface ClampResult {
  x: number;
  y: number;
  /** True when the position was pushed back, i.e. the drone touched a wall. */
  hit: boolean;
}

export function clampToArena(x: number, y: number, bounds: DroneBounds = DRONE_ARENA): ClampResult {
  const cx = Math.min(bounds.maxX, Math.max(bounds.minX, x));
  const cy = Math.min(bounds.maxY, Math.max(bounds.minY, y));
  return { x: cx, y: cy, hit: cx !== x || cy !== y };
}

/**
 * The bounds the drone is currently held to, or null when it may roam.
 *
 * Racing is the one case that roams: `startRace` teleports the drone to the
 * first gate somewhere in the city, so keeping the walls up would trap it
 * outside them.
 */
export function droneConfinement(race: RaceSession | null | undefined): DroneBounds | null {
  if (race && race.phase !== 'idle') return null;
  return DRONE_ARENA;
}
