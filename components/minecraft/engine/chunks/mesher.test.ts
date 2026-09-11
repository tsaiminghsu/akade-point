import { describe, it, expect } from 'vitest';
import { meshChunk } from './mesher';
import type { BlockSource } from './mesher';
import { BLOCK } from '../blocks';
import type { BlockId } from '../../types';

/** Synthetic world: only the listed voxels exist, everything else is Air. */
function fakeWorld(blocks: Array<[number, number, number, BlockId]>): BlockSource {
  const map = new Map<string, BlockId>();
  for (const [x, y, z, id] of blocks) map.set(`${x},${y},${z}`, id);
  return { getBlock: (x, y, z) => map.get(`${x},${y},${z}`) ?? BLOCK.Air };
}

function quadWindingMatchesNormals(data: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}): boolean {
  for (let i = 0; i < data.indices.length; i += 6) {
    const [a, b, c] = [data.indices[i], data.indices[i + 1], data.indices[i + 2]];
    const p = (v: number) => [data.positions[v * 3], data.positions[v * 3 + 1], data.positions[v * 3 + 2]];
    const [ax, ay, az] = p(a);
    const [bx, by, bz] = p(b);
    const [cx, cy, cz] = p(c);
    // cross(b - a, c - a)
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const dot =
      nx * data.normals[a * 3] + ny * data.normals[a * 3 + 1] + nz * data.normals[a * 3 + 2];
    if (dot <= 0) return false; // face points away from its normal
  }
  return true;
}

describe('mesher', () => {
  it('a lone block emits exactly 6 faces / 24 vertices / 36 indices', () => {
    const geo = meshChunk(fakeWorld([[5, 30, 5, BLOCK.Stone]]), 0, 0);
    expect(geo.opaque.positions).toHaveLength(24 * 3);
    expect(geo.opaque.indices).toHaveLength(36);
    expect(geo.transparent.indices).toHaveLength(0);
  });

  it('quad winding is CCW toward the face normal', () => {
    const geo = meshChunk(fakeWorld([[5, 30, 5, BLOCK.Grass]]), 0, 0);
    expect(quadWindingMatchesNormals(geo.opaque)).toBe(true);
  });

  it('shared faces between two opaque blocks are culled', () => {
    const geo = meshChunk(
      fakeWorld([
        [5, 30, 5, BLOCK.Stone],
        [6, 30, 5, BLOCK.Stone],
      ]),
      0,
      0,
    );
    // 12 faces - 2 shared = 10 quads.
    expect(geo.opaque.indices).toHaveLength(10 * 6);
  });

  it('a fully buried block emits nothing', () => {
    const blocks: Array<[number, number, number, BlockId]> = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          blocks.push([8 + dx, 30 + dy, 8 + dz, BLOCK.Stone]);
    const geo = meshChunk(fakeWorld(blocks), 0, 0);
    // The center block contributes 0 faces; only the 3×3×3 hull shows:
    // 6 sides × 9 faces = 54 quads.
    expect(geo.opaque.indices).toHaveLength(54 * 6);
  });

  it('water uses the transparent pass and culls internal faces', () => {
    const geo = meshChunk(
      fakeWorld([
        [5, 30, 5, BLOCK.Water],
        [6, 30, 5, BLOCK.Water],
      ]),
      0,
      0,
    );
    expect(geo.opaque.indices).toHaveLength(0);
    expect(geo.transparent.indices).toHaveLength(10 * 6);
  });

  it('different transparent types keep their shared face', () => {
    const geo = meshChunk(
      fakeWorld([
        [5, 30, 5, BLOCK.Water],
        [6, 30, 5, BLOCK.Glass],
      ]),
      0,
      0,
    );
    expect(geo.transparent.indices).toHaveLength(12 * 6);
  });

  it('only meshes within the requested chunk', () => {
    // Block lives in chunk (1,0); meshing chunk (0,0) must be empty.
    const geo = meshChunk(fakeWorld([[20, 30, 5, BLOCK.Stone]]), 0, 0);
    expect(geo.opaque.indices).toHaveLength(0);
    const geo1 = meshChunk(fakeWorld([[20, 30, 5, BLOCK.Stone]]), 1, 0);
    expect(geo1.opaque.indices).toHaveLength(36);
  });
});
