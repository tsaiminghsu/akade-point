'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Compass HTML overlay — reserved for Phase 10+.
 *
 * In Phase 9 the N/E/S/W labels are rendered directly onto the Canvas2D
 * by MiniMapRenderer.drawCompass().  This component exists as a typed
 * extension point for future HTML-layer compass UI (e.g. animated needle,
 * cardinal degree readout, custom icons).
 *
 * Currently renders nothing.
 */

interface MiniMapCompassProps {
  /** Camera yaw in radians (PlayerController convention). */
  yaw: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MiniMapCompass(_props: MiniMapCompassProps) {
  // Intentionally empty — compass drawn in Canvas2D (Phase 9).
  return null;
}
