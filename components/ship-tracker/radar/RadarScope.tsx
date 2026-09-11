'use client';

/**
 * The PPI canvas.
 *
 * Deliberately thin: it owns the canvas element, sizing, and pointer input, and
 * hands everything else to ScopeRenderer. Drawing happens inside the frame
 * callback from useRadar, never from a React render, so target symbols move
 * with the sweep rather than in 180 ms steps.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { formatBearing, formatRange } from './geo';
import { ScopeRenderer, screenToPolar } from './scopeRenderer';
import type { ScopeOverlay } from './scopeRenderer';
import styles from './radar.module.css';
import type { ArpaTarget, RadarConfig, RadarSnapshot } from './types';
import type { FrameListener } from './useRadar';

/** How close a click has to be to a target to select it, in NM per pixel terms. */
const PICK_RADIUS_PX = 18;

export interface RadarScopeProps {
  config: RadarConfig;
  snapshot: RadarSnapshot | null;
  selectedTrackId: number | null;
  onSelect: (trackId: number | null) => void;
  onFrame: (listener: FrameListener) => () => void;
  eblEnabled: boolean;
  eblBearing: number;
  vrmRange: number;
  onEblChange: (bearing: number, range: number) => void;
}

export function RadarScope({
  config,
  snapshot,
  selectedTrackId,
  onSelect,
  onFrame,
  eblEnabled,
  eblBearing,
  vrmRange,
  onEblChange,
}: RadarScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ScopeRenderer | null>(null);

  const [cursorReadout, setCursorReadout] = useState<{
    bearing: number;
    range: number;
  } | null>(null);

  // The renderer reads these every frame, so they live in a ref rather than
  // forcing the frame subscription to be torn down and rebuilt on each change.
  const overlayRef = useRef<ScopeOverlay>({
    selectedTrackId: null,
    cursor: null,
    eblEnabled: false,
    eblBearing: 0,
    vrmRange: 1,
  });
  overlayRef.current.selectedTrackId = selectedTrackId;
  overlayRef.current.eblEnabled = eblEnabled;
  overlayRef.current.eblBearing = eblBearing;
  overlayRef.current.vrmRange = vrmRange;

  const configRef = useRef(config);
  configRef.current = config;

  // ── Canvas setup and sizing ─────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new ScopeRenderer(canvas);
    rendererRef.current = renderer;

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const size = Math.max(120, Math.min(rect.width, rect.height));
      renderer.resize(size, size, window.devicePixelRatio || 1);
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);

    return () => {
      observer.disconnect();
      rendererRef.current = null;
    };
  }, []);

  // ── Draw loop ───────────────────────────────────────────────────

  useEffect(
    () =>
      onFrame((snap) => {
        rendererRef.current?.render(snap, configRef.current, overlayRef.current);
      }),
    [onFrame]
  );

  // A paused engine emits no frames, so repaint once when settings change to
  // keep the picture in step with the controls.
  useEffect(() => {
    if (snapshot) rendererRef.current?.render(snapshot, config, overlayRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, selectedTrackId, eblEnabled, eblBearing, vrmRange]);

  // ── Pointer input ───────────────────────────────────────────────

  const localPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      const point = localPoint(event);
      if (!renderer || !point || !snapshot) return;

      overlayRef.current.cursor = point;
      const g = renderer.geometry(config, snapshot.own.heading, snapshot.own.cog);
      const polar = screenToPolar(point.x, point.y, g);
      setCursorReadout(polar.range <= config.rangeNm * 1.05 ? polar : null);
    },
    [config, localPoint, snapshot]
  );

  const handleLeave = useCallback(() => {
    overlayRef.current.cursor = null;
    setCursorReadout(null);
  }, []);

  const handleClick = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      const point = localPoint(event);
      if (!renderer || !point || !snapshot) return;

      const g = renderer.geometry(config, snapshot.own.heading, snapshot.own.cog);
      const polar = screenToPolar(point.x, point.y, g);

      // Shift-click drops the electronic bearing line and range marker on the
      // cursor, the way the cursor key does on a real set.
      if (event.shiftKey) {
        onEblChange(polar.bearing, polar.range);
        return;
      }

      const picked = pickTarget(snapshot.targets, point, g, config.rangeNm);
      onSelect(picked?.trackId ?? null);
    },
    [config, localPoint, onEblChange, onSelect, snapshot]
  );

  return (
    <div className={styles.scopeWrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={styles.scopeCanvas}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerDown={handleClick}
      />
      {cursorReadout && (
        <div className={styles.cursorReadout}>
          <span>游標</span>
          <strong>{formatBearing(cursorReadout.bearing)}</strong>
          <strong>{formatRange(cursorReadout.range)}</strong>
        </div>
      )}
      <div className={styles.scopeHint}>點選目標可鎖定 · Shift + 點選設定 EBL / VRM</div>
    </div>
  );
}

/** Nearest target to a click, within the pick radius. */
function pickTarget(
  targets: ArpaTarget[],
  point: { x: number; y: number },
  g: { cx: number; cy: number; scale: number; rotationOffset: number },
  maxRangeNm: number
): ArpaTarget | null {
  let best: ArpaTarget | null = null;
  let bestDist = PICK_RADIUS_PX;

  for (const target of targets) {
    if (target.rangeNm > maxRangeNm) continue;
    const th = ((target.bearing - g.rotationOffset) * Math.PI) / 180;
    const x = g.cx + Math.sin(th) * target.rangeNm * g.scale;
    const y = g.cy - Math.cos(th) * target.rangeNm * g.scale;
    const d = Math.hypot(x - point.x, y - point.y);
    if (d < bestDist) {
      bestDist = d;
      best = target;
    }
  }
  return best;
}
