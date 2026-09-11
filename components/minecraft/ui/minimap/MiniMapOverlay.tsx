'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Circular container that clips its children into a round minimap shape.
 *
 * Responsibilities:
 *   - Fixed 220 × 220 px size (configurable via SIZE constant)
 *   - border-radius: 50% + overflow: hidden → circular clip mask
 *   - Dark border + drop shadow for visual separation from the 3-D scene
 *   - opacity forwarded from MiniMapStore so the user can dim the overlay
 *
 * Children are rendered at position: absolute / inset-0 so they fill
 * the circle completely (MiniMapCanvas does this automatically).
 */

import type { ReactNode } from 'react';

/** Rendered diameter in CSS pixels. */
const SIZE = 220;

interface MiniMapOverlayProps {
  children: ReactNode;
  opacity: number;
}

export function MiniMapOverlay({ children, opacity }: MiniMapOverlayProps) {
  return (
    <div
      style={{
        width:        SIZE,
        height:       SIZE,
        borderRadius: '50%',
        overflow:     'hidden',
        opacity,
      }}
      className="relative border border-white/20 bg-black/40 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
    >
      {children}
    </div>
  );
}
