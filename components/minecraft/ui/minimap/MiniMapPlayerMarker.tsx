'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Player / entity marker HTML overlay — reserved for Phase 10+.
 *
 * In Phase 9 the white arrow is rendered directly onto the Canvas2D
 * by MiniMapRenderer.drawPlayerMarker().  This component is the extension
 * point for future HTML-layer markers such as:
 *   - Multiplayer player dots with name tags
 *   - Mob / NPC icons
 *   - Custom SVG markers with tooltips
 *
 * Currently renders nothing.
 */

import type { MiniMapEntityMarker } from '../../types/minimap.types';

interface MiniMapPlayerMarkerProps {
  /** Additional entity markers to render (Phase 10+). */
  entities?: MiniMapEntityMarker[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MiniMapPlayerMarker(_props: MiniMapPlayerMarkerProps) {
  // Intentionally empty — player marker drawn in Canvas2D (Phase 9).
  return null;
}
