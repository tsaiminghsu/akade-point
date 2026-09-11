import { describe, it, expect } from 'vitest';
import { World } from './World';
import { BLOCK } from '../blocks';
import {
  CHUNK_SIZE,
  WORLD_CHUNKS_X,
  WORLD_CHUNKS_Z,
  WORLD_HEIGHT,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
} from '../../config';

describe('World', () => {
  it('creates the full bounded world and marks all chunks dirty', () => {
    const w = new World();
    expect(w.chunks.size).toBe(WORLD_CHUNKS_X * WORLD_CHUNKS_Z);
    expect(w.consumeDirty()).toHaveLength(WORLD_CHUNKS_X * WORLD_CHUNKS_Z);
    expect(w.consumeDirty()).toHaveLength(0);
  });

  it('reads/writes blocks across chunk borders', () => {
    const w = new World();
    w.consumeDirty();
    expect(w.setBlock(0, 40, 0, BLOCK.Glass)).toBe(true);
    expect(w.getBlock(0, 40, 0)).toBe(BLOCK.Glass);
    expect(w.setBlock(CHUNK_SIZE, 40, 0, BLOCK.Brick)).toBe(true);
    expect(w.getBlock(CHUNK_SIZE, 40, 0)).toBe(BLOCK.Brick);
  });

  it('marks neighboring chunks dirty on border edits', () => {
    const w = new World();
    w.consumeDirty();

    // Interior edit: only the owning chunk.
    w.setBlock(8, 40, 8, BLOCK.Stone);
    expect(w.consumeDirty().sort()).toEqual(['0,0']);

    // Edge edit (lx = 15): neighbor chunk (1,0) is affected too.
    w.setBlock(CHUNK_SIZE - 1, 40, 8, BLOCK.Stone);
    expect(w.consumeDirty().sort()).toEqual(['0,0', '1,0']);

    // Corner of the world: the out-of-world neighbor is dropped.
    w.setBlock(0, 40, 0, BLOCK.Stone);
    expect(w.consumeDirty()).toEqual(['0,0']);
  });

  it('rejects writes outside the world', () => {
    const w = new World();
    expect(w.setBlock(-1, 40, 0, BLOCK.Stone)).toBe(false);
    expect(w.setBlock(0, WORLD_HEIGHT, 0, BLOCK.Stone)).toBe(false);
    expect(w.setBlock(WORLD_SIZE_X, 40, 0, BLOCK.Stone)).toBe(false);
    expect(w.setBlock(0, 40, WORLD_SIZE_Z, BLOCK.Stone)).toBe(false);
    expect(w.getBlock(-5, 40, 0)).toBe(BLOCK.Air);
  });

  it('world borders are solid for physics', () => {
    const w = new World();
    expect(w.isSolid(-1, 30, 30)).toBe(true);
    expect(w.isSolid(WORLD_SIZE_X, 30, 30)).toBe(true);
    expect(w.isSolid(30, -1, 30)).toBe(true);
    expect(w.isSolid(30, WORLD_HEIGHT, 30)).toBe(false);
  });

  it('spawn point is inside the world above ground', () => {
    const w = new World();
    const s = w.spawnPoint();
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(WORLD_SIZE_X);
    expect(s.z).toBeGreaterThan(0);
    expect(s.z).toBeLessThan(WORLD_SIZE_Z);
    expect(s.y).toBeGreaterThan(1);
    expect(s.y).toBeLessThan(WORLD_HEIGHT);
  });
});
