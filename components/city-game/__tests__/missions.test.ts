import { describe, it, expect } from 'vitest';
import {
  MISSIONS,
  getMission,
  makeRng,
  pickCheckpoints,
  isPlaceable,
  estimateDriveTime,
  LANDMARKS,
} from '../missions';
import {
  createSession,
  tickMission,
  failMission,
  computeCourierBonus,
  computeTaxiTip,
  computeDeliveryPay,
  formatMissionTime,
  ABANDON_GRACE,
  STOPPED_SPEED,
  MissionTickInput,
} from '../missionRuntime';
import { OFFICE_MIN_FLOORS, generateWorld, getZoneName } from '../worldGen';
import { BuildingType, GRID_SIZE, TILE_SIZE, TileType, VehicleType, WorldData } from '../types';

const world: WorldData = generateWorld(42);

function input(over: Partial<MissionTickInput> = {}): MissionTickInput {
  return {
    px: 0, py: 0,
    speed: 0,
    playerState: 'inCar',
    vehicleType: null,
    vehicleId: null,
    wantedLevel: 0,
    dt: 1 / 60,
    nowMs: 1000,
    ...over,
  };
}

describe('mission catalogue', () => {
  it('has unique ids', () => {
    const ids = MISSIONS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places every marker somewhere the player can actually stand', () => {
    for (const def of MISSIONS) {
      const at = def.markerAt(world);
      if (def.passive) {
        expect(at).toBeNull();
        continue;
      }
      expect(at, `${def.id} has no marker`).not.toBeNull();
      expect(isPlaceable(world, at!), `${def.id} marker is inside geometry`).toBe(true);
    }
  });

  it('generates objectives that are all reachable, for many seeds', () => {
    const start = world.roadTiles[50];
    for (let seed = 1; seed <= 25; seed++) {
      const rng = makeRng(seed);
      for (const def of MISSIONS) {
        if (def.passive) continue;
        const objectives = def.build(world, rng, start);
        expect(objectives.length, `${def.id} produced no objectives`).toBeGreaterThan(0);
        for (const o of objectives) {
          // loseWanted has no position.
          if (o.kind === 'loseWanted') continue;
          expect(isPlaceable(world, o), `${def.id}/${o.kind} landed in geometry`).toBe(true);
        }
      }
    }
  });

  it('spreads courier checkpoints out', () => {
    const rng = makeRng(7);
    const start = world.roadTiles[10];
    const points = pickCheckpoints(world.roadTiles, 5, 300, rng, start);
    expect(points).toHaveLength(5);

    let prev = start;
    for (const p of points) {
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeGreaterThan(100);
      prev = p;
    }
  });

  it('is deterministic for a given seed', () => {
    const def = getMission('courier_civic')!;
    const start = world.roadTiles[10];
    const a = def.build(world, makeRng(99), start).map(o => [o.x, o.y]);
    const b = def.build(world, makeRng(99), start).map(o => [o.x, o.y]);
    expect(a).toEqual(b);
  });

  it('scales the courier time limit with the route length', () => {
    const start = { x: 0, y: 0 };
    const short = estimateDriveTime([{ x: 100, y: 0 }], start);
    const long = estimateDriveTime([{ x: 2000, y: 0 }], start);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(20);       // includes the fixed grace
  });

  it('defines enough landmarks for the sightseeing job', () => {
    expect(LANDMARKS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(LANDMARKS.map(l => l.id)).size).toBe(LANDMARKS.length);
  });

  it('puts every zone landmark somewhere in the city, so 8/8 is reachable', () => {
    // 辦公區 used to exist only on tiles that report a different zone name
    // first (the helipad and the Town Hall), so the tour could never finish.
    const zones = new Set<string>();
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        zones.add(getZoneName(world.grid, gx * TILE_SIZE + TILE_SIZE / 2, gy * TILE_SIZE + TILE_SIZE / 2));
      }
    }
    for (const l of LANDMARKS) {
      if (l.zone) expect(zones, `no tile reports ${l.zone}`).toContain(l.zone);
    }
  });

  it('makes the tall commercial buildings offices and leaves the low ones commercial', () => {
    let offices = 0;
    for (const row of world.grid) {
      for (const t of row) {
        if (t.type !== TileType.BUILDING) continue;
        if (t.buildingType === BuildingType.OFFICE) {
          offices++;
          expect(t.floors ?? 0).toBeGreaterThanOrEqual(OFFICE_MIN_FLOORS);
        }
        if (t.buildingType === BuildingType.COMMERCIAL) {
          expect(t.floors ?? 0).toBeLessThan(OFFICE_MIN_FLOORS);
        }
      }
    }
    expect(offices).toBeGreaterThan(20);
  });
});

describe('payout maths', () => {
  it('pays a courier bonus proportional to time left', () => {
    expect(computeCourierBonus(0, 100)).toBe(0);
    expect(computeCourierBonus(50, 100)).toBe(50);
    expect(computeCourierBonus(100, 100)).toBe(100);
    expect(computeCourierBonus(200, 100)).toBe(100);   // clamped
  });

  it('gives a bigger taxi tip for a faster trip and docks it for scrapes', () => {
    const fast = computeTaxiTip(80, 40, 50, 0);
    const slow = computeTaxiTip(80, 5, 50, 0);
    expect(fast).toBeGreaterThan(slow);

    const clean = computeTaxiTip(80, 40, 50, 0);
    const scraped = computeTaxiTip(80, 40, 50, 3);
    expect(scraped).toBeLessThan(clean);
  });

  it('never returns a negative tip', () => {
    expect(computeTaxiTip(80, 0, 50, 99)).toBe(0);
  });

  it('docks delivery pay per collision but never below zero', () => {
    expect(computeDeliveryPay(3, 60, 80, 0)).toBe(260);
    expect(computeDeliveryPay(3, 60, 80, 2)).toBe(220);
    expect(computeDeliveryPay(0, 60, 0, 99)).toBe(0);
  });

  it('formats the timer as m:ss', () => {
    expect(formatMissionTime(0)).toBe('0:00');
    expect(formatMissionTime(9)).toBe('0:09');
    expect(formatMissionTime(65)).toBe('1:05');
  });
});

describe('mission runtime', () => {
  const def = getMission('courier_civic')!;

  function activeSession(limit: number | null = 60) {
    const objectives = def.build(world, makeRng(3), world.roadTiles[10]);
    const s = createSession(def, objectives, limit, 1000);
    s.phase = 'active';
    return s;
  }

  it('does nothing while the brief is open', () => {
    const objectives = def.build(world, makeRng(3), world.roadTiles[10]);
    const s = createSession(def, objectives, 60, 1000);
    expect(s.phase).toBe('briefing');
    expect(tickMission(s, def, input())).toBe('none');
    expect(s.elapsed).toBe(0);
  });

  it('completes a reach objective only inside the radius', () => {
    const s = activeSession();
    const first = s.objectives[0];

    expect(tickMission(s, def, input({ px: first.x + 500, py: first.y }))).toBe('none');
    expect(s.currentIndex).toBe(0);

    expect(tickMission(s, def, input({ px: first.x, py: first.y }))).toBe('objective');
    expect(s.currentIndex).toBe(1);
    expect(first.done).toBe(true);
  });

  it('honours requireStopped', () => {
    const s = activeSession();
    s.objectives = [{
      id: 'x', text: 'stop here', kind: 'dropoff',
      x: 100, y: 100, radius: 40, requireStopped: true, done: false,
    }];
    s.currentIndex = 0;

    expect(tickMission(s, def, input({ px: 100, py: 100, speed: STOPPED_SPEED + 50 }))).toBe('none');
    expect(tickMission(s, def, input({ px: 100, py: 100, speed: 0 }))).toBe('success');
  });

  it('succeeds after the final objective', () => {
    const s = activeSession();
    let guard = 0;
    while (s.phase === 'active' && guard < 50) {
      guard++;
      const o = s.objectives[s.currentIndex];
      if (!o) break;
      tickMission(s, def, input({ px: o.x, py: o.y }));
    }
    expect(s.phase).toBe('success');
    expect(s.resultText).toContain('任務完成');
  });

  it('fails on timeout', () => {
    const s = activeSession(1);
    const event = tickMission(s, def, input({ dt: 2 }));
    expect(event).toBe('failed');
    expect(s.failReason).toBe('超時');
    expect(s.timeLeft).toBe(0);
  });

  it('never runs the clock on an untimed job', () => {
    const s = activeSession(null);
    tickMission(s, def, input({ dt: 100 }));
    expect(s.phase).toBe('active');
    expect(s.timeLeft).toBeNull();
  });

  it('fails after the abandon grace period expires', () => {
    const delivery = getMission('delivery_shop')!;
    const objectives = delivery.build(world, makeRng(5), world.roadTiles[10]);
    const s = createSession(delivery, objectives, null, 1000);
    s.phase = 'active';
    s.vehicleId = 'scooter-1';

    // Still aboard: the timer stays at zero.
    tickMission(s, delivery, input({ vehicleId: 'scooter-1', dt: 1 }));
    expect(s.abandonTimer).toBe(0);

    // On foot, the grace period runs out.
    tickMission(s, delivery, input({ vehicleId: null, dt: ABANDON_GRACE - 1 }));
    expect(s.phase).toBe('active');
    const event = tickMission(s, delivery, input({ vehicleId: null, dt: 2 }));
    expect(event).toBe('failed');
    expect(s.failReason).toBe('離開車輛');
  });

  it('binds the vehicle when the enterVehicle objective is met', () => {
    const delivery = getMission('delivery_shop')!;
    const objectives = delivery.build(world, makeRng(5), world.roadTiles[10]);
    const s = createSession(delivery, objectives, null, 1000);
    s.phase = 'active';

    expect(tickMission(s, delivery, input({ vehicleType: VehicleType.CAR, vehicleId: 'car-1' }))).toBe('none');
    const event = tickMission(s, delivery, input({
      vehicleType: VehicleType.DELIVERY_SCOOTER,
      vehicleId: 'scooter-1',
    }));
    expect(event).toBe('objective');
    expect(s.vehicleId).toBe('scooter-1');
  });

  it('completes the getaway job only once the player is clean', () => {
    const getaway = getMission('getaway')!;
    const s = createSession(getaway, getaway.build(world, makeRng(1), world.roadTiles[10]), 90, 1000);
    s.phase = 'active';

    expect(tickMission(s, getaway, input({ wantedLevel: 2 }))).toBe('none');
    expect(tickMission(s, getaway, input({ wantedLevel: 0 }))).toBe('success');
  });

  it('reports a taxi drop-off as a fare rather than the end of the job', () => {
    const taxi = getMission('taxi_job')!;
    const s = createSession(taxi, [
      { id: 'd', text: 'drop', kind: 'dropoff', x: 0, y: 0, radius: 40, done: false },
    ], null, 1000);
    s.phase = 'active';

    expect(tickMission(s, taxi, input({ px: 0, py: 0 }))).toBe('fare');
    expect(s.faresCompleted).toBe(1);
    expect(s.phase).toBe('active');
  });

  it('ignores further ticks once the run has ended', () => {
    const s = activeSession();
    failMission(s, '放棄任務', 2000);
    expect(s.phase).toBe('failed');
    expect(tickMission(s, def, input())).toBe('none');

    // A later failure must not overwrite the recorded reason.
    failMission(s, '超時', 3000);
    expect(s.failReason).toBe('放棄任務');
  });
});
