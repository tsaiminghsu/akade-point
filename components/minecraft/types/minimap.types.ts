'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * All domain types for the MiniMap system.
 *
 * Design principles:
 * - Interfaces describe shape only; no runtime dependency on THREE or R3F
 * - Extensibility hooks (Waypoint, EntityMarker) are typed but not yet implemented
 */

// ─── Theme ────────────────────────────────────────────────────────────────────

/** Visual theme for the MiniMap. Only 'classic' is implemented in Phase 9. */
export type MiniMapTheme = 'classic' | 'dark' | 'satellite';

// ─── Zoom ─────────────────────────────────────────────────────────────────────

/** Allowed zoom levels. Maps to a multiplier applied to the base view radius. */
export type MiniMapZoom = 1 | 1.5 | 2;

// ─── Core State ───────────────────────────────────────────────────────────────

/** Serialisable display settings stored in MiniMapStore. */
export interface MiniMapState {
  enabled: boolean;
  zoom: MiniMapZoom;
  showChunkBorder: boolean;
  showPlayer: boolean;
  showCompass: boolean;
  theme: MiniMapTheme;
  /** Canvas-level opacity, 0–1. */
  opacity: number;
}

// ─── Debug ────────────────────────────────────────────────────────────────────

/** Runtime diagnostics emitted by MiniMapRenderer after each render pass. */
export interface MiniMapDebugInfo {
  /** Effective minimap render frequency over the last second. */
  fps: number;
  /** Total loaded chunks passed to the collector. */
  visibleChunks: number;
  /** Chunks whose canvas was rebuilt this frame (cache miss). */
  renderedChunks: number;
  /** Canvas2D draw time in milliseconds. */
  updateTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * One cached entry per chunk: a pre-drawn CHUNK_SIZE×CHUNK_SIZE canvas
 * and the chunk version it was built from.
 *
 * `version` mirrors `Chunk.version` — if they differ the entry is stale.
 * We use the chunk's own version counter instead of consuming world.dirty()
 * so the 3-D WorldRenderer's dirty-set is not disturbed.
 */
export interface ChunkSurfaceCache {
  /** Off-screen canvas holding the top-down surface image. */
  canvas: HTMLCanvasElement;
  /** Chunk.version at the time this canvas was built. */
  version: number;
}

// ─── Player Transform ─────────────────────────────────────────────────────────

/** Lightweight player state read by the MiniMap each RAF tick. */
export interface PlayerTransform {
  x: number;
  z: number;
  /** Camera yaw in radians (PlayerController look.yaw convention: 0 = -Z / north). */
  yaw: number;
}

// ─── Future Extension Points ──────────────────────────────────────────────────

/** A named location pin. Not rendered in Phase 9. */
export interface MiniMapWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  /** CSS colour string, e.g. '#ff4444'. */
  color: string;
}

/** A dynamic entity marker. Not rendered in Phase 9. */
export interface MiniMapEntityMarker {
  id: string;
  x: number;
  z: number;
  type: 'player' | 'mob' | 'npc';
}

/**
 * Public API surface exposed by useMiniMap hook (and potentially via store).
 * All methods operate in world-space coordinates.
 */
export interface MiniMapApi {
  /** Convert a world (x, z) to canvas pixel coordinates, or null if outside view. */
  worldToMiniMap(worldX: number, worldZ: number): { x: number; y: number } | null;
  /** Convert a canvas pixel to approximate world (x, z). */
  miniMapToWorld(mapX: number, mapY: number): { x: number; z: number };
}
