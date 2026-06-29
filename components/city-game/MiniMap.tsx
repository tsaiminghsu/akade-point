'use client';
import { useRef, useEffect } from 'react';
import { GameState, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { renderMiniMap } from './renderer';

interface Props {
  state: GameState | null;
  world: WorldData | null;
  expanded: boolean;
  onWaypointSet: (worldX: number, worldY: number) => void;
}

export default function MiniMap({ state, world, expanded, onWaypointSet }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapSize = expanded ? 280 : 160;
  const worldTotal = GRID_SIZE * TILE_SIZE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state || !world) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderMiniMap(ctx, state, world, mapSize);
  });

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const scale = mapSize / worldTotal;
    const wx = cx / scale;
    const wy = cy / scale;
    onWaypointSet(wx, wy);
  }

  return (
    <div
      className="absolute top-3 right-3 flex flex-col items-end gap-1"
      style={{ pointerEvents: 'all' }}
    >
      <div
        className="relative rounded-lg overflow-hidden border border-white/20 shadow-2xl"
        style={{ width: mapSize, height: mapSize }}
      >
        <canvas
          ref={canvasRef}
          width={mapSize}
          height={mapSize}
          onClick={handleClick}
          className="block cursor-crosshair"
          title="點擊設定路標"
        />
        {/* Corner label */}
        <div className="absolute top-1 left-1 text-[9px] font-mono text-white/30 pointer-events-none">
          小地圖 (M)
        </div>
        <div className="absolute bottom-1 left-1 text-[9px] font-mono text-white/30 pointer-events-none">
          點擊設定目的地
        </div>
      </div>

      {/* Legend */}
      {expanded && (
        <div className="bg-black/70 backdrop-blur border border-white/10 rounded px-2 py-1 text-[9px] font-mono text-white/50 flex gap-3">
          <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />你</span>
          <span><span className="inline-block w-2 h-2 bg-yellow-300 mr-1" />計程車</span>
          <span><span className="inline-block w-2 h-2 bg-orange-400 mr-1" />外送</span>
          <span><span className="inline-block w-2 h-2 bg-red-500 mr-1" />目標</span>
        </div>
      )}
    </div>
  );
}
