import { describe, it, expect } from 'vitest';
import { dispatchFor, groundTotal } from '../dispatch';
import { MAX_STARS } from '../wanted';

describe('dispatchFor', () => {
  it('sends nothing at zero stars', () => {
    const d = dispatchFor(0);
    expect(groundTotal(d)).toBe(0);
    expect(d.helis).toBe(0);
    expect(d.roadblocks).toBe(false);
  });

  it('escalates GTA III style', () => {
    expect(dispatchFor(1)).toMatchObject({ police: 1, helis: 0, roadblocks: false });
    expect(dispatchFor(2)).toMatchObject({ roadblocks: true, helis: 0 });
    expect(dispatchFor(3)).toMatchObject({ helis: 1, heliGunner: false });
    expect(dispatchFor(4)).toMatchObject({ helis: 1, heliGunner: true });
    expect(dispatchFor(4).swat).toBeGreaterThan(0);
    expect(dispatchFor(5)).toMatchObject({ helis: 2, spikeStrips: true });
    expect(dispatchFor(6).tanks).toBeGreaterThan(0);
    expect(dispatchFor(6).army).toBeGreaterThan(0);
  });

  it('keeps the army for six stars only', () => {
    for (let s = 0; s < MAX_STARS; s++) {
      expect(dispatchFor(s).tanks).toBe(0);
      expect(dispatchFor(s).army).toBe(0);
    }
  });

  it('never sends fewer helicopters as the level rises', () => {
    for (let s = 1; s <= MAX_STARS; s++) {
      expect(dispatchFor(s).helis).toBeGreaterThanOrEqual(dispatchFor(s - 1).helis);
    }
  });

  it('clamps out-of-range levels', () => {
    expect(dispatchFor(-3)).toEqual(dispatchFor(0));
    expect(dispatchFor(99)).toEqual(dispatchFor(MAX_STARS));
  });

  it('trims the weakest units first when over the ground budget', () => {
    const d = dispatchFor(6, 3);
    expect(groundTotal(d)).toBe(3);
    // Tanks survive the cut before anything else does.
    expect(d.tanks).toBe(dispatchFor(6).tanks);
    expect(d.police).toBe(0);
  });

  it('caps helicopters separately', () => {
    expect(dispatchFor(6, Infinity, 1).helis).toBe(1);
    expect(dispatchFor(6, Infinity, 0).helis).toBe(0);
  });

  it('returns a fresh object each time', () => {
    const a = dispatchFor(3);
    a.police = 99;
    expect(dispatchFor(3).police).not.toBe(99);
  });
});
