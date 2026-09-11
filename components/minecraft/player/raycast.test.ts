import { describe, it, expect } from 'vitest';
import { raycastVoxel } from './raycast';
import { BLOCK } from '../engine/blocks';
import type { BlockSource } from '../engine/chunks';
import type { BlockId } from '../types';

function fakeWorld(blocks: Array<[number, number, number, BlockId]>): BlockSource {
  const map = new Map<string, BlockId>();
  for (const [x, y, z, id] of blocks) map.set(`${x},${y},${z}`, id);
  return { getBlock: (x, y, z) => map.get(`${x},${y},${z}`) ?? BLOCK.Air };
}

describe('raycastVoxel', () => {
  it('hits a block straight ahead with the correct face normal', () => {
    const world = fakeWorld([[5, 10, 5, BLOCK.Stone]]);
    const hit = raycastVoxel(world, { x: 2.5, y: 10.5, z: 5.5 }, { x: 1, y: 0, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.block).toEqual({ x: 5, y: 10, z: 5 });
    expect(hit!.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(hit!.distance).toBeCloseTo(2.5);
  });

  it('hits downward with +y normal (standing on ground)', () => {
    const world = fakeWorld([[3, 8, 3, BLOCK.Grass]]);
    const hit = raycastVoxel(world, { x: 3.5, y: 12, z: 3.5 }, { x: 0, y: -1, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.block).toEqual({ x: 3, y: 8, z: 3 });
    expect(hit!.normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('hits along a diagonal ray', () => {
    const world = fakeWorld([[7, 10, 7, BLOCK.Brick]]);
    const hit = raycastVoxel(
      world,
      { x: 4.5, y: 10.5, z: 4.5 },
      { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
      10,
    );
    expect(hit).not.toBeNull();
    expect(hit!.block).toEqual({ x: 7, y: 10, z: 7 });
  });

  it('returns null when nothing is within reach', () => {
    const world = fakeWorld([[50, 10, 5, BLOCK.Stone]]);
    expect(raycastVoxel(world, { x: 2.5, y: 10.5, z: 5.5 }, { x: 1, y: 0, z: 0 }, 6)).toBeNull();
    expect(raycastVoxel(world, { x: 2.5, y: 10.5, z: 5.5 }, { x: -1, y: 0, z: 0 }, 60)).toBeNull();
  });

  it('passes through water (non-targetable) and hits the solid behind it', () => {
    const world = fakeWorld([
      [4, 10, 5, BLOCK.Water],
      [6, 10, 5, BLOCK.Stone],
    ]);
    const hit = raycastVoxel(world, { x: 2.5, y: 10.5, z: 5.5 }, { x: 1, y: 0, z: 0 }, 10);
    expect(hit!.block).toEqual({ x: 6, y: 10, z: 5 });
  });

  it('reports a hit when the origin is inside a solid block', () => {
    const world = fakeWorld([[2, 10, 5, BLOCK.Stone]]);
    const hit = raycastVoxel(world, { x: 2.5, y: 10.5, z: 5.5 }, { x: 1, y: 0, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBe(0);
  });
});
