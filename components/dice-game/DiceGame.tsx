'use client'
import { useState, useCallback, useRef } from 'react'
import DiceScene from './DiceScene'
import GameHUD, { BetAmount, getMatchInfo } from './GameHUD'
import { DicePhase } from './Die'
import ScratchCard from './ScratchCard'

const ROLL_MS = 2800
const SETTLE_MS = 900
const STARTING_CREDITS = 500
const MM_TO_UNIT = 0.9 / 25

function seededRng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 91273 + n * 7219 + 441) % 1)
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function getDieSizes(count: number, windCount: number, numberDieSize: number, windDieSize: number) {
  return Array.from({ length: count }, (_, i) => i < windCount ? windDieSize : numberDieSize)
}

function computeFinalPositions(dieSizes: number[], rollSeed: number): [number, number, number][] {
  const count = dieSizes.length
  if (count === 0) return []
  const sizes = dieSizes.map(mm => mm * MM_TO_UNIT)
  const halves = sizes.map(s => s / 2)
  const maxHalf = Math.max(...halves)
  const spreadX = 2.5 - maxHalf - 0.10
  const spreadZ = 1.75 - maxHalf - 0.10

  const r = (n: number) => seededRng(rollSeed, n)

  const cols = count <= 3 ? count : Math.round(Math.sqrt(count * (spreadX / spreadZ)))
  const rows = Math.ceil(count / Math.max(cols, 1))
  const stepX = (spreadX * 2) / Math.max(cols, 1)
  const stepZ = (spreadZ * 2) / Math.max(rows, 1)

  const pos: [number, number, number][] = Array.from({ length: count }, (_, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    const bx = -spreadX + (col + 0.5) * stepX
    const bz = -spreadZ + (row + 0.5) * stepZ
    return [
      clamp(bx + (r(i * 5) - 0.5) * stepX * 0.9, -spreadX, spreadX),
      halves[i],
      clamp(bz + (r(i * 5 + 1) - 0.5) * stepZ * 0.9, -spreadZ, spreadZ),
    ]
  })

  for (let iter = 0; iter < 140; iter++) {
    let moved = false
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const dx = pos[b][0] - pos[a][0], dz = pos[b][2] - pos[a][2]
        const d2 = dx * dx + dz * dz
        const minSep = halves[a] + halves[b] + 0.07
        if (d2 < minSep * minSep) {
          const d  = d2 < 1e-8 ? 1e-4 : Math.sqrt(d2)
          const ov = (minSep - d) * 0.58
          const nx = d2 < 1e-8 ? r(a * 3) : dx / d
          const nz = d2 < 1e-8 ? r(b * 3) : dz / d
          pos[a][0] = clamp(pos[a][0] - nx * ov, -spreadX, spreadX)
          pos[a][2] = clamp(pos[a][2] - nz * ov, -spreadZ, spreadZ)
          pos[b][0] = clamp(pos[b][0] + nx * ov, -spreadX, spreadX)
          pos[b][2] = clamp(pos[b][2] + nz * ov, -spreadZ, spreadZ)
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return pos
}

type ActiveTab = 'dice' | 'scratch'

export default function DiceGame() {
  const [activeTab, setActiveTab]      = useState<ActiveTab>('dice')
  const [credits, setCredits]          = useState(STARTING_CREDITS)
  const [bet, setBet]                  = useState<BetAmount>(10)
  const [diceCount, setDiceCount]      = useState(9)
  const [windCount, setWindCount]      = useState(0)
  const [numberDieSize, setNumberDieSize] = useState(22)
  const [windDieSize, setWindDieSize]     = useState(22)
  const [consecutiveCount, setConsecutiveCount] = useState(1)
  const [phase, setPhase]              = useState<DicePhase>('idle')
  const [diceValues, setDiceValues]    = useState<number[]>(
    Array.from({ length: 9 }, (_, i) => (i % 6) + 1)
  )
  const [rollId, setRollId]            = useState(0)
  const [finalPositions, setFinalPositions] = useState<[number, number, number][]>([])
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoRollRef = useRef(0)

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current) }

  const doRoll = useCallback((currentRollId: number) => {
    const nextId = currentRollId + 1
    const newValues = Array.from({ length: diceCount }, () => Math.ceil(Math.random() * 6))
    const positions = computeFinalPositions(getDieSizes(diceCount, windCount, numberDieSize, windDieSize), nextId)

    setCredits(c => c - bet)
    setDiceValues(newValues)
    setFinalPositions(positions)
    setRollId(nextId)
    setPhase('rolling')

    timerRef.current = setTimeout(() => {
      setPhase('settling')
      timerRef.current = setTimeout(() => {
        autoRollRef.current -= 1
        if (autoRollRef.current > 0) {
          // More rolls remaining — apply winnings then start next roll
          const info = getMatchInfo(newValues, bet, diceCount)
          if (info.winAmount > 0) setCredits(c => c + info.winAmount)
          doRoll(nextId)
        } else {
          // Last roll — apply winnings and go idle (no result banner)
          const info = getMatchInfo(newValues, bet, diceCount)
          if (info.winAmount > 0) setCredits(c => c + info.winAmount)
          setPhase('idle')
        }
      }, SETTLE_MS)
    }, ROLL_MS)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet, diceCount, windCount, numberDieSize, windDieSize])

  const handleStart = useCallback(() => {
    if (phase !== 'idle' || credits < bet * consecutiveCount) return
    clearTimer()
    autoRollRef.current = consecutiveCount
    doRoll(rollId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, credits, bet, consecutiveCount, rollId, doRoll])

  const handleBetChange = (b: BetAmount) => {
    if (phase !== 'idle') return
    setBet(b)
    if (credits < b) setCredits(STARTING_CREDITS)
  }

  const handleDiceCountChange = (n: number) => {
    if (phase !== 'idle') return
    setDiceCount(n)
    setWindCount(wc => Math.min(wc, n))
    setDiceValues(Array.from({ length: n }, (_, i) => (i % 6) + 1))
    setFinalPositions([]); setRollId(0)
  }

  const handleWindCountChange = (n: number) => {
    if (phase !== 'idle') return
    setWindCount(Math.min(n, diceCount))
    setFinalPositions([]); setRollId(0)
  }

  const handleNumberDieSizeChange = (mm: number) => {
    if (phase !== 'idle') return
    setNumberDieSize(mm)
    setFinalPositions([]); setRollId(0)
  }

  const handleWindDieSizeChange = (mm: number) => {
    if (phase !== 'idle') return
    setWindDieSize(mm)
    setFinalPositions([]); setRollId(0)
  }

  return (
    <div
      className="relative w-full h-dvh overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, hsl(222 47% 14%) 0%, hsl(222 47% 5%) 100%)' }}
    >
      {/* Tab bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1 z-20 bg-white/10 rounded-xl p-1 pointer-events-auto">
        <button
          onClick={() => { if (phase === 'idle') setActiveTab('dice') }}
          className={[
            'px-4 py-1.5 rounded-lg text-sm font-bold transition-all',
            activeTab === 'dice' ? 'bg-amber-500 text-black' : 'text-white/60 hover:text-white',
            phase !== 'idle' && activeTab !== 'dice' ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
        >
          骰子
        </button>
        <button
          onClick={() => { if (phase === 'idle') setActiveTab('scratch') }}
          className={[
            'px-4 py-1.5 rounded-lg text-sm font-bold transition-all',
            activeTab === 'scratch' ? 'bg-amber-500 text-black' : 'text-white/60 hover:text-white',
            phase !== 'idle' && activeTab !== 'scratch' ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
        >
          刮刮卡
        </button>
      </div>

      {activeTab === 'dice' && (
        <>
          <div className="absolute inset-0">
            <DiceScene
              diceValues={diceValues}
              phase={phase}
              rollId={rollId}
              diceCount={diceCount}
              windCount={windCount}
              numberDieSize={numberDieSize}
              windDieSize={windDieSize}
              finalPositions={finalPositions}
            />
          </div>

          <GameHUD
            credits={credits}
            bet={bet}
            phase={phase}
            diceCount={diceCount}
            windCount={windCount}
            numberDieSize={numberDieSize}
            windDieSize={windDieSize}
            consecutiveCount={consecutiveCount}
            onBetChange={handleBetChange}
            onDiceCountChange={handleDiceCountChange}
            onWindCountChange={handleWindCountChange}
            onNumberDieSizeChange={handleNumberDieSizeChange}
            onWindDieSizeChange={handleWindDieSizeChange}
            onConsecutiveChange={setConsecutiveCount}
            onStart={handleStart}
          />
        </>
      )}

      {activeTab === 'scratch' && (
        <ScratchCard credits={credits} onCreditsChange={setCredits} />
      )}
    </div>
  )
}
