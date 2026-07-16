import * as PIXI from 'pixi.js';
import type { SymbolId } from './types';
import { SYMBOL_SIZE, REEL_GAP, GRID_ROWS, SPIN_DURATION_MIN, REEL_STOP_STAGGER, BOUNCE_DURATION } from './constants';
import { updateSymbolCell, createSymbolCell } from './PixiSceneBuilder';

interface ReelState {
  container: PIXI.Container;
  spinning: boolean;
  targetSymbols: SymbolId[];
  scrollY: number;
  velocity: number;
  stopRequested: boolean;
  onStop?: () => void;
  bufferCells: PIXI.Container[];  // all visible + buffer cells
}

const CELL_H = SYMBOL_SIZE + REEL_GAP;
const NUM_CELLS = GRID_ROWS + 2; // 4 visible + 1 above + 1 below

// Elastic ease-out: slight overshoot then spring back
function elasticEaseOut(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export class ReelRenderer {
  private reels: ReelState[] = [];
  private ticker: PIXI.Ticker;
  private spinStartTime = 0;
  private speedMode = false;

  constructor(reelContainers: PIXI.Container[], ticker: PIXI.Ticker) {
    this.ticker = ticker;

    for (let i = 0; i < reelContainers.length; i++) {
      const container = reelContainers[i];
      const bufferCells: PIXI.Container[] = [];

      // Create cells: rows -1 to GRID_ROWS (total NUM_CELLS)
      for (let row = 0; row < NUM_CELLS; row++) {
        const cell = createSymbolCell('SAPPHIRE');
        cell.y = (row - 1) * CELL_H;
        container.addChild(cell);
        bufferCells.push(cell);
      }

      this.reels.push({
        container,
        spinning: false,
        targetSymbols: [],
        scrollY: 0,
        velocity: 0,
        stopRequested: false,
        bufferCells,
      });
    }

    this.ticker.add(this.update, this);
  }

  setSpeedMode(speed: boolean): void {
    this.speedMode = speed;
  }

  /** Start all reels spinning simultaneously */
  spinAll(targetGridByReel: SymbolId[][], onReelStop: (idx: number) => void): void {
    this.spinStartTime = Date.now();

    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i];
      reel.spinning = true;
      reel.stopRequested = false;
      reel.targetSymbols = targetGridByReel[i];
      reel.velocity = this.speedMode ? 80 : 40;

      const reelIdx = i;
      const delay = reelIdx * (this.speedMode ? 50 : REEL_STOP_STAGGER);
      const spinDuration = this.speedMode ? 300 : SPIN_DURATION_MIN + delay;

      setTimeout(() => {
        if (reel.spinning) {
          reel.stopRequested = true;
          reel.onStop = () => onReelStop(reelIdx);
        }
      }, spinDuration);
    }
  }

  private update = (): void => {
    for (const reel of this.reels) {
      if (!reel.spinning) continue;

      if (!reel.stopRequested) {
        // Constant scroll
        reel.scrollY += reel.velocity;
        this.wrapCells(reel);
      } else {
        // Decelerate and snap
        reel.velocity *= 0.88;
        reel.scrollY += reel.velocity;
        this.wrapCells(reel);

        if (reel.velocity < 1.5) {
          // Snap to target
          this.snapToTarget(reel);
        }
      }
    }
  };

  private wrapCells(reel: ReelState): void {
    const totalH = NUM_CELLS * CELL_H;

    for (let i = 0; i < reel.bufferCells.length; i++) {
      const cell = reel.bufferCells[i];
      let newY = (i - 1) * CELL_H + (reel.scrollY % totalH);

      // Wrap around
      while (newY > (GRID_ROWS) * CELL_H) newY -= totalH;
      while (newY < -2 * CELL_H) newY += totalH;

      cell.y = newY;
    }
  }

  private snapToTarget(reel: ReelState): void {
    reel.spinning = false;
    reel.velocity = 0;
    reel.scrollY = 0;

    // Set target symbols on visible cells
    for (let rowIdx = 0; rowIdx < GRID_ROWS; rowIdx++) {
      const cell = reel.bufferCells[rowIdx + 1]; // +1 for buffer above
      cell.y = rowIdx * CELL_H;
      updateSymbolCell(cell, reel.targetSymbols[rowIdx]);
    }

    // Hide buffer cells
    reel.bufferCells[0].y = -CELL_H;
    if (reel.bufferCells[NUM_CELLS - 1]) {
      reel.bufferCells[NUM_CELLS - 1].y = GRID_ROWS * CELL_H;
    }

    // Play elastic bounce
    this.playElasticBounce(reel, () => {
      reel.onStop?.();
    });
  }

  private playElasticBounce(reel: ReelState, onComplete: () => void): void {
    const duration = this.speedMode ? 150 : BOUNCE_DURATION;
    const overshoot = this.speedMode ? 4 : 12;
    const startTime = Date.now();

    const animate = (): void => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = elasticEaseOut(t);

      // Apply overshoot offset to all visible cells
      const offset = overshoot * (1 - eased) * Math.sin(t * Math.PI * 3);
      for (let rowIdx = 0; rowIdx < GRID_ROWS; rowIdx++) {
        const cell = reel.bufferCells[rowIdx + 1];
        cell.y = rowIdx * CELL_H + offset;
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Ensure final snap
        for (let rowIdx = 0; rowIdx < GRID_ROWS; rowIdx++) {
          reel.bufferCells[rowIdx + 1].y = rowIdx * CELL_H;
        }
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }

  /** Get visible cell containers for a specific reel */
  getVisibleCells(reelIdx: number): PIXI.Container[] {
    const reel = this.reels[reelIdx];
    return reel.bufferCells.slice(1, 1 + GRID_ROWS);
  }

  destroy(): void {
    this.ticker.remove(this.update, this);
  }
}
