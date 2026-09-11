/**
 * Minecraft Web Edition — Phase 1 · Steps 4–5
 * Chunk mesher: naive per-face culling into two vertex-color geometries
 * (opaque + transparent). Neighbor lookups cross chunk borders via World,
 * so there are no seams. Greedy meshing is reserved for Phase 2.
 */

import { CHUNK_SIZE, WORLD_HEIGHT } from '../../config';
import type { BlockId, ChunkMeshData, FaceName } from '../../types';
import { ALL_FACES, BLOCK, FACE_SHADE, getBlockDef } from '../blocks';

/** Minimal voxel reader — `World` satisfies this, tests can fake it. */
export interface BlockSource {
  getBlock(x: number, y: number, z: number): BlockId;
}

interface FaceCorner {
  /** Corner offset within the unit cube. */
  pos: readonly [number, number, number];
}

/**
 * Quad corners per face, wound counter-clockwise when viewed from outside
 * (right-handed coords, CCW front faces — three.js default).
 */
const FACE_QUADS: Record<FaceName, { dir: readonly [number, number, number]; corners: FaceCorner[] }> = {
  px: { dir: [1, 0, 0],  corners: [{ pos: [1, 0, 1] }, { pos: [1, 0, 0] }, { pos: [1, 1, 0] }, { pos: [1, 1, 1] }] },
  nx: { dir: [-1, 0, 0], corners: [{ pos: [0, 0, 0] }, { pos: [0, 0, 1] }, { pos: [0, 1, 1] }, { pos: [0, 1, 0] }] },
  py: { dir: [0, 1, 0],  corners: [{ pos: [0, 1, 1] }, { pos: [1, 1, 1] }, { pos: [1, 1, 0] }, { pos: [0, 1, 0] }] },
  ny: { dir: [0, -1, 0], corners: [{ pos: [0, 0, 0] }, { pos: [1, 0, 0] }, { pos: [1, 0, 1] }, { pos: [0, 0, 1] }] },
  pz: { dir: [0, 0, 1],  corners: [{ pos: [0, 0, 1] }, { pos: [1, 0, 1] }, { pos: [1, 1, 1] }, { pos: [0, 1, 1] }] },
  nz: { dir: [0, 0, -1], corners: [{ pos: [1, 0, 0] }, { pos: [0, 0, 0] }, { pos: [0, 1, 0] }, { pos: [1, 1, 0] }] },
};

class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  addFace(x: number, y: number, z: number, face: FaceName, id: BlockId): void {
    const quad = FACE_QUADS[face];
    const def = getBlockDef(id);
    const shade = FACE_SHADE[face];
    const [r, g, b] = def.faces[face];
    const base = this.positions.length / 3;

    for (const { pos } of quad.corners) {
      this.positions.push(x + pos[0], y + pos[1], z + pos[2]);
      this.normals.push(quad.dir[0], quad.dir[1], quad.dir[2]);
      this.colors.push(r * shade, g * shade, b * shade);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): ChunkMeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** Should `id`'s face toward `neighbor` be drawn? */
function faceVisible(id: BlockId, neighbor: BlockId): boolean {
  if (neighbor === BLOCK.Air) return true;
  const def = getBlockDef(id);
  const nDef = getBlockDef(neighbor);
  if (nDef.opaque) return false;
  // Transparent-against-transparent: only draw between different types so
  // e.g. a water body has no internal faces.
  if (def.transparent && nDef.transparent && id === neighbor) return false;
  return true;
}

export interface ChunkGeometry {
  opaque: ChunkMeshData;
  transparent: ChunkMeshData;
}

export function meshChunk(world: BlockSource, cx: number, cz: number): ChunkGeometry {
  const opaque = new MeshBuilder();
  const transparent = new MeshBuilder();
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const id = world.getBlock(wx, y, wz);
        if (id === BLOCK.Air) continue;

        const def = getBlockDef(id);
        const builder = def.transparent ? transparent : opaque;

        for (const face of ALL_FACES) {
          const dir = FACE_QUADS[face].dir;
          const neighbor = world.getBlock(wx + dir[0], y + dir[1], wz + dir[2]);
          if (faceVisible(id, neighbor)) {
            builder.addFace(wx, y, wz, face, id);
          }
        }
      }
    }
  }

  return { opaque: opaque.build(), transparent: transparent.build() };
}
