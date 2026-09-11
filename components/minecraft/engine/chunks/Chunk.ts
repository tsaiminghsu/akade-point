/**
 * Minecraft Web Edition — Phase 1 · Steps 4–5
 * Chunk: a CHUNK_SIZE × WORLD_HEIGHT × CHUNK_SIZE column of voxels.
 */

import { CHUNK_SIZE, WORLD_HEIGHT } from '../../config';
import type { BlockId } from '../../types';
import { BLOCK } from '../blocks';

export function voxelIndex(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;
  /** Bumped on every edit so the renderer knows to re-mesh. */
  version = 0;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  }

  static inBounds(lx: number, y: number, lz: number): boolean {
    return (
      lx >= 0 && lx < CHUNK_SIZE &&
      lz >= 0 && lz < CHUNK_SIZE &&
      y >= 0 && y < WORLD_HEIGHT
    );
  }

  get(lx: number, y: number, lz: number): BlockId {
    if (!Chunk.inBounds(lx, y, lz)) return BLOCK.Air;
    return this.data[voxelIndex(lx, y, lz)];
  }

  set(lx: number, y: number, lz: number, id: BlockId): boolean {
    if (!Chunk.inBounds(lx, y, lz)) return false;
    const i = voxelIndex(lx, y, lz);
    if (this.data[i] === id) return false;
    this.data[i] = id;
    this.version++;
    return true;
  }

  /** Highest non-air y at a local column, or -1 when empty. */
  heightAt(lx: number, lz: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.data[voxelIndex(lx, y, lz)] !== BLOCK.Air) return y;
    }
    return -1;
  }
}
