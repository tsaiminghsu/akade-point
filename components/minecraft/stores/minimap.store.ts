'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Zustand store for all MiniMap display settings and runtime debug info.
 *
 * Single source of truth for:
 *   - User-facing toggles (enabled, zoom, showChunkBorder, …)
 *   - Runtime diagnostics emitted by MiniMapRenderer
 *
 * Intentionally decoupled from world data and player state.
 */

import { create } from 'zustand';
import type {
  MiniMapState,
  MiniMapDebugInfo,
  MiniMapTheme,
  MiniMapZoom,
} from '../types/minimap.types';

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface MiniMapStoreState extends MiniMapState {
  debug: MiniMapDebugInfo;

  // ── Actions ──
  toggle: () => void;
  setEnabled: (v: boolean) => void;
  setZoom: (v: MiniMapZoom) => void;
  cycleZoom: () => void;
  toggleChunkBorder: () => void;
  togglePlayer: () => void;
  toggleCompass: () => void;
  setTheme: (v: MiniMapTheme) => void;
  setOpacity: (v: number) => void;
  setDebug: (d: MiniMapDebugInfo) => void;
}

// ─── Zoom Cycle Order ─────────────────────────────────────────────────────────

const ZOOM_CYCLE: MiniMapZoom[] = [1, 1.5, 2];

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMiniMapStore = create<MiniMapStoreState>(set => ({
  // Default display settings
  enabled: true,
  zoom: 1,
  showChunkBorder: false,
  showPlayer: true,
  showCompass: true,
  theme: 'classic',
  opacity: 0.9,

  // Initial debug snapshot (all zeros until first render)
  debug: {
    fps: 0,
    visibleChunks: 0,
    renderedChunks: 0,
    updateTimeMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
  },

  // ── Actions ────────────────────────────────────────────────────────────────

  toggle: () => set(s => ({ enabled: !s.enabled })),
  setEnabled: enabled => set({ enabled }),

  setZoom: zoom => set({ zoom }),
  cycleZoom: () =>
    set(s => {
      const idx = ZOOM_CYCLE.indexOf(s.zoom);
      return { zoom: ZOOM_CYCLE[(idx + 1) % ZOOM_CYCLE.length] };
    }),

  toggleChunkBorder: () => set(s => ({ showChunkBorder: !s.showChunkBorder })),
  togglePlayer: () => set(s => ({ showPlayer: !s.showPlayer })),
  toggleCompass: () => set(s => ({ showCompass: !s.showCompass })),

  setTheme: theme => set({ theme }),
  setOpacity: opacity => set({ opacity: Math.max(0, Math.min(1, opacity)) }),

  setDebug: debug => set({ debug }),
}));
