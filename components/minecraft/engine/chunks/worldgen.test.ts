import { describe, it, expect } from 'vitest';
import { Chunk } from './Chunk';
import { generateChunk, terrainHeight } from './worldgen';
import { BLOCK } from '../blocks';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../../config';

describe('worldgen', () => {
  it('terrainHeight is deterministic and within clamp range', () => {
    for (const [x, z] of [[0, 0], [17, -5], [63, 120], [127, 127]]) {
      expect(terrainHeight(x, z)).toBe(terrainHeight(x, z));
      expect(terrainHeight(x, z)).toBeGreaterThanOrEqual(4);
      expect(terrainHeight(x, z)).toBeLessThanOrEqual(WORLD_HEIGHT - 12);
    }
  });

  it('generateChunk is deterministic', () => {
    const a = new Chunk(1, 2);
    const b = new Chunk(1, 2);
    generateChunk(a);
    generateChunk(b);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('bedrock covers y=0 and terrain reaches the surface height', () => {
    const c = new Chunk(3, 1);
    generateChunk(c);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        expect(c.get(lx, 0, lz)).toBe(BLOCK.Bedrock);
        const wx = c.cx * CHUNK_SIZE + lx;
        const wz = c.cz * CHUNK_SIZE + lz;
        const h = terrainHeight(wx, wz);
        // The surface block is never Air (it may be a tree trunk).
        expect(c.get(lx, h, lz)).not.toBe(BLOCK.Air);
        // Nothing above the water line except possible trees.
        if (h > SEA_LEVEL + 1) {
          expect(c.get(lx, SEA_LEVEL, lz)).not.toBe(BLOCK.Water);
        }
      }
    }
  });

  it('depressions below sea level are filled with water', () => {
    // Scan several chunks for at least one water block to prove seas exist.
    let foundWater = false;
    for (let cz = 0; cz < 8 && !foundWater; cz++) {
      for (let cx = 0; cx < 8 && !foundWater; cx++) {
        const c = new Chunk(cx, cz);
        generateChunk(c);
        for (let lx = 0; lx < CHUNK_SIZE && !foundWater; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE && !foundWater; lz++) {
            const h = terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
            if (h < SEA_LEVEL && c.get(lx, SEA_LEVEL, lz) === BLOCK.Water) {
              foundWater = true;
            }
          }
        }
      }
    }
    expect(foundWater).toBe(true);
  });
});
