export interface Metrics {
  /** Fraction of impulses applied while ball was airborne (target: 0) */
  airborneImpulseRatio: number;
  /** Average peak jump height in units of BALL_R (target: 0.8–2.5) */
  avgPeakHeightR: number;
  /** Coefficient of variation of peak heights (target: ≥ 0.25) */
  peakHeightCv: number;
  /** Average ball-ball collision count per ball (target: ≥ 1.0) */
  avgCollisionsPerBall: number;
  /** Chi-square-like hole occupancy uniformity score (target: ≤ 2.0) */
  holeChiSquareNorm: number;
  /** Time for all balls to settle in seconds (target: 1.0–3.5) */
  avgSettleTime: number;
  /** Maximum sphere overlap / BALL_R (target: ≤ 0.05) */
  maxPenetrationR: number;
  /** Average rotation (rad) per meter traveled (target: > 0.5) */
  avgSpinPerMeter: number;
}

function rangePenalty(v: number, lo: number, hi: number): number {
  if (v < lo) return ((lo - v) / lo) ** 2;
  if (v > hi) return ((v - hi) / hi) ** 2;
  return 0;
}

export function physicsLoss(m: Metrics): number {
  return (
    4.0 * m.airborneImpulseRatio ** 2 +
    2.0 * rangePenalty(m.avgPeakHeightR, 0.8, 2.5) +
    1.5 * Math.max(0, 0.25 - m.peakHeightCv) ** 2 +
    2.0 * Math.max(0, 1.0 - m.avgCollisionsPerBall) ** 2 +
    1.5 * Math.max(0, m.holeChiSquareNorm - 2.0) ** 2 +
    1.0 * rangePenalty(m.avgSettleTime, 1.0, 3.5) +
    5.0 * Math.max(0, m.maxPenetrationR - 0.05) ** 2 +
    1.0 * Math.max(0, 0.5 - m.avgSpinPerMeter) ** 2
  );
}
