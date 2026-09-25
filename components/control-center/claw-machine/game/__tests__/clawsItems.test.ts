import { beforeAll, describe, expect, it } from 'vitest';
import {
  CLAW_TOP, clawClearance, createSim, drainEvents, floorHubY, gripMargin, inChute, initPhysics, insertCoin, jogArms,
  maxPenetration, pressDrop, prizesLeft, prizesResting, prongGeometry, prongTips, restock, setClaw, setPrizeCount,
  settle, spawnPrize, stepSim, topUp,
  type ClawSim, type Prize, type SimEvent,
} from '../clawSim';
import {
  CLAW_BENDS, CLAW_SIZES, CLAW_SPECS, CLAW_TYPES, DEFAULT_FIT, armProfile, buildClawSpec, sanitizeFit, spanCm,
  spanEstimated, type ClawFit, type ClawType,
} from '../claws';
import { DEFAULT_STOCK, ITEM_CATEGORIES, ITEMS, STOCK_COUNT, sanitizeStock, type ItemCategory } from '../items';
import { defaultSettings, type ClawSettings } from '../settings';

const DT = 1 / 60;

beforeAll(() => initPhysics());

function sim(overrides: Partial<ClawSettings> = {}, claw: ClawType = 'standard', clawFit: Partial<ClawFit> = {}) {
  return createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60, ...overrides }, { seed: 1, prizeCount: 0, claw, clawFit });
}

function add(s: ClawSim, props: Partial<Prize> & Pick<Prize, 'x' | 'z'>): Prize {
  return spawnPrize(s, props);
}

/**
 * The claw has stopped swinging. Checked on the angle, not the offset: a small
 * residual angle at the top becomes a centimetre off at the bottom of the drop.
 */
const swingSettled = (s: ClawSim) =>
  Math.hypot(s.claw.swingX, s.claw.swingZ) < 0.002 && Math.hypot(s.claw.swingVX, s.claw.swingVZ) < 0.01;

function runUntil(s: ClawSim, pred: () => boolean, maxSeconds = 30, joy = () => ({ x: 0, z: 0 })) {
  const events: SimEvent[] = [];
  for (let t = 0; t < maxSeconds; t += DT) {
    stepSim(s, DT, joy());
    events.push(...drainEvents(s));
    if (pred()) return events;
  }
  throw new Error(`condition not reached in ${maxSeconds}s (phase=${s.phase})`);
}

/** Coin in, steer over (x, z), wait for the swing to die, drop; returns events up to lift-off. */
function dropOn(s: ClawSim, x: number, z: number) {
  insertCoin(s);
  const events = runUntil(s, () => s.phase === 'moving', 1);
  runUntil(s, () => Math.abs(s.claw.x - x) < 0.003 && Math.abs(s.claw.z - z) < 0.003
    && Math.hypot(s.claw.vx, s.claw.vz) < 0.01 && swingSettled(s),
  40, () => ({ x: Math.max(-1, Math.min(1, (x - s.claw.x) * 30)), z: Math.max(-1, Math.min(1, (z - s.claw.z) * 30)) }));
  pressDrop(s);
  events.push(...runUntil(s, () => s.phase === 'lifting'));
  return events;
}

describe('claw heads', () => {
  it('every claw opens wider than it closes, keeps its tips above the felt, and has its own prong count', () => {
    for (const type of CLAW_TYPES) {
      const spec = CLAW_SPECS[type];
      expect(prongGeometry(1, spec).reach).toBeGreaterThan(prongGeometry(0, spec).reach);
      expect(floorHubY(spec) - prongGeometry(1, spec).dy).toBeGreaterThan(0);
      const s = sim({}, type);
      expect(prongTips(s)).toHaveLength(spec.prongs);
    }
  });

  it('can be swapped at any time', () => {
    const s = sim();
    setClaw(s, 'four');
    expect(prongTips(s)).toHaveLength(4);
    setClaw(s, 'two');
    expect(prongTips(s)).toHaveLength(2);
  });

  it('a 6號 巨無霸 claw gets around a box too wide for the 4號', () => {
    // Long side front-to-back: a three-prong claw's rear prongs (±30°) would
    // otherwise come down exactly on the corners of a side-to-side box.
    const wide: [number, number, number] = [0.05, 0.03, 0.095];
    const std = sim({}, 'standard');
    add(std, { x: 0.1, z: 0, shape: 'box', halfX: wide[0], halfY: wide[1], halfZ: wide[2] });
    expect(dropOn(std, 0.1, 0).some((e) => e.type === 'grab')).toBe(false);

    const jumbo = sim({}, 'standard', { size: '6', bend: 'straight' });
    add(jumbo, { x: 0.1, z: 0, shape: 'box', halfX: wide[0], halfY: wide[1], halfZ: wide[2] });
    expect(dropOn(jumbo, 0.1, 0).some((e) => e.type === 'grab')).toBe(true);
  });

  it('the two-prong box claw grips a box harder, and a ball worse, than the standard claw', () => {
    /** Grab it, lift it clear, and report whether it is still in the claw and by what margin. */
    const outcome = (type: ClawType, shape: 'box' | 'sphere') => {
      const s = sim({}, type);
      if (shape === 'box') add(s, { x: 0.1, z: 0, shape: 'box', halfX: 0.05, halfY: 0.07, halfZ: 0.04 });
      else add(s, { x: 0.1, z: 0, r: 0.065, grip: 0.6, kind: 'ball', category: 'ball' });
      dropOn(s, 0.1, 0);
      runUntil(s, () => s.claw.y > 0.35 || s.heldId === null, 5);
      return { held: s.heldId !== null, margin: s.heldId !== null ? gripMargin(s) : -Infinity };
    };
    const twoBox = outcome('two', 'box');
    const stdBox = outcome('standard', 'box');
    expect(twoBox.held).toBe(true);
    expect(twoBox.margin).toBeGreaterThan(Math.max(stdBox.margin, 0) + 0.15);
    const stdBall = outcome('standard', 'sphere');
    const twoBall = outcome('two', 'sphere');
    expect(stdBall.held).toBe(true);
    expect(twoBall.margin).toBeLessThan(stdBall.margin - 0.1);
  });

  it('the 金剛K爪 lifts a heavy plush that the standard claw drops at the same power', () => {
    const lift = (type: ClawType) => {
      const s = sim({ strongPower: 25, midPower: 25, weakPower: 25 }, type);
      add(s, { x: 0.1, z: 0, r: 0.08, weight: 1 });
      const events = dropOn(s, 0.1, 0);
      runUntil(s, () => s.claw.y > 0.4 || s.heldId === null, 5);
      events.push(...drainEvents(s));
      return { held: s.heldId !== null, margin: gripMargin(s), grabbed: events.some((e) => e.type === 'grab') };
    };
    const kk = lift('kingkong');
    expect(kk.held).toBe(true);
    expect(kk.margin).toBeGreaterThan(0.05);
    const std = lift('standard');
    expect(std.grabbed).toBe(true);
    expect(std.held).toBe(false);
  });

  it('with strong power the standard claw carries a centred figure box to the chute', () => {
    const s = sim({ midPower: 40, weakPower: 40 });
    add(s, { x: 0.1, z: 0, shape: 'box', halfX: 0.05, halfY: 0.07, halfZ: 0.04, weight: 0.6 });
    dropOn(s, 0.1, 0);
    runUntil(s, () => s.phase === 'idle');
    runUntil(s, () => s.stats.wins > 0, 3);
    expect(s.stats.wins).toBe(1);
  });
});

describe('claw sizes (號數) and 爪位', () => {
  it('the default 4號彎爪 standard claw is the geometry the grip model was calibrated on', () => {
    const s = buildClawSpec('standard', DEFAULT_FIT);
    expect(s.reachOpen).toBeCloseTo(0.1, 6);
    expect(s.reachClosed).toBeCloseTo(0.028, 6);
    expect(s.prongLen).toBeCloseTo(0.13, 6);
    expect(s.gripSphere).toBe(1);
    expect(s.gripBox).toBeCloseTo(0.8, 6);
  });

  it('opens to the listed span, 1號 (11 cm) up to 6號 巨無霸 (30 cm), in both 直爪 and 彎爪', () => {
    for (const row of CLAW_SIZES) {
      for (const bend of CLAW_BENDS) {
        const s = buildClawSpec('standard', { size: row.size, bend });
        expect(s.reachOpen * 200).toBeCloseTo(spanCm(row.size, bend), 6);
        // Every size can still physically open that far on its arms, and its tips clear the felt.
        expect((s.reachOpen - s.pivotR) / s.prongLen).toBeLessThan(0.9);
        expect(floorHubY(s) - prongGeometry(1, s).dy).toBeGreaterThan(0);
      }
    }
    expect(spanCm('1', 'straight')).toBe(11);
    expect(spanCm('6', 'straight')).toBe(30);
    expect(spanCm('6', 'curved')).toBe(28);
    // Curved tips hook inward: a curved claw of the same number spans less.
    for (const row of CLAW_SIZES) expect(row.curved).toBeLessThan(row.straight);
  });

  it('every size comes straight and curved; the bend the listing lacks is estimated and flagged', () => {
    // Listed both ways: nothing estimated.
    expect(spanEstimated('4', 'straight')).toBe(false);
    expect(spanEstimated('4', 'curved')).toBe(false);
    // 1號 is listed straight only, 4號半 curved only.
    expect(spanEstimated('1', 'curved')).toBe(true);
    expect(spanCm('1', 'curved')).toBe(10);
    expect(spanEstimated('4.5', 'straight')).toBe(true);
    expect(spanCm('4.5', 'straight')).toBe(24);
    const s = buildClawSpec('standard', { size: '4.5', bend: 'straight' });
    expect(s.bend).toBe('straight');
    expect(s.label).toBe('標準三爪 4號半直爪');
  });

  it('a straight claw grabs a plush and a box like a curved one', () => {
    for (const bend of CLAW_BENDS) {
      const plush = sim({}, 'standard', { bend });
      add(plush, { x: 0.1, z: 0, r: 0.07 });
      expect(dropOn(plush, 0.1, 0).some((e) => e.type === 'grab')).toBe(true);
      const box = sim({}, 'standard', { bend });
      add(box, { x: 0.1, z: 0, shape: 'box', halfX: 0.05, halfY: 0.07, halfZ: 0.04 });
      expect(dropOn(box, 0.1, 0).some((e) => e.type === 'grab')).toBe(true);
    }
  });

  it('a curved arm hooks its tip inward; a straight one hardly turns', () => {
    const tipX = (bend: 'straight' | 'curved') => armProfile({ prongLen: 0.13, bend })[4][0];
    expect(tipX('curved')).toBeLessThan(0);
    expect(tipX('straight')).toBeGreaterThan(tipX('curved'));
  });

  it('爪位 sets how far the arms open, between closed and the full span', () => {
    const full = buildClawSpec('standard', { size: '4', bend: 'curved', openPct: 100 });
    const half = buildClawSpec('standard', { size: '4', bend: 'curved', openPct: 50 });
    expect(half.reachOpen).toBeCloseTo((full.reachOpen + full.reachClosed) / 2, 6);
    expect(half.reachClosed).toBe(full.reachClosed);
  });

  it('a 1號 claw is too small to get around a plush but fits a capsule', () => {
    const tiny = buildClawSpec('standard', { size: '1' });
    expect(clawClearance(tiny, { shape: 'sphere', r: 0.08, halfX: 0.08, halfZ: 0.08 })).toBeLessThan(0);
    expect(clawClearance(tiny, { shape: 'sphere', r: 0.05, halfX: 0.05, halfZ: 0.05 })).toBeGreaterThan(0);
    const s = sim({}, 'standard', { size: '1' });
    add(s, { x: 0.1, z: 0, r: 0.08 });
    expect(dropOn(s, 0.1, 0).some((e) => e.type === 'grab')).toBe(false);
  });

  it('closing 爪位 right down stops the claw getting around a plush it would otherwise take', () => {
    const open = sim({}, 'standard', { openPct: 100 });
    add(open, { x: 0.1, z: 0, r: 0.07 });
    expect(dropOn(open, 0.1, 0).some((e) => e.type === 'grab')).toBe(true);
    const narrow = sim({}, 'standard', { openPct: 50 });
    add(narrow, { x: 0.1, z: 0, r: 0.07 });
    expect(dropOn(narrow, 0.1, 0).some((e) => e.type === 'grab')).toBe(false);
  });

  it('sanitizes a stored fit: unknown sizes, bends a size is not made in, 爪位 out of range', () => {
    expect(sanitizeFit(null)).toEqual(DEFAULT_FIT);
    expect(sanitizeFit({ size: '9', bend: 'curved', openPct: 70 })).toEqual({ ...DEFAULT_FIT, openPct: 70 });
    expect(sanitizeFit({ size: '1', bend: 'curved' }).bend).toBe('curved');
    expect(sanitizeFit({ size: '4.5', bend: 'straight' }).bend).toBe('straight');
    expect(sanitizeFit({ size: '4', bend: 'bent' }).bend).toBe(DEFAULT_FIT.bend);
    expect(sanitizeFit({ openPct: 12 }).openPct).toBe(50);
    expect(sanitizeFit({ openPct: 83 }).openPct).toBe(85);
  });

  it('the service-mode claw test opens and shuts the arms while the game is paused', () => {
    const s = sim();
    for (let t = 0; t < 1; t += DT) jogArms(s, true, DT);
    expect(s.claw.open).toBe(1);
    for (let t = 0; t < 1; t += DT) jogArms(s, false, DT);
    expect(s.claw.open).toBe(0);
  });

  it('refitting a claw size takes effect at once', () => {
    const s = sim();
    setClaw(s, 'standard', { size: '6', bend: 'straight' });
    expect(s.clawSpec.reachOpen * 200).toBeCloseTo(30, 6);
    expect(s.clawSpec.label).toBe('標準三爪 6號 巨無霸直爪');
  });
});

describe('boxed prizes', () => {
  it('a box dropped on a box comes to rest stacked on top of it', () => {
    const s = sim();
    const bottom = add(s, { x: 0.1, z: 0, shape: 'box', halfX: 0.06, halfY: 0.05, halfZ: 0.05 });
    const top = add(s, { x: 0.11, z: 0.005, y: 0.4, shape: 'box', halfX: 0.05, halfY: 0.04, halfZ: 0.04 });
    settle(s, 2);
    expect(bottom.y).toBeCloseTo(bottom.halfY, 2);
    expect(top.y).toBeCloseTo(bottom.halfY * 2 + top.halfY, 2);
  });

  it('a ball dropped on a box rests on its lid', () => {
    const s = sim();
    const box = add(s, { x: 0.1, z: 0, shape: 'box', halfX: 0.07, halfY: 0.03, halfZ: 0.05 });
    const ball = add(s, { x: 0.1, z: 0, y: 0.4, r: 0.05 });
    settle(s, 2);
    expect(ball.y).toBeCloseTo(box.halfY * 2 + ball.r, 2);
  });

  it('the claw lands on a box lid rather than passing into it', () => {
    const s = sim();
    const box = add(s, { x: 0.1, z: 0, shape: 'box', halfX: 0.05, halfY: 0.07, halfZ: 0.04 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    runUntil(s, () => Math.abs(s.claw.x - 0.1) < 0.003 && Math.abs(s.claw.z) < 0.003
      && swingSettled(s), 40,
    () => ({ x: Math.max(-1, Math.min(1, (0.1 - s.claw.x) * 30)), z: Math.max(-1, Math.min(1, -s.claw.z * 30)) }));
    pressDrop(s);
    runUntil(s, () => s.phase === 'closing');
    expect(s.claw.y).toBeCloseTo(box.y + box.halfY, 2);
  });
});

describe('real physics: no invisible supports', () => {
  it('a box hanging mostly off the edge of another box topples off instead of floating', () => {
    const s = sim();
    add(s, { x: 0.1, z: 0, shape: 'box', halfX: 0.05, halfY: 0.05, halfZ: 0.05 });
    // Only 1.5 cm of a 10 cm box rests on the lower box; its centre of mass is past the edge.
    const top = add(s, { x: 0.185, y: 0.121, z: 0, shape: 'box', halfX: 0.05, halfY: 0.02, halfZ: 0.05 });
    settle(s, 3);
    expect(top.y).toBeLessThan(0.08); // came down off the ledge
    expect(prizesResting(s)).toBe(true);
  });

  it('a plush dropped onto two others nestles into the gap between them', () => {
    const s = sim();
    add(s, { x: 0, z: 0, r: 0.06 });
    add(s, { x: 0.125, z: 0, r: 0.06 });
    const drop = add(s, { x: 0.0625, y: 0.35, z: 0, r: 0.06 });
    settle(s, 3);
    // Perched on top of one would be 0.18; wedged in the notch is ~0.16 or lower.
    expect(drop.y).toBeLessThan(0.17);
    expect(maxPenetration(s)).toBeLessThan(0.006);
  });

  it('a box set on top of a round plush slides off rather than balancing on it', () => {
    const s = sim();
    add(s, { x: 0.1, z: 0, r: 0.07 });
    const box = add(s, { x: 0.11, y: 0.14 + 0.03 + 0.002, z: 0, shape: 'box', halfX: 0.06, halfY: 0.03, halfZ: 0.05 });
    settle(s, 3);
    expect(box.y).toBeLessThan(0.14);
  });

  it('boxes tumble: a restocked box pile is not all perfectly upright', () => {
    const s = createSim(defaultSettings(), { seed: 5, prizeCount: 20, categories: ['figure', 'snack'] });
    const tilted = s.prizes.filter((p) => Math.abs(p.qx) > 0.05 || Math.abs(p.qz) > 0.05);
    expect(tilted.length).toBeGreaterThan(0);
    expect(prizesResting(s)).toBe(true);
  });
});

describe('stocking the cabinet', () => {
  const cases: [string, ItemCategory[]][] = [
    ['figure boxes only', ['figure']],
    ['snack boxes only', ['snack']],
    ['everything mixed', [...ITEM_CATEGORIES]],
  ];
  for (const [label, categories] of cases) {
    it(`${label}: loads the chosen items and they settle into a clean pile`, () => {
      const s = createSim(defaultSettings(), { seed: 11, prizeCount: 18, categories });
      expect(s.prizes.length).toBeGreaterThanOrEqual(16);
      for (const p of s.prizes) {
        expect(categories).toContain(p.category);
        expect(p.won).toBe(false);
        expect(inChute(p.x, p.z)).toBe(false);
        expect(p.y).toBeGreaterThanOrEqual(p.extY - 3e-3);
      }
      expect(prizesResting(s)).toBe(true);
      expect(maxPenetration(s)).toBeLessThan(0.008);
      if (categories.length > 1) expect(new Set(s.prizes.map((p) => p.category)).size).toBeGreaterThanOrEqual(4);
    });
  }

  it('every catalogue item has a size for its shape and a positive grip', () => {
    for (const d of ITEMS) {
      if (d.shape === 'sphere') expect(d.r).toBeDefined();
      else expect(d.half).toBeDefined();
      expect(d.grip).toBeGreaterThan(0);
      expect(d.colors.length).toBeGreaterThan(0);
    }
  });

  it('sanitizes a stored stock choice', () => {
    expect(sanitizeStock({ categories: ['ball', 'nope'], count: 999 }))
      .toEqual({ categories: ['ball'], count: STOCK_COUNT.max, random: false, countMin: DEFAULT_STOCK.countMin });
    // Older saves have no random fields; the minimum never exceeds the count.
    expect(sanitizeStock({ categories: [], count: 2 }))
      .toEqual({ categories: ['plush'], count: STOCK_COUNT.min, random: false, countMin: STOCK_COUNT.min });
    expect(sanitizeStock({ categories: ['plush'], count: 30, random: true, countMin: 12 }))
      .toEqual({ categories: ['plush'], count: 30, random: true, countMin: 12 });
    expect(sanitizeStock('junk')).toEqual(DEFAULT_STOCK);
  });

  it('piles plush right up under the raised claw, and says when it is full', () => {
    const s = createSim(defaultSettings(), { seed: 21, prizeCount: STOCK_COUNT.max });
    expect(prizesLeft(s)).toBeGreaterThanOrEqual(75);
    expect(s.full).toBe(true);
    expect(prizesResting(s)).toBe(true);
    expect(maxPenetration(s)).toBeLessThan(0.008);
    const top = Math.max(...s.prizes.map((p) => p.y + p.extY));
    const clawTips = CLAW_TOP - prongGeometry(0, s.clawSpec).dy;
    expect(top).toBeGreaterThan(0.45); // four layers or so
    expect(top).toBeLessThan(clawTips); // the raised claw still clears it
    for (const p of s.prizes) expect(inChute(p.x, p.z)).toBe(false);
  });

  it('small items fill the cabinet with far more pieces', () => {
    const s = createSim(defaultSettings(), { seed: 21, prizeCount: 150, categories: ['capsule'] });
    expect(prizesLeft(s)).toBe(150);
    expect(s.full).toBe(false);
    expect(prizesResting(s)).toBe(true);
  });

  it('random mode loads a different amount within the set range on each restock', () => {
    const s = createSim(defaultSettings(), { seed: 3, stock: { random: true, countMin: 8, count: 20 } });
    const counts = [s.prizes.length];
    for (let i = 0; i < 5; i++) {
      restock(s);
      counts.push(s.prizes.length);
    }
    for (const n of counts) {
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(20);
    }
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it('changing the count applies at once: more are added on top, fewer are taken off the top', () => {
    const s = createSim(defaultSettings(), { seed: 8, prizeCount: 16 });
    const bottom = [...s.prizes].sort((a, b) => a.y - b.y).slice(0, 5).map((p) => p.id);
    setPrizeCount(s, 40, { count: 40 });
    expect(prizesLeft(s)).toBe(40);
    expect(s.stock.count).toBe(40);
    expect(prizesResting(s)).toBe(true);
    const topIds = [...s.prizes].sort((a, b) => (b.y + b.extY) - (a.y + a.extY)).slice(0, 10).map((p) => p.id);
    setPrizeCount(s, 30, { count: 30 });
    expect(prizesLeft(s)).toBe(30);
    // The ten highest went, the bottom of the pile stayed.
    for (const id of topIds) expect(s.prizes.some((p) => p.id === id)).toBe(false);
    for (const id of bottom) expect(s.prizes.some((p) => p.id === id)).toBe(true);
  });

  it('補貨 tops the cabinet back up on top of what is already there', () => {
    const s = createSim(defaultSettings(), { seed: 4, prizeCount: 10 });
    const before = new Map(s.prizes.map((p) => [p.id, { x: p.x, z: p.z }]));
    topUp(s, { count: 24 });
    expect(prizesLeft(s)).toBe(24);
    expect(new Set(s.prizes.map((p) => p.id)).size).toBe(s.prizes.length);
    // The original ten are still in, and weren't thrown around the cabinet.
    for (const [id, pos] of before) {
      const p = s.prizes.find((q) => q.id === id);
      expect(p).toBeDefined();
      if (p && !p.won) expect(Math.hypot(p.x - pos.x, p.z - pos.z)).toBeLessThan(0.12);
    }
    expect(prizesResting(s)).toBe(true);
  });
});
