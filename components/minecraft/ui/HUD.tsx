'use client';

/**
 * Minecraft Web Edition — Phase 1 · Step 8
 * In-game overlay: crosshair, hotbar, debug readout.
 */

import { HOTBAR_BLOCKS, WORLD_HEIGHT, WORLD_SIZE_X, WORLD_SIZE_Z } from '../config';
import { getBlockDef } from '../engine/blocks';
import { useMinecraftStore } from '../stores';
import { useMiniMapStore } from '../stores/minimap.store';

export default function HUD() {
  const locked = useMinecraftStore(s => s.locked);
  const selectedSlot = useMinecraftStore(s => s.selectedSlot);
  const flying = useMinecraftStore(s => s.flying);
  const debug = useMinecraftStore(s => s.debug);
  const mmDebug = useMiniMapStore(s => s.debug);

  const selectedDef = getBlockDef(HOTBAR_BLOCKS[selectedSlot]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono">
      {/* Crosshair */}
      {locked && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/80 text-xl leading-none mix-blend-difference">
          +
        </div>
      )}

      {/* Debug readout */}
      <div className="absolute left-2 top-2 rounded bg-black/40 px-2 py-1 text-[11px] leading-5 text-white/80">
        <div>FPS {debug.fps}</div>
        <div>
          XYZ {debug.x.toFixed(1)} / {debug.y.toFixed(1)} / {debug.z.toFixed(1)}
        </div>
        <div>
          世界 {WORLD_SIZE_X}×{WORLD_SIZE_Z}×{WORLD_HEIGHT}
          {flying ? ' · 飛行' : ''}
        </div>
        {mmDebug.fps > 0 && (
          <>
            <div className="mt-1 border-t border-white/20 pt-1 text-white/50">MiniMap</div>
            <div>FPS {mmDebug.fps}</div>
            <div>Chunks {mmDebug.visibleChunks} · 重繪 {mmDebug.renderedChunks}</div>
            <div>Cache H/M {mmDebug.cacheHits}/{mmDebug.cacheMisses}</div>
            <div>耗時 {mmDebug.updateTimeMs.toFixed(2)}ms</div>
          </>
        )}
      </div>

      {/* Hotbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <div className="mb-1 text-center text-xs text-white/70">
          {selectedDef.name}
        </div>
        <div className="flex gap-1 rounded-lg bg-black/40 p-1">
          {HOTBAR_BLOCKS.map((id, i) => {
            const def = getBlockDef(id);
            const [r, g, b] = def.faces.py;
            const color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
            const active = i === selectedSlot;
            return (
              <div
                key={id}
                title={`${i + 1} · ${def.name}`}
                className={[
                  'flex h-10 w-10 items-center justify-center rounded border-2 transition-colors',
                  active ? 'border-white' : 'border-white/20',
                ].join(' ')}
              >
                <span
                  className="block h-6 w-6 rounded-sm"
                  style={{ backgroundColor: color, opacity: def.transparent ? 0.7 : 1 }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls hint (locked) */}
      {locked && (
        <div className="absolute bottom-3 right-3 rounded bg-black/40 px-2 py-1 text-[10px] leading-4 text-white/50">
          WASD 移動 · Space 跳躍 · Shift 加速
          <br />
          左鍵挖掘 · 右鍵放置 · F 飛行 · 1–9/滾輪 選方塊
        </div>
      )}
    </div>
  );
}
