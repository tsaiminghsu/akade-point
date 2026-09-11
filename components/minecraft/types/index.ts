/**
 * Minecraft Web Edition — Phase 1 · Step 2
 * Shared domain types.
 */

/** Block identifier. 0 is always Air. */
export type BlockId = number;

/** Integer voxel coordinate in world space. */
export interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned face of a unit cube. */
export type FaceName = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

/** Unit normal for a face, keyed by face name. */
export const FACE_NORMALS: Record<FaceName, VoxelCoord> = {
  px: { x: 1, y: 0, z: 0 },
  nx: { x: -1, y: 0, z: 0 },
  py: { x: 0, y: 1, z: 0 },
  ny: { x: 0, y: -1, z: 0 },
  pz: { x: 0, y: 0, z: 1 },
  nz: { x: 0, y: 0, z: -1 },
};

/** CPU-side geometry produced by the chunk mesher. */
export interface ChunkMeshData {
  /** xyz vertex positions, 3 floats per vertex. */
  positions: Float32Array;
  /** xyz vertex normals, 3 floats per vertex. */
  normals: Float32Array;
  /** rgb vertex colors, 3 floats per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
}

/** Result of a voxel DDA raycast. */
export interface RaycastHit {
  /** Coordinates of the block that was hit. */
  block: VoxelCoord;
  /** Unit normal of the face that was entered. */
  normal: VoxelCoord;
  /** Distance from the ray origin to the hit point. */
  distance: number;
}
