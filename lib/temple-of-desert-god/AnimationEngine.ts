import * as PIXI from 'pixi.js';
import type { SlotGameState } from '@/store/useSlotStore';
import type { Grid, PaylineWin, GodPowerType, WinTier } from './types';
import { PAYLINES, SYMBOL_SIZE, REEL_GAP, GRID_COLS, GRID_ROWS, WIN_HIGHLIGHT_DURATION, CASCADE_FALL_DURATION, GOD_POWERS, WIN_TIERS } from './constants';
import type { SceneRefs } from './PixiSceneBuilder';
import { getCellPosition } from './PixiSceneBuilder';
import { ReelRenderer } from './ReelRenderer';
import { ParticleSystem } from './ParticleSystem';
import { soundEngine } from './SoundEngine';

const CELL_H = SYMBOL_SIZE + REEL_GAP;

export class AnimationEngine {
  private app: PIXI.Application;
  private scene: SceneRefs;
  private store: { getState: () => SlotGameState; subscribe: (listener: (state: SlotGameState) => void) => () => void };
  private reelRenderer: ReelRenderer;
  private particles: ParticleSystem;
  private unsubscribe: (() => void) | null = null;
  private winHighlightTimer: ReturnType<typeof setTimeout> | null = null;
  private screenFlash: PIXI.Graphics;

  constructor(
    app: PIXI.Application,
    scene: SceneRefs,
    store: { getState: () => SlotGameState; subscribe: (listener: (state: SlotGameState) => void) => () => void }
  ) {
    this.app = app;
    this.scene = scene;
    this.store = store;

    this.reelRenderer = new ReelRenderer(scene.reelContainers, app.ticker);
    // Wire ReelRenderer's visible cells into scene refs (used by cascade animations)
    for (let r = 0; r < GRID_COLS; r++) {
      scene.symbolCells[r] = this.reelRenderer.getVisibleCells(r);
    }
    this.particles = new ParticleSystem(scene.particleContainer);

    // Screen flash overlay
    this.screenFlash = new PIXI.Graphics();
    this.screenFlash.beginFill(0xFFD700, 0.0);
    this.screenFlash.drawRect(0, 0, app.screen.width, app.screen.height);
    this.screenFlash.endFill();
    this.screenFlash.alpha = 0;
    scene.effectsContainer.addChild(this.screenFlash);

    // Particle update loop
    app.ticker.add(() => {
      this.particles.update(1);
    });
  }

  start(): void {
    let prevPhase = '';

    this.unsubscribe = this.store.subscribe((state) => {
      const phase = state.phase;
      if (phase === prevPhase) return;
      prevPhase = phase;

      switch (phase) {
        case 'SPIN_START':
          this.onSpinStart(state);
          break;
        case 'WIN_PRESENTATION':
        case 'CASCADE_EVAL':
          this.onWinPresentation(state);
          break;
        case 'CASCADE':
          this.onCascade(state);
          break;
        case 'FREE_SPIN_TRIGGER':
          this.onFreeSpinTrigger(state);
          break;
        case 'GOD_POWER_REVEAL':
          this.onGodPowerReveal(state);
          break;
        case 'FREE_SPIN_COMPLETE':
          this.onFreeSpinComplete(state);
          break;
        case 'BIG_WIN':
          this.onBigWin(state);
          break;
        case 'IDLE':
        case 'FREE_SPIN_IDLE':
          this.clearHighlights();
          break;
      }
    });
  }

  private onSpinStart(state: SlotGameState): void {
    if (!state.currentGrid) return;

    soundEngine.play('reel_spin', true);
    this.clearHighlights();
    this.particles.clear();

    // Speed mode
    this.reelRenderer.setSpeedMode(state.debug.speedMode);

    const grid = state.currentGrid;
    const targetByReel = Array.from({ length: GRID_COLS }, (_, i) =>
      Array.from({ length: GRID_ROWS }, (__, j) => grid[i][j].symbolId)
    );

    let reelsStopped = 0;

    this.reelRenderer.spinAll(targetByReel, (reelIdx) => {
      soundEngine.stop('reel_spin');
      soundEngine.play('reel_stop');

      reelsStopped++;
      if (reelsStopped === GRID_COLS) {
        // All reels done
        this.store.getState().onAllReelsStopped();
      }
    });

    // Transition to REELS_SPINNING
    this.store.getState().setPhase('REELS_SPINNING');
  }

  private onWinPresentation(state: SlotGameState): void {
    if (this.winHighlightTimer) clearTimeout(this.winHighlightTimer);

    const wins = state.activePaylineWins;
    if (wins.length === 0) {
      this.store.getState().onWinPresentationComplete();
      return;
    }

    this.highlightWins(wins, state.currentGrid);
    this.showWinParticles(wins, state.currentGrid);
    this.animateWinCounter(state.currentEvaluation?.totalWin ?? 0);

    soundEngine.play(wins.length > 2 ? 'win_big' : 'win_small');

    const duration = state.debug.speedMode ? 500 : WIN_HIGHLIGHT_DURATION;
    this.winHighlightTimer = setTimeout(() => {
      this.store.getState().onWinPresentationComplete();
    }, duration);
  }

  private onCascade(state: SlotGameState): void {
    const grid = state.currentGrid;
    if (!grid) return;

    // Animate marked symbols fading out
    for (let r = 0; r < GRID_COLS; r++) {
      for (let c = 0; c < GRID_ROWS; c++) {
        if (grid[r][c]?.markedForRemoval) {
          const cell = this.scene.symbolCells[r]?.[c];
          if (cell) {
            this.animateCellOut(cell);
          }
        }
      }
    }

    const duration = state.debug.speedMode ? 150 : CASCADE_FALL_DURATION;
    setTimeout(() => {
      // Update cells to new grid state
      const newGrid = state.currentGrid;
      if (newGrid) {
        for (let r = 0; r < GRID_COLS; r++) {
          for (let c = 0; c < GRID_ROWS; c++) {
            const cell = this.scene.symbolCells[r]?.[c];
            if (cell) {
              import('./PixiSceneBuilder').then(({ updateSymbolCell }) => {
                updateSymbolCell(cell, newGrid[r][c].symbolId);
                cell.alpha = 1;
                this.animateCellFallIn(cell, c);
              });
            }
          }
        }
      }

      this.store.getState().onCascadeComplete();
    }, duration);
  }

  private onFreeSpinTrigger(state: SlotGameState): void {
    const scatterCount = state.currentEvaluation?.scatterCount ?? 4;
    const spinCount = state.currentEvaluation?.freeSpinCount ?? 15;

    // Flash screen gold
    this.flashScreen(0xFFD700);
    soundEngine.play('scatter_land');

    // Burst particles at scatter positions
    const positions = state.currentEvaluation?.scatterPositions ?? [];
    for (const pos of positions) {
      const { x, y } = this.getCellScreenPos(pos.reelIdx, pos.rowIdx);
      this.particles.burst(x, y);
    }

    const godPower = state.config
      ? this.selectGodPowerForIntro(state)
      : 'STICKY_WILD';

    const delay = state.debug.speedMode ? 500 : 2500;
    setTimeout(() => {
      this.store.getState().setPhase('GOD_POWER_REVEAL');
    }, delay);

    // Save spinCount to trigger enterFreeSpins after god power reveal
    (this as unknown as { _pendingFreeSpins: number; _pendingGodPower: GodPowerType })._pendingFreeSpins = spinCount;
    (this as unknown as { _pendingFreeSpins: number; _pendingGodPower: GodPowerType })._pendingGodPower = godPower;
  }

  private selectGodPowerForIntro(state: SlotGameState): GodPowerType {
    const { config, rng } = state;
    if (!config) return 'STICKY_WILD';
    const types = GOD_POWERS.map(g => g.type);
    const weights = types.map(t => config.godPowerWeights[t] ?? 0);
    return state.rng.weightedPick(types, weights);
  }

  private onGodPowerReveal(state: SlotGameState): void {
    const self = this as unknown as { _pendingFreeSpins: number; _pendingGodPower: GodPowerType };
    const spinCount = self._pendingFreeSpins ?? 15;
    const godPower = self._pendingGodPower ?? 'STICKY_WILD';

    soundEngine.play('free_spin_start');
    const delay = state.debug.speedMode ? 300 : 2000;

    setTimeout(() => {
      this.store.getState().enterFreeSpins(spinCount, godPower);
    }, delay);
  }

  private onFreeSpinComplete(state: SlotGameState): void {
    const bonusWin = state.bonusState.totalBonusWin;
    soundEngine.play('coin_shower');
    this.flashScreen(0xFFAA00);

    // Burst particles center screen
    const cx = this.app.screen.width / 2;
    const cy = this.app.screen.height / 2;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.particles.burst(cx + (Math.random() - 0.5) * 200, cy + (Math.random() - 0.5) * 100), i * 200);
    }

    // Credit bonus win
    if (bonusWin > 0) {
      this.store.getState().setDisplayWin(bonusWin);
    }
    this.store.getState()._checkBigWin(bonusWin);
  }

  private onBigWin(state: SlotGameState): void {
    const win = state.currentEvaluation?.totalWin ?? state.bonusState.totalBonusWin;
    const bet = state.totalBet;
    const ratio = bet > 0 ? win / bet : 0;

    let tier: WinTier = 'BIG_WIN';
    for (const t of WIN_TIERS) {
      if (ratio >= t.multiplier) tier = t.tier;
    }

    soundEngine.play(
      tier === 'LEGENDARY_WIN' ? 'win_legendary' :
      tier === 'EPIC_WIN'      ? 'win_epic' :
      tier === 'MEGA_WIN'      ? 'win_mega' : 'win_big'
    );

    this.flashScreen(0xFFFFFF);
    const cx = this.app.screen.width / 2;
    const cy = this.app.screen.height / 2;
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        this.particles.burst(cx + (Math.random() - 0.5) * 300, cy + (Math.random() - 0.5) * 150);
      }, i * 300);
    }

    // Auto-dismiss after BIG_WIN_DURATION if not dismissed manually
    setTimeout(() => {
      if (this.store.getState().phase === 'BIG_WIN') {
        this.store.getState().dismissBigWin();
      }
    }, 5000);
  }

  // ── Win Highlights ────────────────────────────────────────────────────────

  private highlightWins(wins: PaylineWin[], grid: Grid | null): void {
    const g = this.scene.paylineOverlay;
    g.clear();
    if (!grid) return;

    for (const win of wins) {
      const payline = PAYLINES.find(p => p.id === win.paylineId);
      if (!payline) continue;

      const hue = (win.paylineId * 37) % 360;
      const color = hslToHex(hue, 100, 60);

      g.lineStyle(3, color, 0.85);
      g.beginFill(color, 0.08);

      const pts: number[] = [];
      for (let r = 0; r < GRID_COLS; r++) {
        const rowIdx = payline.rows[r];
        const cx = r * (SYMBOL_SIZE + REEL_GAP) + SYMBOL_SIZE / 2;
        const cy = rowIdx * CELL_H + SYMBOL_SIZE / 2;
        pts.push(cx, cy);
      }

      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        g.lineTo(pts[i], pts[i + 1]);
      }
      g.endFill();

      // Highlight winning cells with glow ring
      for (const cell of win.cells) {
        const cx = cell.reelIdx * (SYMBOL_SIZE + REEL_GAP) + SYMBOL_SIZE / 2;
        const cy = cell.rowIdx * CELL_H + SYMBOL_SIZE / 2;
        const glow = this.scene.glowContainer;
        const ring = new PIXI.Graphics();
        ring.lineStyle(4, color, 0.9);
        ring.drawCircle(cx, cy, SYMBOL_SIZE / 2 - 2);
        glow.addChild(ring);
      }
    }

    // Pulse animation
    this.pulseGlow();
  }

  private pulseGlow(): void {
    let t = 0;
    const interval = setInterval(() => {
      t += 0.12;
      const alpha = 0.5 + 0.5 * Math.sin(t * Math.PI);
      this.scene.glowContainer.alpha = alpha;
      if (t > 4) clearInterval(interval);
    }, 30);
  }

  private showWinParticles(wins: PaylineWin[], grid: Grid | null): void {
    if (!grid) return;
    for (const win of wins) {
      for (const cell of win.cells) {
        const pos = this.getCellScreenPos(cell.reelIdx, cell.rowIdx);
        this.particles.emit('coin', pos.x, pos.y, 6);
      }
    }
  }

  private animateWinCounter(totalWin: number): void {
    let current = 0;
    const steps = 30;
    const inc = totalWin / steps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      current = Math.min(step * inc, totalWin);
      this.store.getState().setDisplayWin(current);
      if (step >= steps) {
        clearInterval(interval);
        this.store.getState().setDisplayWin(totalWin);
      }
    }, 40);
  }

  private clearHighlights(): void {
    this.scene.paylineOverlay.clear();
    const glow = this.scene.glowContainer;
    while (glow.children.length > 0) glow.removeChildAt(0);
    const wildText = this.scene.wildTextContainer;
    while (wildText.children.length > 0) wildText.removeChildAt(0);
    if (this.winHighlightTimer) clearTimeout(this.winHighlightTimer);
  }

  private animateCellOut(cell: PIXI.Container): void {
    let t = 0;
    const interval = setInterval(() => {
      t += 0.08;
      cell.alpha = Math.max(0, 1 - t);
      cell.scale.set(1 - t * 0.3);
      if (t >= 1) {
        clearInterval(interval);
        cell.alpha = 0;
      }
    }, 16);
  }

  private animateCellFallIn(cell: PIXI.Container, rowIdx: number): void {
    cell.y = -CELL_H;
    cell.alpha = 0;
    const targetY = rowIdx * CELL_H;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.06;
      if (t >= 1) {
        cell.y = targetY;
        cell.alpha = 1;
        cell.scale.set(1);
        clearInterval(interval);
        return;
      }
      // Ease in quad
      const ease = t * t;
      cell.y = -CELL_H + (targetY + CELL_H) * ease;
      cell.alpha = t * 2;
    }, 16);
  }

  private flashScreen(color: number): void {
    this.screenFlash.tint = color;
    this.screenFlash.alpha = 0.35;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.06;
      this.screenFlash.alpha = Math.max(0, 0.35 - t * 0.35);
      if (t >= 1) {
        this.screenFlash.alpha = 0;
        clearInterval(interval);
      }
    }, 16);
  }

  private getCellScreenPos(reelIdx: number, rowIdx: number): { x: number; y: number } {
    const pos = getCellPosition(reelIdx, rowIdx);
    const reelWindow = this.scene.reelWindow;
    return {
      x: reelWindow.x + pos.x,
      y: reelWindow.y + pos.y,
    };
  }

  destroy(): void {
    this.unsubscribe?.();
    this.reelRenderer.destroy();
    if (this.winHighlightTimer) clearTimeout(this.winHighlightTimer);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): number {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(255 * f(0));
  const g = Math.round(255 * f(8));
  const b = Math.round(255 * f(4));
  return (r << 16) | (g << 8) | b;
}
