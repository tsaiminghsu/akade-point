import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_CAPS,
  FPS_CAPS,
  GFX_KEY,
  GFX_VERSION,
  MAX_PARTICLES,
  MIN_BUDGET_SCALE,
  PRESETS,
  clearGraphics,
  defaultGraphics,
  detectPreset,
  detectTier,
  loadGraphics,
  presetSettings,
  renderDpr,
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

  it('caps every preset so a 144 Hz screen does not run 144 simulation steps', () => {
    expect(PRESETS.low.fpsCap).toBe(30);
    expect(PRESETS.medium.fpsCap).toBe(60);
    expect(PRESETS.high.fpsCap).toBe(60);
    expect(PRESETS.ultra.fpsCap).toBe(60);
    expect(FPS_CAPS).toEqual([0, 30, 60, 120, 144]);
  });

  it('budgets pixels by preset: ~1440x810, 1080p, 1440p, native', () => {
    expect(PRESETS.low.maxPixels).toBeCloseTo(1.2);
    expect(PRESETS.medium.maxPixels).toBeGreaterThanOrEqual(1920 * 1080 / 1e6);
    expect(PRESETS.high.maxPixels).toBeGreaterThanOrEqual(2560 * 1440 / 1e6);
    expect(PRESETS.ultra.maxPixels).toBe(0);
  });

  it('keeps the auto-adjust switch but resets its budget cut when a preset is picked', () => {
    const s = presetSettings('high', { autoAdjust: false });
    expect(s.autoAdjust).toBe(false);
    expect(s.budgetScale).toBe(1);
    expect(presetSettings('high').autoAdjust).toBe(true);
    // Neither is part of what makes a preset.
    expect(detectPreset({ ...s, budgetScale: 0.75 })).toBe('high');
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
    expect(sanitize({ fpsCap: 90 }).fpsCap).toBe(defaultGraphics().fpsCap);
    expect(sanitize({ fpsCap: 144 }).fpsCap).toBe(144);
    expect(sanitize({ fpsCap: 30 }).fpsCap).toBe(30);
    expect(sanitize({ fpsCap: 0 }).fpsCap).toBe(0);
  });

  it('clamps the auto-adjust budget cut', () => {
    expect(sanitize({ budgetScale: 0.1 }).budgetScale).toBe(MIN_BUDGET_SCALE);
    expect(sanitize({ budgetScale: 3 }).budgetScale).toBe(1);
    expect(sanitize({}).autoAdjust).toBe(true);
  });
});

describe('resolve', () => {
  it('maps shadow quality to a map size and disables it when off', () => {
    expect(resolve({ ...presetSettings('high'), shadowQuality: 'low' }).shadowMapSize).toBe(1024);
    expect(resolve(presetSettings('medium')).shadowMapSize).toBe(2048);
    expect(resolve(presetSettings('high')).shadowMapSize).toBe(4096);
    const off = resolve({ ...presetSettings('high'), shadowQuality: 'off' });
    expect(off.shadowsEnabled).toBe(false);
  });

  it('keeps the low default genuinely light', () => {
    expect(defaultGraphics()).toEqual(presetSettings('low'));
    const low = resolve(defaultGraphics());
    expect(low.shadowsEnabled).toBe(false);
    expect(low.usesComposer).toBe(false);
    expect(low.fpsCap).toBe(30);
    expect(low.perfPatch.maxPolice).toBe(3);
    expect(resolve(presetSettings('high')).perfPatch.maxPolice).toBe(5);
    expect(low.perfPatch.maxPeds!).toBeLessThan(resolve(presetSettings('medium')).perfPatch.maxPeds!);
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

  it('multisamples the canvas only when MSAA does the anti-aliasing on its own', () => {
    // Low: AA off, so the low default no longer pays for a multisampled screen.
    expect(resolve(presetSettings('low')).canvasMsaa).toBe(false);
    // Medium: bloom needs the composer, whose target carries the samples.
    expect(resolve(presetSettings('medium')).canvasMsaa).toBe(false);
    const plain = { ...presetSettings('medium'), bloom: false };
    expect(resolve(plain).usesComposer).toBe(false);
    expect(resolve(plain).canvasMsaa).toBe(true);
  });

  it('reports the drawing-buffer size the budget allows', () => {
    const caps = { ...DEFAULT_CAPS, viewportWidth: 2560, viewportHeight: 1440, pixelRatio: 1 };
    const r = resolve(presetSettings('medium'), caps);
    expect(r.renderWidth * r.renderHeight).toBeLessThanOrEqual(2.1e6 * 1.01);
    expect(r.renderWidth).toBeGreaterThan(1900);
  });
});

describe('renderDpr', () => {
  const at = (w: number, h: number, pixelRatio: number, preset: 'low' | 'medium' | 'high' | 'ultra', budgetScale = 1) => {
    const s = presetSettings(preset);
    const dpr = renderDpr({
      scale: s.resolutionScale, pixelRatio, width: w, height: h,
      maxPixels: s.maxPixels, budgetScale, maxDpr: 3,
    });
    return { dpr, pixels: w * h * dpr * dpr };
  };

  it('renders a 1080p screen natively at medium', () => {
    expect(at(1920, 1080, 1, 'medium').dpr).toBeCloseTo(1);
  });

  it('holds a 1440p screen to about 1080p worth of pixels at medium', () => {
    const r = at(2560, 1440, 1, 'medium');
    expect(r.pixels).toBeLessThanOrEqual(2.1e6 + 1);
    expect(r.pixels).toBeGreaterThan(2.0e6);
  });

  it('does the same for a 4K screen at 150% Windows scaling', () => {
    const r = at(2560, 1440, 1.5, 'medium');
    expect(r.pixels).toBeLessThanOrEqual(2.1e6 + 1);
  });

  it('uses the extra pixels of a high-DPI laptop up to the budget at high', () => {
    // 2560x1600 panel at 200%: 1280x800 CSS pixels.
    const r = at(1280, 800, 2, 'high');
    expect(r.dpr).toBeGreaterThan(1.8);
    expect(r.pixels).toBeLessThanOrEqual(3.7e6 + 1);
  });

  it('keeps low at its old size on a 1080p screen', () => {
    expect(at(1920, 1080, 1, 'low').dpr).toBeCloseTo(0.75);
  });

  it('leaves ultra at native resolution', () => {
    expect(at(3840, 2160, 1, 'ultra').dpr).toBeCloseTo(1);
  });

  it('shrinks with the auto-adjust budget cut, ultra included', () => {
    expect(at(1920, 1080, 1, 'medium', 0.5).pixels).toBeLessThanOrEqual(1.05e6 + 1);
    expect(at(3840, 2160, 1, 'ultra', 0.75).pixels).toBeCloseTo(3840 * 2160 * 0.75, -3);
  });

  it('never exceeds any preset budget across common screens', () => {
    const screens: [number, number, number][] = [
      [1920, 1080, 1], [2560, 1440, 1], [3840, 2160, 1], [2560, 1440, 1.5],
      [1280, 800, 2], [1536, 864, 1.25], [3440, 1440, 1], [1366, 768, 1],
    ];
    for (const preset of ['low', 'medium', 'high'] as const) {
      const budget = PRESETS[preset].maxPixels * 1e6;
      for (const [w, h, pr] of screens) {
        expect(at(w, h, pr, preset).pixels).toBeLessThanOrEqual(budget + 1);
      }
    }
  });
});

describe('detectTier', () => {
  const nv = (name: string) => `ANGLE (NVIDIA, NVIDIA GeForce ${name} (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)`;
  const amd = (name: string) => `ANGLE (AMD, AMD ${name} (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)`;
  const intel = (name: string) => `ANGLE (Intel, Intel(R) ${name} (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)`;

  it('places the Steam survey top 25 (Aug 2026)', () => {
    const top25: [string, 'low' | 'medium' | 'high'][] = [
      [nv('RTX 3060'), 'high'],
      [nv('RTX 4060 Laptop GPU'), 'high'],
      [nv('RTX 5070'), 'high'],
      [nv('RTX 4060'), 'high'],
      [nv('RTX 3050'), 'medium'],
      [nv('RTX 5060'), 'high'],
      [nv('RTX 5060 Laptop GPU'), 'high'],
      [nv('RTX 5060 Ti'), 'high'],
      [nv('GTX 1650'), 'medium'],
      [nv('RTX 4060 Ti'), 'high'],
      [nv('RTX 3060 Ti'), 'high'],
      [nv('RTX 3070'), 'high'],
      [nv('RTX 3060 Laptop GPU'), 'high'],
      [nv('RTX 5070 Ti'), 'high'],
      [nv('RTX 4070'), 'high'],
      [intel('Iris(R) Xe Graphics'), 'low'],
      [nv('RTX 4050 Laptop GPU'), 'medium'],
      [amd('Radeon(TM) Graphics'), 'low'],
      [nv('RTX 5080'), 'high'],
      [nv('RTX 2060'), 'high'],
      [nv('GTX 1060 6GB'), 'medium'],
      [nv('RTX 4070 SUPER'), 'high'],
      [nv('GTX 1660 SUPER'), 'medium'],
      [amd('Radeon RX 9070 XT'), 'high'],
      [nv('RTX 3080'), 'high'],
    ];
    for (const [renderer, tier] of top25) {
      expect([renderer, detectTier(renderer)]).toEqual([renderer, tier]);
    }
  });

  it('separates entry cards from mainstream ones in each family', () => {
    expect(detectTier(nv('GTX 1050 Ti'))).toBe('low');
    expect(detectTier(nv('GTX 970'))).toBe('low');
    expect(detectTier(nv('GT 1030'))).toBe('low');
    expect(detectTier(nv('MX450'))).toBe('low');
    expect(detectTier(amd('Radeon RX 6500 XT'))).toBe('medium');
    expect(detectTier(amd('Radeon RX 6600'))).toBe('high');
    expect(detectTier(amd('Radeon RX 580 2048SP'))).toBe('medium');
    expect(detectTier(amd('Radeon RX 560'))).toBe('low');
    expect(detectTier(amd('Radeon RX Vega 11 Graphics'))).toBe('low');
    expect(detectTier(amd('Radeon 780M Graphics'))).toBe('medium');
    expect(detectTier(amd('Radeon 610M'))).toBe('low');
    expect(detectTier(intel('Arc(TM) A770 Graphics'))).toBe('high');
    expect(detectTier(intel('Arc(TM) A380 Graphics'))).toBe('medium');
    expect(detectTier(intel('Arc(TM) Graphics'))).toBe('medium');
    expect(detectTier(intel('UHD Graphics 620'))).toBe('low');
    expect(detectTier('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)')).toBe('medium');
    expect(detectTier('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)')).toBe('high');
  });

  it('starts software rendering and phones at low', () => {
    expect(detectTier('Google SwiftShader')).toBe('low');
    expect(detectTier('llvmpipe (LLVM 15.0.7)')).toBe('low');
    expect(detectTier('Microsoft Basic Render Driver')).toBe('low');
    expect(detectTier('Mali-G78')).toBe('low');
    expect(detectTier('Adreno (TM) 650')).toBe('low');
    // A touch device is low whatever it reports.
    expect(detectTier(nv('RTX 4070'), true)).toBe('low');
  });

  it("treats Firefox's generic 'or similar' names as unknown", () => {
    expect(detectTier('NVIDIA GeForce GTX 980, or similar')).toBe('medium');
  });

  it('never picks ultra automatically', () => {
    const picks = ['', 'RTX 4090', 'Radeon RX 7900', 'unknown gpu'].map(r => detectTier(r));
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
