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
export const GFX_VERSION = 1;

export type Preset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export type AoMode = 'off' | 'ssao' | 'gtao';
export type AaMode = 'off' | 'msaa' | 'fxaa' | 'smaa';
export type SsrQuality = 'low' | 'high';

export interface GraphicsSettings {
  preset: Preset;
  /** Canvas dpr multiplier. Above 1 acts as supersampling. */
  resolutionScale: number;
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
}

/** What the device can actually support. Filled in once the GL context exists. */
export interface GraphicsCaps {
  isMobile: boolean;
  maxTextureSize: number;
  renderer: string;
}

export const DEFAULT_CAPS: GraphicsCaps = {
  isMobile: false,
  maxTextureSize: 4096,
  renderer: '',
};

// ── Presets ──────────────────────────────────────────────────────────────────

type PresetBody = Omit<GraphicsSettings, 'preset'>;

const LOW: PresetBody = {
  resolutionScale: 0.75,
  shadowQuality: 'low',
  shadowDistance: 40,
  ssr: false,
  ssrQuality: 'low',
  ao: 'off',
  bloom: false,
  bloomStrength: 0.35,
  antiAliasing: 'off',
  drawDistance: 0.7,
  fov: 60,
  particleDensity: 0.3,
  trafficDensity: 9,
  pedestrianDensity: 48,
  parkedCars: 6,
  streetLightCount: 0,
  fpsCap: 60,
  uiScale: 1,
  showFps: false,
};

const MEDIUM: PresetBody = {
  ...LOW,
  resolutionScale: 1,
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
  fpsCap: 0,
};

const HIGH: PresetBody = {
  ...MEDIUM,
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

const ULTRA: PresetBody = {
  ...HIGH,
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

/** Selectable frame caps; 0 means uncapped. */
export const FPS_CAPS = [0, 30, 60];

export const SHADOW_MAP_SIZE: Record<ShadowQuality, number> = {
  off: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
  ultra: 4096,
};

export function presetSettings(preset: Exclude<Preset, 'custom'>): GraphicsSettings {
  return { preset, ...PRESETS[preset] };
}

export function defaultGraphics(): GraphicsSettings {
  return presetSettings('high');
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
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowHalf: number;
  perfPatch: Partial<PerfProfile>;
  /** Changing this string rebuilds the post-processing chain. */
  postFxKey: string;
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

  return {
    dpr: Math.min(s.resolutionScale, caps.isMobile ? 2 : 3),
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
    },
    postFxKey: [
      ssr ? `ssr-${s.ssrQuality}` : 'nossr',
      s.ao,
      s.bloom ? `bloom-${s.bloomStrength.toFixed(2)}` : 'nobloom',
      antiAliasing,
    ].join('|'),
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

/**
 * Guess a starting preset from the GL renderer string. Never picks ultra —
 * SSR plus a 4096 shadow map is an opt-in cost, not something to inflict on a
 * first-time player.
 */
export function detectTier(renderer: string): Exclude<Preset, 'custom' | 'ultra'> {
  const r = (renderer || '').toLowerCase();
  if (!r) return 'medium';
  if (r.includes('swiftshader') || r.includes('llvmpipe') || r.includes('software')) return 'low';
  if (
    r.includes('intel') || r.includes('iris') ||
    r.includes('mali') || r.includes('adreno') ||
    r.includes('powervr') || r.includes('apple m1')
  ) return 'medium';
  return 'high';
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
