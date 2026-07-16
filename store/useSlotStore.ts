'use client';

import { create } from 'zustand';
import type {
  GamePhase, Grid, WinEvaluation, PaylineWin,
  BonusState, GameConfig, GodPowerType, DebugFlags, Cell
} from '@/lib/temple-of-desert-god/types';
import { loadGameConfig } from '@/lib/temple-of-desert-god/gameConfig';
import { RandomEngine } from '@/lib/temple-of-desert-god/RandomEngine';
import { generateGrid } from '@/lib/temple-of-desert-god/ReelGenerator';
import { evaluateGrid } from '@/lib/temple-of-desert-god/PaylineChecker';
import { applyMultipliers } from '@/lib/temple-of-desert-god/MultiplierEngine';
import { markWinners, applyGravity } from '@/lib/temple-of-desert-god/CascadeEngine';
import {
  applyGodPowerToGrid, collectStickyWilds
} from '@/lib/temple-of-desert-god/BonusEngine';
import { INITIAL_BALANCE } from '@/lib/temple-of-desert-god/constants';

// ─── Store Shape ──────────────────────────────────────────────────────────────

export interface SlotGameState {
  // Config
  config: GameConfig | null;
  rng: RandomEngine;

  // Balance
  balance: number;
  betLevelIndex: number;
  totalBet: number;
  betPerLine: number;

  // Phase
  phase: GamePhase;

  // Round data
  currentGrid: Grid | null;
  lastSpinResult: null;
  currentEvaluation: WinEvaluation | null;
  cascadeIndex: number;
  activePaylineWins: PaylineWin[];
  displayWin: number;
  totalSessionWin: number;

  // Free game bonus
  bonusState: BonusState;

  // Debug
  debug: DebugFlags;

  // Public actions
  loadConfig: () => Promise<void>;
  setPhase: (phase: GamePhase) => void;
  setBetLevel: (index: number) => void;
  startSpin: () => void;
  onAllReelsStopped: () => void;
  onCascadeComplete: () => void;
  onWinPresentationComplete: () => void;
  dismissBigWin: () => void;
  enterFreeSpins: (count: number, godPower: GodPowerType) => void;
  setGrid: (grid: Grid) => void;
  setDisplayWin: (amount: number) => void;
  toggleDebug: () => void;
  setDebugFlag: (key: keyof DebugFlags, value: boolean) => void;

  // Internal helpers (used by AnimationEngine)
  _advanceFreeSpin: (winAmount: number) => void;
  _completeRound: (winAmount: number, triggeredFreeSpins: boolean) => void;
  _checkBigWin: (winAmount: number) => void;
}

// ─── Initial Bonus State ──────────────────────────────────────────────────────

const initialBonusState: BonusState = {
  active: false,
  totalFreeSpins: 0,
  remainingFreeSpins: 0,
  spinsUsed: 0,
  godPower: null,
  stickyWilds: [],
  totalBonusWin: 0,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSlotStore = create<SlotGameState>((set, get) => ({
  config: null,
  rng: new RandomEngine(),

  balance: INITIAL_BALANCE,
  betLevelIndex: 0,
  totalBet: 40,
  betPerLine: 1 / 40,

  phase: 'IDLE' as GamePhase,

  currentGrid: null,
  lastSpinResult: null,
  currentEvaluation: null,
  cascadeIndex: 0,
  activePaylineWins: [],
  displayWin: 0,
  totalSessionWin: 0,

  bonusState: { ...initialBonusState },

  debug: {
    forceScatter: false,
    forceWild: false,
    forceBigWin: false,
    speedMode: false,
  },

  // ── Load config ───────────────────────────────────────────────────────────

  loadConfig: async () => {
    const config = await loadGameConfig();
    const betAmount = config.betLevels[config.defaultBetLevel];
    set({
      config,
      totalBet: betAmount,
      betPerLine: betAmount / config.paylines,
      betLevelIndex: config.defaultBetLevel,
    });
  },

  setPhase: (phase) => set({ phase }),

  setBetLevel: (index) => {
    const { config } = get();
    if (!config) return;
    const clamped = Math.max(0, Math.min(index, config.betLevels.length - 1));
    const betAmount = config.betLevels[clamped];
    set({
      betLevelIndex: clamped,
      totalBet: betAmount,
      betPerLine: betAmount / config.paylines,
    });
  },

  // ── Spin ──────────────────────────────────────────────────────────────────

  startSpin: () => {
    const { config, phase, balance, totalBet, bonusState, debug, rng } = get();
    if (!config) return;
    if (phase !== 'IDLE' && phase !== 'FREE_SPIN_IDLE') return;

    const isFreeGame = bonusState.active;

    // Deduct bet (not during free games)
    if (!isFreeGame) {
      if (balance < totalBet) return;
      set(s => ({ balance: s.balance - totalBet, displayWin: 0 }));
    }

    // Generate grid
    let grid = generateGrid(config, rng, debug);

    // Apply god powers that affect the grid before spin
    if (isFreeGame && bonusState.godPower === 'EXPANDING_WILD') {
      grid = applyGodPowerToGrid(grid, 'EXPANDING_WILD', bonusState.stickyWilds);
    }
    if (isFreeGame && bonusState.godPower === 'STICKY_WILD' && bonusState.stickyWilds.length > 0) {
      grid = applyGodPowerToGrid(grid, 'STICKY_WILD', bonusState.stickyWilds);
    }

    set({
      phase: 'SPIN_START',
      currentGrid: grid,
      cascadeIndex: 0,
      activePaylineWins: [],
    });
  },

  // ── Called by AnimationEngine after all reels stop ────────────────────────

  onAllReelsStopped: () => {
    const { config, currentGrid, bonusState, rng, betPerLine } = get();
    if (!config || !currentGrid) return;

    const isFreeGame = bonusState.active;
    let evaluation = evaluateGrid(currentGrid, config, 0, isFreeGame);
    evaluation = applyMultipliers(evaluation, config, rng, isFreeGame, bonusState.godPower, betPerLine);

    set({ currentEvaluation: evaluation });

    if (evaluation.totalWin > 0) {
      set({
        phase: 'WIN_PRESENTATION',
        activePaylineWins: evaluation.paylineWins,
      });
    } else if (evaluation.triggeredFreeSpins) {
      set({ phase: 'FREE_SPIN_TRIGGER' });
    } else if (isFreeGame) {
      get()._advanceFreeSpin(0);
    } else {
      set({ phase: 'IDLE' });
    }
  },

  // ── Called when win highlight animation completes ─────────────────────────

  onWinPresentationComplete: () => {
    const { currentEvaluation, config, currentGrid, bonusState, rng, cascadeIndex } = get();
    if (!config || !currentGrid || !currentEvaluation) return;

    const wins = currentEvaluation.paylineWins;

    if (wins.length > 0 && cascadeIndex < config.maxCascades) {
      const marked = markWinners(currentGrid, wins);
      set({ phase: 'CASCADE' });
      const newGrid = applyGravity(
        marked,
        config,
        rng,
        bonusState.godPower === 'STICKY_WILD' ? bonusState.stickyWilds : undefined
      );
      set({ currentGrid: newGrid, cascadeIndex: cascadeIndex + 1 });
    } else {
      const totalWin = currentEvaluation.totalWin;
      if (currentEvaluation.triggeredFreeSpins) {
        set({ phase: 'FREE_SPIN_TRIGGER' });
      } else if (bonusState.active) {
        get()._advanceFreeSpin(totalWin);
      } else {
        get()._completeRound(totalWin, false);
      }
    }
  },

  // ── Called after cascade fall animation finishes ──────────────────────────

  onCascadeComplete: () => {
    const { config, currentGrid, bonusState, rng, betPerLine, cascadeIndex } = get();
    if (!config || !currentGrid) return;

    const isFreeGame = bonusState.active;
    let newEval = evaluateGrid(currentGrid, config, cascadeIndex, isFreeGame);
    newEval = applyMultipliers(newEval, config, rng, isFreeGame, bonusState.godPower, betPerLine);

    if (newEval.totalWin > 0) {
      set({
        phase: 'CASCADE_EVAL',
        currentEvaluation: newEval,
        activePaylineWins: newEval.paylineWins,
      });
    } else {
      const prevWin = get().currentEvaluation?.totalWin ?? 0;
      if (isFreeGame) {
        get()._advanceFreeSpin(prevWin);
      } else {
        get()._completeRound(prevWin, newEval.triggeredFreeSpins);
      }
    }
  },

  // ── Internal helpers ──────────────────────────────────────────────────────

  _advanceFreeSpin: (winAmount: number) => {
    const { bonusState, config, currentGrid } = get();
    if (!config) return;

    const newRemaining = bonusState.remainingFreeSpins - 1;
    const newBonusWin = bonusState.totalBonusWin + winAmount;
    const extraSpin = bonusState.godPower === 'EXTRA_SPIN' && winAmount > 0 ? 1 : 0;
    const newStickyWilds: Cell[] = bonusState.godPower === 'STICKY_WILD' && currentGrid
      ? collectStickyWilds(currentGrid)
      : bonusState.stickyWilds;

    const updatedBonus: BonusState = {
      ...bonusState,
      remainingFreeSpins: newRemaining + extraSpin,
      spinsUsed: bonusState.spinsUsed + 1,
      totalBonusWin: newBonusWin,
      stickyWilds: newStickyWilds,
    };

    if (updatedBonus.remainingFreeSpins <= 0) {
      // Credit wins to balance
      set(s => ({
        bonusState: { ...updatedBonus, active: false },
        phase: 'FREE_SPIN_COMPLETE',
        balance: s.balance + newBonusWin,
        totalSessionWin: s.totalSessionWin + newBonusWin,
        displayWin: newBonusWin,
      }));
    } else {
      set({ bonusState: updatedBonus, phase: 'FREE_SPIN_IDLE', displayWin: winAmount });
    }
  },

  _completeRound: (winAmount: number, triggeredFreeSpins: boolean) => {
    if (winAmount > 0) {
      set(s => ({
        balance: s.balance + winAmount,
        totalSessionWin: s.totalSessionWin + winAmount,
        displayWin: winAmount,
      }));
    }
    if (!triggeredFreeSpins) {
      get()._checkBigWin(winAmount);
    }
  },

  _checkBigWin: (winAmount: number) => {
    const { config, totalBet } = get();
    if (!config || winAmount <= 0) {
      set({ phase: 'IDLE' });
      return;
    }
    const ratio = winAmount / totalBet;
    if (ratio >= config.winThresholds.bigWin) {
      set({ phase: 'BIG_WIN' });
    } else {
      set({ phase: 'IDLE' });
    }
  },

  // ── Free game entry (called by AnimationEngine after god power reveal) ────

  enterFreeSpins: (count: number, godPower: GodPowerType) => {
    set({
      bonusState: {
        active: true,
        totalFreeSpins: count,
        remainingFreeSpins: count,
        spinsUsed: 0,
        godPower,
        stickyWilds: [],
        totalBonusWin: 0,
      },
      phase: 'FREE_SPIN_IDLE',
    });
  },

  dismissBigWin: () => set({ phase: 'IDLE' }),
  setGrid: (grid) => set({ currentGrid: grid }),
  setDisplayWin: (amount) => set({ displayWin: amount }),
  toggleDebug: () => set(s => ({ debug: { ...s.debug, speedMode: !s.debug.speedMode } })),
  setDebugFlag: (key, value) => set(s => ({ debug: { ...s.debug, [key]: value } })),
}));
