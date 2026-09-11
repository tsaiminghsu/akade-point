/**
 * Minecraft Web Edition — Phase 1 · Step 2
 * World & player tuning constants.
 */

import { BLOCK } from '../engine/blocks';

// ─── World ───────────────────────────────────────────────────────────────────

/** Chunk edge length in blocks (x/z). */
export const CHUNK_SIZE = 16;

/** World height in blocks (y). */
export const WORLD_HEIGHT = 64;

/** Bounded Phase-1 world size, in chunks. */
export const WORLD_CHUNKS_X = 8;
export const WORLD_CHUNKS_Z = 8;

/** World size in blocks. */
export const WORLD_SIZE_X = WORLD_CHUNKS_X * CHUNK_SIZE;
export const WORLD_SIZE_Z = WORLD_CHUNKS_Z * CHUNK_SIZE;

/** Water fills up to (and including) this y level. */
export const SEA_LEVEL = 20;

/** Deterministic world-generation seed. */
export const WORLD_SEED = 20260718;

// ─── Player ──────────────────────────────────────────────────────────────────

/** Player AABB half-width on x/z (meters). */
export const PLAYER_HALF_WIDTH = 0.3;
/** Player AABB height (meters). */
export const PLAYER_HEIGHT = 1.8;
/** Eye height above the feet (meters). */
export const EYE_HEIGHT = 1.62;

export const GRAVITY = 25;
export const JUMP_VELOCITY = 8.5;
export const WALK_SPEED = 5;
export const SPRINT_SPEED = 8;
export const FLY_SPEED = 12;

/** Max reach for breaking / placing blocks (meters). */
export const REACH = 6;

/** Respawn when falling below this y. */
export const VOID_Y = -10;

// ─── Rendering ───────────────────────────────────────────────────────────────

export const SKY_COLOR = 0x87ceeb;
export const FOG_NEAR = 60;
export const FOG_FAR = 160;

// ─── Hotbar ──────────────────────────────────────────────────────────────────

/** Blocks available on the 9-slot hotbar (keys 1–9, mouse wheel). */
export const HOTBAR_BLOCKS: readonly number[] = [
  BLOCK.Grass,
  BLOCK.Dirt,
  BLOCK.Stone,
  BLOCK.Sand,
  BLOCK.Log,
  BLOCK.Leaves,
  BLOCK.Planks,
  BLOCK.Glass,
  BLOCK.Brick,
];
