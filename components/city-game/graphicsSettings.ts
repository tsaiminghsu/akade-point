/**
 * Graphics quality settings.
 *
 * Stored under its own localStorage key, deliberately NOT inside `city_save`:
 * `loadSave` throws away the whole save on a version mismatch, and restarting
 * the game should not reset the player's display settings.
 *
 * Pure functions only — no React, no three.js — so the presets, clamping and
 * tier detection are unit testable in node.
 */

import { storage } from './save';
import type { PerfProfile } from './engine3d';

export const GFX_KEY = 'city_gfx';
/**
 * v2: the default dropped from an auto-detected tier (usually high) to low.
 * v3: the default is the GPU's tier again, but from a model table instead of
 * "anything not Intel is high", and resolutionScale became a fraction of the
 * native resolution under a per-preset pixel budget. Bumping discards older
 * settings once, so every player gets the new detection.
 */
export const GFX_VERSION = 3;

export type Preset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export type AoMode = 'off' | 'ssao' | 'gtao';
export type AaMode = 'off' | 'msaa' | 'fxaa' | 'smaa';
export type SsrQuality = 'low' | 'high';

export interface GraphicsSettings {
  preset: Preset;
  /** Fraction of the display's native resolution. Above 1 supersamples. */
  resolutionScale: number;
  /**
   * Most pixels to render, in megapixels, whatever the screen; 0 = no limit.
   * Keeps a 1440p or 4K screen from costing 2-4x a 1080p one at the same preset.
   */
  maxPixels: number;
  shadowQuality: ShadowQuality;
  /** Half-extent of the follow shadow box, in 3D units. */
  shadowDistance: number;
  ssr: boolean;
  ssrQuality: SsrQuality;
  ao: AoMode;
  bloom: boolean;
  bloomStrength: number;
  antiAliasing: AaMode;
  /** Multiplier over the profile's streaming radius. */
  drawDistance: number;
  fov: number;
  particleDensity: number;
  trafficDensity: number;
  pedestrianDensity: number;
  parkedCars: number;
  streetLightCount: number;
  /** 0 means uncapped. */
  fpsCap: number;
  uiScale: number;
  showFps: boolean;
  /** Step quality down automatically when the frame rate stays too low. */
  autoAdjust: boolean;
  /**
   * What auto-adjust has taken off the pixel budget (1 = nothing, down to
   * MIN_BUDGET_SCALE). Not part of any preset; picking a preset resets it.
   */
  budgetScale: number;
}

/** What the device can actually support, and the size of the screen. */
export interface GraphicsCaps {
  isMobile: boolean;
  maxTextureSize: number;
  renderer: string;
  /** window.devicePixelRatio. */
  pixelRatio: number;
  /** Canvas size in CSS pixels. */
  viewportWidth: number;
  viewportHeight: number;
}

export const DEFAULT_CAPS: GraphicsCaps = {
  isMobile: false,
  maxTextureSize: 4096,
  renderer: '',
  pixelRatio: 1,
  viewportWidth: 1920,
  viewportHeight: 1080,
};

// ── Presets ──────────────────────────────────────────────────────────────────

/** Player-level switches that no preset overrides. */
type Personal = 'preset' | 'autoAdjust' | 'budgetScale';
type PresetBody = Omit<GraphicsSettings, Personal>;

/** Auto-adjust never takes the pixel budget below half the preset's. */
export const MIN_BUDGET_SCALE = 0.5;

/**
 * Presets are sized against the Steam Hardware Survey (Aug 2026): 1080p is
 * half of all screens and 1440p a fifth, and the typical GPU is an RTX
 * 3060/4060-class card. See docs/city-game-performance.md.
 *
 * Low is the floor, for integrated graphics: no shadow pass, no
 * post-processing, a thinner crowd, about 1440x810 pixels and a 30 fps cap
 * (which also halves the simulation's CPU time — see GameScene).
 */
const LOW: PresetBody = {
  resolutionScale: 0.75,
  maxPixels: 1.2,
  shadowQuality: 'off',
  shadowDistance: 40,
  ssr: false,
  ssrQuality: 'low',
  ao: 'off',
  bloom: false,
  bloomStrength: 0.35,
  antiAliasing: 'off',
  drawDistance: 0.7,
  fov: 60,
  particleDensity: 0.2,
  trafficDensity: 8,
  pedestrianDensity: 32,
  parkedCars: 4,
  streetLightCount: 0,
  fpsCap: 30,
  uiScale: 1,
  showFps: false,
};

/** Mainstream: 1080p at 60 fps on a GTX 1660 / RTX 3050-class card. */
const MEDIUM: PresetBody = {
  ...LOW,
  resolutionScale: 1,
  maxPixels: 2.1,
  shadowQuality: 'medium',
  shadowDistance: 60,
  bloom: true,
  bloomStrength: 0.35,
  antiAliasing: 'msaa',
  drawDistance: 1,
  particleDensity: 0.6,
  trafficDensity: 15,
  pedestrianDensity: 67,
  parkedCars: 10,
  streetLightCount: 2,
  // Uncapped, a 144 Hz screen runs the simulation 144 times a second.
  fpsCap: 60,
};

/** The survey's typical card (RTX 3060/4060 class), up to 1440p. */
const HIGH: PresetBody = {
  ...MEDIUM,
  maxPixels: 3.7,
  shadowQuality: 'high',
  shadowDistance: 90,
  ao: 'gtao',
  bloomStrength: 0.45,
  antiAliasing: 'smaa',
  particleDensity: 1,
  trafficDensity: 22,
  pedestrianDensity: 96,
  parkedCars: 16,
  streetLightCount: 6,
};

/** Opt-in only: native resolution, SSR and the long shadow range. */
const ULTRA: PresetBody = {
  ...HIGH,
  maxPixels: 0,
  shadowQuality: 'ultra',
  shadowDistance: 160,
  ssr: true,
  ssrQuality: 'high',
  bloomStrength: 0.5,
  drawDistance: 1.3,
  trafficDensity: 31,
  pedestrianDensity: 125,
  parkedCars: 22,
  streetLightCount: 12,
};

export const PRESETS: Record<Exclude<Preset, 'custom'>, PresetBody> = {
  low: LOW,
  medium: MEDIUM,
  high: HIGH,
  ultra: ULTRA,
};

/** Selectable frame caps; 0 means uncapped. 120/144 for high-refresh screens. */
export const FPS_CAPS = [0, 30, 60, 120, 144];

export const SHADOW_MAP_SIZE: Record<ShadowQuality, number> = {
  off: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
  ultra: 4096,
};

export function presetSettings(
  preset: Exclude<Preset, 'custom'>,
  keep: Partial<Pick<GraphicsSettings, 'autoAdjust'>> = {},
): GraphicsSettings {
  return { preset, ...PRESETS[preset], autoAdjust: keep.autoAdjust ?? true, budgetScale: 1 };
}

/** The fallback when nothing is known about the GPU. */
export function defaultGraphics(): GraphicsSettings {
  return presetSettings('low');
}

// ── Validation ───────────────────────────────────────────────────────────────

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Validate per key, falling back to the default for that key alone. A single
 * bad or unknown value must never discard the rest of the settings, so adding
 * a key in a later version does not wipe what the player already chose.
 */
export function sanitize(raw: unknown): GraphicsSettings {
  const d = defaultGraphics();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<GraphicsSettings>;

  return {
    preset: pick(r.preset, ['low', 'medium', 'high', 'ultra', 'custom'] as const, d.preset),
    resolutionScale: num(r.resolutionScale, 0.5, 2, d.resolutionScale),
    maxPixels: num(r.maxPixels, 0, 33, d.maxPixels),
    shadowQuality: pick(r.shadowQuality, ['off', 'low', 'medium', 'high', 'ultra'] as const, d.shadowQuality),
    shadowDistance: num(r.shadowDistance, 40, 200, d.shadowDistance),
    ssr: bool(r.ssr, d.ssr),
    ssrQuality: pick(r.ssrQuality, ['low', 'high'] as const, d.ssrQuality),
    ao: pick(r.ao, ['off', 'ssao', 'gtao'] as const, d.ao),
    bloom: bool(r.bloom, d.bloom),
    bloomStrength: num(r.bloomStrength, 0, 1.5, d.bloomStrength),
    antiAliasing: pick(r.antiAliasing, ['off', 'msaa', 'fxaa', 'smaa'] as const, d.antiAliasing),
    drawDistance: num(r.drawDistance, 0.5, 1.5, d.drawDistance),
    fov: num(r.fov, 50, 90, d.fov),
    particleDensity: num(r.particleDensity, 0, 1, d.particleDensity),
    trafficDensity: num(r.trafficDensity, 0, 40, d.trafficDensity),
    pedestrianDensity: num(r.pedestrianDensity, 0, 128, d.pedestrianDensity),
    parkedCars: num(r.parkedCars, 0, 24, d.parkedCars),
    streetLightCount: num(r.streetLightCount, 0, 12, d.streetLightCount),
    fpsCap: FPS_CAPS.includes(r.fpsCap as number) ? (r.fpsCap as number) : d.fpsCap,
    uiScale: num(r.uiScale, 0.8, 1.4, d.uiScale),
    showFps: bool(r.showFps, d.showFps),
    autoAdjust: bool(r.autoAdjust, d.autoAdjust),
    budgetScale: num(r.budgetScale, MIN_BUDGET_SCALE, 1, d.budgetScale),
  };
}

/** Which preset these settings correspond to, or 'custom' if none match. */
export function detectPreset(s: GraphicsSettings): Preset {
  for (const name of ['low', 'medium', 'high', 'ultra'] as const) {
    const body = PRESETS[name];
    const same = (Object.keys(body) as (keyof PresetBody)[]).every(k => s[k] === body[k]);
    if (same) return name;
  }
  return 'custom';
}

// ── Derived values ───────────────────────────────────────────────────────────

export interface ResolvedGraphics {
  dpr: number;
  /** Drawing-buffer size that dpr gives on this screen, device pixels. */
  renderWidth: number;
  renderHeight: number;
  /**
   * Whether the canvas itself is created multisampled. Only when MSAA is the
   * whole AA story: with a composer the samples live on its render target,
   * and a multisampled default framebuffer would be paid for twice.
   */
  canvasMsaa: boolean;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowHalf: number;
  perfPatch: Partial<PerfProfile>;
  /** Changing this string rebuilds the post-processing chain. */
  postFxKey: string;
  /** False means render straight to the screen, with no composer at all. */
  usesComposer: boolean;
  ssr: boolean;
  ssrQuality: SsrQuality;
  ao: AoMode;
  bloom: boolean;
  bloomStrength: number;
  antiAliasing: AaMode;
  fov: number;
  particleCount: number;
  fpsCap: number;
  uiScale: number;
  showFps: boolean;
}

export interface DprInput {
  /** GraphicsSettings.resolutionScale: fraction of native resolution. */
  scale: number;
  /** window.devicePixelRatio. */
  pixelRatio: number;
  /** Canvas size, CSS pixels. */
  width: number;
  height: number;
  /** Megapixel budget; 0 = none. */
  maxPixels: number;
  /** Auto-adjust's cut to the budget (1 = none). */
  budgetScale: number;
  maxDpr: number;
}

/**
 * The canvas dpr: the requested fraction of native resolution, shrunk until
 * the drawing buffer fits the pixel budget. A 1080p screen at medium renders
 * natively; a 1440p screen at medium renders about 1920x1080 and lets the
 * browser upscale, rather than paying 1.8x the fill rate for the same preset.
 */
export function renderDpr(i: DprInput): number {
  const native = Math.max(0.5, i.pixelRatio || 1);
  let dpr = i.scale * native;
  const cssPixels = Math.max(1, i.width) * Math.max(1, i.height);
  // With no budget of its own (ultra), auto-adjust scales the native size.
  const budget = i.maxPixels > 0
    ? i.maxPixels * 1e6 * i.budgetScale
    : i.budgetScale < 1 ? cssPixels * dpr * dpr * i.budgetScale : 0;
  if (budget > 0) dpr = Math.min(dpr, Math.sqrt(budget / cssPixels));
  return Math.max(0.25, Math.min(i.maxDpr, dpr));
}

/** Full-density particle count; scaled down by particleDensity. */
export const MAX_PARTICLES = 10000;

const BASE_DRAW_DISTANCE = 176;
const BASE_SHADOW_DISTANCE = 96;

/**
 * Turn settings into the concrete numbers each consumer wants, clamped to what
 * the device can stand. Mobile GPUs cannot afford SSR or a 4096 depth map.
 */
export function resolve(s: GraphicsSettings, caps: GraphicsCaps = DEFAULT_CAPS): ResolvedGraphics {
  const maxMap = caps.isMobile ? 2048 : 4096;
  const dpr = renderDpr({
    scale: s.resolutionScale,
    pixelRatio: caps.pixelRatio,
    width: caps.viewportWidth,
    height: caps.viewportHeight,
    maxPixels: s.maxPixels,
    budgetScale: s.budgetScale,
    maxDpr: caps.isMobile ? 2 : 3,
  });
  const shadowMapSize = Math.min(SHADOW_MAP_SIZE[s.shadowQuality], maxMap, caps.maxTextureSize);
  const shadowsEnabled = s.shadowQuality !== 'off' && shadowMapSize > 0;

  const ssr = s.ssr && !caps.isMobile;
  const antiAliasing = caps.isMobile && s.antiAliasing === 'msaa' ? 'fxaa' : s.antiAliasing;

  const drawDistance = Math.round(BASE_DRAW_DISTANCE * s.drawDistance);
  const shadowDistance = Math.min(s.shadowDistance, BASE_SHADOW_DISTANCE * 2);

  // Vehicles and pedestrians dominate the per-frame simulation cost, so they
  // are capped together rather than individually.
  const npcCars = Math.round(Math.min(s.trafficDensity, 40));
  const parkedCars = Math.round(Math.min(s.parkedCars, 56 - npcCars));

  const usesComposer = ssr || s.ao !== 'off' || s.bloom
    || antiAliasing === 'fxaa' || antiAliasing === 'smaa';

  return {
    dpr,
    renderWidth: Math.round(caps.viewportWidth * dpr),
    renderHeight: Math.round(caps.viewportHeight * dpr),
    canvasMsaa: antiAliasing === 'msaa' && !usesComposer,
    shadowsEnabled,
    shadowMapSize,
    shadowHalf: shadowDistance,
    perfPatch: {
      maxPeds: Math.round(Math.min(s.pedestrianDensity, 128)),
      npcCars,
      parkedCars: Math.max(0, parkedCars),
      drawDistance,
      shadowDistance,
      lampLights: Math.round(s.streetLightCount),
      pedShadows: s.shadowQuality === 'high' || s.shadowQuality === 'ultra',
      // Pursuers cost what traffic costs, so a thin street gets a thin chase.
      maxPolice: s.trafficDensity < 12 ? 3 : 5,
    },
    postFxKey: [
      ssr ? `ssr-${s.ssrQuality}` : 'nossr',
      s.ao,
      s.bloom ? `bloom-${s.bloomStrength.toFixed(2)}` : 'nobloom',
      antiAliasing,
    ].join('|'),
    // MSAA alone is handled by the canvas' own antialias flag, so it does not
    // on its own justify the cost of an offscreen buffer.
    usesComposer,
    ssr,
    ssrQuality: s.ssrQuality,
    ao: s.ao,
    bloom: s.bloom,
    bloomStrength: s.bloomStrength,
    antiAliasing,
    fov: s.fov,
    particleCount: Math.round(MAX_PARTICLES * s.particleDensity),
    fpsCap: s.fpsCap,
    uiScale: s.uiScale,
    showFps: s.showFps,
  };
}

// ── Tier detection ───────────────────────────────────────────────────────────

export type DetectedTier = Exclude<Preset, 'custom' | 'ultra'>;

/**
 * Starting preset from the unmasked GL renderer string, e.g.
 * "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 …)".
 *
 * The table follows the Steam Hardware Survey's most common cards: the
 * x060-and-up generation of RTX (and AMD/Intel equivalents) gets high, the
 * GTX 16/10 series and the x050 cards medium, integrated graphics low. Never
 * picks ultra — SSR plus a 4096 shadow map is an opt-in cost. Phones and
 * tablets start at low whatever their GPU.
 */
export function detectTier(renderer: string, isMobile = false): DetectedTier {
  const r = (renderer || '').toLowerCase();
  if (isMobile) return 'low';
  if (!r) return 'medium';
  if (/swiftshader|llvmpipe|software|basic render/.test(r)) return 'low';
  // Phone and tablet GPUs, in case a touch device reports no coarse pointer.
  if (/mali|adreno|powervr|apple a\d/.test(r)) return 'low';
  // Firefox reports a representative card for a whole class ("GeForce GTX
  // 980, or similar"), so the model number means nothing.
  if (/or similar/.test(r)) return 'medium';

  // ── NVIDIA ──
  const rtx = r.match(/rtx\s*a?(\d{3,4})/);
  if (rtx) {
    // RTX 2050/3050/4050/5050 and the small workstation A500 are the entry
    // cards; everything else in the family (x060 and up, A2000 …) is high.
    return rtx[1].length === 3 || /50$/.test(rtx[1]) ? 'medium' : 'high';
  }
  const gtx = r.match(/gtx\s*(\d{3,4})/);
  if (gtx) {
    const n = Number(gtx[1]);
    if (n >= 1650 || (n >= 1060 && n < 1600)) return 'medium';
    return 'low'; // GTX 9xx, 1050, 1630
  }
  if (/titan|quadro|tesla/.test(r)) return 'medium';
  if (/geforce\s*(gt|mx)\b|\bmx\s*\d{3}/.test(r)) return 'low';

  // ── AMD ──
  const rx4 = r.match(/rx\s*(\d{4})/);
  if (rx4) {
    // RX 5500/6400/6500 are entry cards; 5600/6600/7600 and up are high.
    // The 9000 series counts in tens (9060, 9070), so scale it to match.
    const n = Number(rx4[1]);
    const model = n >= 9000 ? (n % 1000) * 10 : n % 1000;
    return model >= 600 ? 'high' : 'medium';
  }
  const rx3 = r.match(/rx\s*(\d{3})\b/);
  if (rx3) return Number(rx3[1]) % 100 >= 70 ? 'medium' : 'low'; // RX 470–590 vs 550/560
  const rxVega = r.match(/rx\s*vega\s*(\d+)/);
  if (rxVega) return Number(rxVega[1]) >= 56 ? 'medium' : 'low'; // Vega 56/64 vs APU Vega 11
  if (/radeon\s*vii|radeon\s*pro/.test(r)) return 'medium';
  const apu = r.match(/radeon\s*(\d{3})m/);
  if (apu) return Number(apu[1]) >= 680 ? 'medium' : 'low'; // 680M/780M/880M/890M
  if (/radeon|vega/.test(r)) return 'low'; // "Radeon(TM) Graphics" APUs

  // ── Intel ──
  const arc = r.match(/arc(?:\(tm\))?\s*([ab])(\d{3})/);
  if (arc) return arc[1] === 'b' || Number(arc[2]) >= 500 ? 'high' : 'medium';
  if (/arc/.test(r)) return 'medium'; // Arc integrated (Meteor/Lunar Lake)
  if (/intel|iris|uhd|hd graphics/.test(r)) return 'low';

  // ── Apple ──
  if (/apple m\d+\s*(pro|max|ultra)/.test(r)) return 'high';
  if (/apple/.test(r)) return 'medium';

  return 'medium';
}

// ── Persistence ──────────────────────────────────────────────────────────────

interface StoredGraphics extends GraphicsSettings {
  v: number;
}

/** Stored settings, or null when nothing valid is saved yet. */
export function loadGraphics(): GraphicsSettings | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(GFX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGraphics>;
    if (!parsed || parsed.v !== GFX_VERSION) return null;
    return sanitize(parsed);
  } catch {
    return null;
  }
}

export function writeGraphics(settings: GraphicsSettings): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(GFX_KEY, JSON.stringify({ v: GFX_VERSION, ...settings }));
  } catch {
    // Quota or blocked storage: the player keeps the settings for this session.
  }
}

export function clearGraphics(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(GFX_KEY);
  } catch {
    // Nothing to do.
  }
}
