'use client';

import { useState } from 'react';
import { useSlotStore } from '@/store/useSlotStore';
import { SYMBOL_DEFS } from '@/lib/temple-of-desert-god/constants';
import type { PaytableEntry } from '@/lib/temple-of-desert-god/types';

export default function PaytableModal() {
  const [open, setOpen] = useState(false);
  const { config } = useSlotStore();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute top-4 right-4 z-20 pointer-events-auto bg-black/60 border border-yellow-700 text-yellow-400 text-xs px-3 py-1.5 rounded-lg hover:border-yellow-500 transition"
      >
        PAYTABLE
      </button>

      {open && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#1A0800] border-2 border-yellow-600 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-yellow-300 text-xl font-bold" style={{ fontFamily: 'serif' }}>
                PAYTABLE
              </h2>
              <button onClick={() => setOpen(false)} className="text-yellow-600 hover:text-yellow-400 text-2xl">✕</button>
            </div>

            <p className="text-yellow-600 text-xs mb-4">All payouts shown per 40-line bet × bet level. Match 3–5 from left.</p>

            {/* Symbols */}
            <div className="space-y-2 mb-6">
              {SYMBOL_DEFS.filter(s => s.tier !== 'scatter' && s.tier !== 'wild').map(sym => {
                const entry = config?.paytable.find((p: PaytableEntry) => p.symbolId === sym.id);
                return (
                  <div key={sym.id} className="flex items-center gap-3 bg-black/40 rounded-lg px-3 py-2">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0"
                      style={{ background: `#${sym.color.toString(16).padStart(6, '0')}` }}
                    />
                    <span className="text-yellow-200 text-sm flex-1">{sym.label}</span>
                    {entry && (
                      <div className="flex gap-3 text-xs font-mono">
                        <span className="text-yellow-600">3×: <span className="text-yellow-300">{entry.payouts[3]}</span></span>
                        <span className="text-yellow-600">4×: <span className="text-yellow-300">{entry.payouts[4]}</span></span>
                        <span className="text-yellow-600">5×: <span className="text-yellow-300">{entry.payouts[5]}</span></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Special symbols */}
            <h3 className="text-yellow-400 text-sm font-bold mb-2">SPECIAL SYMBOLS</h3>
            <div className="space-y-2 mb-6">
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-3 py-2">
                <p className="text-yellow-300 font-bold text-sm">🌟 GOLDEN SUN (Wild)</p>
                <p className="text-yellow-600 text-xs mt-0.5">Substitutes all normal symbols. During free games carries 2×/3×/5×/10× multiplier.</p>
              </div>
              <div className="bg-orange-900/30 border border-orange-700 rounded-lg px-3 py-2">
                <p className="text-orange-300 font-bold text-sm">🏛️ TEMPLE ENTRANCE (Scatter)</p>
                <p className="text-orange-500 text-xs mt-0.5">
                  4 anywhere → 15 Free Spins + 5× bet<br/>
                  5 anywhere → 20 Free Spins + 20× bet<br/>
                  6 anywhere → 25 Free Spins + 100× bet
                </p>
              </div>
            </div>

            {/* God Powers */}
            <h3 className="text-yellow-400 text-sm font-bold mb-2">GOD POWERS (Free Games)</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: 'Sticky Wild', desc: 'Wilds stay until free games end', icon: '🔒' },
                { label: 'Expanding Wild', desc: 'Wild fills entire reel', icon: '⬆️' },
                { label: 'Random ×2~10', desc: 'Every win ×2–10 randomly', icon: '✨' },
                { label: 'Extra Spin', desc: 'Each win adds +1 free spin', icon: '➕' },
              ].map(gp => (
                <div key={gp.label} className="bg-black/50 rounded-lg p-2 text-center">
                  <div className="text-2xl mb-1">{gp.icon}</div>
                  <p className="text-yellow-300 text-xs font-bold">{gp.label}</p>
                  <p className="text-yellow-600 text-xs">{gp.desc}</p>
                </div>
              ))}
            </div>

            {/* Cascade */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-300">
              <p className="font-bold mb-1">CASCADE SYSTEM</p>
              <p>Winning symbols disappear → symbols fall down → new symbols fill from top → re-evaluate. Up to 20 cascades per spin.</p>
            </div>

            <p className="text-gray-600 text-xs mt-4 text-center">RTP: {config ? (config.rtp * 100).toFixed(1) : '96.0'}%</p>
          </div>
        </div>
      )}
    </>
  );
}
