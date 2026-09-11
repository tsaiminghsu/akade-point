import type { CorrectionConfig, PrizeDefinition } from './config'

// ─── Weight normalization ─────────────────────────────────────────────────────

export function normalizeWeights(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total === 0) return weights.map(() => 1 / weights.length)
  return weights.map(w => w / total)
}

// ─── Weighted random draw ─────────────────────────────────────────────────────

// Returns index into prizes array (0-based), or -1 for no-win.
// Combines prize weights + noWinWeight into one pool, draws with uniform random.
export function drawPrizeIndex(
  prizes: PrizeDefinition[],
  weights: number[],         // parallel to prizes
  noWinWeight: number,
  rng: () => number = Math.random,
): number {
  const pool = [...weights, Math.max(0.001, noWinWeight)]
  const total = pool.reduce((a, b) => a + b, 0)
  const r = rng() * total

  let cumulative = 0
  for (let i = 0; i < pool.length; i++) {
    cumulative += pool[i]
    if (r < cumulative) {
      return i < prizes.length ? i : -1
    }
  }
  return -1
}

// ─── Expected payout given current weights ────────────────────────────────────

export function computeExpectedPayout(
  prizes: PrizeDefinition[],
  weights: number[],
  noWinWeight: number,
): number {
  const totalWeight = weights.reduce((a, b) => a + b, 0) + noWinWeight
  if (totalWeight === 0) return 0
  return prizes.reduce((s, p, i) => s + p.amount * (weights[i] / totalWeight), 0)
}

// ─── RTP Correction (Algorithm B) ────────────────────────────────────────────

// Smooth sigmoid correction. Returns new weights and noWinWeight (immutable).
export function computeCorrectedWeights(
  prizes: PrizeDefinition[],
  currentWeights: number[],
  noWinWeight: number,
  currentRTP: number,
  targetRTP: number,
  ticketPrice: number,
  config: CorrectionConfig,
  drawsSinceLastCorrection: number,
): { weights: number[]; noWinWeight: number } {
  if (drawsSinceLastCorrection < config.coolingPeriod) {
    return { weights: currentWeights, noWinWeight }
  }

  const delta = currentRTP - targetRTP
  // Sigmoid: maps delta to (-0.5, 0.5), centered at 0
  const sigmoid = 1 / (1 + Math.exp(-config.sensitivity * delta * 10)) - 0.5

  const expectedPayout = targetRTP * ticketPrice
  const newWeights = currentWeights.map((w, i) => {
    const prize = prizes[i]
    if (!prize) return w
    // direction > 0 for prizes above expected payout, < 0 for below
    const direction = (prize.amount - expectedPayout) / Math.max(1, expectedPayout)
    // When currentRTP > target (sigmoid > 0): suppress high prizes (rawStep < 0)
    const rawStep = -sigmoid * direction * w
    const maxStep = config.maxWeightStep * w
    const clamped = Math.max(-maxStep, Math.min(maxStep, rawStep))
    return Math.max(0.001, w + clamped)
  })

  // noWinWeight adjustment: RTP too low → reduce noWin (easier to win)
  const noWinStep = sigmoid * noWinWeight * 0.5
  const newNoWin = Math.max(0.001, noWinWeight - noWinStep)

  return { weights: newWeights, noWinWeight: newNoWin }
}
