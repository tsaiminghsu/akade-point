import { beforeAll, describe, expect, it } from 'vitest';
import {
  BED_LIFT, BOX, CHUTE, CRATER, DEFAULT_CHUTE, ROPES, STEP_TIERS, bedHeight, bedRopes, chuteFrom, craterOf, craterRopes, fieldDesc,
  holeBox, holeNets, homeOf, inChute, createSim, drainEvents, fieldHeightAt, fieldTopUnder, initPhysics, insertCoin, pressDrop,
  prizesLeft, prizesResting, prongGeometry, setBedLift, setChute, setField, settle, spawnPrize, stepSim,
  type ClawSim, type FieldType, type Prize, type SimEvent,
} from '../clawSim';
import { sanitizeRig } from '../fleet';
import type { ClawType } from '../claws';
import { defaultSettings, type ClawSettings } from '../settings';

const DT = 1 / 60;

beforeAll(() => initPhysics());

function sim(overrides: Partial<ClawSettings> = {}, claw: ClawType = 'standard', field: FieldType = 'flat') {
  return createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60, ...overrides }, { seed: 1, prizeCount: 0, claw, field });
}

function runUntil(s: ClawSim, pred: () => boolean, maxSeconds = 30, joy = () => ({ x: 0, z: 0 })) {
  const events: SimEvent[] = [];
  for (let t = 0; t < maxSeconds; t += DT) {
    stepSim(s, DT, joy());
    events.push(...drainEvents(s));
    if (pred()) return events;
  }
  throw new Error(`condition not reached in ${maxSeconds}s (phase=${s.phase})`);
}

/** Coin in, steer over (x, z) and let the swing die, drop; events up to lift-off. */
function dropOn(s: ClawSim, x: number, z: number) {
  insertCoin(s);
  const events = runUntil(s, () => s.phase === 'moving', 1);
  runUntil(s, () => Math.abs(s.claw.x - x) < 0.003 && Math.abs(s.claw.z - z) < 0.003
    && Math.hypot(s.claw.vx, s.claw.vz) < 0.01 && Math.hypot(s.claw.swingX, s.claw.swingZ) < 0.002
    && Math.hypot(s.claw.swingVX, s.claw.swingVZ) < 0.01,
  40, () => ({ x: Math.max(-1, Math.min(1, (x - s.claw.x) * 30)), z: Math.max(-1, Math.min(1, (z - s.claw.z) * 30)) }));
  pressDrop(s);
  events.push(...runUntil(s, () => s.phase === 'lifting'));
  return events;
}

describe('new prizes', () => {
  it('a 12-sided die is a real dodecahedron: dropped in, it comes to rest lying on a face', () => {
    const s = sim();
    const d = spawnPrize(s, { x: 0.1, z: 0, y: 0.25, r: 0.05, shape: 'dodeca', category: 'dice12', qx: 0.3, qw: 0.954 });
    settle(s, 4);
    expect(prizesResting(s)).toBe(true);
    // On a face its centre sits at the inradius (0.795 r); on an edge or corner it would be higher.
    expect(d.y).toBeCloseTo(0.05 * 0.7947, 2);
  });

  it('a six-sided die and a drink carton come to rest flat on a face', () => {
    const s = sim();
    const die = spawnPrize(s, { x: 0.1, z: 0, y: 0.2, shape: 'box', category: 'dice6', halfX: 0.04, halfY: 0.04, halfZ: 0.04 });
    const carton = spawnPrize(s, { x: -0.1, z: -0.1, shape: 'box', category: 'drink', halfX: 0.032, halfY: 0.052, halfZ: 0.02 });
    settle(s, 3);
    expect(die.y).toBeCloseTo(0.04, 2);
    expect(carton.y).toBeCloseTo(0.052, 2); // stood upright
    expect(prizesResting(s)).toBe(true);
  });
});

describe('magnet claw (磁吸爪)', () => {
  const steel = (s: ClawSim): Prize => spawnPrize(s, { x: 0.1, z: 0, r: 0.035, category: 'steel', weight: 0.85 });

  it('lifts a steel ball it comes down on and carries it to the chute', () => {
    const s = sim({ midPower: 40, weakPower: 40 }, 'magnet');
    steel(s);
    expect(dropOn(s, 0.1, 0).some((e) => e.type === 'grab')).toBe(true);
    runUntil(s, () => s.phase === 'idle');
    runUntil(s, () => s.stats.wins > 0, 3);
    expect(s.stats.wins).toBe(1);
  });

  it('can’t pick up anything that isn’t iron', () => {
    const s = sim({}, 'magnet');
    spawnPrize(s, { x: 0.1, z: 0, r: 0.07 });
    const events = dropOn(s, 0.1, 0);
    expect(events.some((e) => e.type === 'grab')).toBe(false);
    expect(events.some((e) => e.type === 'miss')).toBe(true);
  });

  it('its pull follows the voltage: a weak coil lets a heavy ball drop', () => {
    const s = sim({ strongPower: 40, midPower: 6, midPoint: 30 }, 'magnet');
    steel(s);
    dropOn(s, 0.1, 0);
    const events = runUntil(s, () => s.phase === 'idle');
    expect(events.some((e) => e.type === 'slip')).toBe(true);
    expect(s.stats.wins).toBe(0);
  });

});

describe('檯面 (play field)', () => {
  it('stepped floor: tiers rise toward the back, the hole row stays at the felt', () => {
    expect(fieldHeightAt('steps', 0.2, 0.2)).toBe(0);
    expect(fieldHeightAt('steps', 0.2, 0)).toBe(STEP_TIERS[0].top);
    expect(fieldHeightAt('steps', 0.2, -0.25)).toBe(STEP_TIERS[1].top);
    expect(fieldTopUnder('steps', 0.2, 0.12, 0.05)).toBe(STEP_TIERS[0].top); // tips reach over the step edge
  });

  it('prizes rest on a step, and one hanging over its edge drops to the tier below', () => {
    const s = sim({}, 'standard', 'steps');
    const upper = spawnPrize(s, { x: 0.2, z: -0.22, y: 0.3, r: 0.06 });
    // Centre 1 cm past the upper step's front edge, at the upper step's height.
    const falling = spawnPrize(s, { x: 0.25, z: STEP_TIERS[1].maxZ + 0.01, y: STEP_TIERS[1].top + 0.062, r: 0.06 });
    settle(s, 3);
    expect(upper.y).toBeCloseTo(STEP_TIERS[1].top + 0.06, 2);
    expect(falling.y).toBeLessThan(STEP_TIERS[1].top + 0.06 - 0.02);
  });

  it('the claw lands on a step instead of passing through it', () => {
    const s = sim({ dropLine: 4 }, 'standard', 'steps');
    dropOn(s, 0.2, -0.22);
    const tips = s.claw.y - prongGeometry(s.claw.open, s.clawSpec).dy;
    expect(tips).toBeGreaterThan(STEP_TIERS[1].top - 0.002);
  });

  it('火山口: the chute is the crater, its cords rising in rings from the bed to the hole’s edge', () => {
    const c = craterOf(CHUTE)!;
    expect(c.height).toBe(CHUTE.wallH);
    expect(c.rings[0]).toBeLessThan(0.02); // bottom cord just off the bed
    expect(c.rings.at(-1)).toBeCloseTo(CHUTE.wallH, 6); // top cord on the hole's edge
    for (let k = 1; k < c.rings.length; k++) {
      expect(c.rings[k] - c.rings[k - 1]).toBeLessThanOrEqual(CRATER.spacing + 1e-9);
    }
    expect(craterOf({ ...CHUTE, wallH: 0 })).toBeNull();
    // The hole, then the slope from its edge down to the foot on the bed.
    const z = 0.2;
    expect(fieldHeightAt('volcano', CHUTE.maxX - 0.01, z)).toBe(-Infinity);
    expect(fieldHeightAt('volcano', CHUTE.maxX + 0.001, z)).toBeCloseTo(c.height, 2);
    expect(fieldHeightAt('volcano', CHUTE.maxX + c.lean / 2, z)).toBeCloseTo(c.height / 2, 6);
    expect(fieldHeightAt('volcano', CHUTE.maxX + c.lean + 0.01, z)).toBe(0);
    expect(fieldHeightAt('volcano', 0.3, -0.2)).toBe(0); // the open bed
    // Every ring runs round the hole's corner, never across the mouth.
    for (const r of craterRopes(CHUTE)) {
      const mx = (r.from.x + r.to.x) / 2, mz = (r.from.z + r.to.z) / 2;
      expect(inChute(mx, mz, -0.001)).toBe(false);
    }
    const desc = fieldDesc('volcano', CHUTE);
    expect(desc.barrier).toBe(false); // the cords stand in for the 擋板
    expect(desc.hulls).toHaveLength(2);
    expect(fieldDesc('bounce', CHUTE).barrier).toBe(true);
  });

  it('a prize dropped into the 火山口’s mouth goes down the chute; one dropped on its slope is thrown back out', () => {
    const s = sim({}, 'standard', 'volcano');
    const home = homeOf(s.chute);
    const inMouth = spawnPrize(s, { x: home.x, z: home.z, y: 0.35, r: 0.045, category: 'capsule' });
    settle(s, 2);
    expect(inMouth.won).toBe(true);
    const c = craterOf(s.chute)!;
    const x0 = s.chute.maxX + c.lean * 0.6;
    const onSlope = spawnPrize(s, { x: x0, z: 0.22, y: 0.3, r: 0.03, category: 'capsule' });
    settle(s, 3);
    expect(onSlope.won).toBe(false);
    expect(onSlope.x).toBeGreaterThan(x0 + 0.02);
  });

  it('the claw comes down on the 火山口’s cords instead of through them', () => {
    const s = sim({ dropLine: 4 }, 'standard', 'volcano');
    const c = craterOf(s.chute)!;
    dropOn(s, s.chute.maxX + c.lean / 2, 0.2);
    const tips = s.claw.y - prongGeometry(s.claw.open, s.clawSpec).dy;
    expect(tips).toBeGreaterThan(c.height - 0.002);
  });

  it('raising the 火山口 round a full cabinet keeps the count, with nothing left inside its walls', () => {
    const s = createSim(defaultSettings(), { seed: 9, prizeCount: 40, field: 'volcano' });
    setChute(s, { ...DEFAULT_CHUTE, wallH: 0.3 });
    expect(prizesLeft(s)).toBe(40);
    settle(s, 2);
    expect(prizesResting(s)).toBe(true);
    for (const p of s.prizes) {
      if (!p.won) expect(p.y - p.extY).toBeGreaterThan(fieldHeightAt('volcano', p.x, p.z, s.chute) - 0.01);
    }
  });

  it('the bounce table throws a dropped prize back up; the felt doesn’t', () => {
    const rebound = (field: FieldType) => {
      const s = sim({}, 'standard', field);
      const p = spawnPrize(s, { x: -0.1, z: 0.2, y: 0.4, r: 0.05, category: 'capsule' });
      let fell = false, best = 0;
      for (let t = 0; t < 1.5; t += 1 / 120) {
        settle(s, 1 / 120);
        if (p.vy < -0.5) fell = true;
        if (fell) best = Math.max(best, p.vy);
      }
      return best;
    };
    const flat = rebound('flat');
    expect(rebound('bounce')).toBeGreaterThan(flat + 0.5);
    expect(rebound('volcano')).toBeGreaterThan(flat + 0.5);
  });

  it('a bounce table has 衝繩 round the bed at two heights, open on the chute side', () => {
    const ropes = bedRopes(CHUTE);
    expect(ropes).toHaveLength(ROPES.heights.length * 4);
    for (const r of ropes) {
      // No rope runs across the chute opening.
      const mx = (r.from.x + r.to.x) / 2, mz = (r.from.z + r.to.z) / 2;
      expect(inChute(mx, mz, -0.001)).toBe(false);
    }
    expect(fieldDesc('flat', CHUTE).ropes).toHaveLength(0);
    expect(fieldDesc('bounce', CHUTE).ropes).toHaveLength(ropes.length);
  });

  it('a prize falling at the edge lands on the 衝繩 and is thrown back into the cabinet', () => {
    /** Where the prize first bounces (its height), and how far in it has come by then. */
    const firstBounce = (field: FieldType) => {
      const s = sim({}, 'standard', field);
      const z0 = BOX.minZ + 0.03;
      const p = spawnPrize(s, { x: 0.1, z: z0, y: 0.3, r: 0.03, category: 'capsule' });
      let falling = false;
      for (let t = 0; t < 1; t += 1 / 240) {
        settle(s, 1 / 240);
        if (p.vy < -0.3) falling = true;
        if (falling && p.vy > 0) return { y: p.y, inward: p.z - z0, vz: p.vz };
      }
      return { y: -1, inward: 0, vz: 0 };
    };
    const felt = firstBounce('flat');
    expect(felt.y).toBeLessThan(0.035); // bounced (barely) off the felt
    const rope = firstBounce('bounce');
    expect(rope.y).toBeGreaterThan(ROPES.heights[1]); // caught by the top rope
    expect(rope.vz).toBeGreaterThan(0.3); // flung back toward the middle
  });

  it('3D 彈跳台: the bed is level with the box’s rim on its open sides and rises to the lift at the three far corners', () => {
    const lift = 0.1;
    const box = holeBox('bounce', CHUTE);
    expect(bedHeight(box, lift, box.maxX, 0.25)).toBeCloseTo(0, 6); // along the box's right side
    expect(bedHeight(box, lift, -0.4, box.minZ)).toBeCloseTo(0, 6); // along its back
    for (const [x, z] of [[BOX.minX, BOX.minZ], [BOX.maxX, BOX.minZ], [BOX.maxX, BOX.maxZ]]) {
      expect(bedHeight(box, lift, x, z)).toBeCloseTo(lift, 6);
    }
    // Downhill all the way to the box: a step toward it (left or forward) never climbs.
    for (let x = box.maxX + 0.03; x < BOX.maxX; x += 0.05) {
      for (let z = BOX.minZ + 0.03; z < BOX.maxZ; z += 0.05) {
        const h = bedHeight(box, lift, x, z);
        expect(bedHeight(box, lift, x - 0.02, z)).toBeLessThanOrEqual(h + 1e-9);
        if (z + 0.02 < box.minZ) expect(bedHeight(box, lift, x, z + 0.02)).toBeLessThanOrEqual(h + 1e-9);
      }
    }
    expect(fieldHeightAt('bounce', 0.4, -0.3, CHUTE, lift)).toBeGreaterThan(lift * 0.9);
    expect(fieldHeightAt('flat', 0.4, -0.3, CHUTE, lift)).toBe(0); // only the bounce tables are 3D
    // The physics mesh is the same surface.
    const { vertices } = fieldDesc('bounce', CHUTE, lift).bed!;
    for (let i = 0; i < vertices.length; i += 3) {
      expect(vertices[i + 1]).toBeCloseTo(bedHeight(box, lift, vertices[i], vertices[i + 2]), 6);
    }
  });

  it('on a 3D bed a ball left at the back-right runs downhill into the hole; on a flat bed it stays put', () => {
    const run = (lift: number) => {
      const s = createSim({ ...defaultSettings(), guaranteeN: 0 }, {
        seed: 1, prizeCount: 0, field: 'bounce', bedLift: lift, chute: { ...DEFAULT_CHUTE, wallH: 0 },
      });
      const x = 0.25, z = -0.15;
      const ball = spawnPrize(s, { x, z, y: fieldHeightAt('bounce', x, z, s.chute, lift) + 0.036, r: 0.035, category: 'capsule' });
      settle(s, 8);
      return ball;
    };
    expect(run(0.12).won).toBe(true);
    const flat = run(0);
    expect(flat.won).toBe(false);
    expect(Math.hypot(flat.x - 0.25, flat.z + 0.15)).toBeLessThan(0.02);
  });

  it('the claw comes down on the raised bed, not through it', () => {
    const lift = 0.12;
    const s = createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60, dropLine: 4 }, {
      seed: 1, prizeCount: 0, field: 'bounce', bedLift: lift,
    });
    dropOn(s, 0.35, -0.22);
    const tips = s.claw.y - prongGeometry(s.claw.open, s.clawSpec).dy;
    expect(tips).toBeGreaterThan(fieldHeightAt('bounce', 0.35, -0.22, s.chute, lift) - 0.003);
  });

  it('洞口網: a bounce table keeps its box and nets over what a smaller opening leaves; a felt table shrinks the hole', () => {
    const small = chuteFrom({ width: 0.14, depth: 0.14, wallH: 0.15 });
    const box = holeBox('bounce', small);
    expect(box.maxX).toBeCloseTo(CHUTE.maxX, 6);
    expect(box.minZ).toBeCloseTo(CHUTE.minZ, 6);
    expect(holeNets('bounce', small)).toHaveLength(2);
    expect(holeNets('volcano', small)).toHaveLength(2);
    expect(holeBox('flat', small)).toEqual(small);
    expect(holeNets('flat', small)).toHaveLength(0);
    expect(holeNets('bounce', CHUTE)).toHaveLength(0); // the opening fills the box: no net
    expect(fieldHeightAt('bounce', (small.maxX + box.maxX) / 2, 0.25, small)).toBe(0); // on the net
    expect(fieldHeightAt('bounce', homeOf(small).x, homeOf(small).z, small)).toBe(-Infinity); // down the opening

    const s = createSim({ ...defaultSettings(), guaranteeN: 0 }, {
      seed: 1, prizeCount: 0, field: 'bounce', chute: { width: 0.14, depth: 0.14, wallH: 0.15 },
    });
    const onNet = spawnPrize(s, { x: (small.maxX + box.maxX) / 2, z: 0.25, y: 0.3, r: 0.03, category: 'capsule' });
    const home = homeOf(s.chute);
    const inHole = spawnPrize(s, { x: home.x, z: home.z, y: 0.3, r: 0.03, category: 'capsule' });
    settle(s, 2);
    expect(inHole.won).toBe(true);
    expect(onNet.won).toBe(false); // caught by the net
    expect(onNet.y).toBeGreaterThan(0.02);
  });

  it('loading a bounce table with a 洞口網 keeps the prizes out of the box', () => {
    const s = createSim(defaultSettings(), {
      seed: 4, prizeCount: 30, field: 'bounce', chute: { width: 0.14, depth: 0.14, wallH: 0.15 },
    });
    const box = holeBox(s.field, s.chute);
    expect(prizesLeft(s)).toBe(30);
    for (const p of s.prizes) expect(inChute(p.x, p.z, 0, box)).toBe(false);
  });

  it('raising the bed round a full cabinet keeps the count, with nothing sunk into it', () => {
    const s = createSim(defaultSettings(), { seed: 9, prizeCount: 40, field: 'bounce', bedLift: 0.04 });
    setBedLift(s, 0.14);
    expect(s.bedLift).toBe(0.14);
    expect(prizesLeft(s)).toBe(40);
    settle(s, 2);
    for (const p of s.prizes) {
      if (!p.won) expect(p.y - p.extY).toBeGreaterThan(fieldHeightAt('bounce', p.x, p.z, s.chute, s.bedLift) - 0.01);
    }
  });

  it('a stored bed lift is sanitized', () => {
    expect(sanitizeRig({}).bedLift).toBe(BED_LIFT.default);
    expect(sanitizeRig({ bedLift: 0.5 }).bedLift).toBe(BED_LIFT.max);
    expect(sanitizeRig({ bedLift: 0.034 }).bedLift).toBe(0.03);
    expect(sanitizeRig({ bedLift: 'high' }).bedLift).toBe(BED_LIFT.default);
  });

  it('changing the 檯面 keeps the cabinet count and settles the pile on it', () => {
    const s = createSim(defaultSettings(), { seed: 9, prizeCount: 40 });
    for (const f of ['steps', 'bounce', 'volcano', 'flat'] as FieldType[]) {
      setField(s, f);
      expect(s.field).toBe(f);
      expect(prizesLeft(s)).toBe(40);
      settle(s, 2);
      expect(prizesResting(s), `still moving on ${f}`).toBe(true);
    }
  });

  it('a stored 檯面 is sanitized', () => {
    expect(sanitizeRig({ field: 'steps' }).field).toBe('steps');
    expect(sanitizeRig({ field: 'lava' }).field).toBe('flat');
  });
});
