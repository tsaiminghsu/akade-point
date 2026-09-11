// ─── Prize & Config Types ─────────────────────────────────────────────────────

export interface PrizeDefinition {
  amount: number
  baseWeight: number
  enabled: boolean
}

export interface CorrectionConfig {
  sensitivity: number    // sigmoid slope, e.g. 0.15
  maxWeightStep: number  // max fractional weight change per correction, e.g. 0.05
  coolingPeriod: number  // min draws between corrections, e.g. 10
}

export interface AntiStreakConfig {
  maxSameStreak: number  // trigger after this many consecutive identical outcomes
  penaltyFactor: number  // weight multiplier when triggered (< 1.0), e.g. 0.3
  recoveryRate: number   // penalty factor recovery per draw, e.g. 0.1
}

export interface PrizePoolConfig {
  mode: 'finite' | 'infinite'
  inventory?: { amount: number; total: number; remaining: number }[]
}

export interface RTPEngineConfig {
  ticketPrice: number
  targetRTP: number
  prizes: PrizeDefinition[]
  correction: CorrectionConfig
  antiStreak: AntiStreakConfig
  prizePool: PrizePoolConfig
  statsWindows: number[]
}

// ─── Runtime State Types ──────────────────────────────────────────────────────

export interface WeightVector {
  weights: number[]       // parallel to enabled prizes array
  lastCorrectedAt: number // drawIndex of last correction
}

export interface StreakState {
  streakCounts: number[]   // prizes.length + 1 (last slot = no-win streak)
  penaltyFactors: number[] // 1.0 = no penalty
}

export interface DrawRecord {
  drawIndex: number
  prizeIndex: number  // index into enabled prizes; -1 = no win
  prizeAmount: number // 0 if no win
  spent: number       // ticketPrice
}

export interface RollingWindow {
  size: number
  buffer: number[] // circular buffer; unfilled slots = 0
  head: number
  count: number
}

export interface StatisticsSnapshot {
  totalDraws: number
  totalSpent: number
  totalWon: number
  currentRTP: number
  rollingRTPs: Record<number, number>      // windowSize → RTP
  winRate: number
  prizeDistribution: Record<number, number> // prizeAmount → count
  variance: number
  stdDeviation: number
  netPnL: number
  avgPayout: number
  roi: number // (totalWon - totalSpent) / totalSpent
}

export interface SimulationResult {
  config: RTPEngineConfig
  draws: number
  actualRTP: number
  winRate: number
  prizeDistribution: Record<number, number>
  variance: number
  stdDeviation: number
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number }
  rollingRTPCurve: number[] // RTP sampled every sampleInterval draws
}

// ─── Prize Pool State ─────────────────────────────────────────────────────────

export interface PrizePoolState {
  mode: 'finite' | 'infinite'
  inventory: Map<number, { total: number; remaining: number }>
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_RTP_CONFIG: RTPEngineConfig = {
  ticketPrice: 150,
  targetRTP: 0.55,
  prizes: [
    { amount: 40,  baseWeight: 40, enabled: true },
    { amount: 60,  baseWeight: 25, enabled: true },
    { amount: 80,  baseWeight: 15, enabled: true },
    { amount: 120, baseWeight: 8,  enabled: true },
    { amount: 160, baseWeight: 4,  enabled: true },
  ],
  correction: { sensitivity: 0.15, maxWeightStep: 0.05, coolingPeriod: 10 },
  antiStreak: { maxSameStreak: 5, penaltyFactor: 0.3, recoveryRate: 0.1 },
  prizePool: { mode: 'infinite' },
  statsWindows: [100, 500, 1000],
}

export const RTP_PRESETS = [0.40, 0.50, 0.55, 0.60, 0.65, 0.70] as const
export type RTPPreset = (typeof RTP_PRESETS)[number]

// ─── Helper: compute noWinWeight from config ──────────────────────────────────
// Ensures that long-run expected payout ≈ ticketPrice × targetRTP

export function computeNoWinWeight(
  prizes: PrizeDefinition[],
  ticketPrice: number,
  targetRTP: number,
): number {
  const enabled = prizes.filter(p => p.enabled)
  if (enabled.length === 0) return 1

  const totalPrizeWeight = enabled.reduce((s, p) => s + p.baseWeight, 0)
  const weightedAvgPrize =
    enabled.reduce((s, p) => s + p.amount * p.baseWeight, 0) / totalPrizeWeight

  const expectedPayout = ticketPrice * targetRTP
  // p_win × weightedAvgPrize = expectedPayout  →  p_win = expectedPayout / weightedAvgPrize
  const pWin = Math.min(0.999, Math.max(0.001, expectedPayout / weightedAvgPrize))

  // p_win = totalPrizeWeight / (totalPrizeWeight + noWinWeight)
  // → noWinWeight = totalPrizeWeight × (1/p_win - 1)
  return totalPrizeWeight * (1 / pWin - 1)
}

// ─── Helper: build initial WeightVector from config ──────────────────────────

export function buildInitialWeightVector(config: RTPEngineConfig): WeightVector {
  const enabled = config.prizes.filter(p => p.enabled)
  return {
    weights: enabled.map(p => p.baseWeight),
    lastCorrectedAt: 0,
  }
}
