'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * RAF-driven hook that wires together Collector → Cache → Renderer.
 *
 * Update policy (performance contract):
 *   A full canvas redraw is triggered only when at least one of:
 *     (a) Player has moved more than MOVE_THRESHOLD blocks since last draw
 *     (b) At least one loaded chunk's version differs from the cache entry
 *
 *   Between those events the RAF loop costs ≈ 64 Map lookups + a few
 *   arithmetic operations per frame — negligible compared to the 3-D render.
 *
 *   Player position and yaw are read from useMinecraftStore.getState() (not
 *   via reactive subscription) to avoid React re-renders on every store tick.
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { World } from '../engine/chunks';
import { MiniMapTextureCache }    from '../services/MiniMapTextureCache';
import { MiniMapChunkCollector }  from '../services/MiniMapChunkCollector';
import { MiniMapRenderer }        from '../services/MiniMapRenderer';
import { useMiniMapStore }        from '../stores/minimap.store';
import { useMinecraftStore }      from '../stores';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 256;

/**
 * Minimum player displacement (in world blocks) between redraws.
 * Keeps the compass and position from updating faster than necessary.
 * Set to 0 to redraw on every dirty-chunk event regardless of movement.
 */
const MOVE_THRESHOLD = 0.5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMiniMapResult {
  /** Attach this ref to a <canvas> element. */
  canvasRef: RefObject<HTMLCanvasElement>;
}

export function useMiniMap(world: World): UseMiniMapResult {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rendererRef  = useRef<MiniMapRenderer | null>(null);
  const cacheRef     = useRef(new MiniMapTextureCache());
  const collectorRef = useRef(new MiniMapChunkCollector());

  // Last player position that triggered a redraw
  const lastDrawPos = useRef({ x: -Infinity, z: -Infinity });

  // cancelAnimationFrame handle
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    rendererRef.current = new MiniMapRenderer(canvas);

    // ── RAF loop ──────────────────────────────────────────────────────────────
    const loop = (): void => {
      rafRef.current = requestAnimationFrame(loop);

      // Read store state without subscribing (zero re-render cost)
      const miniMapState = useMiniMapStore.getState();
      if (!miniMapState.enabled) return;

      const gameDebug = useMinecraftStore.getState().debug;
      const transform = {
        x:   gameDebug.x,
        z:   gameDebug.z,
        yaw: gameDebug.yaw,
      };

      // ── Dirty checks ───────────────────────────────────────────────────────

      const dx = Math.abs(transform.x - lastDrawPos.current.x);
      const dz = Math.abs(transform.z - lastDrawPos.current.z);
      const playerMoved = Math.hypot(dx, dz) > MOVE_THRESHOLD;

      const chunks = collectorRef.current.collectAll(world);

      // Check stale chunks WITHOUT consuming world.consumeDirty()
      // isStale() increments cache hit/miss counters as a side-effect,
      // so we reset them after reading.
      const hasStaleChunk = chunks.some(c =>
        cacheRef.current.isStale(c.cx, c.cz, c.version),
      );

      // Discard the hit/miss counts from the probe; they'll be re-counted
      // during refreshCache() below if a redraw is needed.
      cacheRef.current.resetCounters();

      if (!playerMoved && !hasStaleChunk) return;

      // ── Rebuild stale canvases ─────────────────────────────────────────────
      const { rendered } = collectorRef.current.refreshCache(chunks, cacheRef.current);
      lastDrawPos.current = { x: transform.x, z: transform.z };

      // ── Render ────────────────────────────────────────────────────────────
      const debugInfo = rendererRef.current!.render(
        world,
        transform,
        cacheRef.current,
        miniMapState,
        chunks.length,
        rendered,
      );

      // Publish debug info to store (triggers UI update, not canvas re-render)
      useMiniMapStore.getState().setDebug(debugInfo);

      // Reset counters for next cycle
      cacheRef.current.resetCounters();
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current = null;
      // Clear cache on unmount so a remount rebuilds from scratch
      cacheRef.current.clear();
    };
  }, [world]);

  return { canvasRef };
}
