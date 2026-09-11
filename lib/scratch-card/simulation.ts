import type { DrawRecord, RTPEngineConfig, RollingWindow, SimulationResult } from './config'
import { buildInitialWeightVector, computeNoWinWeight } from './config'
import { initStreakState, updateStreak, applyStreakPenalties } from './antiStreak'
import { createRollingWindow, pushToWindow, computeWindowRTP, buildSnapshot } from './statistics'
import { initializePrizePool, getAvailablePrizeIndices, consumePrize } from './prizePool'
import { drawPrizeIndex, computeCorrectedWeights } from './rtpEngine'

export interface SimulationOptions {
  draws: number
  sampleInterval?: number // record rolling RTP every N draws (default 100)
  rng?: () => number      // injectable for deterministic tests
}

function computePercentiles(
  amounts: number[],
): SimulationResult['percentiles'] {
  const sorted = [...amounts].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 }
  const at = (pct: number) => sorted[Math.floor(n * pct)] ?? 0
  return { p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) }
}

export function runSimulation(
  config: RTPEngineConfig,
  options: SimulationOptions,
): SimulationResult {
  const { draws, sampleInterval = 100, rng = Math.random } = options
  const prizes = config.prizes.filter(p => p.enabled)
  const { ticketPrice, targetRTP } = config

  // Initialize engine state
  let weightVector = buildInitialWeightVector(config)
  let noWinWeight = computeNoWinWeight(prizes, ticketPrice, targetRTP)
  let streakState = initStreakState(prizes.length)
  let prizePoolState = initializePrizePool(config.prizePool)

  const windowMap: Record<number, RollingWindow> = {}
  for (const size of config.statsWindows) {
    windowMap[size] = createRollingWindow(size)
  }

  const drawRecords: DrawRecord[] = []
  const rollingRTPCurve: number[] = []
  let totalWon = 0

  for (let i = 0; i < draws; i++) {
    // 1. Apply anti-streak penalties
    const effectiveWeights = applyStreakPenalties(weightVector.weights, streakState)

    // 2. Filter available prizes (finite mode)
    const availIdx = getAvailablePrizeIndices(prizePoolState, prizes)
    if (availIdx.length === 0) break // pool exhausted

    const filteredWeights = availIdx.map(idx => effectiveWeights[idx])
    const filteredPrizes = availIdx.map(idx => prizes[idx])

    // 3. Draw
    const localIdx = drawPrizeIndex(filteredPrizes, filteredWeights, noWinWeight, rng)
    const realPrizeIdx = localIdx === -1 ? -1 : availIdx[localIdx]
    const prizeAmount = realPrizeIdx === -1 ? 0 : prizes[realPrizeIdx].amount

    // 4. Record
    const record: DrawRecord = {
      drawIndex: i,
      prizeIndex: realPrizeIdx,
      prizeAmount,
      spent: ticketPrice,
    }
    drawRecords.push(record)
    totalWon += prizeAmount

    // 5. Update finite pool
    if (prizeAmount > 0) {
      prizePoolState = consumePrize(prizePoolState, prizeAmount)
    }

    // 6. Update streak
    streakState = updateStreak(streakState, realPrizeIdx, config.antiStreak)

    // 7. Update rolling windows
    for (const size of config.statsWindows) {
      windowMap[size] = pushToWindow(windowMap[size], prizeAmount)
    }

    // 8. RTP correction
    const totalSpent = (i + 1) * ticketPrice
    const currentRTP = totalWon / totalSpent
    const drawsSince = i - weightVector.lastCorrectedAt
    const corrected = computeCorrectedWeights(
      prizes,
      weightVector.weights,
      noWinWeight,
      currentRTP,
      targetRTP,
      ticketPrice,
      config.correction,
      drawsSince,
    )
    noWinWeight = corrected.noWinWeight
    weightVector = {
      weights: corrected.weights,
      lastCorrectedAt:
        drawsSince >= config.correction.coolingPeriod ? i : weightVector.lastCorrectedAt,
    }

    // 9. Sample rolling RTP curve
    if ((i + 1) % sampleInterval === 0) {
      const firstWindow = windowMap[config.statsWindows[0]]
      if (firstWindow) {
        rollingRTPCurve.push(computeWindowRTP(firstWindow, ticketPrice))
      }
    }
  }

  const snapshot = buildSnapshot(drawRecords, windowMap, ticketPrice)
  const percentiles = computePercentiles(drawRecords.map(d => d.prizeAmount))

  return {
    config,
    draws: drawRecords.length,
    actualRTP: snapshot.currentRTP,
    winRate: snapshot.winRate,
    prizeDistribution: snapshot.prizeDistribution,
    variance: snapshot.variance,
    stdDeviation: snapshot.stdDeviation,
    percentiles,
    rollingRTPCurve,
  }
}
