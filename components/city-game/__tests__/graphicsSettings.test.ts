import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_CAPS,
  GFX_KEY,
  GFX_VERSION,
  MAX_PARTICLES,
  PRESETS,
  clearGraphics,
  defaultGraphics,
  detectPreset,
  detectTier,
  loadGraphics,
  presetSettings,
  resolve,
  sanitize,
  writeGraphics,
} from '../graphicsSettings';
import { SAVE_KEY, clearSave, writeSave, defaultSave } from '../save';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('presets', () => {
  it('survive a sanitize round trip unchanged', () => {
    for (const name of ['low', 'medium', 'high', 'ultra'] as const) {
      const s = presetSettings(name);
      expect(sanitize(s)).toEqual(s);
    }
  });

  it('are recognised by detectPreset', () => {
    for (const name of ['low', 'medium', 'high', 'ultra'] as const) {
      expect(detectPreset(presetSettings(name))).toBe(name);
    }
  });

  it('reports a modified preset as custom', () => {
    const s = presetSettings('high');
    s.shadowDistance = 123;
    expect(detectPreset(s)).toBe('custom');
  });

  it('only enables SSR on ultra', () => {
    expect(PRESETS.low.ssr).toBe(false);
    expect(PRESETS.medium.ssr).toBe(false);
    expect(PRESETS.high.ssr).toBe(false);
    expect(PRESETS.ultra.ssr).toBe(true);
  });
});

describe('sanitize', () => {
  it('falls back to defaults for a non-object', () => {
    expect(sanitize(null)).toEqual(defaultGraphics());
    expect(sanitize('nope')).toEqual(defaultGraphics());
  });

  it('clamps an out-of-range value without touching other keys', () => {
    const s = sanitize({ ...presetSettings('high'), resolutionScale: 99 });
    expect(s.resolutionScale).toBe(2);
    expect(s.shadowQuality).toBe('high');
    expect(s.trafficDensity).toBe(PRESETS.high.trafficDensity);
  });

  it('replaces only the invalid key', () => {
    const d = defaultGraphics();
    const s = sanitize({ ...presetSettings('ultra'), ao: 'raytraced' });
    expect(s.ao).toBe(d.ao);
    expect(s.ssr).toBe(true);
    expect(s.shadowQuality).toBe('ultra');
  });

  it('rejects an unsupported fps cap', () => {
    expect(sanitize({ fpsCap: 144 }).fpsCap).toBe(defaultGraphics().fpsCap);
    expect(sanitize({ fpsCap: 30 }).fpsCap).toBe(30);
    expect(sanitize({ fpsCap: 0 }).fpsCap).toBe(0);
  });
});

describe('resolve', () => {
  it('maps shadow quality to a map size and disables it when off', () => {
    expect(resolve(presetSettings('low')).shadowMapSize).toBe(1024);
    expect(resolve(presetSettings('high')).shadowMapSize).toBe(4096);
    const off = resolve({ ...presetSettings('high'), shadowQuality: 'off' });
    expect(off.shadowsEnabled).toBe(false);
  });

  it('scales the particle count', () => {
    const s = { ...presetSettings('high'), particleDensity: 0.5 };
    expect(resolve(s).particleCount).toBe(MAX_PARTICLES / 2);
  });

  it('clamps mobile down to a survivable budget', () => {
    const caps = { ...DEFAULT_CAPS, isMobile: true };
    const r = resolve(presetSettings('ultra'), caps);
    expect(r.ssr).toBe(false);
    expect(r.shadowMapSize).toBeLessThanOrEqual(2048);
    expect(r.dpr).toBeLessThanOrEqual(2);
  });

  it('respects the GPU texture limit', () => {
    const caps = { ...DEFAULT_CAPS, maxTextureSize: 1024 };
    expect(resolve(presetSettings('ultra'), caps).shadowMapSize).toBe(1024);
  });

  it('keeps traffic and parked cars within a combined budget', () => {
    const s = { ...presetSettings('ultra'), trafficDensity: 40, parkedCars: 24 };
    const p = resolve(s).perfPatch;
    expect(p.npcCars! + p.parkedCars!).toBeLessThanOrEqual(56);
  });

  it('changes postFxKey only when a pass changes', () => {
    const base = presetSettings('high');
    expect(resolve(base).postFxKey).toBe(resolve({ ...base, fov: 75 }).postFxKey);
    expect(resolve(base).postFxKey).not.toBe(resolve({ ...base, ao: 'off' }).postFxKey);
    expect(resolve(base).postFxKey).not.toBe(resolve({ ...base, ssr: true }).postFxKey);
  });

  it('downgrades MSAA on mobile, where it is not affordable', () => {
    const caps = { ...DEFAULT_CAPS, isMobile: true };
    expect(resolve(presetSettings('medium'), caps).antiAliasing).toBe('fxaa');
  });
});

describe('detectTier', () => {
  it('maps renderer strings to a starting preset', () => {
    expect(detectTier('Google SwiftShader')).toBe('low');
    expect(detectTier('llvmpipe (LLVM 15.0.7)')).toBe('low');
    expect(detectTier('ANGLE (Intel(R) UHD Graphics 620)')).toBe('medium');
    expect(detectTier('Mali-G78')).toBe('medium');
    expect(detectTier('Adreno (TM) 650')).toBe('medium');
    expect(detectTier('ANGLE (NVIDIA GeForce RTX 4070)')).toBe('high');
  });

  it('never picks ultra automatically', () => {
    const picks = ['', 'RTX 4090', 'Radeon RX 7900', 'unknown gpu'].map(detectTier);
    expect(picks).not.toContain('ultra');
  });

  it('falls back to medium without a renderer string', () => {
    expect(detectTier('')).toBe('medium');
  });
});

describe('persistence', () => {
  it('round trips through localStorage', () => {
    const s = { ...presetSettings('ultra'), fov: 71 };
    writeGraphics(s);
    expect(loadGraphics()).toEqual(s);
  });

  it('returns null when nothing is stored', () => {
    expect(loadGraphics()).toBeNull();
  });

  it('rejects a stored version mismatch', () => {
    localStorage.setItem(GFX_KEY, JSON.stringify({ ...defaultGraphics(), v: GFX_VERSION + 1 }));
    expect(loadGraphics()).toBeNull();
  });

  it('rejects corrupt JSON', () => {
    localStorage.setItem(GFX_KEY, '{ not json');
    expect(loadGraphics()).toBeNull();
  });

  it('repairs an out-of-range stored value instead of discarding everything', () => {
    localStorage.setItem(GFX_KEY, JSON.stringify({
      ...presetSettings('ultra'), v: GFX_VERSION, fov: 999,
    }));
    const loaded = loadGraphics()!;
    expect(loaded.fov).toBe(90);
    expect(loaded.ssr).toBe(true);
  });

  it('is not wiped by clearSave, so restarting keeps display settings', () => {
    const s = presetSettings('ultra');
    writeGraphics(s);
    writeSave(defaultSave());

    clearSave();

    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(loadGraphics()).toEqual(s);
  });

  it('clearGraphics removes only the graphics key', () => {
    writeGraphics(presetSettings('low'));
    writeSave(defaultSave());

    clearGraphics();

    expect(loadGraphics()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
  });
});
