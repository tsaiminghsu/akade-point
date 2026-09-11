/**
 * Minecraft Web Edition — Phase 1 · Step 3
 * Block registry.
 *
 * Blocks are identified by numeric ids stored in chunk voxel arrays.
 * Phase 1 renders with per-face vertex colors (no texture atlas yet).
 */

import type { BlockId, FaceName } from '../../types';
import { FACE_NORMALS } from '../../types';
import { hexToRgb } from '../../utils';

// ─── Block ids ───────────────────────────────────────────────────────────────

export const BLOCK = {
  Air: 0,
  Bedrock: 1,
  Stone: 2,
  Dirt: 3,
  Grass: 4,
  Sand: 5,
  Water: 6,
  Log: 7,
  Leaves: 8,
  Planks: 9,
  Glass: 10,
  Brick: 11,
} as const;

export type BlockName = keyof typeof BLOCK;

// ─── Definitions ─────────────────────────────────────────────────────────────

export interface BlockDef {
  id: BlockId;
  /** zh-TW display name (hotbar / debug). */
  name: string;
  /** Solid blocks collide with the player. */
  solid: boolean;
  /**
   * Transparent blocks (water, glass) render in the transparent pass and do
   * not hide neighboring transparent faces of a different type.
   */
  transparent: boolean;
  /** True if the block fully hides adjacent faces (opaque cube). */
  opaque: boolean;
  /** Whether the player is allowed to break it. */
  breakable: boolean;
  /** Per-face RGB color. */
  faces: Record<FaceName, [number, number, number]>;
}

/** Helper: same color on every face. */
function allFaces(hex: number): Record<FaceName, [number, number, number]> {
  const c = hexToRgb(hex);
  return { px: c, nx: c, py: c, ny: c, pz: c, nz: c };
}

/** Helper: distinct top / bottom / side colors (grass, log...). */
function topSideBottom(
  top: number,
  side: number,
  bottom: number,
): Record<FaceName, [number, number, number]> {
  const t = hexToRgb(top);
  const s = hexToRgb(side);
  const b = hexToRgb(bottom);
  return { px: s, nx: s, py: t, ny: b, pz: s, nz: s };
}

const AIR_FACES = allFaces(0x000000);

export const BLOCKS: readonly BlockDef[] = [
  { id: BLOCK.Air,    name: '空氣',   solid: false, transparent: true,  opaque: false, breakable: false, faces: AIR_FACES },
  { id: BLOCK.Bedrock,name: '基岩',   solid: true,  transparent: false, opaque: true,  breakable: false, faces: allFaces(0x3a3a3a) },
  { id: BLOCK.Stone,  name: '石頭',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: allFaces(0x8a8a8a) },
  { id: BLOCK.Dirt,   name: '泥土',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: allFaces(0x8a5f3c) },
  { id: BLOCK.Grass,  name: '草地',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: topSideBottom(0x63b53e, 0x7d9a4e, 0x8a5f3c) },
  { id: BLOCK.Sand,   name: '沙子',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: allFaces(0xe3d9a3) },
  { id: BLOCK.Water,  name: '水',     solid: false, transparent: true,  opaque: false, breakable: false, faces: allFaces(0x3f76e4) },
  { id: BLOCK.Log,    name: '原木',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: topSideBottom(0xb08d57, 0x6b532a, 0xb08d57) },
  { id: BLOCK.Leaves, name: '樹葉',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: allFaces(0x3e7d2c) },
  { id: BLOCK.Planks, name: '木板',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: allFaces(0xb08d57) },
  { id: BLOCK.Glass,  name: '玻璃',   solid: true,  transparent: true,  opaque: false, breakable: true,  faces: allFaces(0xcfe8ef) },
  { id: BLOCK.Brick,  name: '磚塊',   solid: true,  transparent: false, opaque: true,  breakable: true,  faces: allFaces(0x9c4f3d) },
];

const BY_ID = new Map<BlockId, BlockDef>(BLOCKS.map(b => [b.id, b]));

/** Look up a block definition; unknown ids behave like Air. */
export function getBlockDef(id: BlockId): BlockDef {
  return BY_ID.get(id) ?? BLOCKS[BLOCK.Air];
}

export function isOpaque(id: BlockId): boolean {
  return getBlockDef(id).opaque;
}

export function isTransparent(id: BlockId): boolean {
  return getBlockDef(id).transparent;
}

export function isSolid(id: BlockId): boolean {
  return getBlockDef(id).solid;
}

/** Face shade multipliers — fake baked AO so cubes read as 3D. */
export const FACE_SHADE: Record<FaceName, number> = {
  py: 1.0,
  ny: 0.55,
  px: 0.8,
  nx: 0.8,
  pz: 0.7,
  nz: 0.7,
};

export const ALL_FACES = Object.keys(FACE_NORMALS) as FaceName[];
