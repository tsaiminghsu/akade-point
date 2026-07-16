import type { Payline, SymbolDef } from './types';

// ─── Grid ─────────────────────────────────────────────────────────────────────

export const GRID_COLS = 5;
export const GRID_ROWS = 4;

// ─── Reel Animation Timing (ms) ──────────────────────────────────────────────

export const SPIN_DURATION_MIN = 1200;
export const REEL_STOP_STAGGER = 200;
export const BOUNCE_DURATION = 600;
export const WIN_HIGHLIGHT_DURATION = 2000;
export const CASCADE_FALL_DURATION = 400;
export const WIN_COUNTER_DURATION = 1500;
export const FREE_SPIN_INTRO_DURATION = 2500;
export const GOD_POWER_REVEAL_DURATION = 2000;
export const BIG_WIN_DURATION = 5000;
export const SYMBOL_SIZE = 140;
export const REEL_GAP = 8;

// ─── 40 Paylines (row indices: 0=top, 3=bottom) ──────────────────────────────

export const PAYLINES: Payline[] = [
  { id:  1, rows: [0, 0, 0, 0, 0] },
  { id:  2, rows: [1, 1, 1, 1, 1] },
  { id:  3, rows: [2, 2, 2, 2, 2] },
  { id:  4, rows: [3, 3, 3, 3, 3] },
  { id:  5, rows: [0, 1, 2, 1, 0] },
  { id:  6, rows: [3, 2, 1, 2, 3] },
  { id:  7, rows: [1, 2, 3, 2, 1] },
  { id:  8, rows: [2, 1, 0, 1, 2] },
  { id:  9, rows: [0, 0, 1, 2, 3] },
  { id: 10, rows: [3, 3, 2, 1, 0] },
  { id: 11, rows: [0, 1, 2, 3, 3] },
  { id: 12, rows: [3, 2, 1, 0, 0] },
  { id: 13, rows: [0, 1, 1, 2, 3] },
  { id: 14, rows: [3, 2, 2, 1, 0] },
  { id: 15, rows: [0, 1, 2, 2, 3] },
  { id: 16, rows: [3, 2, 1, 1, 0] },
  { id: 17, rows: [1, 0, 0, 1, 2] },
  { id: 18, rows: [2, 3, 3, 2, 1] },
  { id: 19, rows: [1, 0, 1, 2, 3] },
  { id: 20, rows: [2, 3, 2, 1, 0] },
  { id: 21, rows: [0, 1, 0, 1, 0] },
  { id: 22, rows: [3, 2, 3, 2, 3] },
  { id: 23, rows: [1, 2, 1, 2, 1] },
  { id: 24, rows: [2, 1, 2, 1, 2] },
  { id: 25, rows: [0, 2, 0, 2, 0] },
  { id: 26, rows: [3, 1, 3, 1, 3] },
  { id: 27, rows: [0, 3, 1, 3, 0] },
  { id: 28, rows: [3, 0, 2, 0, 3] },
  { id: 29, rows: [1, 3, 0, 3, 1] },
  { id: 30, rows: [2, 0, 3, 0, 2] },
  { id: 31, rows: [0, 2, 3, 2, 0] },
  { id: 32, rows: [3, 1, 0, 1, 3] },
  { id: 33, rows: [0, 0, 1, 1, 2] },
  { id: 34, rows: [1, 1, 2, 2, 3] },
  { id: 35, rows: [3, 3, 2, 2, 1] },
  { id: 36, rows: [2, 2, 1, 1, 0] },
  { id: 37, rows: [2, 2, 3, 3, 2] },
  { id: 38, rows: [1, 1, 0, 0, 1] },
  { id: 39, rows: [0, 1, 3, 1, 0] },
  { id: 40, rows: [3, 2, 0, 2, 3] },
];

// ─── Symbol Definitions ───────────────────────────────────────────────────────

export const SYMBOL_DEFS: SymbolDef[] = [
  { id: 'SAPPHIRE',       label: '藍寶石',   tier: 'low',     color: 0x3A9EF5, textureKey: 'sapphire' },
  { id: 'EMERALD',        label: '綠寶石',   tier: 'low',     color: 0x3EC96E, textureKey: 'emerald' },
  { id: 'RUBY',           label: '紅寶石',   tier: 'low',     color: 0xE53E3E, textureKey: 'ruby' },
  { id: 'GOLD_RING',      label: '黃金戒指', tier: 'low',     color: 0xD4A017, textureKey: 'gold_ring' },
  { id: 'GOLD_NECKLACE',  label: '黃金項鍊', tier: 'low',     color: 0xF6C90E, textureKey: 'gold_necklace' },
  { id: 'PHARAOH',        label: '法老',     tier: 'high',    color: 0xC08000, textureKey: 'pharaoh' },
  { id: 'GODDESS',        label: '女神',     tier: 'high',    color: 0xDA70D6, textureKey: 'goddess' },
  { id: 'WAR_GOD',        label: '戰神',     tier: 'high',    color: 0xFF6B35, textureKey: 'war_god' },
  { id: 'IDOL',           label: '神像',     tier: 'high',    color: 0x9F7AEA, textureKey: 'idol' },
  { id: 'GOLDEN_SUN',     label: '黃金太陽', tier: 'wild',    color: 0xFFD700, textureKey: 'golden_sun' },
  { id: 'TEMPLE_ENTRANCE',label: '神殿入口', tier: 'scatter', color: 0xFF8C00, textureKey: 'temple_entrance' },
];

export const SYMBOL_MAP = Object.fromEntries(SYMBOL_DEFS.map(s => [s.id, s])) as Record<string, SymbolDef>;

// ─── God Power Definitions ────────────────────────────────────────────────────

export const GOD_POWERS = [
  { type: 'STICKY_WILD'       as const, label: 'Sticky Wild',        description: 'Wild符號固定不消失直到免費遊戲結束', icon: '🔒' },
  { type: 'EXPANDING_WILD'    as const, label: 'Expanding Wild',      description: 'Wild擴展整個Reel', icon: '⬆️' },
  { type: 'RANDOM_MULTIPLIER' as const, label: 'Random Multiplier',   description: '每次得分隨機2~10倍', icon: '✨' },
  { type: 'EXTRA_SPIN'        as const, label: 'Extra Spin',          description: '每次中獎增加1次免費遊戲', icon: '➕' },
];

// ─── Win Tier Labels ──────────────────────────────────────────────────────────

export const WIN_TIERS = [
  { tier: 'BIG_WIN'       as const, label: 'BIG WIN',        multiplier: 10,  color: '#FFD700' },
  { tier: 'MEGA_WIN'      as const, label: 'MEGA WIN',       multiplier: 30,  color: '#FF8C00' },
  { tier: 'EPIC_WIN'      as const, label: 'EPIC WIN',       multiplier: 100, color: '#FF4500' },
  { tier: 'LEGENDARY_WIN' as const, label: 'LEGENDARY WIN',  multiplier: 500, color: '#FF0080' },
];

// ─── Initial Balance ──────────────────────────────────────────────────────────

export const INITIAL_BALANCE = 10000;
