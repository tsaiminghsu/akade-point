'use client';

/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Top-level MiniMap component.
 *
 * Mount conditions:
 *   - Only rendered while the pointer is locked (player is in-game).
 *   - Respects the `enabled` toggle from MiniMapStore.
 *
 * Layout: `pointer-events-none absolute right-3 top-3` so it sits in the
 * top-right corner of the game canvas without intercepting mouse events.
 *
 * Zoom control: press Z in-game (wired in Step 9 via PlayerController keydown).
 */

import type { World } from '../../engine/chunks';
import { useMinecraftStore }  from '../../stores';
import { useMiniMapStore }    from '../../stores/minimap.store';
import { useMiniMap }         from '../../hooks/useMiniMap';
import { MiniMapCanvas }      from './MiniMapCanvas';
import { MiniMapOverlay }     from './MiniMapOverlay';
import { MiniMapCompass }     from './MiniMapCompass';
import { MiniMapPlayerMarker } from './MiniMapPlayerMarker';

interface MiniMapProps {
  world: World;
}

export function MiniMap({ world }: MiniMapProps) {
  const locked  = useMinecraftStore(s => s.locked);
  const enabled = useMiniMapStore(s => s.enabled);
  const opacity = useMiniMapStore(s => s.opacity);

  // Hook always runs (Rules of Hooks) but renderer skips work when disabled
  const { canvasRef } = useMiniMap(world);

  if (!locked || !enabled) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 select-none">
      <MiniMapOverlay opacity={opacity}>
        <MiniMapCanvas canvasRef={canvasRef} />
      </MiniMapOverlay>

      {/* Extension points — currently render null (Phase 9) */}
      <MiniMapCompass yaw={0} />
      <MiniMapPlayerMarker />
    </div>
  );
}
