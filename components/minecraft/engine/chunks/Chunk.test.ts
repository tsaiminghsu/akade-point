import { describe, it, expect } from 'vitest';
import { Chunk, voxelIndex } from './Chunk';
import { BLOCK } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../config';

describe('Chunk', () => {
  it('starts filled with Air', () => {
    const c = new Chunk(0, 0);
    expect(c.get(0, 0, 0)).toBe(BLOCK.Air);
    expect(c.get(15, 63, 15)).toBe(BLOCK.Air);
  });

  it('get/set roundtrip and version bump', () => {
    const c = new Chunk(2, 3);
    expect(c.version).toBe(0);
    expect(c.set(4, 10, 7, BLOCK.Stone)).toBe(true);
    expect(c.get(4, 10, 7)).toBe(BLOCK.Stone);
    expect(c.version).toBe(1);
    // Setting the same value is a no-op.
    expect(c.set(4, 10, 7, BLOCK.Stone)).toBe(false);
    expect(c.version).toBe(1);
  });

  it('rejects out-of-bounds access', () => {
    const c = new Chunk(0, 0);
    expect(c.get(-1, 0, 0)).toBe(BLOCK.Air);
    expect(c.get(0, WORLD_HEIGHT, 0)).toBe(BLOCK.Air);
    expect(c.get(0, 0, CHUNK_SIZE)).toBe(BLOCK.Air);
    expect(c.set(16, 0, 0, BLOCK.Stone)).toBe(false);
    expect(c.set(0, -1, 0, BLOCK.Stone)).toBe(false);
  });

  it('voxelIndex maps (x, y, z) uniquely', () => {
    const seen = new Set<number>();
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          seen.add(voxelIndex(x, y, z));
        }
      }
    }
    expect(seen.size).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  });

  it('heightAt returns the highest non-air block', () => {
    const c = new Chunk(0, 0);
    expect(c.heightAt(3, 3)).toBe(-1);
    c.set(3, 10, 3, BLOCK.Dirt);
    c.set(3, 12, 3, BLOCK.Grass);
    expect(c.heightAt(3, 3)).toBe(12);
  });
});
