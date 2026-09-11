/**
 * Minecraft Web Edition — Phase 1 · Steps 4–5
 * Terrain generation: deterministic value-noise heightmap, layered strata,
 * sea-level water, beaches and scattered trees.
 */

import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, WORLD_SEED } from '../../config';
import { clamp, hash2, valueNoise2 } from '../../utils';
import { BLOCK } from '../blocks';
import { Chunk } from './Chunk';

const SEED_TERRAIN = WORLD_SEED;
const SEED_TREE = WORLD_SEED ^ 0x9e3779b9;

/** Terrain surface height (top solid block y) at a world column. */
export function terrainHeight(x: number, z: number): number {
  // Tuned so ~15% of columns dip below SEA_LEVEL (measured over the world).
  const base = 22;
  const n1 = valueNoise2(x, z, 1 / 48, SEED_TERRAIN) * 18; // rolling hills
  const n2 = valueNoise2(x, z, 1 / 16, SEED_TERRAIN ^ 0x51f) * 6; // detail
  const n3 = valueNoise2(x, z, 1 / 7, SEED_TERRAIN ^ 0xa33) * 2; // micro relief
  const h = Math.round(base + n1 + n2 + n3 - 12);
  return clamp(h, 4, WORLD_HEIGHT - 12);
}

/** Deterministic tree candidate at a world column. */
function hasTree(x: number, z: number): boolean {
  return hash2(x, z, SEED_TREE) < 0.012;
}

function trunkHeight(x: number, z: number): number {
  return 4 + Math.floor(hash2(x, z, SEED_TREE ^ 0x7ee) * 3); // 4–6
}

/** Place a tree's blocks into `chunk`, clipped to its local bounds. */
function plantTree(chunk: Chunk, treeX: number, treeZ: number, groundY: number): void {
  const trunk = trunkHeight(treeX, treeZ);
  const topY = groundY + trunk;

  const put = (wx: number, y: number, wz: number, id: number, onlyAir: boolean) => {
    const lx = wx - chunk.cx * CHUNK_SIZE;
    const lz = wz - chunk.cz * CHUNK_SIZE;
    if (!Chunk.inBounds(lx, y, lz)) return;
    if (onlyAir && chunk.get(lx, y, lz) !== BLOCK.Air) return;
    chunk.set(lx, y, lz, id);
  };

  // Canopy: 2 layers of radius 2, then 2 layers of radius 1.
  for (let dy = -2; dy <= 1; dy++) {
    const y = topY + dy;
    const r = dy <= -1 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        // Trim corners on the wide layers for a rounder shape.
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) {
          if (hash2(treeX + dx, treeZ + dz, SEED_TREE ^ 0x1eaf) < 0.5) continue;
        }
        put(treeX + dx, y, treeZ + dz, BLOCK.Leaves, true);
      }
    }
  }

  for (let y = groundY + 1; y <= topY; y++) {
    put(treeX, y, treeZ, BLOCK.Log, false);
  }
}

/** Fill a chunk with terrain. Deterministic for a given WORLD_SEED. */
export function generateChunk(chunk: Chunk): void {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const h = terrainHeight(wx, wz);
      const beach = h <= SEA_LEVEL + 1;

      chunk.set(lx, 0, lz, BLOCK.Bedrock);
      for (let y = 1; y <= h; y++) {
        let id: number;
        if (y >= h - 2 && beach) id = BLOCK.Sand;
        else if (y === h) id = BLOCK.Grass;
        else if (y >= h - 2) id = BLOCK.Dirt;
        else id = BLOCK.Stone;
        chunk.set(lx, y, lz, id);
      }
      for (let y = h + 1; y <= SEA_LEVEL; y++) {
        chunk.set(lx, y, lz, BLOCK.Water);
      }
    }
  }

  // Trees: candidates in this chunk plus a 2-block margin so canopies and
  // trunks from neighboring chunks are drawn consistently.
  for (let tx = baseX - 2; tx < baseX + CHUNK_SIZE + 2; tx++) {
    for (let tz = baseZ - 2; tz < baseZ + CHUNK_SIZE + 2; tz++) {
      if (!hasTree(tx, tz)) continue;
      const h = terrainHeight(tx, tz);
      if (h <= SEA_LEVEL + 1) continue; // no trees on beaches / in water
      plantTree(chunk, tx, tz, h);
    }
  }
}
