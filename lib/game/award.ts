/**
 * The reward economy: base payouts, the combo multiplier cap, and the award
 * calculation.
 *
 * This module is intentionally pure (no AWS SDK imports) so that both the
 * server award path and client-facing pages can read the same numbers. The
 * claim page previously hardcoded its own figures — base 50/150/400/1000 and a
 * "base x 8.5" ceiling — while the server paid 5/15/40/100 capped at 3.0x plus
 * a 200-point bonus limit. For SSR_COMPLETE that promised 8,500 points against
 * an actual maximum of 300.
 */
import { calculateMultiplier } from "./multiplier";

export type GameTrigger =
  | "SMALL_GIFT"
  | "MEDIUM_GIFT"
  | "LARGE_GIFT"
  | "SSR_COMPLETE";

export type RewardTier = "SMALL" | "MEDIUM" | "LARGE" | "SSR_COMPLETE";

export const TIER_TO_TRIGGER: Record<RewardTier, GameTrigger> = {
  SMALL: "SMALL_GIFT",
  MEDIUM: "MEDIUM_GIFT",
  LARGE: "LARGE_GIFT",
  SSR_COMPLETE: "SSR_COMPLETE",
};

export const BASE_REWARDS: Record<GameTrigger, number> = {
  SMALL_GIFT: 5,
  MEDIUM_GIFT: 15,
  LARGE_GIFT: 40,
  SSR_COMPLETE: 100,
};

/** Maximum extra points a single round may pay on top of the base reward. */
export const MAX_BONUS_LIMIT = 200;

export function baseRewardForTier(tier: RewardTier): number {
  return BASE_REWARDS[TIER_TO_TRIGGER[tier]];
}

/** The most a tier can ever pay, for display on the claim screen. */
export function maxRewardForTier(tier: RewardTier): number {
  const base = baseRewardForTier(tier);
  return computeAward(base, Number.MAX_SAFE_INTEGER).totalPoints;
}

export interface AwardBreakdown {
  multiplier: number;
  bonusPoints: number;
  totalPoints: number;
  /** True when the bonus was clipped by MAX_BONUS_LIMIT. */
  capped: boolean;
}

export function computeAward(baseReward: number, combos: number): AwardBreakdown {
  const multiplier = calculateMultiplier(combos);
  const rawBonus = Math.round(baseReward * multiplier) - baseReward;
  const capped = rawBonus > MAX_BONUS_LIMIT;
  const bonusPoints = capped ? MAX_BONUS_LIMIT : rawBonus;
  return {
    multiplier,
    bonusPoints,
    totalPoints: baseReward + bonusPoints,
    capped,
  };
}
