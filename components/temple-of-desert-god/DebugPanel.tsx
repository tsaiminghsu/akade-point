'use client';

import { useState } from 'react';
import { useSlotStore } from '@/store/useSlotStore';

export default function DebugPanel() {
  const { debug, setDebugFlag, phase, balance } = useSlotStore();
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="absolute bottom-4 left-4 z-50 pointer-events-auto">
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-black/70 border border-red-700 text-red-400 text-xs px-2 py-1 rounded"
      >
        DEBUG {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="mt-1 bg-black/90 border border-red-800 rounded-lg p-3 text-xs text-white space-y-2 min-w-[200px]">
          <p className="text-red-400 font-bold mb-1">Debug Mode</p>

          <div className="text-gray-400 space-y-1">
            <p>Phase: <span className="text-yellow-300">{phase}</span></p>
            <p>Balance: <span className="text-green-300">{balance.toFixed(2)}</span></p>
          </div>

          <hr className="border-red-900" />

          {(
            [
              ['forceScatter', 'Force 4x Scatter'],
              ['forceWild', 'Force Wild'],
              ['forceBigWin', 'Force Big Win (Idol×5)'],
              ['speedMode', 'Speed Mode'],
            ] as [keyof typeof debug, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={debug[key]}
                onChange={e => setDebugFlag(key, e.target.checked)}
                className="accent-red-500"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
