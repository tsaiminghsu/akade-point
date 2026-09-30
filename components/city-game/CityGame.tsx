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
import PostFX from './PostFX';
import {
  DEFAULT_CAPS,
  GraphicsCaps,
  GraphicsSettings,
  Preset,
  detectPreset,
  detectTier,
  loadGraphics,
  presetSettings,
  resolve,
  writeGraphics,
} from './graphicsSettings';
import { probeGpu } from './gpuProbe';
import { AdaptiveState, adaptiveStep, createAdaptiveState } from './adaptiveQuality';
import { isBenchRunning, runBenchmark } from './bench';
import { touchLayout } from './touchLayout';

const TIER_LABEL: Record<string, string> = { low: '低', medium: '中', high: '高', ultra: '極致' };

function coarsePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/**
 * First run: the preset the GPU can carry (see detectTier). Afterwards: the
 * player's own settings, auto-adjust steps included.
 */
function initialGraphics(): GraphicsSettings {
  return loadGraphics() ?? presetSettings(detectTier(probeGpu(), coarsePointer()));
}

function screenCaps(): Pick<GraphicsCaps, 'pixelRatio' | 'viewportWidth' | 'viewportHeight'> {
  if (typeof window === 'undefined') return DEFAULT_CAPS;
  return {
    pixelRatio: window.devicePixelRatio || 1,
    viewportWidth: window.innerWidth || DEFAULT_CAPS.viewportWidth,
    viewportHeight: window.innerHeight || DEFAULT_CAPS.viewportHeight,
  };
}

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
  restrictedZone: false,
  hurtFlash: 0,
  cannonReady: null,
  tiresPopped: false,
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
  // Known up front (browser-only component), so the first resolve — and the
  // canvas' antialias flag — already match the device.
  const [isMobile,     setIsMobile]    = useState(coarsePointer);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [paused,       setPaused]      = useState(false);
  const [fps,          setFps]         = useState(0);

  // ── Graphics settings ──────────────────────────────────────────────────────
  // Read synchronously: this component only ever renders in the browser
  // (ssr: false), and the canvas' antialias flag is fixed at creation, so the
  // settings must be known before the first render.
  const [gfx,  setGfx]  = useState<GraphicsSettings>(initialGraphics);
  const [caps, setCaps] = useState<GraphicsCaps>(() => ({
    ...DEFAULT_CAPS, ...screenCaps(), renderer: probeGpu(),
  }));
  // Only what the player (or auto-adjust) changes is saved, so the GPU is
  // detected afresh each run until then.
  const initialGfx = useRef(gfx);
  const gfxRef = useRef(gfx);
  gfxRef.current = gfx;

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

  // Persist whatever the player settles on.
  useEffect(() => {
    if (gfx !== initialGfx.current) writeGraphics(gfx);
  }, [gfx]);

  // The pixel budget depends on the screen: follow resizes, window moves
  // between monitors and browser zoom (all of which fire 'resize').
  useEffect(() => {
    const onResize = () => {
      const next = screenCaps();
      setCaps(c => (
        c.pixelRatio === next.pixelRatio
        && c.viewportWidth === next.viewportWidth
        && c.viewportHeight === next.viewportHeight
      ) ? c : { ...c, ...next });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resolved = useMemo(() => resolve(gfx, { ...caps, isMobile }), [gfx, caps, isMobile]);

  // Touch HUD positions follow the screen shape: turning the phone fires
  // 'resize', which updates caps.
  const touch = useMemo(
    () => (isMobile ? touchLayout(caps.viewportWidth, caps.viewportHeight) : null),
    [isMobile, caps.viewportWidth, caps.viewportHeight],
  );
  const capsRef = useRef(caps);
  capsRef.current = caps;
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

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

  // PostFX measures the real render rate twice a second. It drives the FPS
  // readout and auto-adjust, which steps quality down after a sustained drop.
  const adaptive = useRef<AdaptiveState | null>(null);
  const adaptiveActive = useRef(false);
  adaptiveActive.current = !loadVisible && !anyOverlayOpen;
  useEffect(() => {
    const onFps = (e: Event) => {
      const fps = (e as CustomEvent).detail.fps as number;
      const settings = gfxRef.current;
      if (settings.showFps) setFps(fps);

      const now = performance.now() / 1000;
      const { state, action } = adaptiveStep(
        adaptive.current ?? createAdaptiveState(now),
        {
          now,
          fps,
          active: adaptiveActive.current && document.visibilityState === 'visible' && !isBenchRunning(),
        },
        settings,
      );
      adaptive.current = state;
      if (action.kind === 'none') return;
      setGfx(action.settings);
      engine.current.addNotification(
        action.kind === 'budget'
          ? '⚙️ 畫面不順，已自動降低解析度'
          : `⚙️ 畫面不順，已自動調降為「${TIER_LABEL[action.settings.preset]}」畫質`,
        '#fbbf24',
      );
    };
    window.addEventListener('city:fps', onFps as EventListener);
    return () => window.removeEventListener('city:fps', onFps as EventListener);
  }, []);

  useEffect(() => {
    if (!resolved.showFps) setFps(0);
  }, [resolved.showFps]);

  // Dev-only benchmark: /games/city-game?bench=1 runs bench.ts once the city
  // has loaded and settled.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || loadVisible) return;
    if (!new URLSearchParams(window.location.search).has('bench')) return;
    const timer = window.setTimeout(() => {
      void runBenchmark(engine.current, () => ({
        gpu: capsRef.current.renderer || 'unknown',
        preset: detectPreset(gfxRef.current),
        render: `${resolvedRef.current.renderWidth}x${resolvedRef.current.renderHeight}`,
        fpsCap: gfxRef.current.fpsCap,
      }));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [loadVisible]);

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
    // Picking a resolution by hand overrides what auto-adjust had cut.
    setGfx(prev => ({ ...prev, ...patch, ...('resolutionScale' in patch ? { budgetScale: 1 } : {}) }));
  }, []);
  const onGfxPreset = useCallback((preset: Preset) => {
    if (preset === 'custom') return;
    setGfx(prev => presetSettings(preset, { autoAdjust: prev.autoAdjust }));
  }, []);
  const onGfxAutoDetect = useCallback(() => {
    setGfx(prev => presetSettings(detectTier(caps.renderer, isMobile), { autoAdjust: prev.autoAdjust }));
  }, [caps.renderer, isMobile]);
  const onResume = useCallback(() => setPaused(false), []);
  // Touch devices have no Esc; the quick-button strip opens the menu instead.
  const onPause = useCallback(() => setPaused(true), []);
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
   * What the real context can take. The GPU name normally came from the probe
   * before the canvas existed; this fills in the texture limit, and the name
   * too if the probe was refused.
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
    const maxTextureSize = ctx.getParameter(ctx.MAX_TEXTURE_SIZE) as number;
    setCaps(c => ({ ...c, maxTextureSize, renderer: c.renderer || renderer }));
  }

  return (
    <div
      data-testid="city-game-root"
      className="relative overflow-hidden bg-[#070b13]"
      style={{
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        overscrollBehavior: 'none',
      }}
    >

      {/* ── 3D Canvas ── always mounted so rendering starts immediately ──
          Multisampling is fixed when the context is created, so switching it
          remounts the canvas (keyed). The engine lives outside and carries on. */}
      <Canvas
        key={resolved.canvasMsaa ? 'msaa' : 'plain'}
        shadows={resolved.shadowsEnabled}
        dpr={resolved.dpr}
        gl={{ antialias: resolved.canvasMsaa, powerPreference: 'high-performance' }}
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
        <PostFX
          engine={engine.current}
          graphics={resolved}
          wet={weatherType === 'rain' || weatherType === 'storm'}
        />
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
      {!loadVisible && (
        <HUD data={hud} onPhone={onPhoneToggle} onChallenge={onChallengeToggle} isMobile={isMobile} touch={touch} />
      )}

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
        <MissionPanel mission={hud.mission} isMobile={isMobile} touch={touch} onCancel={onCancelMission} />
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
            // Touch: above the portrait minimap, or under the weather pill in landscape.
            ...(touch?.prompt.top !== undefined
              ? { top: `calc(${touch.prompt.top}px + env(safe-area-inset-top, 0px))` }
              : { bottom: touch ? `calc(${touch.prompt.bottom}px + env(safe-area-inset-bottom, 0px))` : '92px' }),
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
          {/* E reopens a brief the player declined and stayed on; touch
              devices get the same action as a button in the action cluster. */}
          {hud.nearMarker
            ? `${isMobile ? '點「查看任務」' : '按 E 查看任務'}：${hud.nearMarker.icon} ${hud.nearMarker.title}`
            : isMobile ? '點「開始接客」開始載客' : '按 E 開始接客'}
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
          點擊畫面以滑鼠環視 · Esc 暫停選單
        </div>
      )}

      {/* ── FPS readout ── */}
      {!loadVisible && resolved.showFps && (
        <div
          className="absolute pointer-events-none select-none"
          style={{
            top: 12,
            right: isMobile ? 12 : 56,
            zIndex: 46,
            padding: '3px 9px',
            borderRadius: 8,
            fontSize: 11,
            fontFamily: 'monospace',
            color: fps && fps < 30 ? '#f87171' : 'rgba(255,255,255,0.75)',
            background: 'rgba(0,0,0,0.42)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {fps} FPS
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
        detectedTier={detectTier(caps.renderer, isMobile)}
        renderSize={[resolved.renderWidth, resolved.renderHeight]}
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
          touch={touch}
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

      {/* ── Near Town Hall prompt ── (touch gets the 🏛 quick button instead;
          this pill would sit on top of the joystick) */}
      {!loadVisible && !isMobile && !showTownHall && !showPhone && hud.nearTownHall && (
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
              padding: '10px 20px',
            }}
          >
            <span>🏛️</span>
            <span>進入城鎮辦事處</span>
            <kbd className="bg-white/15 text-white/70 px-2 py-0.5 rounded text-[11px] ml-1">T</kbd>
          </button>
        </div>
      )}

      {/* ── Mobile touch controls ── */}
      {!loadVisible && touch && (
        <MobileControls
          input={engine.current.input}
          hud={hud}
          onPhone={onPhoneToggle}
          onChallenge={onChallengeToggle}
          onMapToggle={onMapToggle}
          onTownHallToggle={onTownHallToggle}
          onWeatherCycle={onWeatherCycle}
          onPause={onPause}
          layout={touch}
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
