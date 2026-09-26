import { beforeAll, describe, expect, it } from 'vitest';
import {
  BOX, CHUTE_LIMITS, GANTRY_RANGE, chuteFrom, createSim, drainEvents, initPhysics, insertCoin, pinnedGantry, pressDrop,
  prizesLeft, setField, setShakerConfig, stepSim, type ClawSim, type SimEvent,
} from '../clawSim';
import type { ClawType } from '../claws';
import { sanitizeRig } from '../fleet';
import { defaultSettings, type ClawSettings } from '../settings';
import {
  DEFAULT_SHAKER, SHAKER, SHAKER_DICE, SHAKER_DIE, cordForce, sanitizeShaker, shakerChance, shakerDiceSpots,
  shakerFootprint, shakerRestY, shakerWin, type ShakerConfig,
} from '../shaker';
import { faceUp, isRed } from '../tower';

const DT = 1 / 60;

beforeAll(() => initPhysics());

function shakerSim(
  overrides: Partial<ClawSettings> = {}, shaker: Partial<ShakerConfig> = {}, claw: ClawType = 'magnet', seed = 1, dx = 0,
) {
  return createSim(
    { ...defaultSettings(), guaranteeN: 0, playTime: 60, dropLine: 6, ...overrides },
    { seed, prizeCount: 0, claw, field: 'shaker', shaker, gantry: pinnedGantry(SHAKER.x + dx, SHAKER.z + dx) },
  );
}

/** Coin in, drop straight onto the box (the gantry is pinned over it), and play the round out. */
function playShaker(s: ClawSim, untilResult = true) {
  const events: SimEvent[] = [];
  const step = () => { stepSim(s, DT); events.push(...drainEvents(s)); };
  insertCoin(s);
  for (let t = 0; t < 1 && s.phase !== 'moving'; t += DT) step();
  pressDrop(s);
  for (let t = 0; t < 40; t += DT) {
    step();
    if (s.phase === 'idle' && (!untilResult || !s.shaker?.pending)) break;
  }
  for (let t = 0; t < 1; t += DT) step();
  return events;
}

describe('搖骰子盒 (dice box on bungee cords): rules and shape', () => {
  it('knows its rules', () => {
    const faces = [4, 1, 4, 6, 1];
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'reds', reds: 4 }, faces)).toBe(true);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'reds', reds: 5 }, faces)).toBe(false);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'red' }, faces)).toBe(false);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'red' }, [1, 4, 4])).toBe(true);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'same' }, [5, 5, 5])).toBe(true);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'same' }, [5, 5, 6])).toBe(false);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'sum', sum: 16 }, faces)).toBe(true);
    expect(shakerWin({ ...DEFAULT_SHAKER, rule: 'sum', sum: 17 }, faces)).toBe(false);
  });

  it('works out each rule’s chance exactly', () => {
    expect(shakerChance({ ...DEFAULT_SHAKER, dice: 3, rule: 'red' })).toBeCloseTo(1 / 27, 12);
    expect(shakerChance({ ...DEFAULT_SHAKER, dice: 2, rule: 'same' })).toBeCloseTo(1 / 6, 12);
    // At least 3 reds of 5: C(5,3)·2² + C(5,4)·2 + 1, over 3⁵.
    expect(shakerChance({ ...DEFAULT_SHAKER, dice: 5, rule: 'reds', reds: 3 })).toBeCloseTo(51 / 243, 12);
    // 3 dice totalling 14 or more: 15 + 10 + 6 + 3 + 1 of 216.
    expect(shakerChance({ ...DEFAULT_SHAKER, dice: 3, rule: 'sum', sum: 14 })).toBeCloseTo(35 / 216, 12);
    expect(isRed(1) && isRed(4)).toBe(true);
  });

  it('sanitizes a stored setup to fit its dice', () => {
    expect(sanitizeShaker(null)).toEqual(DEFAULT_SHAKER);
    expect(sanitizeRig({}).shaker).toEqual(DEFAULT_SHAKER);
    expect(sanitizeShaker({ dice: 9, rule: 'line', reds: 9, sum: 99, tension: 0 }))
      .toEqual({ dice: 6, rule: 'reds', reds: 6, sum: 36, tension: 1 });
    expect(sanitizeShaker({ dice: 2, reds: 5, sum: 1 })).toEqual({ ...DEFAULT_SHAKER, dice: 2, reds: 2, sum: 2 });
  });

  it('hangs on its cords where they hold its weight, higher the tighter they are', () => {
    const W = SHAKER.box.mass * 9.81;
    for (const t of [1, 5, 10]) {
      const y = shakerRestY(t);
      expect(cordForce({ x: SHAKER.x, y, z: SHAKER.z }, { x: 0, y: 0, z: 0 }, t).y).toBeCloseTo(W, 2);
      expect(y + SHAKER.box.h).toBeLessThan(SHAKER.frame.height); // just under the post tops
    }
    expect(shakerRestY(10)).toBeGreaterThan(shakerRestY(5));
    expect(shakerRestY(5)).toBeGreaterThan(shakerRestY(1));
  });

  it('is a cube, stands clear of the chute however big it is set, and sits under the gantry’s reach', () => {
    expect(SHAKER.box.h).toBeCloseTo(SHAKER.box.half * 2, 9);
    const f = shakerFootprint();
    const hole = chuteFrom({ width: CHUTE_LIMITS.width.max, depth: CHUTE_LIMITS.depth.max, wallH: 0.15 });
    expect(f.minX > hole.maxX || f.maxZ < hole.minZ).toBe(true);
    expect(f.minX).toBeGreaterThan(BOX.minX);
    expect(f.maxX).toBeLessThan(BOX.maxX);
    expect(f.minZ).toBeGreaterThan(BOX.minZ);
    expect(f.maxZ).toBeLessThan(BOX.maxZ);
    expect(Math.abs(SHAKER.x)).toBeLessThanOrEqual(GANTRY_RANGE.maxX);
    // The dice are set out on the floor clear of each other and the walls.
    const spots = shakerDiceSpots();
    expect(spots).toHaveLength(SHAKER_DICE.max);
    const reach = SHAKER_DIE.half * (Math.cos(0.3) + Math.sin(0.3));
    for (const a of spots) {
      expect(Math.max(Math.abs(a.x), Math.abs(a.z)) + reach).toBeLessThan(SHAKER.box.half - SHAKER.box.wall);
      for (const b of spots) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThan(2 * reach);
    }
  });
});

describe('搖骰子盒 (dice box on bungee cords): play', () => {
  it('holds only its dice, loose in the cube; the stock comes back with another 檯面', () => {
    const s = createSim(defaultSettings(), { seed: 3, prizeCount: 30 });
    setField(s, 'shaker');
    expect(prizesLeft(s)).toBe(0);
    expect(s.shaker!.dice).toHaveLength(DEFAULT_SHAKER.dice);
    expect(s.shaker!.y).toBeCloseTo(shakerRestY(DEFAULT_SHAKER.tension), 6);
    setShakerConfig(s, { dice: 2 });
    expect(s.shaker!.dice).toHaveLength(2);
    setField(s, 'flat');
    expect(s.shaker).toBeNull();
    expect(prizesLeft(s)).toBe(30);
  });

  it('the magnet hauls the box up on the plate until the cords tear it off; it bounces about and the dice are read', () => {
    const s = shakerSim();
    const events = playShaker(s);
    expect(events.some((e) => e.type === 'shakeLift')).toBe(true);
    const drop = events.find((e) => e.type === 'shakeDrop');
    expect(drop?.type === 'shakeDrop' && drop.height).toBeGreaterThan(0.1);
    const read = events.find((e) => e.type === 'shakeDice');
    expect(read?.type).toBe('shakeDice');
    if (read?.type !== 'shakeDice') return;
    expect(read.faces).toHaveLength(DEFAULT_SHAKER.dice);
    expect(read.win).toBe(shakerWin(s.shakerConfig, read.faces));
    expect(read.reds).toBe(read.faces.filter(isRed).length);
    // Back at rest in the frame, every die still in the cube.
    const b = s.shaker!;
    expect(b.held).toBe(false);
    expect(b.y).toBeCloseTo(b.restY, 2);
    expect(Math.hypot(b.x - SHAKER.x, b.z - SHAKER.z)).toBeLessThan(0.005);
    for (const d of b.dice) {
      expect(Math.abs(d.x - b.x)).toBeLessThan(SHAKER.box.half);
      expect(Math.abs(d.z - b.z)).toBeLessThan(SHAKER.box.half);
      expect(d.y).toBeGreaterThan(b.y);
      expect(d.y).toBeLessThan(b.y + SHAKER.box.h);
    }
  });

  it('a weaker 中電壓 or tighter cords tear it off the magnet sooner', () => {
    const haul = (overrides: Partial<ClawSettings>, shaker: Partial<ShakerConfig> = {}) => {
      const drop = playShaker(shakerSim(overrides, shaker), false).find((e) => e.type === 'shakeDrop');
      return drop?.type === 'shakeDrop' ? drop.height : 0;
    };
    const full = haul({});
    expect(haul({ midPower: 12, midPoint: 20 })).toBeLessThan(full - 0.05);
    expect(haul({}, { tension: 10 })).toBeLessThan(full - 0.05);
    expect(haul({}, { tension: 1 })).toBeGreaterThan(full + 0.05);
  });

  it('shakes the dice about: different shakes come up different, and most dice turn over', () => {
    let turned = 0, total = 0;
    const results = [1, 2, 3, 4].map((seed) => {
      const s = shakerSim({}, {}, 'magnet', seed);
      const up = () => s.shaker!.dice.map((d) => faceUp({ x: d.qx, y: d.qy, z: d.qz, w: d.qw }));
      const before = up();
      const read = playShaker(s).find((e) => e.type === 'shakeDice');
      up().forEach((f, i) => { total++; if (f !== before[i]) turned++; });
      return read?.type === 'shakeDice' ? read.faces.join('') : '';
    });
    expect(new Set(results).size).toBe(4);
    expect(turned / total).toBeGreaterThan(0.4);
  });

  it('the magnet has to find the iron plate: over bare acrylic by the edge it gets no grip', () => {
    const lifts = (dx: number) => {
      const s = shakerSim({}, {}, 'magnet', 1, dx);
      insertCoin(s);
      for (let t = 0; t < 1 && s.phase !== 'moving'; t += DT) stepSim(s, DT);
      pressDrop(s);
      const events: SimEvent[] = [];
      for (let t = 0; t < 8 && s.phase !== 'top'; t += DT) { stepSim(s, DT); events.push(...drainEvents(s)); }
      return events.some((e) => e.type === 'shakeLift');
    };
    expect(lifts(0)).toBe(true);
    expect(lifts(0.02)).toBe(true);
    expect(lifts(0.05)).toBe(false);
  });

  it('an ordinary claw just sits on the lid and hauls nothing', () => {
    const s = shakerSim({}, {}, 'standard');
    const events = playShaker(s, false);
    expect(events.some((e) => e.type === 'shakeLift' || e.type === 'shakeDrop')).toBe(false);
    expect(s.shaker!.y).toBeCloseTo(s.shaker!.restY, 2);
  });

  it('a winning shake pays out a stocked prize through the chute, and so does any haul in a 保夾 round', () => {
    // A total of at least the number of dice always wins.
    const s = shakerSim({}, { rule: 'sum', sum: DEFAULT_SHAKER.dice });
    const events = playShaker(s);
    const read = events.find((e) => e.type === 'shakeDice');
    expect(read?.type === 'shakeDice' && read.win).toBe(true);
    expect(events.some((e) => e.type === 'win')).toBe(true);
    expect(s.stats.wins).toBe(1);

    const g = shakerSim({ guaranteeN: 1 }, { rule: 'red' });
    const ge = playShaker(g);
    const gr = ge.find((e) => e.type === 'shakeDice');
    expect(gr?.type === 'shakeDice' && gr.win).toBe(true);
    expect(g.stats.wins).toBe(1);
  });
});
