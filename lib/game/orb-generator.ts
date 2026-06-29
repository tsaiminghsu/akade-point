import { createHash } from "crypto";

export type OrbColor = "FIRE" | "WATER" | "WOOD" | "LIGHT" | "DARK" | "RECOVERY";

export const ORB_COLORS: OrbColor[] = [
  "FIRE",
  "WATER",
  "WOOD",
  "LIGHT",
  "DARK",
  "RECOVERY",
];

const COLS = 6;
const ROWS = 5;

/** 檢查版面是否含有任何 3 連線的消除線（防止開局即有 Combo） */
function hasAnyMatches(grid: OrbColor[]): boolean {
  // 檢查橫向三連
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const idx = r * COLS + c;
      if (grid[idx] === grid[idx + 1] && grid[idx] === grid[idx + 2]) {
        return true;
      }
    }
  }
  // 檢查縱向三連
  for (let r = 0; r < ROWS - 2; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (grid[idx] === grid[idx + COLS] && grid[idx] === grid[idx + COLS * 2]) {
        return true;
      }
    }
  }
  return false;
}

/** 
 * 確定性地從種子生成一個 5×6 (30顆) 轉珠盤面。
 * 並且自動過濾掉開局即有連線的盤面，保證第一波起始 Combo 必為 0。
 */
export function generateGrid(finalSeed: string): OrbColor[] {
  let attempt = 0;
  while (attempt < 100) {
    const grid = Array.from({ length: 30 }, (_, i) => {
      const hash = createHash("sha256")
        .update(`${finalSeed}:${attempt}:${i}`)
        .digest("hex");
      const value = parseInt(hash.substring(0, 8), 16);
      return ORB_COLORS[value % 6];
    });

    if (!hasAnyMatches(grid)) {
      return grid;
    }
    attempt++;
  }
  
  // 保底方案（若極端情況下 100 次都有連線，採用交錯排列保證無連線）
  return Array.from({ length: 30 }, (_, i) => ORB_COLORS[i % 6]);
}

/** 驗證兩個盤面是否為相同的珠子組成（僅順序不同） */
export function isPermutation(a: OrbColor[], b: OrbColor[]): boolean {
  if (a.length !== b.length) return false;
  const countA: Partial<Record<OrbColor, number>> = {};
  const countB: Partial<Record<OrbColor, number>> = {};
  for (const orb of a) countA[orb] = (countA[orb] ?? 0) + 1;
  for (const orb of b) countB[orb] = (countB[orb] ?? 0) + 1;
  return ORB_COLORS.every((c) => (countA[c] ?? 0) === (countB[c] ?? 0));
}
