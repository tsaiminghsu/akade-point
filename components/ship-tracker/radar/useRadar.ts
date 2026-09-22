'use client';

/**
 * React binding for the radar engine.
 *
 * One animation frame loop drives everything: it steps the engine, hands the
 * fresh snapshot straight to the canvas subscribers, and only then throttles a
 * state update for the panels. Two separate loops would let the canvas draw a
 * frame the engine had not produced yet, and pushing every frame through React
 * would re-render seven panels sixty times a second to change a number that
 * only updates twice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_CONFIG, RadarEngine } from './engine';
import { DEFAULT_ENVIRONMENT } from './radar';
import type { Environment } from './radar';
import type {
  AisReport,
  ArpaTarget,
  DataSource,
  OwnShip,
  RadarConfig,
  RadarSnapshot,
} from './types';

/** How often the React panels are refreshed, in milliseconds. */
const PANEL_INTERVAL_MS = 180;

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type FrameListener = (snapshot: RadarSnapshot, dtMs: number) => void;

export interface UseRadarReturn {
  snapshot: RadarSnapshot | null;
  config: RadarConfig;
  environment: Environment;
  own: OwnShip | null;
  source: DataSource;
  liveStatus: LiveStatus;
  liveMessage: string | null;
  paused: boolean;
  selectedTrackId: number | null;
  selectedTarget: ArpaTarget | null;
  setConfig: (patch: Partial<RadarConfig>) => void;
  setEnvironment: (patch: Partial<Environment>) => void;
  setOrdered: (course?: number, speed?: number) => void;
  setSource: (source: DataSource) => void;
  setPaused: (paused: boolean) => void;
  setSelectedTrackId: (id: number | null) => void;
  reset: () => void;
  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame: (listener: FrameListener) => () => void;
}

export function useRadar(): UseRadarReturn {
  const engineRef = useRef<RadarEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new RadarEngine();
  const engine = engineRef.current;

  const listeners = useRef(new Set<FrameListener>());

  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(null);
  const [config, setConfigState] = useState<RadarConfig>(DEFAULT_CONFIG);
  const [environment, setEnvironmentState] = useState<Environment>(DEFAULT_ENVIRONMENT);
  const [source, setSourceState] = useState<DataSource>('simulation');
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // ── The one loop ────────────────────────────────────────────────

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastPanel = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dtMs = now - last;
      last = now;

      if (pausedRef.current) return;

      engine.step(dtMs);
      const snap = engine.snapshot();

      for (const listener of listeners.current) listener(snap, dtMs);

      if (now - lastPanel >= PANEL_INTERVAL_MS) {
        lastPanel = now;
        setSnapshot(snap);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // ── Live AIS ────────────────────────────────────────────────────

  useEffect(() => {
    if (source !== 'live-ais') {
      setLiveStatus('idle');
      setLiveMessage(null);
      return;
    }

    setLiveStatus('connecting');
    setLiveMessage('連線至 AIS 資料串流...');

    const es = new EventSource('/api/ais/stream');
    let fatal = false;

    es.onopen = () => {
      setLiveStatus('connected');
      setLiveMessage('已連線，等待 AIS 位置報告');
    };

    es.addEventListener('position', (event) => {
      try {
        const reports = JSON.parse((event as MessageEvent).data) as AisReport[];
        if (!Array.isArray(reports) || reports.length === 0) return;
        engine.ingestLiveAis(reports);
        setLiveStatus('connected');
        setLiveMessage(`已接收 ${reports.length} 筆 AIS 報告`);
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    });

    es.addEventListener('status', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          message?: string;
          fatal?: boolean;
        };
        if (payload.message) setLiveMessage(payload.message);
        if (payload.fatal) {
          // The server has said this will never work, so stop EventSource
          // reconnecting every few seconds for the rest of the session.
          fatal = true;
          setLiveStatus('error');
          es.close();
        }
      } catch {
        // Ignore.
      }
    });

    es.onerror = () => {
      // A fatal status has already explained the real reason; do not paper over
      // it with the generic one.
      if (fatal) return;
      setLiveStatus('error');
      setLiveMessage('AIS 串流連線中斷，將自動重試。');
    };

    return () => es.close();
  }, [source, engine]);

  // ── Controls ────────────────────────────────────────────────────

  const setConfig = useCallback(
    (patch: Partial<RadarConfig>) => {
      engine.setConfig(patch);
      setConfigState(engine.getConfig());
      // A paused engine produces no frames, so nothing derived from the
      // snapshot would follow the controls until it resumed: the range filter,
      // and the truth overlay, which the engine only builds while it is on.
      if (pausedRef.current) setSnapshot(engine.snapshot());
    },
    [engine]
  );

  const setEnvironment = useCallback(
    (patch: Partial<Environment>) => {
      engine.setEnvironment(patch);
      setEnvironmentState({ ...engine.getEnvironment() });
    },
    [engine]
  );

  const setOrdered = useCallback(
    (course?: number, speed?: number) => {
      engine.setOrdered(course, speed);
    },
    [engine]
  );

  const setSource = useCallback(
    (next: DataSource) => {
      engine.setSource(next);
      setSourceState(next);
      setSelectedTrackId(null);
    },
    [engine]
  );

  const reset = useCallback(() => {
    engine.reset();
    setSelectedTrackId(null);
    setSnapshot(engine.snapshot());
  }, [engine]);

  const onFrame = useCallback((listener: FrameListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const selectedTarget = useMemo(() => {
    if (selectedTrackId === null || !snapshot) return null;
    return snapshot.targets.find((t) => t.trackId === selectedTrackId) ?? null;
  }, [selectedTrackId, snapshot]);

  return {
    snapshot,
    config,
    environment,
    own: snapshot?.own ?? null,
    source,
    liveStatus,
    liveMessage,
    paused,
    selectedTrackId,
    selectedTarget,
    setConfig,
    setEnvironment,
    setOrdered,
    setSource,
    setPaused,
    setSelectedTrackId,
    reset,
    onFrame,
  };
}
