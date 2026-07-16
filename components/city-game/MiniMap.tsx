'use client';
import { useRef, useEffect } from 'react';
import { GameState, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { renderMiniMap } from './renderer';

interface Props {
  state: GameState | null;
  world: WorldData | null;
  expanded: boolean;
  onWaypointSet: (worldX: number, worldY: number) => void;
  isMobile?: boolean;
  onCollapse?: () => void;
}

export default function MiniMap({ state, world, expanded, onWaypointSet, isMobile = false, onCollapse }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const worldTotal = GRID_SIZE * TILE_SIZE;

  // Desktop size
  const mapSize = isMobile ? (expanded ? 0 : 96) : (expanded ? 280 : 160);

  // Draw on the compact canvas (desktop + mobile collapsed)
  useEffect(() => {
    if (isMobile && expanded) return; // overlay handles its own draw
    const canvas = canvasRef.current;
    if (!canvas || !state || !world) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderMiniMap(ctx, state, world, mapSize);
  });

  // Draw on the full-screen overlay canvas (mobile expanded)
  useEffect(() => {
    if (!isMobile || !expanded) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas || !state || !world) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderMiniMap(ctx, state, world, Math.max(canvas.width, canvas.height));
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

  function handleClickOverlay(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const wx = (cx / rect.width) * worldTotal;
    const wy = (cy / rect.height) * worldTotal;
    onWaypointSet(wx, wy);
  }

  // Mobile expanded: full-screen overlay panel
  if (isMobile && expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60vh',
          background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 45,
          pointerEvents: 'all',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header with close button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'monospace' }}>小地圖</span>
          <button
            onClick={onCollapse}
            aria-label="關閉地圖"
            style={{
              minWidth: 44,
              minHeight: 44,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            ✕ 關閉
          </button>
        </div>

        {/* Full-width canvas */}
        <canvas
          ref={overlayCanvasRef}
          width={typeof window !== 'undefined' ? window.innerWidth : 400}
          height={typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.6) - 60 : 300}
          onClick={handleClickOverlay}
          style={{ flex: 1, width: '100%', cursor: 'crosshair', display: 'block' }}
          title="點擊設定路標"
        />

        {/* Hint bar */}
        <div style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', flexShrink: 0 }}>
          點擊設定目的地
        </div>

        {/* Legend */}
        <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 16, flexShrink: 0 }}>
          {[
            { color: '#facc15', round: true,  label: '你' },
            { color: '#fde047', round: false, label: '計程車' },
            { color: '#fb923c', round: false, label: '外送' },
            { color: '#ef4444', round: false, label: '目標' },
          ].map(({ color, round, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'monospace' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: round ? '50%' : 2, background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute flex flex-col items-end gap-1"
      style={{
        top: isMobile ? 'calc(12px + env(safe-area-inset-top, 0px))' : '12px',
        right: isMobile ? 'calc(12px + env(safe-area-inset-right, 0px))' : '12px',
        pointerEvents: 'all',
      }}
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
          小地圖{!isMobile ? ' (M)' : ''}
        </div>
        <div className="absolute bottom-1 left-1 text-[9px] font-mono text-white/30 pointer-events-none">
          點擊設定目的地
        </div>
      </div>

      {/* Legend — desktop expanded only */}
      {expanded && !isMobile && (
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
