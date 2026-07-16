import { z } from 'zod';
import type { GameConfig } from './types';

const PaytableEntrySchema = z.object({
  symbolId: z.string(),
  payouts: z.object({ '3': z.number(), '4': z.number(), '5': z.number() }),
});

const ReelStripSchema = z.object({
  reelIdx: z.number(),
  strip: z.array(z.string()),
});

const GameConfigSchema = z.object({
  version: z.string(),
  rtp: z.number(),
  grid: z.object({ reels: z.literal(5), rows: z.literal(4) }),
  paylines: z.literal(40),
  betLevels: z.array(z.number()),
  defaultBetLevel: z.number(),
  paytable: z.array(PaytableEntrySchema),
  reelStrips: z.array(ReelStripSchema),
  scatterPayouts: z.object({ '4': z.number(), '5': z.number(), '6': z.number() }),
  freeSpinCounts: z.object({ '4': z.number(), '5': z.number(), '6': z.number() }),
  wildMultiplierWeights: z.object({ '2': z.number(), '3': z.number(), '5': z.number(), '10': z.number() }),
  godPowerWeights: z.record(z.string(), z.number()),
  maxCascades: z.number(),
  winThresholds: z.object({
    bigWin: z.number(),
    megaWin: z.number(),
    epicWin: z.number(),
    legendaryWin: z.number(),
  }),
});

let cached: GameConfig | null = null;

export async function loadGameConfig(): Promise<GameConfig> {
  if (cached) return cached;
  const res = await fetch('/temple-of-desert-god/gameConfig.json');
  if (!res.ok) throw new Error('Failed to load game config');
  const raw = await res.json();
  cached = GameConfigSchema.parse(raw) as GameConfig;
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
