/**
 * Minecraft Web Edition — Phase 1 · Step 7
 * Voxel raycast (Amanatides & Woo DDA). Pure — no three.js.
 */

import type { BlockSource } from '../engine/chunks';
import { getBlockDef } from '../engine/blocks';
import type { RaycastHit } from '../types';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * March a ray through the voxel grid until it enters a solid block
 * (water is not targetable) or `maxDist` is exceeded.
 */
export function raycastVoxel(
  source: BlockSource,
  origin: Vec3Like,
  dir: Vec3Like,
  maxDist: number,
): RaycastHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  // Distance along the ray to the first voxel boundary on each axis.
  const distToBoundary = (o: number, d: number, cell: number) => {
    if (d > 0) return (cell + 1 - o) * Math.abs(1 / d);
    if (d < 0) return (o - cell) * Math.abs(1 / d);
    return Infinity;
  };

  let tMaxX = distToBoundary(origin.x, dir.x, x);
  let tMaxY = distToBoundary(origin.y, dir.y, y);
  let tMaxZ = distToBoundary(origin.z, dir.z, z);

  // The block containing the origin may itself be a hit.
  if (getBlockDef(source.getBlock(x, y, z)).solid) {
    return { block: { x, y, z }, normal: { x: 0, y: 0, z: 0 }, distance: 0 };
  }

  let normal = { x: 0, y: 0, z: 0 };
  let t = 0;

  while (t <= maxDist) {
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY <= tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = { x: 0, y: 0, z: -stepZ };
    }
    if (t > maxDist) return null;
    if (getBlockDef(source.getBlock(x, y, z)).solid) {
      return { block: { x, y, z }, normal, distance: t };
    }
  }
  return null;
}
