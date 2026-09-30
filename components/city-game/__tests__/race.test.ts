import { describe, it, expect } from 'vitest';
import {
  checkGateCrossing,
  checkGateFrameHit,
  getGateRespawnPos,
  formatRaceTime,
  formatDelta,
  createRaceSession,
  tickRace,
  getRaceStars,
} from '../race';
import type { RaceGate, RaceCourse, RaceSession } from '../types';

/** A gate facing north (yaw 0) at the world origin, in world px / 3D-unit mix. */
function gate(over: Partial<RaceGate> = {}): RaceGate {
  return {
    id: 'g0', order: 0,
    x: 1000, y: 1000, altitude: 15, yaw: 0,
    width: 6, height: 4, thickness: 0.25,
    shape: 'rectangle', glow: true,
    ...over,
  };
}

function course(gates: RaceGate[], over: Partial<RaceCourse> = {}): RaceCourse {
  return {
    id: 'test_course', name: 'Test', description: '', gates,
    totalLaps: 1, difficulty: 'easy', color: '#fff', parTime: 60,
    ...over,
  };
}

describe('checkGateCrossing', () => {
  it('detects a straight flight through the opening, in the correct direction', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0, width: 6, height: 4, altitude: 15 });
    // Approaching from the south (larger y), flying north (decreasing y) — the
    // plane normal for yaw=0 is (sin0,-cos0) = (0,-1), so "in front" is smaller y.
    const hit = checkGateCrossing(1000, 1020, 15, 1000, 980, 15, g);
    expect(hit).toBe(true);
  });

  it('rejects crossing in the wrong direction', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0 });
    // From north to south — opposite of the gate's intended direction.
    const hit = checkGateCrossing(1000, 980, 15, 1000, 1020, 15, g);
    expect(hit).toBe(false);
  });

  it('rejects a crossing outside the horizontal opening', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0, width: 6 }); // half-width 3 units = 30 px
    const hit = checkGateCrossing(1050, 1020, 15, 1050, 980, 15, g);
    expect(hit).toBe(false);
  });

  it('rejects a crossing outside the vertical opening', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0, altitude: 15, height: 4 }); // half-height 2 units = 20 alt
    const hit = checkGateCrossing(1000, 1020, 60, 1000, 980, 60, g);
    expect(hit).toBe(false);
  });

  it('does not fire when both points stay on the same side', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0 });
    const hit = checkGateCrossing(1000, 1020, 15, 1000, 1010, 15, g);
    expect(hit).toBe(false);
  });

  it('respects gate yaw when computing the opening axis', () => {
    // yaw = PI/2: normal points +x, opening spans along y.
    const g = gate({ x: 1000, y: 1000, yaw: Math.PI / 2, width: 6, height: 4, altitude: 15 });
    const hit = checkGateCrossing(980, 1000, 15, 1020, 1000, 15, g);
    expect(hit).toBe(true);
  });
});

describe('checkGateFrameHit', () => {
  const g = gate({ x: 1000, y: 1000, yaw: 0, width: 6, height: 4, thickness: 0.25, altitude: 15 });

  it('is false in the middle of the opening', () => {
    expect(checkGateFrameHit(1000, 1000, 15, g)).toBe(false);
  });

  it('is true just outside the opening but inside the outer frame', () => {
    // Half-width opening = 3 units = 30 px; frame extends width/2 + thickness = 3.25 units = 32.5 px.
    expect(checkGateFrameHit(1031, 1000, 15, g)).toBe(true);
  });

  it('is false well outside the frame entirely', () => {
    expect(checkGateFrameHit(1100, 1000, 15, g)).toBe(false);
  });

  it('is false far from the gate plane even if laterally aligned', () => {
    expect(checkGateFrameHit(1000, 1000, 15, gate({ x: 1000, y: 1200, yaw: 0 }))).toBe(false);
  });

  it('checks the vertical frame band the same way', () => {
    // altitude 15, half-height 2 units = 20 alt; frame extends to 2.25 = 22.5.
    expect(checkGateFrameHit(1000, 1000, 15 + 21, g)).toBe(true);
    expect(checkGateFrameHit(1000, 1000, 15 + 10, g)).toBe(false);
  });
});

describe('getGateRespawnPos', () => {
  it('places the drone 80px behind the gate, facing through it', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0, altitude: 40 });
    const pos = getGateRespawnPos(g);
    expect(pos.x).toBeCloseTo(1000, 5);
    expect(pos.y).toBeCloseTo(1080, 5); // behind = +y for yaw 0
    expect(pos.altitude).toBe(40);
    expect(pos.angle).toBe(0);
  });

  it('rotates the offset with yaw', () => {
    const g = gate({ x: 1000, y: 1000, yaw: Math.PI / 2 });
    const pos = getGateRespawnPos(g);
    expect(pos.x).toBeCloseTo(920, 5); // behind = -x for yaw PI/2
    expect(pos.y).toBeCloseTo(1000, 5);
  });
});

describe('formatRaceTime / formatDelta', () => {
  it('formats zero and negative as the floor value', () => {
    expect(formatRaceTime(0)).toBe('0:00.000');
    expect(formatRaceTime(-5)).toBe('0:00.000');
  });

  it('formats sub-minute times with millisecond precision', () => {
    expect(formatRaceTime(12.345)).toBe('0:12.345');
  });

  it('carries minutes correctly', () => {
    expect(formatRaceTime(75.5)).toBe('1:15.500');
  });

  it('signs a delta', () => {
    expect(formatDelta(3.2)).toBe('+0:03.200');
    expect(formatDelta(-3.2)).toBe('-0:03.200');
  });
});

describe('createRaceSession', () => {
  it('starts in countdown with a fresh, empty session', () => {
    const c = course([gate()], { totalLaps: 2 });
    const s = createRaceSession(c);
    expect(s.phase).toBe('countdown');
    expect(s.countdownValue).toBe(3);
    expect(s.currentLap).toBe(1);
    expect(s.totalLaps).toBe(2);
    expect(s.currentGateIndex).toBe(0);
    expect(s.lapTimes).toEqual([]);
    expect(s.bestLap).toBe(0);
  });
});

describe('tickRace: countdown', () => {
  it('ticks the countdown down to GO and starts racing', () => {
    const c = course([gate()]);
    const s = createRaceSession(c);
    for (let i = 0; i < 3; i++) {
      const ev = tickRace(s, 0, 0, 0, 0, 0, 0, c, 1.0, 1000 + i * 1000, false, false);
      expect(ev).toBe('none');
    }
    expect(s.phase).toBe('racing');
    expect(s.countdownValue).toBe(0);
    expect(s.startTime).toBe(3000);
    expect(s.lapStartTime).toBe(3000);
  });
});

describe('tickRace: gate / lap / finish progression', () => {
  const g0 = gate({ id: 'g0', order: 0, x: 1000, y: 1000, yaw: 0 });
  const g1 = gate({ id: 'g1', order: 1, x: 1000, y: 900, yaw: 0 });

  function racingSession(c: RaceCourse): RaceSession {
    const s = createRaceSession(c);
    s.phase = 'racing';
    s.startTime = 0;
    s.lapStartTime = 0;
    s.lastGateTime = 0;
    return s;
  }

  it('advances through gates one at a time', () => {
    const c = course([g0, g1], { totalLaps: 1 });
    const s = racingSession(c);

    const ev1 = tickRace(s, 1000, 1020, 15, 1000, 980, 15, c, 1 / 60, 500, false, false);
    expect(ev1).toBe('gate');
    expect(s.currentGateIndex).toBe(1);
    expect(s.splitTimes).toHaveLength(1);
  });

  it('only tests the current gate — crossing gate 2 early does nothing', () => {
    const c = course([g0, g1], { totalLaps: 1 });
    const s = racingSession(c);
    // Fly through where gate 1 is without having passed gate 0.
    const ev = tickRace(s, 1000, 920, 15, 1000, 880, 15, c, 1 / 60, 500, false, false);
    expect(ev).toBe('none');
    expect(s.currentGateIndex).toBe(0);
  });

  it('finishes a single-lap course on the last gate', () => {
    const c = course([g0, g1], { totalLaps: 1 });
    const s = racingSession(c);
    s.currentGateIndex = 1;
    const ev = tickRace(s, 1000, 920, 15, 1000, 880, 15, c, 1 / 60, 4000, false, false);
    expect(ev).toBe('finish');
    expect(s.phase).toBe('finished');
    expect(s.lapTimes).toHaveLength(1);
    expect(s.bestLap).toBe(4);
  });

  it('starts a new lap instead of finishing when more laps remain', () => {
    const c = course([g0, g1], { totalLaps: 2 });
    const s = racingSession(c);
    s.currentGateIndex = 1;
    s.splitTimes = [1.2];
    const ev = tickRace(s, 1000, 920, 15, 1000, 880, 15, c, 1 / 60, 5000, false, false);
    expect(ev).toBe('lap');
    expect(s.phase).toBe('racing');
    expect(s.currentLap).toBe(2);
    expect(s.currentGateIndex).toBe(0);
    expect(s.splitTimes).toHaveLength(0);
    expect(s.lapTimes).toHaveLength(1);
    expect(s.lapStartTime).toBe(5000);
  });

  it('tracks the best lap across multiple laps', () => {
    const c = course([g0], { totalLaps: 3 });
    const s = racingSession(c);
    // Lap 1: 5s.
    s.lapStartTime = 0;
    tickRace(s, 1000, 1020, 15, 1000, 980, 15, c, 1 / 60, 5000, false, false);
    expect(s.bestLap).toBe(5);
    // Lap 2: 3s — faster, becomes the new best.
    s.lapStartTime = 5000;
    tickRace(s, 1000, 1020, 15, 1000, 980, 15, c, 1 / 60, 8000, false, false);
    expect(s.bestLap).toBe(3);
    // Lap 3: 9s — slower, best lap unchanged, and the course finishes.
    s.lapStartTime = 8000;
    const ev = tickRace(s, 1000, 1020, 15, 1000, 980, 15, c, 1 / 60, 17000, false, false);
    expect(ev).toBe('finish');
    expect(s.bestLap).toBe(3);
    expect(s.lapTimes).toEqual([5, 3, 9]);
  });
});

describe('tickRace: crash / respawn / crash-loop protection', () => {
  function racingSession(c: RaceCourse): RaceSession {
    const s = createRaceSession(c);
    s.phase = 'racing';
    return s;
  }

  it('crashes on collision and starts the auto-respawn timer', () => {
    const c = course([gate()]);
    const s = racingSession(c);
    const ev = tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1000, false, true);
    expect(ev).toBe('crash');
    expect(s.phase).toBe('crashed');
    expect(s.crashCount).toBe(1);
    expect(s.crashesAtCurrentGate).toBe(1);
    expect(s.autoRespawnTimer).toBe(2.0);
  });

  it('crashes on hitting the gate frame', () => {
    const g = gate({ x: 1000, y: 1000, yaw: 0, width: 6, height: 4, thickness: 0.25 });
    const c = course([g]);
    const s = racingSession(c);
    const ev = tickRace(s, 1031, 1000, 15, 1031, 1000, 15, c, 1 / 60, 1000, false, false);
    expect(ev).toBe('crash');
    expect(s.phase).toBe('crashed');
  });

  it('ignores collisions during the post-respawn invincibility window', () => {
    const c = course([gate()]);
    const s = racingSession(c);
    s.respawnInvincTimer = 1.0;
    const ev = tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1000, false, true);
    expect(ev).toBe('none');
    expect(s.phase).toBe('racing');
    expect(s.respawnInvincTimer).toBeCloseTo(1.0 - 1 / 60, 5);
  });

  it('respawns automatically once the timer elapses', () => {
    const c = course([gate()]);
    const s = racingSession(c);
    s.phase = 'crashed';
    s.autoRespawnTimer = 0.01;
    const ev = tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1000, false, false);
    expect(ev).toBe('respawn');
    expect(s.phase).toBe('racing');
  });

  it('steps back a gate after 3 crashes at the same gate', () => {
    const c = course([gate(), gate({ id: 'g1', order: 1 })]);
    const s = racingSession(c);
    s.currentGateIndex = 1;
    s.crashesAtCurrentGate = 3;
    s.phase = 'crashed';
    s.autoRespawnTimer = 0.01;
    tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1000, false, false);
    expect(s.currentGateIndex).toBe(0);
    expect(s.lastPassedGateIndex).toBe(-1);
    expect(s.crashesAtCurrentGate).toBe(0);
  });

  it('does not step back past gate 0', () => {
    const c = course([gate()]);
    const s = racingSession(c);
    s.currentGateIndex = 0;
    s.crashesAtCurrentGate = 3;
    s.phase = 'crashed';
    s.autoRespawnTimer = 0.01;
    tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1000, false, false);
    expect(s.currentGateIndex).toBe(0);
  });

  it('resets the crash-at-gate counter once a gate is actually passed', () => {
    const g0 = gate({ id: 'g0', order: 0, x: 1000, y: 1000, yaw: 0 });
    const c = course([g0, gate({ id: 'g1', order: 1 })]);
    const s = racingSession(c);
    s.crashesAtCurrentGate = 2;
    tickRace(s, 1000, 1020, 15, 1000, 980, 15, c, 1 / 60, 1000, false, false);
    expect(s.crashesAtCurrentGate).toBe(0);
  });

  it('does nothing further once finished', () => {
    const c = course([gate()]);
    const s = racingSession(c);
    s.phase = 'finished';
    const ev = tickRace(s, 1000, 1020, 15, 1000, 980, 15, c, 1 / 60, 1000, false, false);
    expect(ev).toBe('none');
  });
});

describe('tickRace: boost', () => {
  it('activates on input, runs its timer, then enters cooldown', () => {
    const c = course([gate()]);
    const s = createRaceSession(c);
    s.phase = 'racing';

    tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1000, true, false);
    expect(s.boostActive).toBe(true);
    expect(s.boostTimer).toBeCloseTo(0.5, 5);

    // Re-pressing input while active does not restart or double the timer.
    tickRace(s, 0, 0, 0, 0, 0, 0, c, 0.3, 1300, true, false);
    expect(s.boostActive).toBe(true);
    expect(s.boostTimer).toBeCloseTo(0.2, 5);

    // The tick that lets boostTimer expire also immediately ticks the freshly
    // set cooldown down by this same dt — both blocks run unconditionally.
    tickRace(s, 0, 0, 0, 0, 0, 0, c, 0.3, 1600, false, false);
    expect(s.boostActive).toBe(false);
    expect(s.boostCooldown).toBeCloseTo(2.7, 5);

    // Cannot re-trigger during cooldown.
    tickRace(s, 0, 0, 0, 0, 0, 0, c, 1 / 60, 1610, true, false);
    expect(s.boostActive).toBe(false);
  });

  it('cools down to exactly zero, never negative', () => {
    const c = course([gate()]);
    const s = createRaceSession(c);
    s.phase = 'racing';
    s.boostCooldown = 0.1;
    tickRace(s, 0, 0, 0, 0, 0, 0, c, 1.0, 1000, false, false);
    expect(s.boostCooldown).toBe(0);
  });
});

describe('getRaceStars', () => {
  const c = course([gate()], { parTime: 60 });

  it('is zero unless finished', () => {
    const s = createRaceSession(c);
    s.phase = 'racing';
    s.lapTimes = [10];
    expect(getRaceStars(s, c)).toBe(0);
  });

  it('awards 3 stars for a clean run under par', () => {
    const s = createRaceSession(c);
    s.phase = 'finished';
    s.crashCount = 0;
    s.lapTimes = [50];
    expect(getRaceStars(s, c)).toBe(3);
  });

  it('awards 2 stars for a few crashes within 1.5x par', () => {
    const s = createRaceSession(c);
    s.phase = 'finished';
    s.crashCount = 2;
    s.lapTimes = [80];
    expect(getRaceStars(s, c)).toBe(2);
  });

  it('falls back to 1 star when slow or crash-heavy', () => {
    const s = createRaceSession(c);
    s.phase = 'finished';
    s.crashCount = 5;
    s.lapTimes = [80];
    expect(getRaceStars(s, c)).toBe(1);
  });

  it('sums lap times across a multi-lap course', () => {
    const s = createRaceSession(c);
    s.phase = 'finished';
    s.crashCount = 0;
    s.lapTimes = [30, 29];
    expect(getRaceStars(s, c)).toBe(3); // 59 <= 60
    s.lapTimes = [30, 31];
    expect(getRaceStars(s, c)).toBe(2); // 61 > 60 but <= 90
  });
});
