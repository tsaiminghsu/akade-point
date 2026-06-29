'use client'
import { useState, useCallback, useRef } from 'react'
import DiceScene from './DiceScene'
import GameHUD, { BetAmount, getMatchInfo } from './GameHUD'
import { DicePhase } from './Die'

const ROLL_MS = 2800
const SETTLE_MS = 900
const RESULT_MS = 3000
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
  const spreadX = 2.5 - maxHalf - 0.10   // stay inside box with margin
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

export default function DiceGame() {
  const [credits, setCredits]         = useState(STARTING_CREDITS)
  const [bet, setBet]                 = useState<BetAmount>(10)
  const [diceCount, setDiceCount]     = useState(9)
  const [windCount, setWindCount]     = useState(0)
  const [numberDieSize, setNumberDieSize] = useState(22)
  const [windDieSize, setWindDieSize]     = useState(22)
  const [phase, setPhase]             = useState<DicePhase>('idle')
  const [diceValues, setDiceValues]   = useState<number[]>(
    Array.from({ length: 9 }, (_, i) => (i % 6) + 1)
  )
  const [rollId, setRollId]           = useState(0)
  const [finalPositions, setFinalPositions] = useState<[number, number, number][]>([])
  const [result, setResult]           = useState<ReturnType<typeof getMatchInfo> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current) }

  const handleStart = useCallback(() => {
    if (phase !== 'idle' || credits < bet) return
    clearTimer()

    const nextId = rollId + 1
    const newValues = Array.from({ length: diceCount }, () => Math.ceil(Math.random() * 6))
    const positions = computeFinalPositions(getDieSizes(diceCount, windCount, numberDieSize, windDieSize), nextId)

    setCredits(c => c - bet)
    setDiceValues(newValues)
    setFinalPositions(positions)
    setRollId(nextId)
    setResult(null)
    setPhase('rolling')

    timerRef.current = setTimeout(() => {
      setPhase('settling')
      timerRef.current = setTimeout(() => {
        setPhase('result')
        const info = getMatchInfo(newValues, bet, diceCount)
        setResult(info)
        if (info.winAmount > 0) setCredits(c => c + info.winAmount)
        timerRef.current = setTimeout(() => setPhase('idle'), RESULT_MS)
      }, SETTLE_MS)
    }, ROLL_MS)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, credits, bet, diceCount, windCount, numberDieSize, windDieSize, rollId])

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
    setFinalPositions([]); setRollId(0); setResult(null)
  }

  const handleWindCountChange = (n: number) => {
    if (phase !== 'idle') return
    setWindCount(Math.min(n, diceCount))
    setFinalPositions([]); setRollId(0); setResult(null)
  }

  const handleNumberDieSizeChange = (mm: number) => {
    if (phase !== 'idle') return
    setNumberDieSize(mm)
    setFinalPositions([]); setRollId(0); setResult(null)
  }

  const handleWindDieSizeChange = (mm: number) => {
    if (phase !== 'idle') return
    setWindDieSize(mm)
    setFinalPositions([]); setRollId(0); setResult(null)
  }

  return (
    <div
      className="relative w-full h-dvh overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, hsl(222 47% 14%) 0%, hsl(222 47% 5%) 100%)' }}
    >
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
        result={result}
        diceValues={diceValues}
        diceCount={diceCount}
        windCount={windCount}
        numberDieSize={numberDieSize}
        windDieSize={windDieSize}
        onBetChange={handleBetChange}
        onDiceCountChange={handleDiceCountChange}
        onWindCountChange={handleWindCountChange}
        onNumberDieSizeChange={handleNumberDieSizeChange}
        onWindDieSizeChange={handleWindDieSizeChange}
        onStart={handleStart}
      />
    </div>
  )
}
