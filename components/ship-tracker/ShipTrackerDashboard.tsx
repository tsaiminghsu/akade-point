'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './shiptracker.module.css';
import {
  GpsData,
  ShipData,
  ScreenshotResult,
  ToastState,
  WsStatus,
  useShipTracker,
} from './useShipTracker';

const BASE =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_SHIP_TRACKER_BACKEND_URL) ||
  'http://localhost:8000';

const MODE_LABELS: Record<string, string> = {
  camera: '攝影機',
  image: '圖片',
  video: '影片',
};

const WS_LABELS: Record<WsStatus, string> = {
  connecting: '連線中...',
  connected: '已連線',
  disconnected: '已斷線',
};

const WS_COLORS: Record<WsStatus, string> = {
  connecting: '#e3b341',
  connected: '#3fb950',
  disconnected: '#f85149',
};

// ── Sub-panels ────────────────────────────────────────────────────

function GpsPanel({
  gps,
  onSet,
  onReset,
}: {
  gps: GpsData | null;
  onSet: (lat: number, lng: number) => void;
  onReset: () => void;
}) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const handleSet = () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return;
    onSet(latNum, lngNum);
  };

  const isManual = gps?.mode === 'manual';

  return (
    <div className={styles.panel}>
      <h2>GPS 位置</h2>
      <div className={styles.gpsValues}>
        <div className={styles.gpsValue}>
          <span className={styles.gpsLabel}>緯度&nbsp;</span>
          <span className={`${styles.gpsVal} ${isManual ? styles.gpsValManual : ''}`}>
            {gps ? `${gps.lat.toFixed(6)}°` : '--'}
          </span>
        </div>
        <div className={styles.gpsValue}>
          <span className={styles.gpsLabel}>經度&nbsp;</span>
          <span className={`${styles.gpsVal} ${isManual ? styles.gpsValManual : ''}`}>
            {gps ? `${gps.lng.toFixed(6)}°` : '--'}
          </span>
        </div>
        <div className={styles.gpsValue}>
          <span className={styles.gpsLabel}>模式&nbsp;</span>
          <span className={`${styles.gpsVal} ${isManual ? styles.gpsValManual : ''}`}>
            {gps ? (isManual ? '手動' : '自動 (IP)') : '--'}
          </span>
        </div>
      </div>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="緯度 (e.g. 22.62)"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />
        <input
          className={styles.input}
          type="text"
          placeholder="經度 (e.g. 120.30)"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
        />
      </div>
      <div className={styles.btnRow}>
        <button className={`${styles.btn} ${styles.btnGreen}`} onClick={handleSet}>
          設定位置
        </button>
        <button className={`${styles.btn} ${styles.btnYellow}`} onClick={onReset}>
          自動定位
        </button>
      </div>
    </div>
  );
}

function CameraParamsPanel({
  heading,
  fov,
  onSetHeading,
  onSetFov,
}: {
  heading: number | null;
  fov: number | null;
  onSetHeading: (h: number) => void;
  onSetFov: (f: number) => void;
}) {
  const [headingVal, setHeadingVal] = useState('');
  const [fovVal, setFovVal] = useState('');

  return (
    <div className={styles.panel}>
      <h2>攝影機參數</h2>
      <div className={styles.hfRow}>
        <span className={styles.hfLabel}>航向</span>
        <input
          className={styles.inputSmall}
          type="number"
          min={0}
          max={359}
          step={1}
          placeholder="270"
          value={headingVal}
          onChange={(e) => setHeadingVal(e.target.value)}
        />
        <span className={styles.hfUnit}>° (0=北)</span>
        <button
          className={`${styles.btn} ${styles.btnBlue}`}
          onClick={() => {
            const h = parseFloat(headingVal);
            if (!isNaN(h)) onSetHeading(h);
          }}
        >
          設定
        </button>
      </div>
      <div className={styles.hfRow}>
        <span className={styles.hfLabel}>FOV</span>
        <input
          className={styles.inputSmall}
          type="number"
          min={10}
          max={180}
          step={1}
          placeholder="60"
          value={fovVal}
          onChange={(e) => setFovVal(e.target.value)}
        />
        <span className={styles.hfUnit}>°</span>
        <button
          className={`${styles.btn} ${styles.btnBlue}`}
          onClick={() => {
            const f = parseFloat(fovVal);
            if (!isNaN(f)) onSetFov(f);
          }}
        >
          設定
        </button>
      </div>
      <div className={styles.dispRow}>
        目前: 航向{' '}
        <span style={{ color: '#00d4ff' }}>{heading != null ? heading.toFixed(0) : '--'}</span>°
        ｜ FOV{' '}
        <span style={{ color: '#00d4ff' }}>{fov != null ? fov.toFixed(0) : '--'}</span>°
      </div>
    </div>
  );
}

function InputSourcePanel({
  uploadProgress,
  onSwitchCamera,
  onUploadImage,
  onUploadVideo,
}: {
  uploadProgress: string | null;
  onSwitchCamera: () => void;
  onUploadImage: (file: File) => void;
  onUploadVideo: (file: File) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.panel}>
      <h2>輸入來源</h2>
      <div className={styles.sourceBtns}>
        <div className={styles.fileRow}>
          <span
            className={styles.fileLabel}
            onClick={() => imageInputRef.current?.click()}
          >
            圖片
          </span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUploadImage(file);
                e.target.value = '';
              }
            }}
          />
          <span
            className={styles.fileLabel}
            onClick={() => videoInputRef.current?.click()}
          >
            影片
          </span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUploadVideo(file);
                e.target.value = '';
              }
            }}
          />
        </div>
        <button
          className={`${styles.btn} ${styles.btnGreen}`}
          onClick={onSwitchCamera}
        >
          攝影機
        </button>
        {uploadProgress && (
          <div className={styles.uploadProgress}>{uploadProgress}</div>
        )}
      </div>
    </div>
  );
}

function ScreenshotPanel({
  screenshotResult,
  onTakeScreenshot,
  exportUrl,
}: {
  screenshotResult: ScreenshotResult | null;
  onTakeScreenshot: () => void;
  exportUrl: string;
}) {
  return (
    <div className={styles.panel}>
      <h2>截圖 / 匯出</h2>
      <button
        className={`${styles.btn} ${styles.btnAccent} ${styles.btnFull}`}
        onClick={onTakeScreenshot}
      >
        擷取畫面
      </button>
      <a
        href={exportUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none' }}
      >
        <button className={`${styles.btn} ${styles.btnGray} ${styles.btnFull}`}>
          匯出偵測資料
        </button>
      </a>
      {screenshotResult && (
        <div className={styles.screenshotResult}>
          圖片:{' '}
          <a
            className={styles.screenshotLink}
            href={`${BASE}/api/screenshot/${screenshotResult.image}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {screenshotResult.image}
          </a>
          <br />
          資料:{' '}
          <a
            className={styles.screenshotLink}
            href={`${BASE}/api/screenshot/${screenshotResult.json}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {screenshotResult.json}
          </a>
          <br />
          報告:{' '}
          <a
            className={styles.screenshotLink}
            href={`${BASE}/api/screenshot/${screenshotResult.txt}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {screenshotResult.txt}
          </a>
          <br />
          偵測 {screenshotResult.ship_count} 艘船隻
        </div>
      )}
    </div>
  );
}

function AisPanel({
  aisRefreshMessage,
  onRefresh,
}: {
  aisRefreshMessage: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className={styles.panel}>
      <h2>AIS 數據</h2>
      <button
        className={`${styles.btn} ${styles.btnGray} ${styles.btnFull}`}
        onClick={onRefresh}
        style={{ marginBottom: 0 }}
      >
        刷新 AIS 數據
      </button>
      {aisRefreshMessage && (
        <div className={styles.aisResult}>{aisRefreshMessage}</div>
      )}
    </div>
  );
}

function ShipsTable({
  ships,
  shipCount,
  aisCount,
}: {
  ships: ShipData[];
  shipCount: number;
  aisCount: number;
}) {
  return (
    <div className={styles.shipsSection}>
      <h2>
        偵測船隻 ({shipCount} 艘 | AIS: {aisCount} 筆)
      </h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>船名</th>
            <th>MMSI</th>
            <th>距離 (km)</th>
            <th>航速 (節)</th>
            <th>方位角</th>
            <th>方位</th>
            <th>座標</th>
          </tr>
        </thead>
        <tbody>
          {ships.length === 0 ? (
            <tr>
              <td colSpan={7} className={styles.noShips}>
                尚未偵測到船隻
              </td>
            </tr>
          ) : (
            ships.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{s['船名'] || '--'}</td>
                <td style={{ fontSize: 11, color: '#8b949e' }}>{s['MMSL'] || '--'}</td>
                <td style={{ color: '#00d4ff' }}>{(s['距離_km'] || 0).toFixed(2)}</td>
                <td style={{ color: '#3fb950' }}>
                  {s['航速_節'] != null ? Number(s['航速_節']).toFixed(1) : '--'}
                </td>
                <td style={{ color: '#e3b341' }}>
                  {s['方位角'] != null ? `${s['方位角']}°` : '--'}
                </td>
                <td>{s['方位'] || '--'}</td>
                <td style={{ fontSize: 11, color: '#8b949e' }}>
                  {s['緯度'] != null
                    ? `${s['緯度'].toFixed(4)}, ${s['經度']?.toFixed(4)}`
                    : '--'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div className={`${styles.toast} ${toast.isError ? styles.toastError : ''}`}>
      {toast.message}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────

export default function ShipTrackerDashboard() {
  const {
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
    videoFeedUrl,
    videoFeedKey,
    exportUrl,
    setLocation,
    resetLocation,
    setHeading,
    setFov,
    switchToCamera,
    uploadImage,
    uploadVideo,
    takeScreenshot,
    refreshAis,
  } = useShipTracker();

  const [videoError, setVideoError] = useState(false);

  // Reset video error when key changes (video feed refreshed)
  useEffect(() => {
    setVideoError(false);
  }, [videoFeedKey]);

  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.dot} />
        <h1>Catch the Boat — 智慧船舶監測系統</h1>
        <div className={styles.wsStatus}>
          WebSocket:{' '}
          <span style={{ color: WS_COLORS[wsStatus], fontWeight: 600 }}>
            {WS_LABELS[wsStatus]}
          </span>
        </div>
      </header>

      {/* Main grid */}
      <main className={styles.main}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <GpsPanel gps={gps} onSet={setLocation} onReset={resetLocation} />
          <CameraParamsPanel
            heading={heading}
            fov={fov}
            onSetHeading={setHeading}
            onSetFov={setFov}
          />
          <InputSourcePanel
            uploadProgress={uploadProgress}
            onSwitchCamera={switchToCamera}
            onUploadImage={uploadImage}
            onUploadVideo={uploadVideo}
          />
          <ScreenshotPanel
            screenshotResult={screenshotResult}
            onTakeScreenshot={takeScreenshot}
            exportUrl={exportUrl}
          />
          <AisPanel aisRefreshMessage={aisRefreshMessage} onRefresh={refreshAis} />
        </aside>

        {/* Video feed */}
        <div className={styles.videoArea}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={videoFeedKey}
            src={videoFeedUrl}
            alt="video feed"
            className={styles.videoImg}
            style={{ display: videoError ? 'none' : 'block' }}
            onError={() => setVideoError(true)}
            onLoad={() => setVideoError(false)}
          />
          {videoError && (
            <div className={styles.videoPlaceholder}>
              無法連接影像串流
              <br />
              <small style={{ color: '#8b949e' }}>請確認後端服務已啟動</small>
            </div>
          )}
          <div className={styles.modeBadge}>
            {MODE_LABELS[detectionMode] || detectionMode || '--'}
          </div>
        </div>

        {/* Ships table */}
        <ShipsTable ships={ships} shipCount={shipCount} aisCount={aisCount} />

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.stat}>
            模式: <strong>{MODE_LABELS[detectionMode] || '--'}</strong>
          </div>
          <div className={styles.stat}>
            船隻: <strong>{shipCount}</strong>
          </div>
          <div className={styles.stat}>
            AIS: <strong>{aisCount}</strong>
          </div>
          <div className={styles.stat}>
            GPS:{' '}
            <strong>
              {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : '--'}
            </strong>
          </div>
          <div className={styles.stat}>
            航向: <strong>{heading != null ? heading.toFixed(0) : '--'}</strong>°
          </div>
        </footer>
      </main>

      <Toast toast={toast} />
    </div>
  );
}
