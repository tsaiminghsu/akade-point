'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import DiceScene from './DiceScene'
import GameHUD, { BetAmount, getMatchInfo } from './GameHUD'
import { PhysicsDicePhase, DiePhysicsHandle, DicePhysicsConfig, DEFAULT_DICE_CONFIG } from './PhysicsDie'
import DiceDebug from './DiceDebug'
import ScratchCard from './ScratchCard'

const STARTING_CREDITS = 500

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
  const [phase, setPhase]              = useState<PhysicsDicePhase>('idle')
  const [diceValues, setDiceValues]    = useState<number[]>(Array.from({ length: 9 }, (_, i) => (i % 6) + 1))
  const [rollId, setRollId]            = useState(0)
  const [sceneReady, setSceneReady]    = useState(false)

  const [physicsConfig, setPhysicsConfig] = useState<DicePhysicsConfig>(DEFAULT_DICE_CONFIG)
  const physicsConfigRef = useRef<DicePhysicsConfig>(DEFAULT_DICE_CONFIG)
  useEffect(() => { physicsConfigRef.current = physicsConfig }, [physicsConfig])

  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoRollRef = useRef(0)
  const handlesRef  = useRef<Array<{ current: DiePhysicsHandle }>>([])
  const [debugVisible, setDebugVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSceneReady(true)))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setDebugVisible(v => !v)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current) }

  const startRoll = useCallback(() => {
    clearTimer()
    const cfg = physicsConfigRef.current
    console.log('[DiceGame] → shaking | config:', {
      shakeDuration: cfg.shakeDuration, kickUp: cfg.kickUp, kickHoriz: cfg.kickHoriz,
      gravity: cfg.gravity, bounceFloor: cfg.bounceFloor, floorFriction: cfg.floorFriction,
      rotDamp: cfg.rotDamp, linDampH: cfg.linDampH,
      settleLinVel: cfg.settleLinVel, settleAngVel: cfg.settleAngVel,
    })
    setRollId(prev => prev + 1)
    setPhase('shaking')
    timerRef.current = setTimeout(() => {
      setPhase('freeroll')
      console.log('[DiceGame] → freeroll')
    }, cfg.shakeDuration)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStart = useCallback(() => {
    if (phase !== 'idle' && phase !== 'result') return
    if (credits < bet * consecutiveCount) return
    clearTimer()
    setCredits(c => c - bet)
    autoRollRef.current = consecutiveCount
    startRoll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, credits, bet, consecutiveCount, startRoll])

  // Called by DiceScene when all dice have settled (via physics velocity detection)
  const handleSettled = useCallback((faces: number[]) => {
    setDiceValues(faces)
    const info = getMatchInfo(faces, bet, diceCount)
    if (info.winAmount > 0) setCredits(c => c + info.winAmount)

    autoRollRef.current -= 1

    if (autoRollRef.current > 0) {
      // More consecutive rounds — brief pause then next roll
      setCredits(c => c - bet)
      timerRef.current = setTimeout(() => startRoll(), 600)
    } else {
      // Stay in result indefinitely — dice hold their position until player restarts
      setPhase('result')
      console.log('[DiceGame] → result')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet, diceCount, startRoll])

  const handlePhysicsConfigChange = useCallback((patch: Partial<DicePhysicsConfig>) => {
    setPhysicsConfig(c => ({ ...c, ...patch }))
  }, [])

  const handleBetChange = (b: BetAmount) => {
    if (phase === 'shaking' || phase === 'freeroll') return
    setBet(b)
    if (credits < b) setCredits(STARTING_CREDITS)
  }

  const handleDiceCountChange = (n: number) => {
    if (phase === 'shaking' || phase === 'freeroll') return
    setDiceCount(n)
    setWindCount(wc => Math.min(wc, n))
    setDiceValues(Array.from({ length: n }, (_, i) => (i % 6) + 1))
    setRollId(0)
  }

  const handleWindCountChange = (n: number) => {
    if (phase === 'shaking' || phase === 'freeroll') return
    setWindCount(Math.min(n, diceCount))
    setRollId(0)
  }

  const handleNumberDieSizeChange = (mm: number) => {
    if (phase === 'shaking' || phase === 'freeroll') return
    setNumberDieSize(mm)
    setRollId(0)
  }

  const handleWindDieSizeChange = (mm: number) => {
    if (phase === 'shaking' || phase === 'freeroll') return
    setWindDieSize(mm)
    setRollId(0)
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
          <div
            className="absolute inset-0"
            style={{
              transform: sceneReady ? 'perspective(1000px) rotateX(0deg)' : 'perspective(1000px) rotateX(20deg)',
              transition: sceneReady ? 'transform 1s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
              transformOrigin: '50% 65%',
            }}
          >
            <DiceScene
              phase={phase}
              rollId={rollId}
              diceCount={diceCount}
              windCount={windCount}
              numberDieSize={numberDieSize}
              windDieSize={windDieSize}
              onSettled={handleSettled}
              handlesRef={handlesRef}
              config={physicsConfig}
            />
            <DiceDebug handlesRef={handlesRef} visible={debugVisible} />
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
            physicsConfig={physicsConfig}
            onBetChange={handleBetChange}
            onDiceCountChange={handleDiceCountChange}
            onWindCountChange={handleWindCountChange}
            onNumberDieSizeChange={handleNumberDieSizeChange}
            onWindDieSizeChange={handleWindDieSizeChange}
            onConsecutiveChange={setConsecutiveCount}
            onPhysicsConfigChange={handlePhysicsConfigChange}
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
