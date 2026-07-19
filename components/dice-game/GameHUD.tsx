'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhysicsDicePhase as DicePhase } from './PhysicsDie'
import { DicePhysicsConfig } from './PhysicsDie'

export type BetAmount = 10 | 50 | 100

interface ResultInfo {
  matches: number
  multiplier: number
  winAmount: number
  label: string
}

interface GameHUDProps {
  credits: number
  bet: BetAmount
  phase: DicePhase
  diceCount: number
  windCount: number
  numberDieSize: number
  windDieSize: number
  consecutiveCount: number
  physicsConfig: DicePhysicsConfig
  onBetChange: (b: BetAmount) => void
  onDiceCountChange: (n: number) => void
  onWindCountChange: (n: number) => void
  onNumberDieSizeChange: (mm: number) => void
  onWindDieSizeChange: (mm: number) => void
  onConsecutiveChange: (n: number) => void
  onPhysicsConfigChange: (patch: Partial<DicePhysicsConfig>) => void
  onStart: () => void
}

const BET_OPTIONS: BetAmount[] = [10, 50, 100]
const DIE_SIZES = [12, 16, 20, 22, 25]
const CONSECUTIVE_OPTIONS = [1, 5, 10, 20, 50, 100]

interface PayRow { matches: number; label: string; multiplier: number }

function buildPayoutTable(n: number): PayRow[] {
  if (n === 1) return [{ matches: 4, label: '大(4-5)', multiplier: 2 }, { matches: 6, label: '最大(6)', multiplier: 5 }]
  if (n === 2) return [{ matches: 2, label: '對子', multiplier: 20 }]
  if (n === 3) return [{ matches: 2, label: '對子', multiplier: 3 }, { matches: 3, label: '豹子🎰', multiplier: 30 }]
  if (n === 4) return [{ matches: 2, label: '一對', multiplier: 2 }, { matches: 3, label: '三同', multiplier: 8 }, { matches: 4, label: '豹子🎰', multiplier: 50 }]
  if (n === 5) return [{ matches: 2, label: '一對', multiplier: 2 }, { matches: 3, label: '三同', multiplier: 5 }, { matches: 4, label: '四同', multiplier: 20 }, { matches: 5, label: '豹子🎰', multiplier: 100 }]
  if (n === 6) return [{ matches: 3, label: '三同', multiplier: 2 }, { matches: 4, label: '四同', multiplier: 8 }, { matches: 5, label: '五同', multiplier: 30 }, { matches: 6, label: '豹子🎰', multiplier: 200 }]
  if (n === 7) return [{ matches: 3, label: '三同', multiplier: 2 }, { matches: 4, label: '四同', multiplier: 8 }, { matches: 5, label: '五同', multiplier: 20 }, { matches: 6, label: '六同', multiplier: 80 }, { matches: 7, label: '豹子🎰', multiplier: 300 }]
  if (n === 8) return [{ matches: 3, label: '三同', multiplier: 2 }, { matches: 4, label: '四同', multiplier: 5 }, { matches: 5, label: '五同', multiplier: 12 }, { matches: 6, label: '六同', multiplier: 40 }, { matches: 7, label: '七同', multiplier: 150 }, { matches: 8, label: '豹子🎰', multiplier: 400 }]
  return [{ matches: 3, label: '三同', multiplier: 2 }, { matches: 4, label: '四同', multiplier: 5 }, { matches: 5, label: '五同', multiplier: 10 }, { matches: 6, label: '六同', multiplier: 20 }, { matches: 7, label: '七同', multiplier: 50 }, { matches: 8, label: '八同', multiplier: 100 }, { matches: 9, label: '豹子🎰', multiplier: 500 }]
}

export function getMatchInfo(diceValues: number[], bet: BetAmount, diceCount: number): ResultInfo {
  if (diceCount === 1) {
    const v = diceValues[0] ?? 1
    if (v === 6) return { matches: v, multiplier: 5, winAmount: bet * 5, label: '最大' }
    if (v >= 4)  return { matches: v, multiplier: 2, winAmount: bet * 2, label: '大' }
    return { matches: v, multiplier: 0, winAmount: 0, label: '沒中' }
  }
  const counts: Record<number, number> = {}
  for (const v of diceValues) counts[v] = (counts[v] ?? 0) + 1
  const max = Math.max(...Object.values(counts))
  const table = buildPayoutTable(diceCount)
  const entry = [...table].reverse().find(r => max >= r.matches)
  if (!entry) return { matches: max, multiplier: 0, winAmount: 0, label: '沒中' }
  return { matches: max, multiplier: entry.multiplier, winAmount: bet * entry.multiplier, label: entry.label }
}

function CounterRow({
  label, value, max, onChange, disabled,
}: { label: string; value: number; max: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1 justify-center">
      <span className="text-[10px] text-white/40 w-10 text-right shrink-0">{label}</span>
      {Array.from({ length: max + 1 }, (_, n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          disabled={disabled}
          className={[
            'w-7 h-7 rounded-lg font-bold text-xs transition-all border',
            value === n
              ? 'bg-purple-600 border-purple-400 text-white'
              : 'bg-white/10 border-white/15 text-white/60 hover:bg-white/20',
            disabled ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function SliderRow({
  label, value, min, max, step, display, onChange, disabled,
}: {
  label: string; value: number; min: number; max: number; step: number
  display?: (v: number) => string
  onChange: (v: number) => void; disabled: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/40 w-16 text-right shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-amber-500 disabled:opacity-40"
      />
      <span className="text-[10px] text-white/60 w-8 text-left tabular-nums">
        {display ? display(value) : value}
      </span>
    </div>
  )
}

export default function GameHUD({
  credits, bet, phase, diceCount, windCount, numberDieSize, windDieSize, consecutiveCount,
  physicsConfig,
  onBetChange, onDiceCountChange, onWindCountChange, onNumberDieSizeChange, onWindDieSizeChange,
  onConsecutiveChange, onPhysicsConfigChange, onStart,
}: GameHUDProps) {
  const [showSettings, setShowSettings] = useState(false)
  const canPlay  = (phase === 'idle' || phase === 'result') && credits >= bet
  const disabled = phase === 'shaking' || phase === 'freeroll'
  const table = buildPayoutTable(diceCount)

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ zIndex: 10 }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-14 pb-2">
        <div>
          <span className="text-xs text-amber-400/70 tracking-widest uppercase block">大怒神</span>
          <span className="text-base font-bold text-white">{diceCount}顆 · 數{numberDieSize}mm · 風{windDieSize}mm</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-amber-400/70 block">金幣</span>
          <motion.span
            key={credits}
            initial={{ scale: 1.3, color: '#fbbf24' }}
            animate={{ scale: 1, color: '#ffffff' }}
            transition={{ duration: 0.4 }}
            className="text-xl font-bold text-white tabular-nums"
          >
            {credits.toLocaleString()}
          </motion.span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Bottom panel */}
      <div
        className="pointer-events-auto px-3 pb-6 pt-3 flex flex-col gap-2"
        style={{ background: 'linear-gradient(to top, rgba(10,10,20,0.97) 78%, transparent)' }}
      >
        {/* Payout hint */}
        <div className="flex justify-center gap-1 flex-wrap">
          {table.map(r => (
            <span key={r.matches} className="text-[10px] text-amber-300/55 bg-white/5 rounded px-1.5 py-0.5 whitespace-nowrap">
              {r.label} {r.multiplier}×
            </span>
          ))}
        </div>

        {/* Settings open button */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-white/15 bg-white/5 text-white/50 text-xs hover:bg-white/10 hover:text-white/70 transition-all pointer-events-auto"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          骰子設定 · {diceCount}顆 · {consecutiveCount}局
        </button>

        {/* Bet */}
        <div className="flex gap-2">
          {BET_OPTIONS.map(b => (
            <button
              key={b}
              onClick={() => onBetChange(b)}
              disabled={disabled}
              className={[
                'flex-1 py-2 rounded-xl font-bold text-sm transition-all border',
                bet === b ? 'bg-amber-500 border-amber-400 text-black shadow shadow-amber-500/40' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {b} 幣
            </button>
          ))}
        </div>

        {/* Start */}
        <motion.button
          onClick={onStart}
          disabled={!canPlay}
          whileTap={{ scale: 0.96 }}
          className={[
            'w-full py-4 rounded-2xl font-bold text-lg tracking-wider transition-all',
            canPlay ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-xl shadow-amber-500/30' : 'bg-white/10 text-white/30 cursor-not-allowed',
          ].join(' ')}
        >
          {phase === 'idle' || phase === 'result'
            ? <>
                {phase === 'result' ? '再來一局' : '開始遊戲'}
                <span className="ml-2 text-sm font-normal opacity-70">
                  {consecutiveCount > 1 ? `${consecutiveCount}局 × ${bet} 幣` : `${bet} 幣/次`}
                </span>
              </>
            : phase === 'shaking' ? '搖動中…'
            : '滾動中…'}
        </motion.button>
      </div>

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/60 pointer-events-auto"
              style={{ zIndex: 20 }}
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="absolute bottom-0 left-0 right-0 pointer-events-auto rounded-t-3xl px-4 pt-5 pb-8 flex flex-col gap-3 overflow-y-auto max-h-[85vh]"
              style={{ zIndex: 21, background: 'linear-gradient(to bottom, hsl(222 47% 12%), hsl(222 47% 8%))' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white/80">骰子設定</span>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-7 h-7 rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white flex items-center justify-center text-lg leading-none transition-all"
                >
                  ×
                </button>
              </div>

              {/* Number die size */}
              <div className="flex items-center gap-1 justify-center">
                <span className="text-[10px] text-white/40 w-12 text-right shrink-0">數字大小:</span>
                {DIE_SIZES.map(mm => (
                  <button
                    key={mm}
                    onClick={() => onNumberDieSizeChange(mm)}
                    disabled={disabled}
                    className={[
                      'px-2 h-7 rounded-lg font-bold text-xs transition-all border',
                      numberDieSize === mm
                        ? 'bg-amber-600 border-amber-400 text-white shadow shadow-amber-500/30'
                        : 'bg-white/10 border-white/15 text-white/60 hover:bg-white/20',
                      disabled ? 'opacity-40 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {mm}
                  </button>
                ))}
                <span className="text-[10px] text-white/30">mm</span>
              </div>

              {/* Wind die size */}
              <div className="flex items-center gap-1 justify-center">
                <span className="text-[10px] text-white/40 w-12 text-right shrink-0">風向大小:</span>
                {DIE_SIZES.map(mm => (
                  <button
                    key={mm}
                    onClick={() => onWindDieSizeChange(mm)}
                    disabled={disabled}
                    className={[
                      'px-2 h-7 rounded-lg font-bold text-xs transition-all border',
                      windDieSize === mm
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow shadow-emerald-500/30'
                        : 'bg-white/10 border-white/15 text-white/60 hover:bg-white/20',
                      disabled ? 'opacity-40 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {mm}
                  </button>
                ))}
                <span className="text-[10px] text-white/30">mm</span>
              </div>

              {/* Dice count */}
              <CounterRow label="數字:" value={diceCount} max={9} onChange={onDiceCountChange} disabled={disabled} />

              {/* Wind dice count */}
              <CounterRow label="風向:" value={windCount} max={Math.min(diceCount, 6)} onChange={onWindCountChange} disabled={disabled} />

              {/* Consecutive count */}
              <div className="flex items-center gap-1 justify-center">
                <span className="text-[10px] text-white/40 w-10 text-right shrink-0">局數:</span>
                {CONSECUTIVE_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => onConsecutiveChange(n)}
                    disabled={disabled}
                    className={[
                      'px-2 h-7 rounded-lg font-bold text-xs transition-all border',
                      consecutiveCount === n
                        ? 'bg-rose-600 border-rose-400 text-white'
                        : 'bg-white/10 border-white/15 text-white/60 hover:bg-white/20',
                      disabled ? 'opacity-40 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                ))}
                {consecutiveCount > 1 && (
                  <span className="text-[10px] text-white/30 ml-1">共 {(consecutiveCount * bet).toLocaleString()} 幣</span>
                )}
              </div>

              {/* Physics settings */}
              <div className="border-t border-white/10 pt-3 flex flex-col gap-2.5">
                <span className="text-[10px] text-white/30 text-center tracking-widest uppercase">物理設定</span>

                <SliderRow
                  label="搖骰強度" value={physicsConfig.kickUp} min={5} max={20} step={1}
                  onChange={v => onPhysicsConfigChange({ kickUp: v })} disabled={disabled}
                />
                <SliderRow
                  label="搖骰時長" value={physicsConfig.shakeDuration / 1000} min={1} max={5} step={0.5}
                  display={v => `${v}s`}
                  onChange={v => onPhysicsConfigChange({ shakeDuration: Math.round(v * 1000) })} disabled={disabled}
                />
                <SliderRow
                  label="地板摩擦" value={physicsConfig.floorFriction} min={1} max={20} step={1}
                  onChange={v => onPhysicsConfigChange({ floorFriction: v })} disabled={disabled}
                />
                <SliderRow
                  label="地板彈力" value={physicsConfig.bounceFloor} min={0.1} max={0.8} step={0.05}
                  onChange={v => onPhysicsConfigChange({ bounceFloor: v })} disabled={disabled}
                />
                <SliderRow
                  label="旋轉阻尼" value={physicsConfig.rotDamp} min={1} max={10} step={0.5}
                  onChange={v => onPhysicsConfigChange({ rotDamp: v })} disabled={disabled}
                />
                <SliderRow
                  label="重力" value={physicsConfig.gravity} min={10} max={40} step={1}
                  onChange={v => onPhysicsConfigChange({ gravity: v })} disabled={disabled}
                />
                <SliderRow
                  label="靜止門檻" value={physicsConfig.settleLinVel} min={0.01} max={0.1} step={0.005}
                  display={v => v.toFixed(3)}
                  onChange={v => onPhysicsConfigChange({ settleLinVel: v, settleAngVel: v })} disabled={disabled}
                />
              </div>

              {/* Confirm */}
              <button
                onClick={() => setShowSettings(false)}
                className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/15 text-white/70 font-bold text-sm hover:bg-white/20 transition-all"
              >
                確認
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
