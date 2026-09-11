'use client'

import { create } from 'zustand'
import type {
  DrawRecord,
  PrizeDefinition,
  PrizePoolState,
  RTPEngineConfig,
  RollingWindow,
  SimulationResult,
  StatisticsSnapshot,
  StreakState,
  WeightVector,
} from '@/lib/scratch-card/config'
import {
  DEFAULT_RTP_CONFIG,
  buildInitialWeightVector,
  computeNoWinWeight,
} from '@/lib/scratch-card/config'
import { initStreakState, updateStreak, applyStreakPenalties } from '@/lib/scratch-card/antiStreak'
import { createRollingWindow, pushToWindow, buildSnapshot } from '@/lib/scratch-card/statistics'
import { initializePrizePool, getAvailablePrizeIndices, consumePrize } from '@/lib/scratch-card/prizePool'
import { drawPrizeIndex, computeCorrectedWeights } from '@/lib/scratch-card/rtpEngine'
import { runSimulation } from '@/lib/scratch-card/simulation'

// ─── State Shape ──────────────────────────────────────────────────────────────

export interface ScratchCardState {
  // Config
  engineConfig: RTPEngineConfig
  setTargetRTP: (rtp: number) => void
  setTicketPrice: (price: number) => void
  setPrizes: (prizes: PrizeDefinition[]) => void

  // Engine runtime
  weightVector: WeightVector
  streakState: StreakState
  prizePoolState: PrizePoolState
  noWinWeight: number

  // History & stats
  draws: DrawRecord[]
  windows: Record<number, RollingWindow>
  snapshot: StatisticsSnapshot | null

  // Actions
  executeDraw: () => { won: boolean; prizeAmount: number; prizeIndex: number }
  resetSession: () => void

  // Simulation
  lastSimulation: SimulationResult | null
  runSimulation: (draws: number) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWindows(statsWindows: number[]): Record<number, RollingWindow> {
  const result: Record<number, RollingWindow> = {}
  for (const size of statsWindows) {
    result[size] = createRollingWindow(size)
  }
  return result
}

function initFromConfig(config: RTPEngineConfig) {
  const prizes = config.prizes.filter(p => p.enabled)
  return {
    weightVector: buildInitialWeightVector(config),
    streakState: initStreakState(prizes.length),
    prizePoolState: initializePrizePool(config.prizePool),
    noWinWeight: computeNoWinWeight(prizes, config.ticketPrice, config.targetRTP),
    draws: [] as DrawRecord[],
    windows: buildWindows(config.statsWindows),
    snapshot: null as StatisticsSnapshot | null,
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useScratchCardStore = create<ScratchCardState>((set, get) => ({
  engineConfig: DEFAULT_RTP_CONFIG,
  ...initFromConfig(DEFAULT_RTP_CONFIG),
  lastSimulation: null,

  // ── Config mutations ────────────────────────────────────────────────────────

  setTargetRTP: (rtp) => {
    const config = { ...get().engineConfig, targetRTP: rtp }
    const prizes = config.prizes.filter(p => p.enabled)
    set({
      engineConfig: config,
      weightVector: buildInitialWeightVector(config),
      noWinWeight: computeNoWinWeight(prizes, config.ticketPrice, rtp),
    })
  },

  setTicketPrice: (price) => {
    const config = { ...get().engineConfig, ticketPrice: price }
    const prizes = config.prizes.filter(p => p.enabled)
    set({
      engineConfig: config,
      noWinWeight: computeNoWinWeight(prizes, price, config.targetRTP),
    })
  },

  setPrizes: (prizes) => {
    const config = { ...get().engineConfig, prizes }
    const enabled = prizes.filter(p => p.enabled)
    set({
      engineConfig: config,
      weightVector: buildInitialWeightVector(config),
      streakState: initStreakState(enabled.length),
      noWinWeight: computeNoWinWeight(enabled, config.ticketPrice, config.targetRTP),
    })
  },

  // ── Single draw (atomic state update) ──────────────────────────────────────

  executeDraw: () => {
    const s = get()
    const { engineConfig, weightVector, streakState, prizePoolState, noWinWeight } = s
    const prizes = engineConfig.prizes.filter(p => p.enabled)

    // 1. Anti-streak penalty
    const effectiveWeights = applyStreakPenalties(weightVector.weights, streakState)

    // 2. Filter available prizes
    const availIdx = getAvailablePrizeIndices(prizePoolState, prizes)
    const filteredWeights = availIdx.map(i => effectiveWeights[i] ?? 0)
    const filteredPrizes = availIdx.map(i => prizes[i])

    // 3. Draw
    const localIdx = drawPrizeIndex(filteredPrizes, filteredWeights, noWinWeight)
    const realPrizeIdx = localIdx === -1 ? -1 : availIdx[localIdx]
    const prizeAmount = realPrizeIdx === -1 ? 0 : prizes[realPrizeIdx].amount

    // 4. Build record
    const record: DrawRecord = {
      drawIndex: s.draws.length,
      prizeIndex: realPrizeIdx,
      prizeAmount,
      spent: engineConfig.ticketPrice,
    }

    // 5. Atomic state update
    set(prev => {
      const newDraws = [...prev.draws, record]
      const newPool =
        prizeAmount > 0 ? consumePrize(prev.prizePoolState, prizeAmount) : prev.prizePoolState
      const newStreak = updateStreak(prev.streakState, realPrizeIdx, engineConfig.antiStreak)

      const newWindows = { ...prev.windows }
      for (const size of engineConfig.statsWindows) {
        newWindows[size] = pushToWindow(
          prev.windows[size] ?? createRollingWindow(size),
          prizeAmount,
        )
      }

      const totalSpent = newDraws.length * engineConfig.ticketPrice
      const totalWon = newDraws.reduce((sum, d) => sum + d.prizeAmount, 0)
      const currentRTP = totalSpent > 0 ? totalWon / totalSpent : 0
      const drawsSince = record.drawIndex - prev.weightVector.lastCorrectedAt

      const corrected = computeCorrectedWeights(
        prizes,
        prev.weightVector.weights,
        prev.noWinWeight,
        currentRTP,
        engineConfig.targetRTP,
        engineConfig.ticketPrice,
        engineConfig.correction,
        drawsSince,
      )
      const didCorrect = drawsSince >= engineConfig.correction.coolingPeriod

      const newSnapshot = buildSnapshot(newDraws, newWindows, engineConfig.ticketPrice)

      return {
        draws: newDraws,
        prizePoolState: newPool,
        streakState: newStreak,
        windows: newWindows,
        weightVector: {
          weights: corrected.weights,
          lastCorrectedAt: didCorrect ? record.drawIndex : prev.weightVector.lastCorrectedAt,
        },
        noWinWeight: corrected.noWinWeight,
        snapshot: newSnapshot,
      }
    })

    return { won: prizeAmount > 0, prizeAmount, prizeIndex: realPrizeIdx }
  },

  // ── Reset ───────────────────────────────────────────────────────────────────

  resetSession: () => {
    const config = get().engineConfig
    set({ ...initFromConfig(config), lastSimulation: null })
  },

  // ── Simulation ──────────────────────────────────────────────────────────────

  runSimulation: (draws) => {
    const config = get().engineConfig
    const result = runSimulation(config, { draws })
    set({ lastSimulation: result })
  },
}))
