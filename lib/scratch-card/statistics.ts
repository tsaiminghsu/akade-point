import type { DrawRecord, RollingWindow, StatisticsSnapshot } from './config'

// ─── Circular Buffer ──────────────────────────────────────────────────────────

export function createRollingWindow(size: number): RollingWindow {
  return { size, buffer: new Array(size).fill(0), head: 0, count: 0 }
}

export function pushToWindow(window: RollingWindow, value: number): RollingWindow {
  const buffer = [...window.buffer]
  buffer[window.head] = value
  return {
    size: window.size,
    buffer,
    head: (window.head + 1) % window.size,
    count: Math.min(window.count + 1, window.size),
  }
}

// Rolling RTP = sum of payouts in window / (count × ticketPrice)
export function computeWindowRTP(window: RollingWindow, ticketPrice: number): number {
  if (window.count === 0 || ticketPrice === 0) return 0
  const sum = window.buffer.reduce((a, b) => a + b, 0)
  return sum / (window.count * ticketPrice)
}

// ─── Variance & Std Dev ───────────────────────────────────────────────────────

function computeWindowVariance(window: RollingWindow): number {
  if (window.count < 2) return 0
  const n = window.count
  const sum = window.buffer.reduce((a, b) => a + b, 0)
  const sumSq = window.buffer.reduce((a, b) => a + b * b, 0)
  const mean = sum / n
  return sumSq / n - mean * mean
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export function buildSnapshot(
  draws: DrawRecord[],
  windows: Record<number, RollingWindow>,
  ticketPrice: number,
): StatisticsSnapshot {
  const totalDraws = draws.length
  const totalSpent = totalDraws * ticketPrice
  const totalWon = draws.reduce((s, d) => s + d.prizeAmount, 0)
  const currentRTP = totalSpent > 0 ? totalWon / totalSpent : 0
  const winCount = draws.filter(d => d.prizeAmount > 0).length
  const winRate = totalDraws > 0 ? winCount / totalDraws : 0

  const rollingRTPs: Record<number, number> = {}
  for (const [key, win] of Object.entries(windows)) {
    rollingRTPs[Number(key)] = computeWindowRTP(win, ticketPrice)
  }

  // Use the largest filled window for variance
  const sortedWindows = Object.values(windows).sort((a, b) => b.size - a.size)
  const bestWindow = sortedWindows.find(w => w.count > 1) ?? sortedWindows[0]
  const variance = bestWindow ? computeWindowVariance(bestWindow) : 0
  const stdDeviation = Math.sqrt(variance)

  const prizeDistribution: Record<number, number> = {}
  for (const d of draws) {
    if (d.prizeAmount > 0) {
      prizeDistribution[d.prizeAmount] = (prizeDistribution[d.prizeAmount] ?? 0) + 1
    }
  }

  const netPnL = totalWon - totalSpent
  const avgPayout = totalDraws > 0 ? totalWon / totalDraws : 0
  const roi = totalSpent > 0 ? netPnL / totalSpent : 0

  return {
    totalDraws,
    totalSpent,
    totalWon,
    currentRTP,
    rollingRTPs,
    winRate,
    prizeDistribution,
    variance,
    stdDeviation,
    netPnL,
    avgPayout,
    roi,
  }
}
