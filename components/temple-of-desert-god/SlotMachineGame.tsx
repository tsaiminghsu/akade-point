'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useSlotStore } from '@/store/useSlotStore';
import { buildScene } from '@/lib/temple-of-desert-god/PixiSceneBuilder';
import { AnimationEngine } from '@/lib/temple-of-desert-god/AnimationEngine';
import GameHUD from './GameHUD';
import BonusPanel from './BonusPanel';
import WinCelebration from './WinCelebration';
import DebugPanel from './DebugPanel';
import PaytableModal from './PaytableModal';
import LoadingScreen from './LoadingScreen';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

export default function SlotMachineGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const engineRef = useRef<AnimationEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [loadProgress, setLoadProgress] = useState(0);

  const { loadConfig } = useSlotStore();

  const initPixiApp = useCallback(async () => {
    if (!mountRef.current) return;

    try {
      setLoadProgress(10);

      // Load game config
      await loadConfig();
      setLoadProgress(30);

      // Create PixiJS application
      const app = new PIXI.Application({
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: 0x0D0818,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      mountRef.current.appendChild(app.view as HTMLCanvasElement);
      appRef.current = app;
      setLoadProgress(60);

      // Build PixiJS scene
      const scene = buildScene(app);
      setLoadProgress(80);

      // Initialize animation engine
      const engine = new AnimationEngine(app, scene, useSlotStore);
      engine.start();
      engineRef.current = engine;

      // Resize handler
      const handleResize = () => {
        if (!app) return;
        const clientWidth = Math.min(window.innerWidth, GAME_WIDTH);
        const clientHeight = Math.min(window.innerHeight, GAME_HEIGHT);
        const scale = Math.min(clientWidth / GAME_WIDTH, clientHeight / GAME_HEIGHT);
        const canvas = app.view as HTMLCanvasElement;
        canvas.style.width = `${GAME_WIDTH * scale}px`;
        canvas.style.height = `${GAME_HEIGHT * scale}px`;
        canvas.style.position = 'absolute';
        canvas.style.top = '50%';
        canvas.style.left = '50%';
        canvas.style.transform = 'translate(-50%, -50%)';
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(document.documentElement);
      handleResize();

      setLoadProgress(100);
      setTimeout(() => setLoaded(true), 300);

      return () => {
        resizeObserver.disconnect();
      };
    } catch (err) {
      console.error('SlotMachine init error:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to initialize game');
    }
  }, [loadConfig]);

  useEffect(() => {
    const cleanup = initPixiApp();

    return () => {
      cleanup.then(fn => fn?.());
      engineRef.current?.destroy();
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        appRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}
    >
      {/* PixiJS canvas mount point — canvas centers itself via transform */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading screen */}
      {!loaded && (
        <LoadingScreen progress={loadProgress} error={loadError} />
      )}

      {/* React overlay (absolute positioned on top of canvas) */}
      {loaded && (
        <>
          <GameHUD />
          <BonusPanel />
          <WinCelebration />
          <PaytableModal />
          <DebugPanel />
        </>
      )}
    </div>
  );
}
