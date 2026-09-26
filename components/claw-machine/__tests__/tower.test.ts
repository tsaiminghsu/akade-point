import { beforeAll, describe, expect, it } from 'vitest';
import {
  BOX, CHUTE, CHUTE_LIMITS, GANTRY_RANGE, chuteFrom, createSim, drainEvents, fieldTopUnder, initPhysics, insertCoin,
  pinnedGantry, pressDrop, prizesLeft, prongGeometry, setChute, setField, setTowerConfig, stepSim, type ClawSim,
  type SimEvent,
} from '../clawSim';
import type { ClawType } from '../claws';
import { sanitizeRig } from '../fleet';
import { defaultSettings, type ClawSettings } from '../settings';
import {
  DEFAULT_CELL, DEFAULT_TOWER, DIE_FACES, TOWER, TOWER_COUNT, boxCells, boxParts, boxRest, diceWin, faceUp,
  faceUpRotation, platformRest, sanitizeTower, siteOf, towerChance, towerRimUnder, towerSites, winChance,
  type CellConfig, type TowerConfig, type TowerSetup, type TowerSite,
} from '../tower';

const DT = 1 / 60;

beforeAll(() => initPhysics());

/** A setup with these towers (the rest default), e.g. `setupOf({ double: true, cells: [a, b] })`. */
function setupOf(...towers: { double?: boolean; cells?: CellConfig[] }[]): Partial<TowerConfig> {
  return {
    count: towers.length,
    towers: towers.map((t) => ({
      double: t.double ?? false,
      cells: [t.cells?.[0] ?? DEFAULT_CELL, t.cells?.[1] ?? DEFAULT_CELL],
    }) as TowerSetup),
  };
}

function towerSim(overrides: Partial<ClawSettings> = {}, claw: ClawType = 'magnet', tower: Partial<TowerConfig> = {}, seed = 1) {
  return createSim(
    { ...defaultSettings(), guaranteeN: 0, playTime: 60, dropLine: 6, ...overrides },
    { seed, prizeCount: 0, claw, field: 'tower', tower },
  );
}

/** Coin in, steer the claw over a tower's shaft (the first by default), let the swing die and drop; then play the round out. */
function playTower(s: ClawSim, untilResult = true, site: TowerSite = s.towers[0].site) {
  const events: SimEvent[] = [];
  const step = (joy = { x: 0, z: 0 }) => { stepSim(s, DT, joy); events.push(...drainEvents(s)); };
  insertCoin(s);
  for (let t = 0; t < 1 && s.phase !== 'moving'; t += DT) step();
  for (let t = 0; t < 30; t += DT) {
    const c = s.claw;
    if (Math.abs(c.x - site.x) < 0.003 && Math.abs(c.z - site.z) < 0.003 && Math.hypot(c.vx, c.vz) < 0.01
      && Math.hypot(c.swingX, c.swingZ) < 0.002) break;
    step({ x: Math.max(-1, Math.min(1, (site.x - c.x) * 30)), z: Math.max(-1, Math.min(1, (site.z - c.z) * 30)) });
  }
  pressDrop(s);
  for (let t = 0; t < 40; t += DT) {
    step();
    if (s.phase === 'idle' && (!untilResult || !s.towers.some((w) => w.pending))) break;
  }
  // Let a dispensed prize finish falling down the chute.
  for (let t = 0; t < 1; t += DT) step();
  return events;
}

/** Collar footprints overlap (or come closer than `gap`)? */
function overlaps(a: TowerSite, b: TowerSite, gap = 0) {
  return Math.abs(a.x - b.x) < a.collar.x + b.collar.x + gap - 1e-9 && Math.abs(a.z - b.z) < a.collar.z + b.collar.z + gap - 1e-9;
}

describe('大怒神 (drop tower): rules and shape', () => {
  it('reads the face on top of a die however it was turned', () => {
    for (const points of DIE_FACES) {
      for (const yaw of [0, 0.7, -2.1, Math.PI]) expect(faceUp(faceUpRotation(points, yaw))).toBe(points);
    }
  });

  it('knows its rules and how likely each is; a 雙格 pays on either cell', () => {
    expect(diceWin({ dice: 3, rule: 'red', sum: 0 }, [1, 4, 4])).toBe(true);
    expect(diceWin({ dice: 3, rule: 'red', sum: 0 }, [1, 4, 5])).toBe(false);
    expect(diceWin({ dice: 3, rule: 'same', sum: 0 }, [6, 6, 6])).toBe(true);
    expect(diceWin({ dice: 3, rule: 'same', sum: 0 }, [6, 6, 5])).toBe(false);
    expect(diceWin({ dice: 2, rule: 'sum', sum: 11 }, [5, 6])).toBe(true);
    expect(diceWin({ dice: 2, rule: 'sum', sum: 11 }, [5, 5])).toBe(false);
    expect(winChance({ dice: 3, rule: 'red', sum: 0 })).toBeCloseTo(1 / 27, 9);
    expect(winChance({ dice: 2, rule: 'same', sum: 0 })).toBeCloseTo(1 / 6, 9);
    expect(winChance({ dice: 2, rule: 'sum', sum: 12 })).toBeCloseTo(1 / 36, 9);
    expect(winChance({ dice: 1, rule: 'same', sum: 0 })).toBe(1);
    const red1: CellConfig = { dice: 1, rule: 'red', sum: 1 };
    expect(towerChance({ double: false, cells: [red1, DEFAULT_CELL] })).toBeCloseTo(1 / 3, 9);
    expect(towerChance({ double: true, cells: [red1, red1] })).toBeCloseTo(5 / 9, 9);
  });

  it('sanitizes a stored setup, and takes one saved before 座數 and 雙格 as a single 單格 tower', () => {
    expect(sanitizeTower(null)).toEqual(DEFAULT_TOWER);
    expect(sanitizeRig({}).tower).toEqual(DEFAULT_TOWER);
    const old = sanitizeTower({ dice: 4, rule: 'same', spring: 42 });
    expect(old.count).toBe(1);
    expect(old.spring).toBe(10);
    expect(old.towers[0]).toEqual({ double: false, cells: [{ dice: 4, rule: 'same', sum: 14 }, DEFAULT_CELL] });
    expect(sanitizeRig({ field: 'tower', tower: { dice: 2, rule: 'sum', sum: 1 } }).tower.towers[0].cells[0])
      .toEqual({ dice: 2, rule: 'sum', sum: 2 });
    const odd = sanitizeTower({
      count: 9, spring: 0,
      towers: [{ double: true, cells: [{ dice: 9, rule: 'odd', sum: 99 }, { dice: 2, rule: 'sum', sum: 1 }] }, 'x'],
    });
    expect(odd.count).toBe(TOWER_COUNT.max);
    expect(odd.spring).toBe(1);
    expect(odd.towers).toHaveLength(TOWER_COUNT.max);
    expect(odd.towers[0]).toEqual({ double: true, cells: [{ dice: 5, rule: 'red', sum: 30 }, { dice: 2, rule: 'sum', sum: 2 }] });
    expect(odd.towers[1]).toEqual(DEFAULT_TOWER.towers[1]);
  });

  it('stands the towers in a row across the middle, or two rows when three 雙格 don’t fit', () => {
    const one = towerSites(DEFAULT_TOWER, BOX, CHUTE);
    expect(one).toHaveLength(1);
    expect(one[0].x).toBeCloseTo(0, 9);
    const mixed = towerSites(sanitizeTower(setupOf({}, { double: true }, {})), BOX, CHUTE);
    expect(mixed.map((s) => s.kind)).toEqual(['single', 'double', 'single']);
    expect(new Set(mixed.map((s) => s.z)).size).toBe(1);
    expect(mixed[0].x).toBeLessThan(mixed[1].x);
    expect(mixed[1].x).toBeLessThan(mixed[2].x);
    const big = towerSites(sanitizeTower(setupOf({ double: true }, { double: true }, { double: true })), BOX, CHUTE);
    expect(big[0].z).toBe(big[1].z);
    expect(big[2].z).toBeGreaterThan(big[0].z); // the third to the front
    expect(big[2].x - big[2].collar.x).toBeGreaterThan(CHUTE.maxX); // right of the chute
  });

  it('whatever the setup and chute, the towers stand apart, inside the glass, off the hole, within the gantry’s reach', () => {
    const chutes = [CHUTE, chuteFrom({ width: CHUTE_LIMITS.width.max, depth: CHUTE_LIMITS.depth.max, wallH: 0.15 })];
    for (const chute of chutes) {
      for (let count = 1; count <= TOWER_COUNT.max; count++) {
        for (let mask = 0; mask < 1 << count; mask++) {
          const cfg = sanitizeTower(setupOf(...Array.from({ length: count }, (_, i) => ({ double: (mask >> i & 1) === 1 }))));
          const sites = towerSites(cfg, BOX, chute);
          expect(sites).toHaveLength(count);
          for (const s of sites) {
            expect(s.x - s.collar.x).toBeGreaterThanOrEqual(BOX.minX + 0.01);
            expect(s.x + s.collar.x).toBeLessThanOrEqual(BOX.maxX - 0.01);
            expect(s.z - s.collar.z).toBeGreaterThanOrEqual(BOX.minZ + 0.01);
            expect(s.z + s.collar.z).toBeLessThanOrEqual(BOX.maxZ - 0.01);
            const offHole = s.x - s.collar.x >= chute.maxX || s.z + s.collar.z <= chute.minZ;
            expect(offHole).toBe(true);
            expect(Math.abs(s.x)).toBeLessThanOrEqual(GANTRY_RANGE.maxX);
            expect(s.z).toBeGreaterThanOrEqual(GANTRY_RANGE.minZ);
            expect(s.z).toBeLessThanOrEqual(GANTRY_RANGE.maxZ);
            for (const o of sites) if (o !== s) expect(overlaps(s, o, 0.005)).toBe(false);
          }
        }
      }
    }
  });

  it('a 雙格 box is split down the middle into two cells, each wide enough for its dice', () => {
    const single = siteOf(0, 0, 0, 'single'), double = siteOf(0, 0, 0, 'double');
    expect(boxParts(single)).toHaveLength(6);
    expect(boxParts(double)).toHaveLength(7);
    expect(boxCells(single)).toHaveLength(1);
    const [left, right] = boxCells(double);
    expect(left.x).toBeCloseTo(-right.x, 9);
    // Five dice fit in a cell, four in the corners and one in the middle, clear of each other
    // even turned the most they're set down turned (0.3 rad).
    const reach = TOWER.die.half * (Math.cos(0.3) + Math.sin(0.3));
    for (const cell of [boxCells(single)[0], left]) {
      const ox = cell.halfX - TOWER.die.half - 0.006, oz = cell.halfZ - TOWER.die.half - 0.006;
      expect(Math.min(ox, oz)).toBeGreaterThan(reach); // corner to corner
      expect(Math.max(ox, oz)).toBeGreaterThan(2 * reach); // corner to middle
    }
  });

  it('a claw coming down on a tower off the shaft sits on its rim; only a narrow one gets down inside', () => {
    const t = towerSites(DEFAULT_TOWER, BOX, CHUTE)[0];
    expect(towerRimUnder(t, 0.4, 0.2, 0.05)).toBe(0); // clear of it
    expect(towerRimUnder(t, t.x, t.z, 0.036)).toBe(0); // the magnet fits down the shaft
    expect(towerRimUnder(t, t.x, t.z, 0.09)).toBe(TOWER.height); // open arms span the walls
    expect(towerRimUnder(t, t.x, t.z, 0.1)).toBe(TOWER.height + TOWER.collar.h); // and wider ones the collar
    expect(towerRimUnder(t, t.x + t.collar.x - 0.005, t.z, 0.01)).toBe(TOWER.height + TOWER.collar.h);
    expect(fieldTopUnder('tower', t.x, t.z, 0.09, CHUTE, 0, [t])).toBe(TOWER.height);
    expect(fieldTopUnder('flat', t.x, t.z, 0.1, CHUTE, 0, [t])).toBe(0);
  });
});

describe('大怒神 (drop tower): play', () => {
  it('holds only the dice, in the acrylic box on the sprung platform; the stock comes back with another 檯面', () => {
    const s = createSim(defaultSettings(), { seed: 3, prizeCount: 30 });
    setField(s, 'tower');
    expect(prizesLeft(s)).toBe(0);
    expect(s.towers).toHaveLength(1);
    const t = s.towers[0];
    expect(t.dice).toHaveLength(DEFAULT_CELL.dice);
    expect(t.y).toBeCloseTo(platformRest(t.site.size), 3);
    expect(t.boxY).toBeCloseTo(boxRest(t.site.size), 3);
    for (const d of t.dice) expect(d.y).toBeCloseTo(boxRest(t.site.size) + TOWER.box.wall + TOWER.die.half, 2);
    setTowerConfig(s, {
      towers: s.towerConfig.towers.map((w, i) => (i === 0 ? { ...w, cells: [{ ...DEFAULT_CELL, dice: 5 }, w.cells[1]] } : w)),
    });
    expect(s.towers[0].dice).toHaveLength(5);
    setField(s, 'flat');
    expect(s.towers).toHaveLength(0);
    expect(prizesLeft(s)).toBe(30);
  });

  it('sets up as many towers as the operator puts in, 單格 or 雙格, with each cell’s dice', () => {
    const s = towerSim();
    setTowerConfig(s, setupOf({}, { double: true, cells: [{ ...DEFAULT_CELL, dice: 2 }, { ...DEFAULT_CELL, dice: 4 }] }));
    expect(s.towers.map((t) => t.site.kind)).toEqual(['single', 'double']);
    const d = s.towers[1];
    expect(d.dice.filter((x) => x.cell === 0)).toHaveLength(2);
    expect(d.dice.filter((x) => x.cell === 1)).toHaveLength(4);
    for (const x of d.dice) expect(Math.sign(x.x - d.site.x)).toBe(x.cell === 0 ? -1 : 1);
    // Each die is its own body: ids don't clash between towers.
    const ids = s.towers.flatMap((t) => t.dice.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    setTowerConfig(s, { count: 1 });
    expect(s.towers).toHaveLength(1);
    expect(s.towerConfig.towers[1].double).toBe(true); // kept for when it goes back in
  });

  it('the magnet lifts the acrylic box up the shaft and lets go; it falls onto the sprung platform and the dice are read', () => {
    const s = towerSim();
    const events = playTower(s);
    expect(events.some((e) => e.type === 'lift')).toBe(true);
    const drop = events.find((e) => e.type === 'drop');
    expect(drop && drop.type === 'drop' && drop.height).toBeGreaterThan(0.2); // the lid up to the lip at the top
    const dice = events.find((e) => e.type === 'dice');
    expect(dice?.type).toBe('dice');
    if (dice?.type !== 'dice') return;
    expect(dice.tower).toBe(0);
    expect(dice.faces).toHaveLength(1);
    expect(dice.faces[0]).toHaveLength(3);
    expect(dice.win).toBe(diceWin(s.towerConfig.towers[0].cells[0], dice.faces[0]));
    const t = s.towers[0];
    expect(t.result?.faces).toEqual(dice.faces);
    // Back at rest: the box on the platform, the platform on its spring, the dice still in the box.
    expect(t.held).toBe(false);
    expect(t.boxY).toBeCloseTo(boxRest(t.site.size), 2);
    expect(t.y).toBeCloseTo(platformRest(t.site.size), 2);
    for (const d of t.dice) {
      expect(d.y).toBeGreaterThan(t.boxY);
      expect(d.y).toBeLessThan(t.boxY + TOWER.box.h);
      expect(Math.abs(d.x - t.site.x)).toBeLessThan(t.site.size.box.x);
      expect(Math.abs(d.z - t.site.z)).toBeLessThan(t.site.size.box.z);
    }
  });

  it('the magnet has to find the iron disc on the lid: over the bare acrylic by the edge it can’t lift the box', () => {
    const at = towerSites(DEFAULT_TOWER, BOX, CHUTE)[0];
    const lifts = (dx: number) => {
      const s = createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60, dropLine: 6 }, {
        seed: 1, prizeCount: 0, claw: 'magnet', field: 'tower', gantry: pinnedGantry(at.x + dx, at.z + dx),
      });
      insertCoin(s);
      for (let t = 0; t < 1 && s.phase !== 'moving'; t += DT) stepSim(s, DT);
      pressDrop(s);
      const events: SimEvent[] = [];
      for (let t = 0; t < 8 && s.phase !== 'top'; t += DT) { stepSim(s, DT); events.push(...drainEvents(s)); }
      return events.some((e) => e.type === 'lift');
    };
    expect(lifts(0)).toBe(true);
    expect(lifts(0.02)).toBe(true);
    expect(lifts(0.044)).toBe(false); // in a corner of the lid
  });

  it('with several towers the magnet lifts the one it goes down; the others stay put', () => {
    const s = towerSim({}, 'magnet', setupOf({}, {}, {}));
    const [a, b] = s.towers;
    const events = playTower(s, true, b.site);
    const lift = events.find((e) => e.type === 'lift');
    expect(lift?.type === 'lift' && lift.tower).toBe(1);
    const dice = events.find((e) => e.type === 'dice');
    expect(dice?.type === 'dice' && dice.tower).toBe(1);
    expect(a.result).toBeNull();
    expect(a.boxY).toBeCloseTo(boxRest(a.site.size), 3);
  });

  it('a 雙格 lifts at the factory voltages, keeps its dice on their own side, and pays out when either cell wins', () => {
    // The right cell's one die under 豹子 always wins; the left cell's two need a double six.
    const s = towerSim({}, 'magnet', setupOf({
      double: true, cells: [{ dice: 2, rule: 'sum', sum: 12 }, { dice: 1, rule: 'same', sum: 1 }],
    }));
    const events = playTower(s);
    const drop = events.find((e) => e.type === 'drop');
    expect(drop && drop.type === 'drop' && drop.height).toBeGreaterThan(0.2);
    const dice = events.find((e) => e.type === 'dice');
    expect(dice?.type).toBe('dice');
    if (dice?.type !== 'dice') return;
    expect(dice.faces.map((f) => f.length)).toEqual([2, 1]);
    expect(dice.wins[1]).toBe(true);
    expect(dice.win).toBe(true);
    expect(s.stats.wins).toBe(1);
    const t = s.towers[0];
    for (const d of t.dice) expect(Math.sign(d.x - t.site.x)).toBe(d.cell === 0 ? -1 : 1);
  });

  it('a springier 彈簧 throws the box back up higher off the platform', () => {
    const at = towerSites(DEFAULT_TOWER, BOX, CHUTE)[0];
    /** Highest the box's underside gets after it first comes down on the platform. */
    const rebound = (spring: number) => {
      const s = createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60, dropLine: 6 }, {
        seed: 1, prizeCount: 0, claw: 'magnet', field: 'tower', gantry: pinnedGantry(at.x, at.z), tower: { spring },
      });
      const t = s.towers[0];
      insertCoin(s);
      for (let x = 0; x < 1 && s.phase !== 'moving'; x += DT) stepSim(s, DT);
      pressDrop(s);
      let dropped = false, landed = false, best = 0;
      for (let x = 0; x < 20 && !(landed && t.boxVy < 0 && best > 0); x += 1 / 240) {
        stepSim(s, 1 / 240);
        for (const e of drainEvents(s)) if (e.type === 'drop') dropped = true;
        if (dropped && !landed && t.boxVy > 0) landed = true;
        if (landed) best = Math.max(best, t.boxY - boxRest(t.site.size));
      }
      return best;
    };
    const dead = rebound(1), factory = rebound(5), lively = rebound(10);
    expect(factory).toBeGreaterThan(dead);
    expect(lively).toBeGreaterThan(factory + 0.005);
  });

  it('the drop throws the dice about: different throws come up different', () => {
    const results = [1, 2, 3, 4].map((seed) => {
      const s = towerSim({}, 'magnet', {}, seed);
      const dice = playTower(s).find((e) => e.type === 'dice');
      return dice?.type === 'dice' ? dice.faces.flat().join('') : '';
    });
    expect(results.every((r) => r.length === 3)).toBe(true);
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it('a weak 中電壓 lets go at 中壓距離頂點, so the box falls from lower down', () => {
    const height = (overrides: Partial<ClawSettings>) => {
      const drop = playTower(towerSim(overrides), false).find((e) => e.type === 'drop');
      return drop?.type === 'drop' ? drop.height : 0;
    };
    const full = height({});
    const early = height({ midPower: 12, midPoint: 20 });
    expect(early).toBeGreaterThan(0.03);
    expect(early).toBeLessThan(full - 0.1);
  });

  it('an ordinary claw is too wide for the shaft: it sits on the rim and lifts nothing', () => {
    const s = towerSim({}, 'standard');
    const events = playTower(s, false);
    expect(events.some((e) => e.type === 'lift' || e.type === 'drop' || e.type === 'dice')).toBe(false);
    expect(s.towers[0].y).toBeCloseTo(platformRest(s.towers[0].site.size), 2);
  });

  it('a winning throw pays out a stocked prize through the chute', () => {
    // One die under 豹子 always wins.
    const s = towerSim({}, 'magnet', setupOf({ cells: [{ dice: 1, rule: 'same', sum: 1 }] }));
    const events = playTower(s);
    const dice = events.find((e) => e.type === 'dice');
    expect(dice?.type === 'dice' && dice.win).toBe(true);
    const win = events.find((e) => e.type === 'win');
    expect(win?.type === 'win' && s.stock.categories.length > 0).toBe(true);
    expect(s.stats.wins).toBe(1);
  });

  it('a 保夾 round pays out on any real drop, whatever the dice say', () => {
    const s = towerSim({ guaranteeN: 1 }, 'magnet', setupOf({ cells: [{ dice: 2, rule: 'sum', sum: 12 }] }));
    const events = playTower(s);
    const dice = events.find((e) => e.type === 'dice');
    expect(dice?.type).toBe('dice');
    if (dice?.type !== 'dice') return;
    expect(dice.win).toBe(true);
    expect(dice.guaranteed).toBe(!diceWin(s.towerConfig.towers[0].cells[0], dice.faces[0]));
    expect(s.stats.wins).toBe(1);
  });

  it('moving the chute keeps the towers clear of it', () => {
    const s = towerSim({}, 'magnet', setupOf({ double: true }, { double: true }, { double: true }));
    setChute(s, { width: CHUTE_LIMITS.width.max, depth: CHUTE_LIMITS.depth.max, wallH: 0.1 });
    const front = s.towers[2].site;
    expect(front.x - front.collar.x).toBeGreaterThan(s.chute.maxX);
  });

  it('down the shaft the claw stays off the walls', () => {
    const s = towerSim();
    const T = s.towers[0].site;
    insertCoin(s);
    for (let t = 0; t < 1 && s.phase !== 'moving'; t += DT) stepSim(s, DT);
    // Come in fast and drop at once, still swinging.
    for (let t = 0; t < 30 && Math.abs(s.claw.x - T.x) > 0.01; t += DT) {
      stepSim(s, DT, { x: Math.sign(T.x - s.claw.x), z: Math.max(-1, Math.min(1, (T.z - s.claw.z) * 30)) });
    }
    pressDrop(s);
    const lim = T.size.inner.x - s.clawSpec.reachOpen + 1e-6;
    for (let t = 0; t < 4 && s.phase === 'dropping'; t += DT) {
      stepSim(s, DT);
      const c = s.claw;
      const inside = c.y - prongGeometry(c.open, s.clawSpec).dy < TOWER.height - 0.01
        && Math.max(Math.abs(c.hx - T.x), Math.abs(c.hz - T.z)) < T.size.inner.x;
      if (inside) {
        expect(Math.abs(c.hx - T.x)).toBeLessThanOrEqual(lim);
        expect(Math.abs(c.hz - T.z)).toBeLessThanOrEqual(lim);
      }
    }
  });
});
