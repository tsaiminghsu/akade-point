// ─── Symbol IDs ───────────────────────────────────────────────────────────────

export type SymbolId =
  | 'SAPPHIRE'
  | 'EMERALD'
  | 'RUBY'
  | 'GOLD_RING'
  | 'GOLD_NECKLACE'
  | 'PHARAOH'
  | 'GODDESS'
  | 'WAR_GOD'
  | 'IDOL'
  | 'GOLDEN_SUN'       // Wild
  | 'TEMPLE_ENTRANCE'; // Scatter

export const WILD_ID: SymbolId = 'GOLDEN_SUN';
export const SCATTER_ID: SymbolId = 'TEMPLE_ENTRANCE';

export type GodPowerType =
  | 'STICKY_WILD'
  | 'EXPANDING_WILD'
  | 'RANDOM_MULTIPLIER'
  | 'EXTRA_SPIN';

// ─── State Machine ────────────────────────────────────────────────────────────

export type GamePhase =
  | 'IDLE'
  | 'SPIN_START'
  | 'REELS_SPINNING'
  | 'REEL_STOPPING'
  | 'EVALUATING'
  | 'WIN_PRESENTATION'
  | 'CASCADE'
  | 'CASCADE_FILL'
  | 'CASCADE_EVAL'
  | 'FREE_SPIN_TRIGGER'
  | 'GOD_POWER_REVEAL'
  | 'FREE_SPIN_IDLE'
  | 'FREE_SPIN_COMPLETE'
  | 'BIG_WIN'
  | 'ERROR';

export type WinTier = 'BIG_WIN' | 'MEGA_WIN' | 'EPIC_WIN' | 'LEGENDARY_WIN';

// ─── Grid ─────────────────────────────────────────────────────────────────────

export interface Cell {
  symbolId: SymbolId;
  reelIdx: number;
  rowIdx: number;
  wildMultiplier?: 2 | 3 | 5 | 10;
  isSticky?: boolean;
  isExpanded?: boolean;
  markedForRemoval?: boolean;
}

/** Grid[reelIdx][rowIdx] */
export type Grid = Cell[][];

// ─── Paylines ─────────────────────────────────────────────────────────────────

export interface Payline {
  id: number;
  rows: [number, number, number, number, number];
}

// ─── Win Evaluation ───────────────────────────────────────────────────────────

export interface PaylineWin {
  paylineId: number;
  symbolId: SymbolId;
  count: number;
  cells: Cell[];
  basePayout: number;
  wildMultiplier: number;
  finalPayout: number;
}

export interface WinEvaluation {
  paylineWins: PaylineWin[];
  scatterCount: number;
  scatterPositions: Cell[];
  totalWin: number;
  triggeredFreeSpins: boolean;
  freeSpinCount: number;
  cascadeLevel: number;
}

export interface SpinResult {
  betAmount: number;
  betPerLine: number;
  grid: Grid;
  evaluations: WinEvaluation[];
  totalWin: number;
  cascadeCount: number;
  isFreeSpin: boolean;
  godPowerApplied?: GodPowerType;
}

// ─── Bonus ────────────────────────────────────────────────────────────────────

export interface GodPower {
  type: GodPowerType;
  label: string;
  description: string;
  icon: string;
}

export interface BonusState {
  active: boolean;
  totalFreeSpins: number;
  remainingFreeSpins: number;
  spinsUsed: number;
  godPower: GodPowerType | null;
  stickyWilds: Cell[];
  totalBonusWin: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface PaytableEntry {
  symbolId: SymbolId;
  payouts: { 3: number; 4: number; 5: number };
}

export interface ReelStripConfig {
  reelIdx: number;
  strip: SymbolId[];
}

export interface GameConfig {
  version: string;
  rtp: number;
  grid: { reels: 5; rows: 4 };
  paylines: 40;
  betLevels: number[];
  defaultBetLevel: number;
  paytable: PaytableEntry[];
  reelStrips: ReelStripConfig[];
  scatterPayouts: { 4: number; 5: number; 6: number };
  freeSpinCounts: { 4: number; 5: number; 6: number };
  wildMultiplierWeights: { 2: number; 3: number; 5: number; 10: number };
  godPowerWeights: Record<GodPowerType, number>;
  maxCascades: number;
  winThresholds: {
    bigWin: number;
    megaWin: number;
    epicWin: number;
    legendaryWin: number;
  };
}

// ─── Symbol Definition ────────────────────────────────────────────────────────

export interface SymbolDef {
  id: SymbolId;
  label: string;
  tier: 'low' | 'high' | 'wild' | 'scatter';
  color: number;    // hex for placeholder rendering
  textureKey: string;
}

// ─── Debug ────────────────────────────────────────────────────────────────────

export interface DebugFlags {
  forceScatter: boolean;
  forceWild: boolean;
  forceBigWin: boolean;
  speedMode: boolean;
}

// ─── Scene Refs (PixiJS) ──────────────────────────────────────────────────────

export interface ReelStopInfo {
  reelIdx: number;
  symbols: SymbolId[];
  stopComplete: boolean;
}

export interface AnimationCallbacks {
  onReelStopComplete: (reelIdx: number) => void;
  onAllReelsStopped: () => void;
  onCascadeComplete: () => void;
  onBigWinComplete: () => void;
}
