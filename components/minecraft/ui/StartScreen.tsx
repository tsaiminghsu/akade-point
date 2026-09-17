'use client';

/**
 * Minecraft Web Edition — Phase 1 · Step 8
 * Overlay shown whenever the pointer is not locked.
 */

import type { RefObject } from 'react';
import { useMinecraftStore } from '../stores';

export default function StartScreen({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const locked = useMinecraftStore(s => s.locked);
  if (locked) return null;

  const start = () => {
    canvasRef.current?.requestPointerLock();
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#10141f]/90 p-8 text-center shadow-2xl">
        <div className="mb-1 text-4xl">⛏️</div>
        <h1 className="mb-1 text-2xl font-bold text-white">方塊世界</h1>
        <p className="mb-6 text-sm text-white/50">Minecraft Web Edition · Phase 1</p>

        <div className="mb-6 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white/5 p-4 text-left text-xs text-white/70">
          <span>WASD</span><span>移動</span>
          <span>Space / Shift</span><span>跳躍 / 加速</span>
          <span>滑鼠左鍵</span><span>挖掘方塊</span>
          <span>滑鼠右鍵</span><span>放置方塊</span>
          <span>1–9 / 滾輪</span><span>切換方塊</span>
          <span>F</span><span>切換飛行</span>
          <span>Esc</span><span>離開遊戲畫面</span>
        </div>

        <button
          onClick={start}
          className="w-full rounded-lg bg-emerald-500 py-3 text-base font-bold text-black transition-colors hover:bg-emerald-400"
        >
          ▶ 開始遊戲
        </button>
        <p className="mt-3 text-[11px] text-white/40">建議使用電腦遊玩（需要滑鼠指標鎖定）</p>
      </div>
    </div>
  );
}
