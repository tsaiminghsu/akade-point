'use client';

/**
 * Minecraft Web Edition — Phase 1
 * Top-level game component: builds the world, then mounts the R3F scene
 * and UI overlays.
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { FOG_FAR, FOG_NEAR, SKY_COLOR } from './config';
import { createWorld } from './engine/chunks';
import type { World } from './engine/chunks';
import { WorldRenderer } from './engine/render';
import { PlayerController } from './player';
import { HUD, StartScreen } from './ui';
import { MiniMap } from './ui/minimap';

export default function MinecraftGame() {
  const [world, setWorld] = useState<World | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Generate synchronously after first paint so the loading state shows.
    const w = createWorld();
    w.consumeDirty(); // initial meshes build on ChunkMesh mount
    setWorld(w);
  }, []);

  if (!world) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0e1a] text-white/70">
        <div className="text-center">
          <div className="mb-3 animate-pulse text-4xl">⛏️</div>
          <div className="text-sm">正在生成方塊世界...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <Canvas ref={canvasRef} camera={{ fov: 75, near: 0.1, far: 1000 }}>
        <color attach="background" args={[SKY_COLOR]} />
        <fog attach="fog" args={[SKY_COLOR, FOG_NEAR, FOG_FAR]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[80, 140, 60]} intensity={1.1} />
        <WorldRenderer world={world} />
        <PlayerController world={world} />
      </Canvas>
      <HUD />
      <StartScreen canvasRef={canvasRef} />
      <MiniMap world={world} />
    </div>
  );
}
