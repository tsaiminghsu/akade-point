'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const BASE =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_SHIP_TRACKER_BACKEND_URL) ||
  'http://localhost:8000';

// ── Types ────────────────────────────────────────────────────────

export interface GpsData {
  lat: number;
  lng: number;
  mode: 'manual' | 'auto';
}

export interface ShipData {
  船名: string;
  MMSL: string; // intentional typo matching the backend field name
  距離_km: number;
  航速_節: number | null;
  方位角: number | null;
  方位: string;
  緯度: number | null;
  經度: number | null;
}

export interface WsPayload {
  gps: GpsData | null;
  ships: ShipData[];
  ship_count: number;
  ais_count: number;
  detection_mode: 'camera' | 'image' | 'video';
  heading: number | null;
  fov: number | null;
}

export interface ScreenshotResult {
  image: string;
  json: string;
  txt: string;
  ship_count: number;
}

export interface ToastState {
  message: string;
  isError: boolean;
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseShipTrackerReturn {
  wsStatus: WsStatus;
  gps: GpsData | null;
  ships: ShipData[];
  shipCount: number;
  aisCount: number;
  detectionMode: 'camera' | 'image' | 'video';
  heading: number | null;
  fov: number | null;
  toast: ToastState | null;
  uploadProgress: string | null;
  screenshotResult: ScreenshotResult | null;
  aisRefreshMessage: string | null;
  videoFeedUrl: string;
  videoFeedKey: number;
  exportUrl: string;
  setLocation: (lat: number, lng: number) => Promise<void>;
  resetLocation: () => Promise<void>;
  setHeading: (h: number) => Promise<void>;
  setFov: (fov: number) => Promise<void>;
  switchToCamera: () => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
  uploadVideo: (file: File) => Promise<void>;
  takeScreenshot: () => Promise<void>;
  refreshAis: () => Promise<void>;
  refreshVideoFeed: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useShipTracker(): UseShipTrackerReturn {
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [gps, setGps] = useState<GpsData | null>(null);
  const [ships, setShips] = useState<ShipData[]>([]);
  const [shipCount, setShipCount] = useState(0);
  const [aisCount, setAisCount] = useState(0);
  const [detectionMode, setDetectionMode] = useState<'camera' | 'image' | 'video'>('camera');
  const [heading, setHeading] = useState<number | null>(null);
  const [fov, setFov] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [screenshotResult, setScreenshotResult] = useState<ScreenshotResult | null>(null);
  const [aisRefreshMessage, setAisRefreshMessage] = useState<string | null>(null);
  const [videoFeedKey, setVideoFeedKey] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = BASE.replace(/^https?/, 'ws') + '/ws';

    const connect = () => {
      setWsStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        retryTimerRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (e: MessageEvent) => {
        try {
          const d: WsPayload = JSON.parse(e.data);
          if (d.gps) setGps(d.gps);
          setShips(d.ships || []);
          setShipCount(d.ship_count ?? 0);
          setAisCount(d.ais_count ?? 0);
          if (d.detection_mode) setDetectionMode(d.detection_mode);
          if (d.heading != null) setHeading(d.heading);
          if (d.fov != null) setFov(d.fov);
        } catch {
          // A malformed frame is not worth tearing the socket down for.
        }
      };
    };

    connect();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  // API helpers
  const apiPost = useCallback(
    async (path: string, body?: unknown): Promise<Response> => {
      return fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    []
  );

  const setLocation = useCallback(
    async (lat: number, lng: number) => {
      const r = await apiPost('/api/location', { lat, lng });
      if (r.ok) showToast(`位置已設定: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      else showToast('設定失敗', true);
    },
    [apiPost, showToast]
  );

  const resetLocation = useCallback(async () => {
    const r = await fetch(`${BASE}/api/location`, { method: 'DELETE' });
    if (r.ok) showToast('已切換至自動定位 (IP)');
    else showToast('重置失敗', true);
  }, [showToast]);

  const setHeadingAction = useCallback(
    async (h: number) => {
      const r = await apiPost('/api/heading', { heading: h });
      if (r.ok) {
        const d = await r.json();
        setHeading(d.heading);
        showToast(`航向已設定: ${Number(d.heading).toFixed(0)}°`);
      }
    },
    [apiPost, showToast]
  );

  const setFovAction = useCallback(
    async (fovVal: number) => {
      const r = await apiPost('/api/config', { fov_degrees: fovVal });
      if (r.ok) {
        const d = await r.json();
        setFov(d.fov);
        showToast(`FOV 已設定: ${Number(d.fov).toFixed(0)}°`);
      } else {
        const err = await r.json();
        showToast(err.detail || '設定失敗', true);
      }
    },
    [apiPost, showToast]
  );

  const switchToCamera = useCallback(async () => {
    const r = await apiPost('/api/mode', { mode: 'camera' });
    if (r.ok) {
      setVideoFeedKey((k) => k + 1);
      showToast('已切換至攝影機模式');
    }
  }, [apiPost, showToast]);

  const uploadImage = useCallback(
    async (file: File) => {
      setUploadProgress(`上傳圖片: ${file.name}...`);
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await fetch(`${BASE}/api/upload/image`, { method: 'POST', body: fd });
        if (r.ok) {
          setVideoFeedKey((k) => k + 1);
          setUploadProgress(`圖片已載入: ${file.name}`);
          showToast(`圖片已載入: ${file.name}`);
        } else {
          const err = await r.json();
          showToast(err.detail || '上傳失敗', true);
          setUploadProgress(null);
        }
      } catch {
        showToast('上傳失敗', true);
        setUploadProgress(null);
      }
    },
    [showToast]
  );

  const uploadVideo = useCallback(
    async (file: File) => {
      setUploadProgress(
        `上傳影片: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`
      );
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await fetch(`${BASE}/api/upload/video`, { method: 'POST', body: fd });
        if (r.ok) {
          const d = await r.json();
          setVideoFeedKey((k) => k + 1);
          setUploadProgress(
            `影片已載入: ${file.name} | ${d.resolution} | ${d.fps} fps | ${d.duration_sec}s`
          );
          showToast(`影片已載入: ${file.name}`);
        } else {
          const err = await r.json();
          showToast(err.detail || '上傳失敗', true);
          setUploadProgress(null);
        }
      } catch {
        showToast('上傳失敗', true);
        setUploadProgress(null);
      }
    },
    [showToast]
  );

  const takeScreenshot = useCallback(async () => {
    setScreenshotResult(null);
    try {
      const r = await apiPost('/api/screenshot');
      if (r.ok) {
        const d: ScreenshotResult = await r.json();
        setScreenshotResult(d);
        showToast(`截圖完成，偵測 ${d.ship_count} 艘船隻`);
      } else {
        const err = await r.json();
        showToast(err.detail || '截圖失敗', true);
      }
    } catch {
      showToast('截圖失敗', true);
    }
  }, [apiPost, showToast]);

  const refreshAis = useCallback(async () => {
    setAisRefreshMessage('刷新中...');
    try {
      const r = await apiPost('/api/ais/refresh');
      if (r.ok) {
        const d = await r.json();
        setAisRefreshMessage(`已更新 ${d.count} 筆 AIS 資料`);
        showToast(`AIS 已刷新：${d.count} 筆`);
      } else {
        setAisRefreshMessage('刷新失敗');
        showToast('AIS 刷新失敗', true);
      }
    } catch {
      setAisRefreshMessage('刷新失敗');
      showToast('AIS 刷新失敗', true);
    }
  }, [apiPost, showToast]);

  const refreshVideoFeed = useCallback(() => {
    setVideoFeedKey((k) => k + 1);
  }, []);

  return {
    wsStatus,
    gps,
    ships,
    shipCount,
    aisCount,
    detectionMode,
    heading,
    fov,
    toast,
    uploadProgress,
    screenshotResult,
    aisRefreshMessage,
    videoFeedUrl: `${BASE}/video_feed`,
    videoFeedKey,
    exportUrl: `${BASE}/api/export`,
    setLocation,
    resetLocation,
    setHeading: setHeadingAction,
    setFov: setFovAction,
    switchToCamera,
    uploadImage,
    uploadVideo,
    takeScreenshot,
    refreshAis,
    refreshVideoFeed,
  };
}
