'use client';

/**
 * Minecraft Web Edition — Phase 1 · Step 8
 * UI-facing game state (zustand). Voxel data lives in World, not here.
 */

import { create } from 'zustand';

export interface DebugInfo {
  fps: number;
  x: number;
  y: number;
  z: number;
  /** Camera yaw in radians (PlayerController look.yaw convention). Used by MiniMap. */
  yaw: number;
}

interface MinecraftUIState {
  /** Pointer is locked to the canvas (game has focus). */
  locked: boolean;
  /** Selected hotbar slot 0–8. */
  selectedSlot: number;
  flying: boolean;
  debug: DebugInfo;

  setLocked: (locked: boolean) => void;
  setSelectedSlot: (slot: number) => void;
  toggleFlying: () => void;
  setDebug: (debug: DebugInfo) => void;
}

export const useMinecraftStore = create<MinecraftUIState>(set => ({
  locked: false,
  selectedSlot: 0,
  flying: false,
  debug: { fps: 0, x: 0, y: 0, z: 0, yaw: 0 },

  setLocked: locked => set({ locked }),
  setSelectedSlot: slot => set({ selectedSlot: ((slot % 9) + 9) % 9 }),
  toggleFlying: () => set(s => ({ flying: !s.flying })),
  setDebug: debug => set({ debug }),
}));
