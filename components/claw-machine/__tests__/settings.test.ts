import { describe, expect, it } from 'vitest';
import {
  MID_POINT_SPAN, SETTING_DEFS, SETTING_GROUPS, clampSetting, defaultSettings, dropLineLength, formatSetting, getDef,
  homeLineLength, midLineLength, sanitizeSettings, settingDetail, stepSetting, winchSpeed,
} from '../settings';

describe('claw mainboard settings', () => {
  it('has unique menu codes and defaults inside each range', () => {
    const codes = SETTING_DEFS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const d of SETTING_DEFS) {
      expect(d.default).toBeGreaterThanOrEqual(d.min);
      expect(d.default).toBeLessThanOrEqual(d.max);
      if (d.options) expect(d.options.length).toBe(d.max - d.min + 1);
    }
  });

  it('lists the items group by group, in the order of the groups', () => {
    const order = SETTING_GROUPS.map((g) => g.id);
    const seen = SETTING_DEFS.map((d) => order.indexOf(d.group));
    expect(seen.every((g) => g >= 0)).toBe(true);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('numeric items stop at their limits', () => {
    let s = { ...defaultSettings(), strongPower: 48 };
    s = stepSetting(s, 'strongPower', 1);
    expect(s.strongPower).toBe(48);
    s = { ...s, coinsPerPlay: 1 };
    expect(stepSetting(s, 'coinsPerPlay', -1).coinsPerPlay).toBe(1);
  });

  it('enumerated items wrap around like the board', () => {
    const s = { ...defaultSettings(), payoutMode: 1 };
    expect(stepSetting(s, 'payoutMode', 1).payoutMode).toBe(0);
    expect(stepSetting({ ...s, payoutMode: 0 }, 'payoutMode', -1).payoutMode).toBe(1);
  });

  it('steps fractional items without float drift', () => {
    let s = { ...defaultSettings(), dropLine: 0.2 };
    for (let i = 0; i < 7; i++) s = stepSetting(s, 'dropLine', 1);
    expect(s.dropLine).toBe(0.9);
    let v = { ...defaultSettings(), strongPower: 0 };
    for (let i = 0; i < 3; i++) v = stepSetting(v, 'strongPower', 1);
    expect(v.strongPower).toBe(1.5);
  });

  it('sanitizes stored junk back to valid values', () => {
    const s = sanitizeSettings({ strongPower: 999, liftDelay: 0.123, playTime: 'x', bogus: 1, weakTrigger: 2 });
    expect(s.strongPower).toBe(48);
    expect(s.liftDelay).toBe(0.1);
    expect(s.playTime).toBe(getDef('playTime').default);
    expect('weakTrigger' in s).toBe(false); // retired items from older saves are dropped
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    expect(clampSetting(getDef('dropLine'), Number.NaN)).toBe(2);
  });

  it('formats values for the LCD', () => {
    expect(formatSetting(getDef('payoutMode'), 0)).toBe('保夾');
    expect(formatSetting(getDef('guaranteeN'), 0)).toBe('關閉');
    expect(formatSetting(getDef('dropLine'), 1.5)).toBe('1.5 秒');
    expect(formatSetting(getDef('strongPower'), 17.5)).toBe('17.5 V');
    expect(formatSetting(getDef('liftDelay'), 0.25)).toBe('0.25 秒');
    expect(formatSetting(getDef('homeDrop'), 0)).toBe('關閉');
    expect(formatSetting(getDef('topPull'), 3)).toBe('3 段');
  });
});

describe('cable lengths from the board settings', () => {
  it('下線長度 is motor time × down speed, so a faster motor lets out more line', () => {
    const s = { ...defaultSettings(), dropLine: 1, dropSpeed: 6 };
    expect(dropLineLength(s)).toBeCloseTo(winchSpeed(6), 6);
    expect(dropLineLength({ ...s, dropSpeed: 10 })).toBeGreaterThan(dropLineLength(s));
    expect(dropLineLength({ ...s, dropLine: 2 })).toBeCloseTo(2 * dropLineLength(s), 6);
  });

  it('the default 下線長度 reaches the felt', () => {
    // Top stop to the felt is about 0.67 m of line for the standard claw.
    expect(dropLineLength(defaultSettings())).toBeGreaterThan(0.68);
  });

  it('中壓距離頂點 runs from just under the top stop (1) to a full drop (30)', () => {
    expect(midLineLength({ midPoint: 1 })).toBeLessThan(0.03);
    expect(midLineLength({ midPoint: 30 })).toBe(MID_POINT_SPAN);
    expect(midLineLength({ midPoint: 20 })).toBeGreaterThan(midLineLength({ midPoint: 10 }));
  });

  it('回停下降 lets out 0.1 s of down motor per 段', () => {
    const s = { ...defaultSettings(), homeDrop: 5, dropSpeed: 6 };
    expect(homeLineLength(s)).toBeCloseTo(0.5 * winchSpeed(6), 6);
    expect(homeLineLength({ ...s, homeDrop: 0 })).toBe(0);
  });

  it('shows the resulting length under the length items on the LCD', () => {
    const s = { ...defaultSettings(), dropLine: 1, dropSpeed: 6 };
    expect(settingDetail('dropLine', s)).toBe(`下線長度 ≈ ${Math.round(winchSpeed(6) * 100)} cm`);
    expect(settingDetail('homeDrop', { ...s, homeDrop: 0 })).toBeNull();
    expect(settingDetail('midPoint', { ...s, midPoint: 30 })).toBe('上停下方 70 cm 轉中壓');
    expect(settingDetail('playTime', s)).toBeNull();
  });
});
