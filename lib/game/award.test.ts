import { describe, expect, it } from "vitest";
import {
  BASE_REWARDS,
  MAX_BONUS_LIMIT,
  TIER_TO_TRIGGER,
  baseRewardForTier,
  computeAward,
  maxRewardForTier,
  type RewardTier,
} from "./award";
import { calculateMultiplier } from "./multiplier";

const TIERS: RewardTier[] = ["SMALL", "MEDIUM", "LARGE", "SSR_COMPLETE"];

describe("calculateMultiplier", () => {
  it.each([
    [0, 1.0],
    [1, 1.0],
    [2, 1.0],
    [3, 1.2],
    [4, 1.2],
    [5, 1.5],
    [6, 1.5],
    [7, 1.8],
    [8, 1.8],
    [9, 2.2],
    [10, 2.2],
    [11, 2.6],
    [12, 2.6],
    [13, 3.0],
    [50, 3.0],
  ])("combos %i -> %fx", (combos, expected) => {
    expect(calculateMultiplier(combos)).toBe(expected);
  });

  it("is monotonically non-decreasing", () => {
    for (let c = 1; c <= 20; c++) {
      expect(calculateMultiplier(c)).toBeGreaterThanOrEqual(calculateMultiplier(c - 1));
    }
  });
});

describe("computeAward", () => {
  it("pays exactly the base reward with no combos", () => {
    expect(computeAward(100, 0)).toEqual({
      multiplier: 1.0,
      bonusPoints: 0,
      totalPoints: 100,
      capped: false,
    });
  });

  it("caps the SSR tier at base + MAX_BONUS_LIMIT", () => {
    // base 100 x 3.0 = 300 raw, so a 200 bonus, which is exactly the limit.
    expect(computeAward(100, 13)).toEqual({
      multiplier: 3.0,
      bonusPoints: 200,
      totalPoints: 300,
      capped: false,
    });
  });

  it("clips a bonus above the limit and reports it", () => {
    const award = computeAward(1000, 13);
    expect(award.bonusPoints).toBe(MAX_BONUS_LIMIT);
    expect(award.totalPoints).toBe(1000 + MAX_BONUS_LIMIT);
    expect(award.capped).toBe(true);
  });

  it("scales small bases without hitting the cap", () => {
    expect(computeAward(40, 13)).toMatchObject({ bonusPoints: 80, totalPoints: 120 });
    expect(computeAward(5, 13)).toMatchObject({ bonusPoints: 10, totalPoints: 15 });
  });

  it("always returns integers and never pays less than the base", () => {
    for (const base of [5, 15, 40, 100]) {
      for (let combos = 0; combos <= 20; combos++) {
        const { bonusPoints, totalPoints } = computeAward(base, combos);
        expect(Number.isInteger(bonusPoints)).toBe(true);
        expect(Number.isInteger(totalPoints)).toBe(true);
        expect(totalPoints).toBeGreaterThanOrEqual(base);
        expect(bonusPoints).toBeLessThanOrEqual(MAX_BONUS_LIMIT);
      }
    }
  });

  it("is monotonic in combos", () => {
    for (let c = 1; c <= 20; c++) {
      expect(computeAward(100, c).totalPoints).toBeGreaterThanOrEqual(
        computeAward(100, c - 1).totalPoints
      );
    }
  });
});

describe("tier economy", () => {
  it("maps every tier to a trigger with a defined base reward", () => {
    for (const tier of TIERS) {
      expect(BASE_REWARDS[TIER_TO_TRIGGER[tier]]).toBeGreaterThan(0);
      expect(baseRewardForTier(tier)).toBe(BASE_REWARDS[TIER_TO_TRIGGER[tier]]);
    }
  });

  it("advertises a maximum the server can actually pay", () => {
    // Regression guard for the claim screen, which used to promise base x 8.5
    // (up to 8,500 points) against a real ceiling of 300.
    for (const tier of TIERS) {
      const base = baseRewardForTier(tier);
      const max = maxRewardForTier(tier);
      expect(max).toBe(computeAward(base, Number.MAX_SAFE_INTEGER).totalPoints);
      expect(max).toBeLessThanOrEqual(base + MAX_BONUS_LIMIT);
      expect(max).toBeGreaterThanOrEqual(base);
    }
  });

  it("pins the advertised ceilings", () => {
    expect(TIERS.map(maxRewardForTier)).toEqual([15, 45, 120, 300]);
  });
});
