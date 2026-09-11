import { describe, expect, it } from 'vitest';

import {
  classifyDanger,
  computeBowCrossing,
  computeCpa,
  hasSteadyBearing,
  isInGuardZone,
  isInSector,
} from './arpa';
import { knotsToNmPerSec } from './geo';
import type { GuardZone } from './types';

const kn = knotsToNmPerSec;

describe('computeCpa', () => {
  it('finds a head-on collision at zero range', () => {
    // Target 4 NM due north, closing at 20 knots combined.
    const { cpaNm, tcpaSec } = computeCpa({ x: 0, y: 4 }, { x: 0, y: -kn(20) });
    expect(cpaNm).toBeCloseTo(0, 6);
    expect(tcpaSec / 3600).toBeCloseTo(0.2, 6); // 4 NM at 20 kn = 12 minutes
  });

  it('measures the passing distance of a crossing target', () => {
    // Target 3 NM ahead and 0.5 NM to starboard, tracking straight down.
    const { cpaNm, tcpaSec } = computeCpa({ x: 0.5, y: 3 }, { x: 0, y: -kn(12) });
    expect(cpaNm).toBeCloseTo(0.5, 6);
    expect(tcpaSec).toBeGreaterThan(0);
  });

  it('returns a negative TCPA once the CPA is astern', () => {
    // Already past and opening.
    const { tcpaSec } = computeCpa({ x: 0, y: -2 }, { x: 0, y: -kn(15) });
    expect(tcpaSec).toBeLessThan(0);
  });

  it('treats a stationary relative geometry as never closing', () => {
    const { cpaNm, tcpaSec } = computeCpa({ x: 1, y: 1 }, { x: 0, y: 0 });
    expect(cpaNm).toBeCloseTo(Math.SQRT2, 6);
    expect(tcpaSec).toBe(Infinity);
  });

  it('is unchanged by rotating the whole geometry', () => {
    const a = computeCpa({ x: 0.5, y: 3 }, { x: 0, y: -kn(12) });
    // Same problem rotated 90 degrees clockwise.
    const b = computeCpa({ x: 3, y: -0.5 }, { x: -kn(12), y: 0 });
    expect(b.cpaNm).toBeCloseTo(a.cpaNm, 9);
    expect(b.tcpaSec).toBeCloseTo(a.tcpaSec, 6);
  });
});

describe('computeBowCrossing', () => {
  it('finds a target crossing ahead from starboard to port', () => {
    // Own ship heading north; target 2 NM ahead, 1 NM to starboard, running west.
    const bow = computeBowCrossing({ x: 1, y: 2 }, { x: -kn(10), y: 0 }, 0);
    expect(bow.rangeNm).toBeCloseTo(2, 6);
    expect(bow.timeSec).toBeGreaterThan(0);
    expect(bow.timeSec / 3600).toBeCloseTo(0.1, 6); // 1 NM at 10 kn
  });

  it('reports no crossing for a parallel course', () => {
    const bow = computeBowCrossing({ x: 1, y: 2 }, { x: 0, y: kn(10) }, 0);
    expect(Number.isNaN(bow.rangeNm)).toBe(true);
  });

  it('follows the ordered heading rather than true north', () => {
    // Own ship heading 090; target 2 NM to the east (dead ahead) running north.
    const bow = computeBowCrossing({ x: 2, y: 1 }, { x: 0, y: -kn(10) }, 90);
    expect(bow.rangeNm).toBeCloseTo(2, 6);
    expect(bow.timeSec).toBeGreaterThan(0);
  });
});

describe('classifyDanger', () => {
  it('alarms only when both limits are breached', () => {
    expect(classifyDanger(0.3, 300, 0.5, 12)).toBe('danger');
  });

  it('stays quiet when the CPA is close but hours away', () => {
    expect(classifyDanger(0.2, 3 * 3600, 0.5, 12)).toBe('safe');
  });

  it('stays quiet when the pass is soon but wide', () => {
    expect(classifyDanger(4, 120, 0.5, 12)).toBe('safe');
  });

  it('never alarms on a target that has already passed', () => {
    expect(classifyDanger(0.1, -60, 0.5, 12)).toBe('safe');
  });

  it('warns inside the wider envelope before it alarms', () => {
    expect(classifyDanger(0.7, 600, 0.5, 12)).toBe('warning');
  });

  it('ignores a fixed echo whose TCPA is infinite', () => {
    expect(classifyDanger(0.1, Infinity, 0.5, 12)).toBe('safe');
  });
});

describe('isInSector', () => {
  it('handles a sector that wraps through the bow', () => {
    expect(isInSector(0, 315, 45)).toBe(true);
    expect(isInSector(340, 315, 45)).toBe(true);
    expect(isInSector(180, 315, 45)).toBe(false);
  });

  it('handles an ordinary sector', () => {
    expect(isInSector(90, 45, 135)).toBe(true);
    expect(isInSector(200, 45, 135)).toBe(false);
  });

  it('treats a zero-width sector as all round', () => {
    expect(isInSector(217, 90, 90)).toBe(true);
  });
});

describe('isInGuardZone', () => {
  const zone: GuardZone = {
    enabled: true,
    innerNm: 0.5,
    outerNm: 2.5,
    startRelBearing: 315,
    endRelBearing: 45,
  };

  it('catches a target inside the annulus and the sector', () => {
    expect(isInGuardZone(1.5, 10, zone)).toBe(true);
  });

  it('ignores one that is too close, too far, or off to the beam', () => {
    expect(isInGuardZone(0.2, 10, zone)).toBe(false);
    expect(isInGuardZone(4, 10, zone)).toBe(false);
    expect(isInGuardZone(1.5, 120, zone)).toBe(false);
  });

  it('reports nothing when the zone is switched off', () => {
    expect(isInGuardZone(1.5, 10, { ...zone, enabled: false })).toBe(false);
  });
});

describe('hasSteadyBearing', () => {
  const own = { x: 0, y: 0 };

  it('flags a target closing on a constant bearing', () => {
    const trail = [5, 4.5, 4, 3.5, 3, 2.5].map((r, i) => ({ x: r, y: r, t: i * 1000 }));
    expect(hasSteadyBearing(trail, own)).toBe(true);
  });

  it('ignores a target that is closing but drawing across', () => {
    const trail = [
      { x: 0.5, y: 5, t: 0 },
      { x: 1.2, y: 4.5, t: 1000 },
      { x: 2, y: 4, t: 2000 },
      { x: 2.8, y: 3.4, t: 3000 },
      { x: 3.4, y: 2.8, t: 4000 },
      { x: 3.9, y: 2.2, t: 5000 },
    ];
    expect(hasSteadyBearing(trail, own)).toBe(false);
  });

  it('ignores a target that is opening', () => {
    const trail = [2, 2.5, 3, 3.5, 4, 4.5].map((r, i) => ({ x: r, y: r, t: i * 1000 }));
    expect(hasSteadyBearing(trail, own)).toBe(false);
  });

  it('needs enough history to judge', () => {
    expect(hasSteadyBearing([{ x: 1, y: 1, t: 0 }], own)).toBe(false);
  });
});
