'use client';
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameEngine3D } from './engine3d';
import { HUDData } from './types';
import HUD from './HUD';
import MiniMap from './MiniMap';
import PhoneUI from './PhoneUI';
import GameScene, { WeatherType } from './GameScene';
import LoadingScreen from './LoadingScreen';
import TownHallUI from './TownHallUI';
import MobileControls from './MobileControls';
import RaceHUD from './RaceHUD';
import ChallengesPanel from './ChallengesPanel';
import CashCounter from './CashCounter';
import { MissionPanel, MissionBriefModal, CenterBanner } from './MissionHUD';
import { getCourse } from './raceCourses';
import * as gameClock from './gameClock';
import PauseMenu from './PauseMenu';
import {
  DEFAULT_CAPS,
  GraphicsCaps,
  GraphicsSettings,
  Preset,
  defaultGraphics,
  detectTier,
  loadGraphics,
  presetSettings,
  resolve,
  writeGraphics,
} from './graphicsSettings';

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
  health: 100,
  wantedStars: 0,
  wantedEvading: false,
  arrestProgress: 0,
  screenFade: 0,
  screenLabel: null,
  nearVehicle: 'none',
  cash: 0,
  cashTicker: [],
  mission: null,
  nearMarker: null,
  canStartTaxi: false,
  banner: null,
  jobs: [],
  autopilot: null,
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
  const [showTownHall,    setShowTownHall]    = useState(false);
  const [showChallenges,  setShowChallenges]  = useState(false);
  const [weatherIdx,   setWeatherIdx]  = useState(0);
  const [isMobile,     setIsMobile]    = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [paused,       setPaused]      = useState(false);

  // ── Graphics settings ──────────────────────────────────────────────────────
  // Starts at the defaults so the server and first client render agree; the
  // stored settings and the detected GPU tier are applied after mount.
  const [gfx,  setGfx]  = useState<GraphicsSettings>(defaultGraphics);
  const [caps, setCaps] = useState<GraphicsCaps>(DEFAULT_CAPS);
  const gfxLoaded = useRef(false);

  // ── Loading state ──────────────────────────────────────────────────────────
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText,     setLoadText]     = useState('初始化 WebGL 3D 渲染引擎...');
  const [loadVisible,  setLoadVisible]  = useState(true);
  const [loadFade,     setLoadFade]     = useState(false);
  const loadDone = useRef(false);

  // ── Mobile detection ───────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Dev-only handle so the running simulation can be inspected from the console.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { cityEngine?: unknown }).cityEngine = engine.current;
  }, []);

  // Load stored graphics settings once, after mount.
  useEffect(() => {
    const stored = loadGraphics();
    if (stored) setGfx(stored);
    gfxLoaded.current = true;
  }, []);

  // Persist whatever the player settles on, but never the pre-load defaults.
  useEffect(() => {
    if (gfxLoaded.current) writeGraphics(gfx);
  }, [gfx]);

  const resolved = useMemo(() => resolve(gfx, { ...caps, isMobile }), [gfx, caps, isMobile]);

  // The touch profile is only the baseline: the player's own settings are
  // applied on top, in the same effect, or this would clobber them on mount.
  useEffect(() => {
    engine.current.setPerfProfile(isMobile ? 'low' : 'high');
    engine.current.applyGraphics(resolved.perfPatch);
  }, [isMobile, resolved]);

  // The engine debounces writes, so force one when the page goes away.
  useEffect(() => {
    const flush = () => engine.current.flushSave();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  // Any overlay needs the cursor back.
  const otherOverlayOpen = showPhone || mapExpanded || showTownHall || showChallenges;
  const anyOverlayOpen = otherOverlayOpen || paused;

  // Track pointer lock so the "click to look" hint can be shown/hidden.
  //
  // This also opens the pause menu: while the pointer is locked the browser
  // consumes the first Esc to exit the lock, so the game never sees that
  // keydown. Losing a lock we did not release ourselves means the player
  // pressed Esc.
  useEffect(() => {
    const onChange = () => {
      const locked = !!document.pointerLockElement;
      setPointerLocked(locked);
      if (locked) return;
      const byUs = engine.current.input.consumeReleasedByUs();
      if (!byUs && !otherOverlayOpen) setPaused(true);
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [otherOverlayOpen]);

  // Esc with the pointer already free: nothing else is listening for it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (paused) { setPaused(false); return; }
      if (otherOverlayOpen || document.pointerLockElement) return;
      setPaused(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, otherOverlayOpen]);

  // Freezing the simulation is the engine's job; it also holds the game clock.
  useEffect(() => {
    engine.current.setPaused(paused);
  }, [paused]);

  // A pause that outlives this component would leave the clock stopped.
  useEffect(() => () => engine.current.setPaused(false), []);
  useEffect(() => {
    if (anyOverlayOpen) engine.current.input.releasePointerLock();
  }, [anyOverlayOpen]);

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
  // Memoised so GameScene's effects do not see a new identity every render.
  const onTownHallToggle  = useCallback(() => setShowTownHall(t => !t), []);
  const onAcceptMission   = useCallback(() => engine.current.acceptMission(), []);
  const onDeclineMission  = useCallback(() => engine.current.declineMission(), []);
  const onCancelMission   = useCallback(() => engine.current.missions.requestCancel(gameClock.now()), []);
  const onSetJobRoute     = useCallback((defId: string) => {
    engine.current.setWaypointToMission(defId);
    setShowPhone(false);
  }, []);
  const onRestart = useCallback(() => {
    engine.current.reset({ clearSave: true });
    setShowPhone(false);
    setMapExpanded(false);
    setShowChallenges(false);
    setShowTownHall(false);
    setPaused(false);
  }, []);
  const onChallengeToggle = useCallback(() => setShowChallenges(c => !c), []);

  // ── Graphics settings callbacks ────────────────────────────────────────────
  const onGfxChange = useCallback((patch: Partial<GraphicsSettings>) => {
    setGfx(prev => ({ ...prev, ...patch }));
  }, []);
  const onGfxPreset = useCallback((preset: Preset) => {
    if (preset === 'custom') return;
    setGfx(presetSettings(preset));
  }, []);
  const onGfxAutoDetect = useCallback(() => {
    setGfx(presetSettings(detectTier(caps.renderer)));
  }, [caps.renderer]);
  const onResume = useCallback(() => setPaused(false), []);
  // A full navigation also drops the WebGL context and its textures.
  const onExitToLobby = useCallback(() => { window.location.href = '/games'; }, []);

  // ── Race callbacks ─────────────────────────────────────────────────────────
  const onStartRace = useCallback((courseId: string) => {
    engine.current.startRace(courseId);
  }, []);
  const onExitRace  = useCallback(() => { engine.current.exitRace(); }, []);
  const onRetryRace = useCallback(() => { engine.current.retryRace(); }, []);

  const weatherType = WEATHER_CYCLE[weatherIdx];

  function handleWaypointSet(wx: number, wy: number) {
    engine.current.setWaypoint(wx, wy);
  }

  /**
   * Read what the GPU can take. With no stored settings this is also the only
   * chance to pick a sensible starting preset — guessing from the renderer
   * string beats dropping an integrated laptop straight into 4096 shadows.
   */
  function detectCaps(gl: THREE.WebGLRenderer) {
    const ctx = gl.getContext();
    let renderer = '';
    try {
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    } catch {
      // Some browsers hide this for fingerprinting reasons; medium is assumed.
    }
    setCaps({
      isMobile,
      maxTextureSize: ctx.getParameter(ctx.MAX_TEXTURE_SIZE) as number,
      renderer,
    });
    if (!loadGraphics()) setGfx(presetSettings(detectTier(renderer)));
  }

  return (
    <div
      className="relative overflow-hidden bg-[#070b13]"
      style={{
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        overscrollBehavior: 'none',
      }}
    >

      {/* ── 3D Canvas ── always mounted so rendering starts immediately ── */}
      <Canvas
        shadows={resolved.shadowsEnabled}
        dpr={resolved.dpr}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: gfx.fov, near: 0.3, far: 500, position: [0, 8, 14] }}
        style={{ position: 'absolute', inset: 0 }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.5;
          pmrem.dispose();
          detectCaps(gl);
        }}
      >
        <FrameCounter onReady={handleCanvasReady} />
        <GameScene
          engine={engine.current}
          weatherType={weatherType}
          graphics={resolved}
          onHUDUpdate={onHUDUpdate}
          onPhoneToggle={onPhoneToggle}
          onMapToggle={onMapToggle}
          onTownHallToggle={onTownHallToggle}
          onWeatherCycle={onWeatherCycle}
        />
      </Canvas>

      {/* ── HUD overlay ── */}
      {!loadVisible && <HUD data={hud} onPhone={onPhoneToggle} onChallenge={onChallengeToggle} isMobile={isMobile} />}

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
          {!isMobile && (
            <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 8, fontSize: 11 }}>
              G 切換
            </span>
          )}
        </div>
      )}

      {/* ── Cash counter (top-right, above the health bar) ── */}
      {!loadVisible && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: isMobile ? 'calc(30px + env(safe-area-inset-top, 0px))' : '32px',
            right: isMobile ? '12px' : '12px',
          }}
        >
          <CashCounter cash={hud.cash} ticker={hud.cashTicker} isMobile={isMobile} />
        </div>
      )}

      {/* ── Active mission objective ── */}
      {!loadVisible && hud.mission && (
        <MissionPanel mission={hud.mission} isMobile={isMobile} onCancel={onCancelMission} />
      )}

      {/* ── Mission announcements ── */}
      {!loadVisible && hud.banner && (
        <CenterBanner banner={hud.banner} isMobile={isMobile} />
      )}

      {/* ── Mission brief ── */}
      {!loadVisible && hud.mission && hud.mission.phase === 'briefing' && (
        <MissionBriefModal
          mission={hud.mission}
          isMobile={isMobile}
          onAccept={onAcceptMission}
          onDecline={onDeclineMission}
        />
      )}

      {/* ── Contextual interact prompt ── */}
      {!loadVisible && !hud.mission && (hud.nearMarker || hud.canStartTaxi) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none"
          style={{
            bottom: isMobile ? 'calc(190px + env(safe-area-inset-bottom, 0px))' : '92px',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,210,63,0.45)',
            borderRadius: 20,
            padding: '5px 16px',
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#ffd23f',
            whiteSpace: 'nowrap',
          }}
        >
          {hud.nearMarker
            ? `按 E 接受任務：${hud.nearMarker.icon} ${hud.nearMarker.title}`
            : '按 E 開始接客'}
        </div>
      )}

      {/* ── Mouse-look hint (desktop, only while unlocked) ── */}
      {!loadVisible && !isMobile && !pointerLocked && !anyOverlayOpen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none"
          style={{
            bottom: '58px',
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(4px)',
          }}
        >
          點擊畫面以滑鼠環視 · Esc 釋放 · 再按 Esc 暫停
        </div>
      )}

      {/* ── Pause / settings ── */}
      {!loadVisible && !isMobile && !anyOverlayOpen && (
        <button
          onClick={() => setPaused(true)}
          aria-label="暫停選單"
          title="暫停選單 (Esc)"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 46,
            width: 34,
            height: 34,
            borderRadius: 10,
            fontSize: 15,
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.65)',
            background: 'rgba(0,0,0,0.42)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(4px)',
          }}
        >
          ⚙
        </button>
      )}

      <PauseMenu
        open={paused && !loadVisible}
        settings={gfx}
        gpuName={caps.renderer}
        onChange={onGfxChange}
        onPreset={onGfxPreset}
        onAutoDetect={onGfxAutoDetect}
        onClose={onResume}
        onRestart={onRestart}
        onExit={onExitToLobby}
        isMobile={isMobile}
      />

      {/* ── Mini-map ── */}
      {!loadVisible && (
        <MiniMap
          world={engine.current.world}
          expanded={mapExpanded}
          onWaypointSet={handleWaypointSet}
          isMobile={isMobile}
          onCollapse={onMapToggle}
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
          isMobile={isMobile}
          cash={hud.cash}
          jobs={hud.jobs}
          stats={engine.current.save.stats}
          onSetJobRoute={onSetJobRoute}
          onRestart={onRestart}
        />
      )}

      {/* ── Race HUD ── */}
      {!loadVisible && hud.raceSession && hud.raceSession.phase !== 'idle' && (
        <RaceHUD
          session={hud.raceSession}
          course={hud.raceSession ? getCourse(hud.raceSession.courseId) : null}
          onRetry={onRetryRace}
          onExit={onExitRace}
        />
      )}

      {/* ── Challenges Panel ── */}
      <ChallengesPanel
        open={showChallenges}
        onClose={() => setShowChallenges(false)}
        onStartRace={onStartRace}
        raceSession={hud.raceSession}
        isMobile={isMobile}
      />

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
            className="flex items-center gap-2 rounded-xl text-sm font-semibold text-white hover:scale-105 transition-all shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
              border: '1px solid rgba(96,165,250,0.4)',
              boxShadow: '0 0 24px rgba(59,130,246,0.35)',
              padding: isMobile ? '14px 24px' : '10px 20px',
            }}
          >
            <span>🏛️</span>
            <span>進入城鎮辦事處</span>
            {!isMobile && (
              <kbd className="bg-white/15 text-white/70 px-2 py-0.5 rounded text-[11px] ml-1">T</kbd>
            )}
          </button>
        </div>
      )}

      {/* ── Mobile touch controls ── */}
      {!loadVisible && isMobile && (
        <MobileControls
          input={engine.current.input}
          hud={hud}
          onPhone={onPhoneToggle}
          onChallenge={onChallengeToggle}
          onMapToggle={onMapToggle}
          onTownHallToggle={onTownHallToggle}
          onWeatherCycle={onWeatherCycle}
        />
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
