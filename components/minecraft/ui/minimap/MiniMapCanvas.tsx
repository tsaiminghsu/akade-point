'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Thin wrapper around the <canvas> element that MiniMapRenderer draws into.
 *
 * Intentionally minimal — all rendering logic lives in MiniMapRenderer.
 * This component owns only the DOM node; width/height are set imperatively
 * by useMiniMap before the first RAF tick.
 */

import type { RefObject } from 'react';

interface MiniMapCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function MiniMapCanvas({ canvasRef }: MiniMapCanvasProps) {
  return (
    <canvas
      ref={canvasRef}
      // Dimensions set imperatively in useMiniMap (256×256).
      // CSS fills the overlay container so it scales with the circular mask.
      className="absolute inset-0 h-full w-full"
    />
  );
}
