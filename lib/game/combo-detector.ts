import type { OrbColor } from "./orb-generator";

const COLS = 6;
const ROWS = 5;

const ORB_COLORS: OrbColor[] = [
  "FIRE",
  "WATER",
  "WOOD",
  "LIGHT",
  "DARK",
  "RECOVERY",
];

function neighbors(idx: number): number[] {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  const result: number[] = [];
  if (row > 0) result.push(idx - COLS);
  if (row < ROWS - 1) result.push(idx + COLS);
  if (col > 0) result.push(idx - 1);
  if (col < COLS - 1) result.push(idx + 1);
  return result;
}

function floodFill(
  grid: (OrbColor | null)[],
  start: number,
  color: OrbColor,
  restriction?: Set<number>
): Set<number> {
  const visited = new Set<number>();
  const queue = [start];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (visited.has(idx)) continue;
    if (grid[idx] !== color) continue;
    if (restriction && !restriction.has(idx)) continue;
    visited.add(idx);
    for (const n of neighbors(idx)) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return visited;
}

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 
 * Returns the total number of combos including cascading/skyfall matches.
 * The new falling orbs are generated deterministically based on the grid contents 
 * to ensure that client and server calculations are perfectly synchronized.
 */
export function detectCombos(initialGrid: OrbColor[]): number {
  const grid: (OrbColor | null)[] = [...initialGrid];
  let totalCombos = 0;
  
  // 使用 FNV-1a 將初始版面 hash 化作為隨機數種子
  let seed = fnv1a(initialGrid.join(","));
  const nextColor = (): OrbColor => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return ORB_COLORS[seed % 6];
  };

  let iteration = 0;
  // 防無限迴圈機制
  while (iteration < 100) {
    iteration++;
    
    // 1. 尋找目前版面上所有的相連群組 (同色相連 >= 3)
    const matched = new Set<number>();
    for (let idx = 0; idx < grid.length; idx++) {
      const color = grid[idx];
      if (color === null || matched.has(idx)) continue;
      
      const group = floodFill(grid, idx, color);
      if (group.size >= 3) {
        group.forEach((i) => matched.add(i));
      }
    }

    // 若無任何連線，代表消珠結束，跳出迴圈
    if (matched.size === 0) {
      break;
    }

    // 2. 計算此回合的 Combo 組數
    const visited = new Set<number>();
    let stepCombos = 0;
    Array.from(matched).forEach((start) => {
      if (visited.has(start)) return;
      const color = grid[start];
      if (color === null) return;
      
      const component = floodFill(grid, start, color, matched);
      if (component.size >= 3) {
        component.forEach((i) => visited.add(i));
        stepCombos++;
      }
    });

    totalCombos += stepCombos;

    // 3. 將被消除的珠子設為空 (null)
    matched.forEach((idx) => {
      grid[idx] = null;
    });

    // 4. 下落珠子並在頂端補充新隨機珠子 (欄位處理)
    for (let col = 0; col < COLS; col++) {
      const colOrbs: OrbColor[] = [];
      for (let row = ROWS - 1; row >= 0; row--) {
        const idx = row * COLS + col;
        if (grid[idx] !== null) {
          colOrbs.push(grid[idx] as OrbColor);
        }
      }

      // 重填該欄
      let rowIdx = ROWS - 1;
      for (const color of colOrbs) {
        grid[rowIdx * COLS + col] = color;
        rowIdx--;
      }
      
      // 頂部補新珠子
      while (rowIdx >= 0) {
        grid[rowIdx * COLS + col] = nextColor();
        rowIdx--;
      }
    }
  }

  return totalCombos;
}
