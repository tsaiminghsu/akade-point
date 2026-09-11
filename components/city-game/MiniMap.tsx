'use client';
import { useRef, useEffect, useCallback } from 'react';
import { GameState, WorldData } from './types';
import {
  MiniMapTransform,
  minimapToWorld,
  renderMiniMapFull,
  renderMiniMapGTA,
  VIEW_RADIUS_FOOT,
  VIEW_RADIUS_VEHICLE,
} from './minimapRender';

interface Props {
  world: WorldData | null;
  expanded: boolean;
  onWaypointSet: (worldX: number, worldY: number) => void;
  isMobile?: boolean;
  onCollapse?: () => void;
}

/**
 * The minimap subscribes to the engine's snapshot event directly and draws
 * imperatively. Routing the ~20Hz snapshot through React state would re-render
 * the whole game shell on every tick.
 */
export default function MiniMap({ world, expanded, onWaypointSet, isMobile = false, onCollapse }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Latest engine snapshot, and the transform used by the most recent draw.
  const stateRef = useRef<GameState | null>(null);
  const transformRef = useRef<MiniMapTransform | null>(null);
  const overlayTransformRef = useRef<MiniMapTransform | null>(null);

  // Read in the event handler; kept in refs so the listener never re-binds.
  const expandedRef = useRef(expanded);
  const worldRef = useRef(world);
  const viewRadiusRef = useRef(VIEW_RADIUS_VEHICLE);
  expandedRef.current = expanded;
  worldRef.current = world;

  const compactSize = isMobile ? 104 : 168;

  const draw = useCallback(() => {
    const state = stateRef.current;
    const w = worldRef.current;
    if (!state || !w) return;

    // Zoom out a little while driving so there is more warning of turns.
    const target = state.player.state === 'onFoot' ? VIEW_RADIUS_FOOT : VIEW_RADIUS_VEHICLE;
    viewRadiusRef.current += (target - viewRadiusRef.current) * 0.08;

    if (expandedRef.current) {
      const canvas = overlayRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        overlayTransformRef.current = renderMiniMapFull(ctx, state, w, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      transformRef.current = renderMiniMapGTA(ctx, state, w, canvas.width, viewRadiusRef.current);
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      stateRef.current = (e as CustomEvent<GameState>).detail;
      draw();
    };
    window.addEventListener('city:minimap', handler as EventListener);
    return () => window.removeEventListener('city:minimap', handler as EventListener);
  }, [draw]);

  // Redraw immediately when switching views so the panel is never blank.
  useEffect(() => { draw(); }, [expanded, draw]);

  function handleCompactClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const t = transformRef.current;
    if (!canvas || !t) return;
    const rect = canvas.getBoundingClientRect();
    // Use the transform from the last render, not the live camera yaw, or the
    // waypoint lands offset from where the player clicked.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const p = minimapToWorld(t, (e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    onWaypointSet(p.x, p.y);
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = overlayRef.current;
    const t = overlayTransformRef.current;
    if (!canvas || !t) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const p = minimapToWorld(t, (e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    onWaypointSet(p.x, p.y);
  }

  // ── Expanded: full-city map ────────────────────────────────────────────────
  if (expanded) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 400;
    const side = Math.min(Math.round(w * (isMobile ? 0.92 : 0.6)), Math.round(h * 0.7));

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 45,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          pointerEvents: 'all',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: 'monospace' }}>
            城市地圖 · 點擊設定目的地
          </span>
          <button
            onClick={onCollapse}
            aria-label="關閉地圖"
            style={{
              minWidth: 44, minHeight: 40,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, color: '#fff',
              fontSize: 13, fontFamily: 'monospace', cursor: 'pointer',
            }}
          >
            ✕ 關閉 {!isMobile && '(M)'}
          </button>
        </div>

        <canvas
          ref={overlayRef}
          width={side}
          height={side}
          onClick={handleOverlayClick}
          style={{
            width: side, height: side,
            cursor: 'crosshair',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        />
      </div>
    );
  }

  // ── Collapsed: rotating GTA-style minimap, bottom-right ────────────────────
  return (
    <div
      className="absolute"
      style={{
        bottom: isMobile
          ? 'calc(150px + env(safe-area-inset-bottom, 0px))'
          : '12px',
        right: isMobile ? '50%' : '12px',
        transform: isMobile ? 'translateX(50%)' : undefined,
        pointerEvents: 'all',
      }}
    >
      <div className="relative" style={{ width: compactSize, height: compactSize }}>
        <canvas
          ref={canvasRef}
          width={compactSize}
          height={compactSize}
          onClick={handleCompactClick}
          className="block cursor-crosshair"
          title="點擊設定路標"
          style={{ borderRadius: '50%' }}
        />
        {!isMobile && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/35 pointer-events-none whitespace-nowrap">
            M 全圖
          </div>
        )}
      </div>
    </div>
  );
}
