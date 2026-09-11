/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Collects visible chunks from the World and builds/refreshes their
 * top-surface canvas textures in the TextureCache.
 *
 * Performance contract:
 *   - Never calls world.consumeDirty() — that belongs to WorldRenderer.
 *   - buildChunkCanvas() is only invoked when cache.isStale() returns true
 *     (i.e. Chunk.version changed), so chunks that haven't been edited
 *     incur zero per-frame cost beyond a single Map lookup.
 *   - Each canvas is CHUNK_SIZE×CHUNK_SIZE pixels (16×16).  The renderer
 *     scales it to the correct screen size via ctx.drawImage().
 */

import type { World } from '../engine/chunks';
import type { Chunk } from '../engine/chunks/Chunk';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { BLOCK, getBlockDef } from '../engine/blocks';
import type { MiniMapTextureCache } from './MiniMapTextureCache';

// ─── Collector ────────────────────────────────────────────────────────────────

export class MiniMapChunkCollector {

  // ── Collection ──────────────────────────────────────────────────────────────

  /** Return every loaded chunk (Phase 9: whole world is always loaded). */
  collectAll(world: World): Chunk[] {
    return Array.from(world.chunks.values());
  }

  /**
   * Return only the chunks within `radiusChunks` of the player's chunk.
   * Useful for future Infinite World / Chunk Streaming phases.
   */
  collectVisible(
    world: World,
    playerX: number,
    playerZ: number,
    radiusChunks: number,
  ): Chunk[] {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const result: Chunk[] = [];
    for (const chunk of world.chunks.values()) {
      if (
        Math.abs(chunk.cx - pcx) <= radiusChunks &&
        Math.abs(chunk.cz - pcz) <= radiusChunks
      ) {
        result.push(chunk);
      }
    }
    return result;
  }

  // ── Canvas Building ─────────────────────────────────────────────────────────

  /**
   * Rasterise a chunk's top surface into a CHUNK_SIZE×CHUNK_SIZE canvas.
   *
   * Algorithm:
   *   For each (lx, lz) column in local chunk space:
   *     1. Find highest non-Air block via Chunk.heightAt().
   *     2. Sample the block's top-face RGB from its BlockDef.
   *     3. Apply a simple height-based shade so hills look brighter.
   *     4. Write RGBA into ImageData, then putImageData onto an off-screen canvas.
   *
   * The resulting HTMLCanvasElement is stored in the cache and later drawn
   * with ctx.drawImage() (which handles scaling and clipping cheaply).
   */
  buildChunkCanvas(chunk: Chunk): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width  = CHUNK_SIZE;
    canvas.height = CHUNK_SIZE;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
    const data = imageData.data;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const pixelIndex = (lz * CHUNK_SIZE + lx) * 4;
        const h = chunk.heightAt(lx, lz);

        if (h < 0) {
          // Empty column — leave transparent
          data[pixelIndex + 3] = 0;
          continue;
        }

        const blockId = chunk.get(lx, h, lz);

        if (blockId === BLOCK.Air) {
          data[pixelIndex + 3] = 0;
          continue;
        }

        // faces.py values are 0–1 floats (hexToRgb convention); scale to 0–255
        const [r, g, b] = getBlockDef(blockId).faces.py;

        // Height shading: darker in valleys, brighter on peaks (range 0.35–1.0)
        const shade = 0.35 + 0.65 * (h / WORLD_HEIGHT);

        data[pixelIndex]     = Math.round(r * 255 * shade);
        data[pixelIndex + 1] = Math.round(g * 255 * shade);
        data[pixelIndex + 2] = Math.round(b * 255 * shade);
        data[pixelIndex + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // ── Cache Refresh ───────────────────────────────────────────────────────────

  /**
   * Walk every chunk in `chunks` and rebuild its canvas only when stale.
   * Returns the number of canvases actually rebuilt this call (cache misses).
   */
  refreshCache(chunks: Chunk[], cache: MiniMapTextureCache): { rendered: number } {
    let rendered = 0;
    for (const chunk of chunks) {
      if (cache.isStale(chunk.cx, chunk.cz, chunk.version)) {
        const canvas = this.buildChunkCanvas(chunk);
        cache.set(chunk.cx, chunk.cz, { canvas, version: chunk.version });
        rendered++;
      }
    }
    return { rendered };
  }
}
