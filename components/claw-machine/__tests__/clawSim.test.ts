import { beforeAll, describe, expect, it } from 'vitest';
import {
  BOX, CHUTE, CLAW_TOP, PLATE_Y, DEFAULT_CHUTE, HOME, chuteFrom, createSim, drainEvents, dropLimitHubY, floorHubY,
  homeOf, inChute, initPhysics, insertCoin, maxPenetration, pendulumLength, pressDrop, prizesLeft, prizesResting,
  DEFAULT_ANTI_SWING, sanitizeAntiSwing, sanitizeChute, setAntiSwing, setChute, settle, spawnPrize, stepSim,
  surfaceHeightAt, topLean,
  type ClawSim, type Prize, type SimEvent,
} from '../clawSim';
import { headTop } from '../claws';
import { DEFAULT_STOCK } from '../items';
import { defaultSettings, midLineLength, winchSpeed, type ClawSettings } from '../settings';

const DT = 1 / 60;

beforeAll(() => initPhysics());

function sim(overrides: Partial<ClawSettings> = {}, prizeCount = 0, seed = 1) {
  return createSim({ ...defaultSettings(), ...overrides }, { seed, prizeCount });
}

/** A plush (sphere, r 7 cm by default) resting on the felt at (x, z). */
function addPrize(s: ClawSim, x: number, z: number, props: Partial<Prize> = {}): Prize {
  return spawnPrize(s, { x, z, ...props });
}

/** Step until pred holds; fails the test instead of hanging. */
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

/** Hub's horizontal offset from the trolley: how far the claw is swung out. */
const swingOffset = (s: ClawSim) => Math.hypot(s.claw.hx - s.claw.x, s.claw.hz - s.claw.z);

/**
 * Steer the gantry over (x, z) with the joystick and wait for the claw to stop
 * swinging, like a careful player would before dropping.
 */
function driveTo(s: ClawSim, x: number, z: number) {
  const joy = () => ({
    x: Math.max(-1, Math.min(1, (x - s.claw.x) * 30)),
    z: Math.max(-1, Math.min(1, (z - s.claw.z) * 30)),
  });
  runUntil(s, () => Math.abs(s.claw.x - x) < 0.003 && Math.abs(s.claw.z - z) < 0.003
    && Math.hypot(s.claw.vx, s.claw.vz) < 0.01 && swingSettled(s), 40, joy);
}

/** Coin in, steer over (x, z), drop, and play the round out until prizes rest. */
function playRound(s: ClawSim, x: number, z: number) {
  insertCoin(s);
  const events = runUntil(s, () => s.phase === 'moving', 1);
  driveTo(s, x, z);
  pressDrop(s);
  events.push(...runUntil(s, () => s.phase === 'idle'));
  events.push(...runUntil(s, () => prizesResting(s), 5));
  return events;
}

describe('coins and credits', () => {
  it('needs coinsPerPlay coins before a round starts', () => {
    const s = sim({ coinsPerPlay: 3 });
    insertCoin(s); insertCoin(s);
    stepSim(s, DT);
    expect(s.phase).toBe('idle');
    insertCoin(s);
    stepSim(s, DT);
    expect(s.phase).toBe('moving');
    expect(s.coins).toBe(0);
    expect(s.stats.coins).toBe(3);
    expect(s.stats.plays).toBe(1);
    expect(s.timer).toBeCloseTo(s.settings.playTime, 1);
  });
});

describe('gantry', () => {
  it('is clamped inside the cabinet whichever way the stick is held', () => {
    const s = sim({ playTime: 60 });
    insertCoin(s);
    for (const joy of [{ x: 1, z: 1 }, { x: -1, z: -1 }]) {
      for (let t = 0; t < 6; t += DT) stepSim(s, DT, joy);
      expect(s.claw.x).toBeGreaterThan(BOX.minX);
      expect(s.claw.x).toBeLessThan(BOX.maxX);
      expect(s.claw.z).toBeGreaterThan(BOX.minZ);
      expect(s.claw.z).toBeLessThan(BOX.maxZ);
    }
  });
});

describe('frame timing', () => {
  it('ignores zero and bogus frame deltas instead of producing NaN', () => {
    const s = createSim(defaultSettings(), { seed: 3 });
    insertCoin(s);
    for (const dt of [0, -1, Number.NaN, 0, DT, 0, 5]) stepSim(s, dt, { x: 1, z: 1 });
    const values = [s.claw.x, s.claw.y, s.claw.z, s.claw.swingX, s.claw.swingZ,
      ...s.prizes.flatMap((p) => [p.x, p.y, p.z])];
    expect(values.every(Number.isFinite)).toBe(true);
  });
});

describe('swinging the claw (甩爪)', () => {
  /**
   * At the top stop the 防甩片 holds the claw nearly still, so, as on a real
   * machine, 甩爪 practice starts with 回停下降 letting the claw hang lower.
   */
  const HOME_DROP = 5;
  const hangLine = () => HOME_DROP * 0.1 * winchSpeed(defaultSettings().dropSpeed);
  /** Start a round and let the (lowered) claw hang still. */
  function ready(overrides: Partial<ClawSettings> = {}) {
    const s = sim({ playTime: 60, homeDrop: HOME_DROP, ...overrides });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    driveTo(s, 0, 0);
    return s;
  }
  /** Record hub offset along x (hub minus trolley) for `seconds`. */
  function trace(s: ClawSim, seconds: number, joy: (t: number) => { x: number; z: number } = () => ({ x: 0, z: 0 })) {
    const xs: number[] = [];
    for (let t = 0; t < seconds; t += DT) {
      stepSim(s, DT, joy(t));
      xs.push(s.claw.hx - s.claw.x);
    }
    return xs;
  }
  const naturalPeriod = () => 2 * Math.PI * Math.sqrt(pendulumLength(CLAW_TOP - hangLine()) / 9.8);

  it('keeps swinging like a pendulum after the gantry stops, at the natural period', () => {
    const s = ready();
    trace(s, 0.8, () => ({ x: 1, z: 0 }));
    const xs = trace(s, 4);
    const crossings: number[] = [];
    for (let i = 1; i < xs.length; i++) if (Math.sign(xs[i]) !== Math.sign(xs[i - 1])) crossings.push(i * DT);
    expect(crossings.length).toBeGreaterThanOrEqual(5);
    const period = 2 * (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
    expect(period).toBeGreaterThan(naturalPeriod() * 0.85);
    expect(period).toBeLessThan(naturalPeriod() * 1.15);
    // Damped: the last second swings less than the first.
    const amp = (a: number[]) => Math.max(...a.map(Math.abs));
    expect(amp(xs.slice(-60))).toBeLessThan(amp(xs.slice(0, 60)));
  });

  it('rocking the stick in time with the swing builds it up far more than one push', () => {
    const single = ready();
    const one = Math.max(...trace(single, 6, (t) => ({ x: t < 0.25 ? 1 : 0, z: 0 })).map(Math.abs));

    const pumped = ready();
    const half = naturalPeriod() / 2;
    const rocked = trace(pumped, 6, (t) => ({ x: Math.floor(t / half) % 2 === 0 ? 1 : -1, z: 0 }));
    expect(Math.max(...rocked.map(Math.abs))).toBeGreaterThan(one * 2);
    expect(Math.max(...rocked.map(Math.abs))).toBeGreaterThan(0.04);
  });

  it('dropping mid-swing lands the claw off to the side of the trolley', () => {
    const s = ready();
    const half = naturalPeriod() / 2;
    trace(s, 3, (t) => ({ x: Math.floor(t / half) % 2 === 0 ? 1 : -1, z: 0 }));
    pressDrop(s);
    runUntil(s, () => s.phase === 'closing');
    expect(swingOffset(s)).toBeGreaterThan(0.015);
  });

  it('a landed claw lifts off from where it landed and swings back under the trolley', () => {
    const s = ready();
    const half = naturalPeriod() / 2;
    trace(s, 3, (t) => ({ x: Math.floor(t / half) % 2 === 0 ? 1 : -1, z: 0 }));
    pressDrop(s);
    runUntil(s, () => s.phase === 'closing');
    expect(s.claw.resting).toBe(true);
    const landed = { x: s.claw.hx, z: s.claw.hz };
    // Closing takes 0.45 s plus the 0.25 s 下停上拉延遲; look just before the lift.
    runUntil(s, () => s.phase === 'closing' && s.phaseTime > 0.6);
    expect(s.claw.hx).toBeCloseTo(landed.x, 3); // didn't slide while resting
    expect(s.claw.hz).toBeCloseTo(landed.z, 3);
    const off = swingOffset(s);
    expect(off).toBeGreaterThan(0.01);
    runUntil(s, () => s.phase === 'lifting');
    runUntil(s, () => swingOffset(s) < off * 0.5, 3);
  });

  it('steers during the drop only when 下降中操控 is on', () => {
    for (const dropSteer of [1, 0]) {
      const s = ready({ dropSteer });
      pressDrop(s);
      const x0 = s.claw.x;
      runUntil(s, () => s.phase !== 'dropping', 10, () => ({ x: 1, z: 0 }));
      if (dropSteer) expect(s.claw.x - x0).toBeGreaterThan(0.05);
      else expect(s.claw.x).toBeCloseTo(x0, 4);
    }
  });

  it('a violent swing never puts the claw through the glass', () => {
    const s = ready({ gantrySpeed: 10 });
    const half = naturalPeriod() / 2;
    for (let t = 0; t < 12; t += DT) {
      const phase = Math.floor(t / half) % 2 === 0 ? 1 : -1;
      stepSim(s, DT, { x: phase, z: -phase });
      expect(s.claw.hx).toBeGreaterThan(BOX.minX);
      expect(s.claw.hx).toBeLessThan(BOX.maxX);
      expect(s.claw.hz).toBeGreaterThan(BOX.minZ);
      expect(s.claw.hz).toBeLessThan(BOX.maxZ);
    }
  });
});

describe('surfaceHeightAt (aiming marker / claw cam)', () => {
  it('is the prize top over a plush, the felt elsewhere, and below floor over the chute', () => {
    const s = sim();
    const p = addPrize(s, 0.1, 0, { r: 0.07 });
    settle(s, 0.05); // new bodies join ray queries on the next physics step
    expect(surfaceHeightAt(s, 0.1, 0)).toBeCloseTo(p.y + p.r, 3);
    expect(surfaceHeightAt(s, 0.3, 0.2)).toBeCloseTo(0, 5);
    expect(surfaceHeightAt(s, HOME.x, HOME.z)).toBeLessThan(0);
  });
});

describe('fresh cabinet', () => {
  it('settles into a resting pile outside the chute', () => {
    const s = createSim(defaultSettings(), { seed: 7 });
    expect(s.prizes.length).toBe(DEFAULT_STOCK.count);
    settle(s, 1);
    expect(prizesResting(s)).toBe(true);
    for (const p of s.prizes) {
      expect(p.won).toBe(false);
      expect(p.y).toBeGreaterThanOrEqual(p.extY - 3e-3);
      expect(inChute(p.x, p.z)).toBe(false);
    }
    // No two plushies interpenetrating (Rapier keeps contacts to a few mm).
    expect(maxPenetration(s)).toBeLessThan(0.006);
  });
});

describe('claw voltage (強 → 中 → 弱)', () => {
  const target = { x: 0.15, z: -0.05 };

  it('strong voltage all the way carries a centred prize into the chute', () => {
    const s = sim({ midPower: 40, weakPower: 40, guaranteeN: 0 });
    addPrize(s, target.x, target.z, { weight: 0.9 });
    const events = playRound(s, target.x, target.z);
    expect(events.some((e) => e.type === 'grab')).toBe(true);
    expect(events.some((e) => e.type === 'slip')).toBe(false);
    expect(s.stats.wins).toBe(1);
  });

  it('runs strong at the bottom, mid past 中壓距離頂點, and weak once the gantry heads home', () => {
    const s = sim({ strongPower: 40, midPower: 30, midPoint: 10, weakPower: 20, guaranteeN: 0, topPull: 0 });
    addPrize(s, target.x, target.z, { weight: 0.3 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    driveTo(s, target.x, target.z);
    pressDrop(s);
    const events = runUntil(s, () => s.phase === 'lifting');
    const midLine = midLineLength(s.settings);
    events.push(...runUntil(s, () => s.claw.line < midLine + 0.02));
    expect(s.claw.power).toBe(40);
    expect(s.powerStage).toBe('strong');
    events.push(...runUntil(s, () => s.claw.line < midLine - 0.04));
    expect(s.claw.power).toBe(30);
    expect(s.powerStage).toBe('mid');
    events.push(...runUntil(s, () => s.phase === 'returning'));
    events.push(...runUntil(s, () => s.phase !== 'returning' || s.claw.power === 20, 1));
    expect(s.claw.power).toBe(20);
    const stages = events.flatMap((e) => (e.type === 'stage' ? [e.stage] : []));
    expect(stages).toEqual(['mid', 'weak']);
  });

  it('a low mid voltage from the bottom (中壓距離頂點 30) drops the prize on the way up', () => {
    const s = sim({ midPower: 5, midPoint: 30, guaranteeN: 0 });
    const p = addPrize(s, target.x, target.z, { weight: 0.6 });
    const events = playRound(s, target.x, target.z);
    expect(events.some((e) => e.type === 'grab')).toBe(true);
    expect(events.some((e) => e.type === 'stage' && e.stage === 'mid')).toBe(true);
    expect(events.some((e) => e.type === 'slip')).toBe(true);
    expect(s.stats.wins).toBe(0);
    expect(p.y).toBeCloseTo(p.r, 2);
  });

  it('a weak voltage strong enough to hold still pays out', () => {
    const s = sim({ midPower: 40, weakPower: 40, topPull: 0, guaranteeN: 0 });
    addPrize(s, target.x, target.z);
    playRound(s, target.x, target.z);
    expect(s.stats.wins).toBe(1);
  });

  it('強電壓 0 with 中壓距離頂點 30: the claw only closes when the mid voltage comes on, right off the bottom', () => {
    const s = sim({ strongPower: 0, midPower: 48, midPoint: 30, weakPower: 48, guaranteeN: 0 });
    addPrize(s, target.x, target.z, { weight: 0.5 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    driveTo(s, target.x, target.z);
    pressDrop(s);
    runUntil(s, () => s.phase === 'lifting');
    expect(s.closed).toBe(false); // sat at the bottom with the arms open
    expect(s.claw.open).toBeGreaterThan(0.95);
    const events = runUntil(s, () => s.closed, 1);
    expect(events.some((e) => e.type === 'grab')).toBe(true);
  });

  it('強電壓 0 with 中壓距離頂點 1: the claw rides up open and only shuts at the top', () => {
    const s = sim({ strongPower: 0, midPower: 48, midPoint: 1, guaranteeN: 0 });
    addPrize(s, target.x, target.z, { weight: 0.5 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    driveTo(s, target.x, target.z);
    pressDrop(s);
    runUntil(s, () => s.phase === 'lifting');
    runUntil(s, () => s.claw.y > 0.5);
    expect(s.closed).toBe(false);
    expect(s.claw.open).toBeGreaterThan(0.95);
    const events = runUntil(s, () => s.phase === 'idle');
    expect(events.some((e) => e.type === 'grab')).toBe(false);
    expect(events.some((e) => e.type === 'miss')).toBe(true);
  });

  it('a centred grab holds better than an edge grab', () => {
    const q = (dx: number) => {
      const s = sim({ weakPower: 40, guaranteeN: 0 });
      addPrize(s, target.x, target.z);
      insertCoin(s);
      runUntil(s, () => s.phase === 'moving', 1);
      driveTo(s, target.x + dx, target.z);
      pressDrop(s);
      const grab = runUntil(s, () => s.phase === 'lifting').find((e) => e.type === 'grab');
      return grab && grab.type === 'grab' ? grab.quality : 0;
    };
    expect(q(0)).toBeGreaterThan(q(0.06) + 0.2);
  });

  it('misses when dropped far from any prize, and reports where the nearest one was', () => {
    const s = sim();
    addPrize(s, target.x, target.z);
    const events = playRound(s, target.x - 0.3, target.z + 0.05);
    const miss = events.find((e) => e.type === 'miss');
    expect(miss && miss.type === 'miss' && miss.nearest).toBeTruthy();
    if (miss?.type === 'miss' && miss.nearest) {
      // Prize is 30 cm to the right and 5 cm further in than where the claw closed.
      expect(miss.nearest.dx).toBeCloseTo(0.3, 1);
      expect(miss.nearest.dz).toBeCloseTo(-0.05, 1);
    }
    expect(s.stats.wins).toBe(0);
  });

  it('flags whether a slip happened after the voltage dropped or at full grip', () => {
    const weak = sim({ midPower: 5, midPoint: 30, guaranteeN: 0 });
    addPrize(weak, target.x, target.z, { weight: 0.6 });
    const slip = playRound(weak, target.x, target.z).find((e) => e.type === 'slip');
    expect(slip?.type === 'slip' && slip.weak).toBe(true);

    // Heavy prize, edge grab, the same voltage throughout: slips without going weak.
    const strong = sim({ strongPower: 20, midPower: 20, weakPower: 20, guaranteeN: 0 });
    addPrize(strong, target.x, target.z, { weight: 1.2 });
    const slip2 = playRound(strong, target.x + 0.03, target.z).find((e) => e.type === 'slip');
    expect(slip2?.type === 'slip' && !slip2.weak).toBe(true);
  });
});

describe('guarantee (保夾)', () => {
  it('guarantees every Nth round in 保夾 mode', () => {
    const s = sim({ guaranteeN: 3, payoutMode: 0 });
    const flags: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      insertCoin(s);
      const ev = runUntil(s, () => s.phase === 'moving', 1);
      const start = ev.find((e) => e.type === 'roundStart');
      flags.push(!!(start && start.type === 'roundStart' && start.guaranteed));
      pressDrop(s);
      runUntil(s, () => s.phase === 'idle');
    }
    expect(flags).toEqual([false, false, true, false, false, true]);
    expect(s.stats.guarantees).toBe(2);
  });

  it('a guaranteed round stays on 保夾電壓 whatever the stage voltages are', () => {
    const s = sim({ guaranteeN: 1, payoutMode: 0, strongPower: 10, midPower: 1, midPoint: 30, weakPower: 1, guaranteePower: 48 });
    addPrize(s, 0.1, 0, { weight: 0.9 });
    const events = playRound(s, 0.1, 0);
    expect(events.some((e) => e.type === 'stage')).toBe(false);
    expect(s.stats.wins).toBe(1);
  });

  it('a win resets the 保夾 counter when resetOnWin is on', () => {
    const s = sim({ guaranteeN: 5, midPower: 40, weakPower: 40, resetOnWin: 1 });
    addPrize(s, 0.1, 0);
    playRound(s, 0.1, 0);
    expect(s.stats.wins).toBe(1);
    expect(s.sinceGuarantee).toBe(0);
  });

  it('probability mode guarantees roughly 1/N of rounds', () => {
    const s = sim({ guaranteeN: 4, payoutMode: 1 }, 0, 99);
    for (let i = 0; i < 400; i++) {
      insertCoin(s);
      runUntil(s, () => s.phase === 'moving', 1);
      s.phase = 'resetting'; // skip the physical round; only the draw matters
      runUntil(s, () => s.phase === 'idle', 2);
    }
    expect(s.stats.guarantees / s.stats.plays).toBeGreaterThan(0.18);
    expect(s.stats.guarantees / s.stats.plays).toBeLessThan(0.32);
  });
});

describe('winch and cable (下線長度 / 回停下降)', () => {
  /** Coin in and drop straight down from the home position. */
  function dropFromHome(s: ClawSim) {
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    return runUntil(s, () => s.phase === 'closing');
  }

  it('下線長度 stops the claw after time × down speed of line, and it closes in mid-air', () => {
    const s = sim({ dropLine: 0.8 });
    dropFromHome(s);
    const line = 0.8 * winchSpeed(s.settings.dropSpeed);
    expect(s.claw.line).toBeCloseTo(line, 3);
    expect(s.claw.y).toBeCloseTo(CLAW_TOP - line, 3);
    expect(s.claw.y).toBeCloseTo(dropLimitHubY(s.settings), 3);
    expect(s.claw.resting).toBe(false);
  });

  it('the same 下線長度 time lets out more line with a faster down motor', () => {
    const slow = sim({ dropLine: 0.8, dropSpeed: 3 });
    dropFromHome(slow);
    const fast = sim({ dropLine: 0.8, dropSpeed: 9 });
    dropFromHome(fast);
    expect(fast.claw.y).toBeLessThan(slow.claw.y - 0.1);
  });

  it('a long 下線長度 reaches the felt, and the claw stops there', () => {
    const s = sim({ dropLine: 4, midAirGrab: 0 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    driveTo(s, 0.2, -0.1);
    pressDrop(s);
    runUntil(s, () => s.phase !== 'dropping', 5);
    expect(s.claw.y).toBeCloseTo(floorHubY(), 2);
    expect(s.claw.resting).toBe(true);
  });

  it('the cable is the hypotenuse: a swinging claw hangs higher than the line it has out', () => {
    const still = sim({ playTime: 60 });
    insertCoin(still);
    runUntil(still, () => still.phase === 'moving', 1);
    pressDrop(still);
    runUntil(still, () => still.claw.line > 0.3);
    expect(still.claw.y).toBeCloseTo(CLAW_TOP - still.claw.line, 6);

    const s = sim({ playTime: 60, gantrySpeed: 10, homeDrop: 5 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    driveTo(s, 0, 0);
    const half = Math.PI * Math.sqrt(pendulumLength(CLAW_TOP - 0.5 * winchSpeed(6)) / 9.8);
    for (let t = 0; t < 3; t += DT) stepSim(s, DT, { x: Math.floor(t / half) % 2 === 0 ? 1 : -1, z: 0 });
    pressDrop(s);
    let lift = 0;
    runUntil(s, () => {
      const c = s.claw;
      const cos = Math.sqrt(1 - Math.sin(c.swingX) ** 2 - Math.sin(c.swingZ) ** 2);
      expect(c.y).toBeCloseTo(PLATE_Y - (PLATE_Y - CLAW_TOP + c.line) * cos, 6);
      lift = Math.max(lift, c.y - (CLAW_TOP - c.line));
      return c.line > 0.3;
    });
    expect(lift).toBeGreaterThan(0.001);
  });

  it('回停下降 lets the claw down after it gets home, onto a longer, slower pendulum', () => {
    const s = sim({ homeDrop: 5 });
    const let_out = 0.5 * winchSpeed(s.settings.dropSpeed);
    runUntil(s, () => s.claw.line >= let_out - 1e-9, 3);
    expect(s.claw.y).toBeCloseTo(CLAW_TOP - let_out, 3);
    // Next round starts from there, and the trolley's jolt swings it more slowly.
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    expect(s.claw.line).toBeCloseTo(let_out, 3);
    expect(pendulumLength(s.claw.y)).toBeCloseTo(pendulumLength(CLAW_TOP) + let_out, 3);
    // After the round it goes back up to the top stop, then down again once home.
    pressDrop(s);
    runUntil(s, () => s.phase === 'top');
    expect(s.claw.line).toBe(0);
    runUntil(s, () => s.phase === 'idle');
    runUntil(s, () => s.claw.line >= let_out - 1e-9, 3);
  });
});

describe('claw timing (下爪延遲 / 延遲收爪 / 下停上拉延遲 / 上停延遲 / 上停上拉)', () => {
  /** Seconds spent in each phase of one round dropped from home. */
  function phaseTimes(overrides: Partial<ClawSettings>) {
    const s = sim({ guaranteeN: 0, ...overrides });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    const times: Partial<Record<string, number>> = {};
    let last = s.phase;
    let since = 0;
    for (let t = 0; t < 30 && s.phase !== 'idle'; t += DT) {
      stepSim(s, DT);
      since += DT;
      if (s.phase !== last) { times[last] = since; since = 0; last = s.phase; }
    }
    return { s, times };
  }

  it('下爪延遲 holds the claw at the top for a moment before it drops', () => {
    const s = sim({ dropDelay: 0.5 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    for (let t = 0; t < 0.4; t += DT) stepSim(s, DT);
    expect(s.claw.line).toBe(0);
    for (let t = 0; t < 0.3; t += DT) stepSim(s, DT);
    expect(s.claw.line).toBeGreaterThan(0.01);
  });

  it('延遲收爪 + close + 下停上拉延遲 set how long the claw stays down', () => {
    const quick = phaseTimes({ closeDelay: 0, liftDelay: 0 }).times.closing ?? 0;
    const slow = phaseTimes({ closeDelay: 0.5, liftDelay: 1 }).times.closing ?? 0;
    expect(quick).toBeCloseTo(0.45, 1);
    expect(slow - quick).toBeCloseTo(1.5, 1);
  });

  it('延遲收爪 keeps the arms open while the claw sits', () => {
    const s = sim({ closeDelay: 0.6 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    runUntil(s, () => s.phase === 'closing');
    for (let t = 0; t < 0.4; t += DT) stepSim(s, DT);
    expect(s.closed).toBe(false);
    expect(s.claw.open).toBeGreaterThan(0.95);
  });

  it('上停延遲 sets how long the claw waits at the top', () => {
    expect(phaseTimes({ topDelay: 0.2 }).times.top).toBeCloseTo(0.2, 1);
    expect(phaseTimes({ topDelay: 1.5 }).times.top).toBeCloseTo(1.5, 1);
  });

  it('上停上拉 jerks the claw when it hits the top stop; 0 leaves it still', () => {
    const swingAtTop = (topPull: number) => {
      const s = sim({ topPull, dropLine: 0.6 });
      insertCoin(s);
      runUntil(s, () => s.phase === 'moving', 1);
      pressDrop(s);
      runUntil(s, () => s.phase === 'top');
      return Math.hypot(s.claw.swingVX, s.claw.swingVZ);
    };
    expect(swingAtTop(0)).toBeLessThan(1e-6);
    expect(swingAtTop(4)).toBeGreaterThan(1.5);
    expect(swingAtTop(8)).toBeGreaterThan(swingAtTop(2));
  });
});

describe('防甩片 (anti-swing plate)', () => {
  /** Rock the gantry hard for a few seconds with the claw at the top; return the widest swing (m). */
  function widestSwing(gap: number) {
    const s = sim({ playTime: 60, gantrySpeed: 10 });
    setAntiSwing(s, { gap, tilt: 0 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    let widest = 0;
    for (let t = 0; t < 3; t += DT) {
      stepSim(s, DT, { x: Math.floor(t / 0.3) % 2 ? 1 : -1, z: 0 });
      widest = Math.max(widest, Math.hypot(s.claw.hx - s.claw.x, s.claw.hz - s.claw.z));
    }
    return widest;
  }

  it('at the top the claw housing sits right under the plate, not dangling on its rope', () => {
    const s = sim();
    for (let t = 0; t < 0.5; t += DT) stepSim(s, DT);
    expect(s.claw.y + headTop(s.clawSpec)).toBeCloseTo(PLATE_Y - s.antiSwing.gap, 6);
    const tight = sim();
    setAntiSwing(tight, { gap: 0, tilt: 0 });
    expect(tight.claw.y + headTop(tight.clawSpec)).toBeCloseTo(PLATE_Y, 6);
  });

  it('a tight (鎖緊) plate stops the raised claw swinging; a looser one lets it swing a little', () => {
    expect(widestSwing(0)).toBeLessThan(0.002);
    const loose = widestSwing(0.03);
    expect(loose).toBeGreaterThan(0.01);
    expect(loose).toBeGreaterThan(widestSwing(0.01));
  });

  it('let down below the plate (回停下降), the claw swings freely again', () => {
    const s = sim({ playTime: 60, gantrySpeed: 10, homeDrop: 6 });
    setAntiSwing(s, { gap: 0, tilt: 0 });
    for (let t = 0; t < 2; t += DT) stepSim(s, DT);
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    let widest = 0;
    for (let t = 0; t < 3; t += DT) {
      stepSim(s, DT, { x: Math.floor(t / 0.45) % 2 ? 1 : -1, z: 0 });
      widest = Math.max(widest, Math.abs(s.claw.hx - s.claw.x));
    }
    expect(widest).toBeGreaterThan(0.03);
  });

  it('slamming into the plate at the top (上停上拉) jolts the grip; no pull, no jolt', () => {
    const joltAtTop = (topPull: number) => {
      const s = sim({ topPull, dropLine: 0.6 });
      setAntiSwing(s, { gap: 0, tilt: 0 });
      insertCoin(s);
      runUntil(s, () => s.phase === 'moving', 1);
      pressDrop(s);
      runUntil(s, () => s.phase === 'top');
      return s.jolt;
    };
    expect(joltAtTop(0)).toBeLessThan(0.01);
    expect(joltAtTop(5)).toBeGreaterThan(0.15);
  });

  it('a bent plate flicks a prize slipping at the top away from the hole (內丟)', () => {
    const throwAtTop = (tilt: number) => {
      const s = sim({ topPull: 0, dropLine: 0.6 });
      setAntiSwing(s, { gap: 0.01, tilt });
      insertCoin(s);
      runUntil(s, () => s.phase === 'moving', 1);
      pressDrop(s);
      runUntil(s, () => s.phase === 'top');
      return { x: s.throwX, z: s.throwZ, home: homeOf(s.chute) };
    };
    const flat = throwAtTop(0);
    expect(Math.hypot(flat.x, flat.z)).toBe(0);
    const bent = throwAtTop(45);
    // Pointing from the hole toward the middle of the cabinet.
    expect(bent.x * -bent.home.x + bent.z * -bent.home.z).toBeGreaterThan(0);
    expect(Math.hypot(bent.x, bent.z)).toBeGreaterThan(0.5);
  });

  it('a bent plate holds the claw leaning at the top, its bottom away from the hole', () => {
    const deg = (s: ClawSim) => (Math.hypot(s.claw.swingX, s.claw.swingZ) * 180) / Math.PI;
    const s = sim();
    setAntiSwing(s, { gap: 0, tilt: 30 }); // 鎖緊: the housing sits flush on the plate
    expect(deg(s)).toBeCloseTo(30, 1);
    const home = homeOf(s.chute);
    expect(s.claw.swingX * -home.x + s.claw.swingZ * -home.z).toBeGreaterThan(0);
    expect((s.claw.hx - s.claw.x) * -home.x + (s.claw.hz - s.claw.z) * -home.z).toBeGreaterThan(0);
    // Gravity doesn't win while the plate holds it.
    for (let t = 0; t < 2; t += DT) stepSim(s, DT, { x: 0, z: 0 });
    expect(deg(s)).toBeCloseTo(30, 1);

    // A gap lets it hang back toward plumb: part of the bend is lost, or all of it.
    setAntiSwing(s, { gap: 0.01, tilt: 30 });
    const partial = topLean(s.clawSpec, s.antiSwing);
    expect(partial).toBeGreaterThan(5);
    expect(partial).toBeLessThan(25);
    for (let t = 0; t < 2; t += DT) stepSim(s, DT, { x: 0, z: 0 });
    expect(deg(s)).toBeCloseTo(partial, 1);
    setAntiSwing(s, { gap: 0.03, tilt: 30 });
    expect(topLean(s.clawSpec, s.antiSwing)).toBe(0);
    expect(deg(s)).toBe(0);
    setAntiSwing(s, { gap: 0, tilt: 0 });
    expect(deg(s)).toBe(0);
  });

  it('let down clear of a bent plate, the claw swings back past plumb', () => {
    const s = sim({ dropLine: 4 });
    setAntiSwing(s, { gap: 0, tilt: 30 });
    const home = homeOf(s.chute);
    const n = Math.hypot(home.x, home.z);
    // Lean along the plate's bend (positive = bottom away from the hole).
    const lean = () => (s.claw.swingX * -home.x + s.claw.swingZ * -home.z) / n;
    const start = lean();
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    let least = Infinity;
    runUntil(s, () => {
      if (s.claw.line > 0.1) least = Math.min(least, lean());
      return s.phase !== 'dropping';
    });
    expect(start).toBeGreaterThan(0.4);
    expect(least).toBeLessThan(0);
  });

  it('sanitizes a stored plate setting into range', () => {
    expect(sanitizeAntiSwing(null)).toEqual(DEFAULT_ANTI_SWING);
    expect(sanitizeAntiSwing({ gap: -1, tilt: 99 })).toEqual({ gap: 0, tilt: 45 });
  });
});

describe('prize chute (出貨口)', () => {
  it('擋板 height is a real wall: rays (and prizes) stop on top of it; 0 means no wall', () => {
    const tall = sim();
    setChute(tall, { ...DEFAULT_CHUTE, wallH: 0.25 });
    const zMid = (tall.chute.minZ + tall.chute.maxZ) / 2;
    expect(surfaceHeightAt(tall, tall.chute.maxX, zMid)).toBeCloseTo(0.25, 2);
    const none = sim();
    setChute(none, { ...DEFAULT_CHUTE, wallH: 0 });
    expect(surfaceHeightAt(none, none.chute.maxX, zMid)).toBeLessThan(0.01);
  });

  it('縮洞: a plush too big for a shrunken hole wedges on the rim instead of falling in', () => {
    const dropInto = (width: number, depth: number) => {
      const s = sim();
      setChute(s, { width, depth, wallH: 0 });
      const home = homeOf(s.chute);
      const p = addPrize(s, home.x, home.z, { r: 0.08, y: 0.2 });
      settle(s, 2);
      return p;
    };
    expect(dropInto(0.23, 0.22).won).toBe(true);
    const stuck = dropInto(0.12, 0.12);
    expect(stuck.won).toBe(false);
    expect(stuck.y).toBeGreaterThan(0);
  });

  it('the claw parks over the new hole and carries prizes there', () => {
    const s = sim({ midPower: 40, weakPower: 40, guaranteeN: 0 });
    setChute(s, { width: 0.3, depth: 0.14, wallH: 0.1 });
    const home = homeOf(s.chute);
    expect(s.claw.x).toBeCloseTo(home.x, 6);
    addPrize(s, 0.15, -0.05, { r: 0.06 });
    playRound(s, 0.15, -0.05);
    expect(s.claw.x).toBeCloseTo(home.x, 2);
    expect(s.claw.z).toBeCloseTo(home.z, 2);
    expect(s.stats.wins).toBe(1);
  });

  it('keeps the cabinet count when a bigger hole opens up under the pile', () => {
    const s = createSim(defaultSettings(), { seed: 12, prizeCount: 50 });
    setChute(s, { width: 0.3, depth: 0.26, wallH: 0 });
    expect(prizesLeft(s)).toBe(50);
    // Some may lean out over the new hole's edge, propped up by the pile; all have come to rest.
    settle(s, 1);
    expect(prizesResting(s)).toBe(true);
  });

  it('sanitizes a stored chute into range, snapped to whole cm', () => {
    expect(sanitizeChute(null)).toEqual(DEFAULT_CHUTE);
    expect(sanitizeChute({ width: 0.05, depth: 0.5, wallH: 0.123 })).toEqual({ width: 0.12, depth: 0.26, wallH: 0.12 });
    expect(chuteFrom(DEFAULT_CHUTE)).toEqual(CHUTE);
  });
});

describe('待機爪子', () => {
  it('with 開爪 the claw waits and travels open, and opens again after each round', () => {
    const s = sim({ idleOpen: 1 });
    for (let t = 0; t < 1; t += DT) stepSim(s, DT);
    expect(s.claw.open).toBe(1);
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    for (let t = 0; t < 1; t += DT) stepSim(s, DT, { x: 1, z: 0 });
    expect(s.claw.open).toBe(1);
    pressDrop(s);
    runUntil(s, () => s.phase === 'idle');
    for (let t = 0; t < 1; t += DT) stepSim(s, DT);
    expect(s.claw.open).toBe(1);
  });

  it('with 合爪 (default) it waits shut', () => {
    const s = sim();
    for (let t = 0; t < 1; t += DT) stepSim(s, DT);
    expect(s.claw.open).toBe(0);
  });
});

describe('panel options', () => {
  it('time up with auto-drop on drops the claw', () => {
    const s = sim({ playTime: 10, autoDrop: 1 });
    insertCoin(s);
    const ev = runUntil(s, () => s.phase === 'dropping', 12);
    expect(ev.some((e) => e.type === 'timeUp')).toBe(true);
  });

  it('time up with auto-drop off ends the round without dropping', () => {
    const s = sim({ playTime: 10, autoDrop: 0 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    const ev = runUntil(s, () => s.phase === 'idle', 12);
    expect(ev.some((e) => e.type === 'timeUp')).toBe(true);
    expect(s.claw.y).toBe(CLAW_TOP);
  });

  it('mid-air grab closes the claw where the button was pressed again', () => {
    const s = sim({ midAirGrab: 1 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    runUntil(s, () => s.claw.y < 0.6);
    pressDrop(s);
    runUntil(s, () => s.phase !== 'dropping', 1);
    expect(s.phase).toBe('closing');
    expect(s.claw.y).toBeGreaterThan(0.5);
  });

  it('with mid-air grab off the second press is ignored', () => {
    const s = sim({ midAirGrab: 0 });
    insertCoin(s);
    runUntil(s, () => s.phase === 'moving', 1);
    pressDrop(s);
    runUntil(s, () => s.claw.y < 0.6);
    pressDrop(s);
    runUntil(s, () => s.phase !== 'dropping', 5);
    // Went all the way down: the default 下線長度 reaches the felt.
    expect(s.claw.y).toBeCloseTo(floorHubY(), 2);
  });

  it('returns home over the chute after every round', () => {
    const s = sim();
    playRound(s, 0.2, -0.2);
    expect(s.claw.x).toBeCloseTo(HOME.x, 2);
    expect(s.claw.z).toBeCloseTo(HOME.z, 2);
    expect(inChute(HOME.x, HOME.z)).toBe(true);
    expect(HOME.x).toBeLessThan(CHUTE.maxX);
  });
});
