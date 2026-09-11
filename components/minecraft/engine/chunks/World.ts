/**
 * Minecraft Web Edition — Phase 1 · Steps 4–5
 * World: a bounded grid of chunks with cross-chunk block access and
 * dirty-chunk tracking for incremental re-meshing.
 */

import {
  CHUNK_SIZE,
  WORLD_CHUNKS_X,
  WORLD_CHUNKS_Z,
  WORLD_HEIGHT,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
} from '../../config';
import type { BlockId } from '../../types';
import { chunkKey } from '../../utils';
import { BLOCK, getBlockDef } from '../blocks';
import { Chunk } from './Chunk';
import { generateChunk, terrainHeight } from './worldgen';

export class World {
  readonly chunks = new Map<string, Chunk>();
  private dirty = new Set<string>();

  constructor() {
    for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
        const chunk = new Chunk(cx, cz);
        generateChunk(chunk);
        this.chunks.set(chunkKey(cx, cz), chunk);
        this.dirty.add(chunkKey(cx, cz));
      }
    }
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** Read a block in world coords; outside the world reads as Air. */
  getBlock(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.Air;
    if (x < 0 || x >= WORLD_SIZE_X || z < 0 || z >= WORLD_SIZE_Z) return BLOCK.Air;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BLOCK.Air;
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  /**
   * Write a block in world coords. Marks the owning chunk (and any neighbor
   * sharing the edited face) dirty. Returns true when the world changed.
   */
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    if (x < 0 || x >= WORLD_SIZE_X || z < 0 || z >= WORLD_SIZE_Z) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return false;

    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (!chunk.set(lx, y, lz, id)) return false;

    this.dirty.add(chunkKey(cx, cz));
    if (lx === 0) this.dirty.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirty.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirty.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirty.add(chunkKey(cx, cz + 1));
    return true;
  }

  /** Solid for physics: like getBlock but world borders act as walls. */
  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (y >= WORLD_HEIGHT) return false;
    if (x < 0 || x >= WORLD_SIZE_X || z < 0 || z >= WORLD_SIZE_Z) return true;
    return getBlockDef(this.getBlock(x, y, z)).solid;
  }

  /** Surface height at a world column (generation function, ignores edits). */
  surfaceHeight(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  /** Spawn point: world center, one block above the surface. */
  spawnPoint(): { x: number; y: number; z: number } {
    const x = Math.floor(WORLD_SIZE_X / 2);
    const z = Math.floor(WORLD_SIZE_Z / 2);
    return { x: x + 0.5, y: this.surfaceHeight(x, z) + 1, z: z + 0.5 };
  }

  /** Take the current set of dirty chunk keys (clears the set). */
  consumeDirty(): string[] {
    if (this.dirty.size === 0) return [];
    const out = [...this.dirty].filter(k => this.chunks.has(k));
    this.dirty.clear();
    return out;
  }

  /** Keys of all chunks (stable order). */
  allChunkKeys(): string[] {
    return [...this.chunks.keys()];
  }
}

export function createWorld(): World {
  return new World();
}
