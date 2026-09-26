import { beforeAll, describe, expect, it } from 'vitest';
import {
  BOX, CHUTE, DEFAULT_GANTRY, GANTRY_RANGE, createSim, drainEvents, gantryHome, homeOf, initPhysics, insertCoin, pinnedGantry,
  pressDrop, sanitizeGantry, setGantry, stepSim, type ClawSim, type SimEvent,
} from '../clawSim';
import { sanitizeRig } from '../fleet';
import { defaultSettings } from '../settings';
import { DEFAULT_TOWER, towerSites } from '../tower';

const DT = 1 / 60;
/** Where the one factory 大怒神 stands. */
const TOWER = towerSites(DEFAULT_TOWER, BOX, CHUTE)[0];

beforeAll(() => initPhysics());

function run(s: ClawSim, seconds: number, joy = { x: 0, z: 0 }) {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    stepSim(s, DT, joy);
    events.push(...drainEvents(s));
  }
  return events;
}

/** Coin in and wait for the round to start. */
function startRound(s: ClawSim) {
  insertCoin(s);
  for (let t = 0; t < 1 && s.phase !== 'moving'; t += DT) stepSim(s, DT);
}

/** Play the round out from the drop to idle. */
function finishRound(s: ClawSim) {
  pressDrop(s);
  const events: SimEvent[] = [];
  for (let t = 0; t < 40 && !(s.phase === 'idle' && t > 1); t += DT) {
    stepSim(s, DT);
    events.push(...drainEvents(s));
  }
  return events;
}

describe('天車限位 (limit switches and start point)', () => {
  it('sanitizes: clamped to the rails, the switches in order, the start point inside, snapped to cm', () => {
    expect(sanitizeGantry(null)).toEqual(DEFAULT_GANTRY);
    expect(DEFAULT_GANTRY).toEqual({ ...GANTRY_RANGE, home: null });
    expect(sanitizeGantry({ minX: 0.3, maxX: -0.1, minZ: -9, maxZ: 0.123, home: { x: 0.5, z: 0 } }))
      .toEqual({ minX: -0.1, maxX: 0.3, minZ: GANTRY_RANGE.minZ, maxZ: 0.12, home: { x: 0.3, z: 0 } });
    expect(sanitizeGantry({ home: { x: 'left' } }).home).toBeNull();
    expect(sanitizeRig({}).gantry).toEqual(DEFAULT_GANTRY);
    expect(pinnedGantry(0.1, -0.02)).toEqual({ minX: 0.1, maxX: 0.1, minZ: -0.02, maxZ: -0.02, home: { x: 0.1, z: -0.02 } });
  });

  it('starts over the chute unless moved, and never outside the limits', () => {
    expect(gantryHome(DEFAULT_GANTRY, CHUTE)).toEqual(homeOf(CHUTE));
    // Limits that leave the chute out: it homes to the corner nearest the hole, like a real machine.
    expect(gantryHome(sanitizeGantry({ minX: 0, maxX: 0.2, minZ: -0.1, maxZ: 0.1 }), CHUTE)).toEqual({ x: 0, z: 0.1 });
    expect(gantryHome(sanitizeGantry({ home: { x: 0.2, z: -0.1 } }), CHUTE)).toEqual({ x: 0.2, z: -0.1 });
  });

  it('the limit switches stop the gantry where they are clamped', () => {
    const s = createSim(defaultSettings(), { seed: 1, prizeCount: 0, gantry: { ...DEFAULT_GANTRY, maxX: 0, minZ: -0.05 } });
    startRound(s);
    // Full right and away from the player (joystick up is -z).
    run(s, 6, { x: 1, z: -1 });
    expect(s.claw.x).toBeCloseTo(0, 6);
    expect(s.claw.z).toBeCloseTo(-0.05, 6);
  });

  it('pinned over the 大怒神 the claw starts there, the stick does nothing, and it drops straight down the shaft', () => {
    const s = createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60, dropLine: 6 }, {
      seed: 1, prizeCount: 0, claw: 'magnet', field: 'tower', gantry: pinnedGantry(TOWER.x, TOWER.z),
    });
    expect(s.claw.x).toBeCloseTo(TOWER.x, 6);
    expect(s.claw.z).toBeCloseTo(TOWER.z, 6);
    startRound(s);
    run(s, 2, { x: 1, z: 1 });
    expect(s.claw.x).toBeCloseTo(TOWER.x, 6);
    expect(s.claw.z).toBeCloseTo(TOWER.z, 6);
    const events = finishRound(s);
    expect(events.some((e) => e.type === 'lift')).toBe(true);
    expect(events.some((e) => e.type === 'drop')).toBe(true);
    expect(s.claw.x).toBeCloseTo(TOWER.x, 6); // it waits over the tower for the next round
  });

  it('after a round the claw comes back to a moved start point', () => {
    const home = { x: 0.2, z: -0.1 };
    const s = createSim({ ...defaultSettings(), guaranteeN: 0, playTime: 60 }, {
      seed: 1, prizeCount: 0, gantry: sanitizeGantry({ home }),
    });
    expect(s.claw.x).toBeCloseTo(home.x, 6);
    startRound(s);
    run(s, 1, { x: -1, z: 1 });
    expect(s.claw.x).toBeLessThan(home.x - 0.05);
    finishRound(s);
    expect(s.claw.x).toBeCloseTo(home.x, 2);
    expect(s.claw.z).toBeCloseTo(home.z, 2);
  });

  it('moving the start point sends an idle claw there at once', () => {
    const s = createSim(defaultSettings(), { seed: 1, prizeCount: 0 });
    setGantry(s, pinnedGantry(0.1, 0));
    expect(s.claw.x).toBe(0.1);
    expect(s.claw.z).toBe(0);
    expect(s.claw.hx).toBeCloseTo(0.1, 6);
  });
});
