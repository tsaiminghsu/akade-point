'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { DicePhase } from './Die'

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
  result: ResultInfo | null
  diceValues: number[]
  diceCount: number
  windCount: number
  numberDieSize: number
  windDieSize: number
  onBetChange: (b: BetAmount) => void
  onDiceCountChange: (n: number) => void
  onWindCountChange: (n: number) => void
  onNumberDieSizeChange: (mm: number) => void
  onWindDieSizeChange: (mm: number) => void
  onStart: () => void
}

const BET_OPTIONS: BetAmount[] = [10, 50, 100]
const DIE_SIZES = [12, 16, 20, 22, 25]
const WIND_CHARS = ['東', '西', '南', '北', '中', '發']

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

function DiceChip({ value, isWind }: { value: number; isWind: boolean }) {
  if (!isWind) {
    return (
      <span className="w-7 h-7 rounded bg-white text-black font-bold text-sm flex items-center justify-center shadow">
        {value}
      </span>
    )
  }
  const char = WIND_CHARS[value - 1]
  const bg = '#f7f5f0'
  const fg = value === 5 ? '#c0392b' : value === 6 ? '#1e8449' : '#1a1a1a'
  return (
    <span
      className="w-7 h-7 rounded font-bold text-sm flex items-center justify-center shadow"
      style={{ background: bg, color: fg, fontFamily: '"PingFang SC","Microsoft YaHei",serif' }}
    >
      {char}
    </span>
  )
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

export default function GameHUD({
  credits, bet, phase, result, diceValues, diceCount, windCount, numberDieSize, windDieSize,
  onBetChange, onDiceCountChange, onWindCountChange, onNumberDieSizeChange, onWindDieSizeChange, onStart,
}: GameHUDProps) {
  const isJackpot = diceCount === 1 ? result?.matches === 6 : result?.matches === diceCount
  const canPlay = phase === 'idle' && credits >= bet
  const table = buildPayoutTable(diceCount)
  const disabled = phase !== 'idle'

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col" style={{ zIndex: 10 }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
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
          {phase === 'idle' ? '開始遊戲' : phase === 'rolling' ? '搖動中…' : phase === 'settling' ? '落定中…' : '結果'}
          {phase === 'idle' && <span className="ml-2 text-sm font-normal opacity-70">{bet} 幣/次</span>}
        </motion.button>
      </div>

      {/* Result banner */}
      <AnimatePresence>
        {result && phase === 'result' && (
          <motion.div
            initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="absolute bottom-56 left-3 right-3 pointer-events-none"
          >
            <div className={[
              'rounded-2xl p-4 text-center border backdrop-blur-sm',
              result.winAmount > 0 ? 'bg-amber-500/20 border-amber-400/60' : 'bg-white/5 border-white/20',
            ].join(' ')}>
              <div className="text-3xl font-black text-white mb-1">{result.label}</div>
              {result.winAmount > 0 ? (
                <div className="text-amber-300 font-bold text-lg">
                  +{result.winAmount.toLocaleString()} 幣
                  <span className="text-sm text-amber-400/70 ml-2">({result.multiplier}×)</span>
                </div>
              ) : (
                <div className="text-white/50 text-sm">再接再厲！</div>
              )}
              <div className="flex justify-center gap-1 mt-2 flex-wrap">
                {diceValues.map((v, i) => (
                  <DiceChip key={i} value={v} isWind={i < windCount} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jackpot overlay */}
      <AnimatePresence>
        {isJackpot && phase === 'result' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.28) 0%, transparent 70%)' }}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [-2, 2, -2, 0] }}
              transition={{ duration: 0.45, repeat: 5 }}
              className="text-center"
            >
              <div className="text-6xl mb-2">🎰</div>
              <div className="text-4xl font-black text-amber-300 drop-shadow-lg">全同豹子！</div>
              <div className="text-xl text-amber-200 mt-1">{table.at(-1)?.multiplier}×</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
