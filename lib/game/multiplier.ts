/** Calculate the reward multiplier based on combo count. */
export function calculateMultiplier(combos: number): number {
  if (combos <= 2) return 1.0;
  if (combos <= 4) return 1.2;
  if (combos <= 6) return 1.5;
  if (combos <= 8) return 1.8;
  if (combos <= 10) return 2.2;
  if (combos <= 12) return 2.6;
  return 3.0; // 13 Combo 以上一律 3.0 倍封頂
}
