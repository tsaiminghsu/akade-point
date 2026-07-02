'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GameEngine3D } from './engine3d';
import { HUDData, GameState } from './types';
import HUD from './HUD';
import MiniMap from './MiniMap';
import PhoneUI from './PhoneUI';
import GameScene, { WeatherType } from './GameScene';
import LoadingScreen from './LoadingScreen';
import TownHallUI from './TownHallUI';

// ─── Weather cycle ────────────────────────────────────────────────────────────
const WEATHER_CYCLE: WeatherType[] = [
  'clear_day', 'dusk', 'night', 'cloudy', 'rain', 'storm', 'foggy', 'snow',
];
const WEATHER_LABELS: Record<WeatherType, string> = {
  clear_day: '☀️ 晴天',
  dusk:      '🌅 傍晚',
  night:     '🌙 夜晚',
  cloudy:    '☁️ 烏雲',
  rain:      '🌧️ 雨天',
  storm:     '⛈️ 暴風雨',
  foggy:     '🌫️ 霧',
  snow:      '❄️ 下雪',
};

// ─── Loading phase definitions ────────────────────────────────────────────────
const PHASES = [
  { pct: 10,  text: '初始化 WebGL 3D 渲染引擎...' },
  { pct: 25,  text: '建立場景圖與著色器...' },
  { pct: 45,  text: '生成隨機街區與道路網...' },
  { pct: 65,  text: '配置城市建築與高樓群...' },
  { pct: 80,  text: '配置路燈、樹木與場景細節...' },
  { pct: 92,  text: '生成車流與計程車服務...' },
  { pct: 100, text: '準備進入 AKADE CITY...' },
];

// ─── Progress broadcaster (inside Canvas context) ─────────────────────────────
// Counts rendered frames and fires an event so CityGame can advance progress
function FrameCounter({ onReady }: { onReady: (frames: number) => void }) {
  const frames = useRef(0);
  const reported = useRef(false);
  const { gl } = useThree();

  // Signal WebGL context is live (phase 1)
  useEffect(() => {
    if (gl) {
      window.dispatchEvent(new CustomEvent('city:load', { detail: { phase: 'webgl' } }));
    }
  }, [gl]);

  useFrame(() => {
    frames.current++;
    if (!reported.current) {
      window.dispatchEvent(new CustomEvent('city:load', { detail: { phase: 'frame', count: frames.current } }));
      if (frames.current >= 60) {
        reported.current = true;
        onReady(frames.current);
      }
    }
  });

  return null;
}

// ─── Default HUD ──────────────────────────────────────────────────────────────
const DEFAULT_HUD: HUDData = {
  speed: 0, speedKMH: 0, playerState: 'onFoot', vehicleType: null,
  orders: [],
  drone: { active: false, altitude: 0, throttle: 0, pitch: 0, roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: null },
  waypoint: { x: 0, y: 0, active: false },
  zone: '城市區', playerX: 0, playerY: 0, notifications: [],
  callLog: [],
};

// Singleton engine
let engineSingleton: GameEngine3D | null = null;
function getEngine(): GameEngine3D {
  if (!engineSingleton) engineSingleton = new GameEngine3D();
  return engineSingleton;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CityGame() {
  const engine = useRef(getEngine());
  const [hud,          setHud]         = useState<HUDData>(DEFAULT_HUD);
  const [showPhone,    setShowPhone]   = useState(false);
  const [mapExpanded,  setMapExpanded] = useState(false);
  const [showTownHall, setShowTownHall] = useState(false);
  const [weatherIdx,   setWeatherIdx]  = useState(0);
  const [miniState,    setMiniState]   = useState<GameState | null>(null);

  // ── Loading state ──────────────────────────────────────────────────────────
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText,     setLoadText]     = useState('初始化 WebGL 3D 渲染引擎...');
  const [loadVisible,  setLoadVisible]  = useState(true);
  const [loadFade,     setLoadFade]     = useState(false);
  const loadDone = useRef(false);

  // Advance progress to the next phase above current value
  const advanceTo = useCallback((target: number, text: string) => {
    setLoadProgress(prev => {
      if (target <= prev) return prev;
      return target;
    });
    setLoadText(text);
  }, []);

  // Listen for Canvas events
  useEffect(() => {
    const handler = (e: Event) => {
      if (loadDone.current) return;
      const { phase, count } = (e as CustomEvent).detail as { phase: string; count?: number };

      if (phase === 'webgl') {
        advanceTo(25, '建立場景圖與著色器...');
        // After WebGL: simulate world-gen phases at ~100 ms intervals
        let step = 1;
        const tick = setInterval(() => {
          if (loadDone.current) { clearInterval(tick); return; }
          const ph = PHASES[step];
          if (!ph) { clearInterval(tick); return; }
          advanceTo(ph.pct, ph.text);
          step++;
          if (ph.pct >= 92) clearInterval(tick);
        }, 120);
      }

      if (phase === 'frame' && count !== undefined) {
        // Map rendered frames to final progress
        const framePct = Math.min(92, 45 + Math.floor(count / 60 * 47));
        setLoadProgress(prev => Math.max(prev, framePct));
        if (count >= 30) setLoadText('生成車流與計程車服務...');
      }
    };

    window.addEventListener('city:load', handler as EventListener);
    return () => window.removeEventListener('city:load', handler as EventListener);
  }, [advanceTo]);

  const handleCanvasReady = useCallback(() => {
    if (loadDone.current) return;
    loadDone.current = true;
    advanceTo(100, '準備進入 AKADE CITY...');
    setTimeout(() => {
      setLoadFade(true);
      setTimeout(() => setLoadVisible(false), 700);
    }, 500);
  }, [advanceTo]);

  // ── HUD / Phone / Map callbacks ────────────────────────────────────────────
  const onHUDUpdate     = useCallback((data: HUDData) => { setHud(data); }, []);
  const onPhoneToggle   = useCallback(() => setShowPhone(p => !p), []);
  const onMapToggle     = useCallback(() => setMapExpanded(m => !m), []);
  const onWeatherCycle  = useCallback(() => setWeatherIdx(i => (i + 1) % WEATHER_CYCLE.length), []);

  const weatherType = WEATHER_CYCLE[weatherIdx];

  useEffect(() => {
    const handler = (e: Event) => setMiniState((e as CustomEvent<GameState>).detail);
    window.addEventListener('city:minimap', handler as EventListener);
    return () => window.removeEventListener('city:minimap', handler as EventListener);
  }, []);

  function handleWaypointSet(wx: number, wy: number) {
    engine.current.setWaypoint(wx, wy);
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070b13]">

      {/* ── 3D Canvas ── always mounted so rendering starts immediately ── */}
      <Canvas
        shadows
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 62, near: 0.3, far: 500, position: [0, 8, 14] }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <FrameCounter onReady={handleCanvasReady} />
        <GameScene
          engine={engine.current}
          weatherType={weatherType}
          onHUDUpdate={onHUDUpdate}
          onPhoneToggle={onPhoneToggle}
          onMapToggle={onMapToggle}
          onTownHallToggle={() => setShowTownHall(t => !t)}
          onWeatherCycle={onWeatherCycle}
        />
      </Canvas>

      {/* ── HUD overlay ── */}
      {!loadVisible && <HUD data={hud} onPhone={onPhoneToggle} />}

      {/* ── Weather indicator ── */}
      {!loadVisible && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none select-none"
          style={{
            background: 'rgba(0,0,0,0.38)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px',
            padding: '3px 14px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(4px)',
            letterSpacing: '0.02em',
          }}
        >
          {WEATHER_LABELS[weatherType]}
          <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 8, fontSize: 11 }}>
            G 切換
          </span>
        </div>
      )}

      {/* ── Mini-map ── */}
      {!loadVisible && (
        <MiniMap
          state={miniState}
          world={engine.current.world}
          expanded={mapExpanded}
          onWaypointSet={handleWaypointSet}
        />
      )}

      {/* ── Phone ── */}
      {showPhone && (
        <PhoneUI
          onClose={() => setShowPhone(false)}
          onCallTaxi={() => { engine.current.dispatchTaxi(); setShowPhone(false); }}
          onOrderFood={(i) => { engine.current.dispatchFood(i); setShowPhone(false); }}
          onCallHelicopter={() => { engine.current.dispatchHelicopter(); setShowPhone(false); }}
          onLaunchDrone={() => { engine.current.launchDrone(); setShowPhone(false); }}
          onLandDrone={() => { engine.current.landDrone(); setShowPhone(false); }}
          onRTLDrone={() => { engine.current.landDrone(); }}
          onCancelOrder={(id) => { engine.current.cancelOrder(id); }}
          orders={hud.orders}
          drone={hud.drone}
          callLog={hud.callLog ?? []}
        />
      )}

      {/* ── Town Hall UI ── */}
      {showTownHall && (
        <TownHallUI open={showTownHall} onClose={() => setShowTownHall(false)} />
      )}

      {/* ── Near Town Hall prompt ── */}
      {!loadVisible && !showTownHall && !showPhone && hud.nearTownHall && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-auto"
          style={{ animation: 'notifSlideIn 0.3s ease-out' }}
        >
          <button
            onClick={() => setShowTownHall(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:scale-105 transition-all shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
              border: '1px solid rgba(96,165,250,0.4)',
              boxShadow: '0 0 24px rgba(59,130,246,0.35)',
            }}
          >
            <span>🏛️</span>
            <span>進入城鎮辦事處</span>
            <kbd className="bg-white/15 text-white/70 px-2 py-0.5 rounded text-[11px] ml-1">T</kbd>
          </button>
        </div>
      )}

      {/* ── Loading overlay (semi-transparent, on top of live Canvas) ── */}
      {loadVisible && (
        <div
          className="absolute inset-0 z-50 transition-opacity duration-700 ease-out pointer-events-auto"
          style={{ opacity: loadFade ? 0 : 1, pointerEvents: loadFade ? 'none' : 'auto' }}
        >
          <LoadingScreen progress={loadProgress} statusText={loadText} />
        </div>
      )}
    </div>
  );
}
