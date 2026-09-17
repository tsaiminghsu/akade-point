import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAutopilot,
  planAutopilot,
  stepAutopilot,
  AutopilotCtx,
  AUTOPILOT_SPEED_FRACTION,
  AUTOPILOT_CORNER_SPEED,
  AUTOPILOT_ARRIVE_RADIUS,
  AUTOPILOT_STUCK_TIME,
} from '../autopilot';
import { generateWorld, isDrivable } from '../worldGen';
import { GameEngine3D } from '../engine3d';
import { Vehicle, VehicleType, WorldData, TILE_SIZE } from '../types';

const world: WorldData = generateWorld(42);
const MAX = 160;
const STEER = 2.2;
const DT = 1 / 60;

function makeCar(x: number, y: number, angle = 0): Vehicle {
  return {
    id: 'player-car', type: VehicleType.CAR, x, y, angle, speed: 0, maxSpeed: MAX,
    color: '#0bc', width: 16, height: 26, occupant: 'player',
    waypoints: [], waypointIndex: 0, hp: 100, vx: 0, vy: 0,
  };
}

function ctxFor(vehicles = new Map<string, Vehicle>(), peds?: AutopilotCtx['peds']): AutopilotCtx {
  return { vehicles, peds, maxSpeed: MAX, steerRate: STEER, dt: DT };
}

/**
 * Minimal stand-in for the engine's car physics: apply the drive the same way
 * `updateCarPhysics` does (px/s, friction, handbrake), without collisions.
 */
function integrate(car: Vehicle, drive: { up: boolean; brake: boolean; steer: number }) {
  car.angle += drive.steer;
  if (drive.up) car.speed = Math.min(MAX, car.speed + 280 * DT);
  else { car.speed *= Math.pow(1 - 0.06, DT * 60); if (Math.abs(car.speed) < 0.5) car.speed = 0; }
  if (drive.brake) car.speed *= Math.pow(0.7, DT * 60);
  car.x += Math.sin(car.angle) * car.speed * DT;
  car.y -= Math.cos(car.angle) * car.speed * DT;
}

/** A road tile on the same vertical road column, `tiles` tiles north of `from`. */
function northOf(from: { x: number; y: number }, tiles: number) {
  return { x: from.x, y: from.y - tiles * TILE_SIZE };
}

// A ROAD_V tile with plenty of straight road above it: column 88 (a road at 160²), row 100.
const START = { x: 88 * TILE_SIZE + 20, y: 100 * TILE_SIZE + 20 };

describe('planAutopilot', () => {
  it('produces a lane-following path that stays on drivable tiles', () => {
    const s = createAutopilot();
    const car = makeCar(START.x, START.y);
    planAutopilot(s, world, car, northOf(START, 12));
    expect(s.path.length).toBeGreaterThan(5);
    for (const p of s.path) {
      expect(isDrivable(world.grid, p.x, p.y), `${p.x},${p.y} off road`).toBe(true);
    }
    expect(s.arrived).toBe(false);
    expect(s.index).toBe(0);
  });

  it('keeps to the right-hand lane when heading north', () => {
    const s = createAutopilot();
    planAutopilot(s, world, makeCar(START.x, START.y), northOf(START, 6));
    // Northbound traffic drives on the +x side of the road centre line.
    const mid = s.path[Math.floor(s.path.length / 2)];
    expect(mid.x).toBeGreaterThan(START.x);
  });
});

describe('stepAutopilot on a straight road', () => {
  let s: ReturnType<typeof createAutopilot>;
  let car: Vehicle;

  beforeEach(() => {
    s = createAutopilot();
    car = makeCar(START.x, START.y);
    planAutopilot(s, world, car, northOf(START, 14));
    s.active = true;
  });

  it('accelerates to the cruise limit and never above it', () => {
    let peak = 0;
    for (let i = 0; i < 240; i++) {
      const d = stepAutopilot(s, car, ctxFor());
      integrate(car, d);
      peak = Math.max(peak, car.speed);
    }
    const limit = MAX * AUTOPILOT_SPEED_FRACTION;
    expect(peak).toBeLessThanOrEqual(limit + 6);
    expect(car.speed).toBeGreaterThan(limit * 0.8);
    // It has actually driven north.
    expect(car.y).toBeLessThan(START.y - 200);
  });

  it('faces the road direction while driving', () => {
    for (let i = 0; i < 120; i++) integrate(car, stepAutopilot(s, car, ctxFor()));
    // Heading ≈ north (0 rad), allowing for the lane change at the start.
    expect(Math.abs(Math.atan2(Math.sin(car.angle), Math.cos(car.angle)))).toBeLessThan(0.35);
  });

  it('brakes for a car directly ahead and resumes when it is gone', () => {
    for (let i = 0; i < 90; i++) integrate(car, stepAutopilot(s, car, ctxFor()));
    const cruising = car.speed;
    expect(cruising).toBeGreaterThan(40);

    const blocker = makeCar(car.x + Math.sin(car.angle) * 40, car.y - Math.cos(car.angle) * 40);
    blocker.id = 'npc';
    blocker.occupant = 'npc';
    const vehicles = new Map<string, Vehicle>([[blocker.id, blocker]]);
    const d = stepAutopilot(s, car, ctxFor(vehicles));
    expect(d.brake).toBe(true);
    expect(d.up).toBe(false);
    expect(d.targetSpeed).toBeLessThan(cruising * 0.4);

    const after = stepAutopilot(s, car, ctxFor());
    expect(after.targetSpeed).toBeGreaterThan(d.targetSpeed);
  });

  it('brakes for a pedestrian ahead', () => {
    for (let i = 0; i < 90; i++) integrate(car, stepAutopilot(s, car, ctxFor()));
    const peds = { forwardPedDistance: vi.fn(() => 20) };
    const d = stepAutopilot(s, car, ctxFor(new Map(), peds));
    expect(peds.forwardPedDistance).toHaveBeenCalled();
    expect(d.targetSpeed).toBe(0);
    expect(d.brake).toBe(true);
  });

  it('eases off and stops inside the arrival radius', () => {
    let arrived = false;
    for (let i = 0; i < 60 * 30 && !arrived; i++) {
      const d = stepAutopilot(s, car, ctxFor());
      integrate(car, d);
      arrived = d.arrived;
    }
    expect(arrived).toBe(true);
    const dest = northOf(START, 14);
    expect(Math.hypot(car.x - dest.x, car.y - dest.y)).toBeLessThan(AUTOPILOT_ARRIVE_RADIUS + 5);
    expect(Math.abs(car.speed)).toBeLessThan(2);
  });
});

describe('stepAutopilot corners and recovery', () => {
  it('slows before a sharp turn', () => {
    const s = createAutopilot();
    const car = makeCar(START.x, START.y);
    // Destination one block west along the row above: forces a 90° turn.
    planAutopilot(s, world, car, { x: START.x - 8 * TILE_SIZE, y: START.y - 8 * TILE_SIZE });
    s.active = true;
    let minLimitNearCorner = Infinity;
    for (let i = 0; i < 60 * 12; i++) {
      const d = stepAutopilot(s, car, ctxFor());
      integrate(car, d);
      // Sample the target speed when the next bend is close.
      const t = s.path[s.index];
      const n = s.path[s.index + 1];
      if (t && n) {
        const h1 = Math.atan2(t.x - car.x, -(t.y - car.y));
        const h2 = Math.atan2(n.x - t.x, -(n.y - t.y));
        const bend = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
        if (bend > Math.PI / 4 && Math.hypot(t.x - car.x, t.y - car.y) < 60) {
          minLimitNearCorner = Math.min(minLimitNearCorner, d.targetSpeed);
        }
      }
    }
    expect(minLimitNearCorner).toBeLessThanOrEqual(AUTOPILOT_CORNER_SPEED);
  });

  it('drops the route once when stuck, then gives up', () => {
    const s = createAutopilot();
    const car = makeCar(START.x, START.y);
    planAutopilot(s, world, car, northOf(START, 10));
    s.active = true;

    // Never move the car: the first stuck sample forces a re-plan.
    const ticks = Math.ceil(AUTOPILOT_STUCK_TIME / DT) + 1;
    let lost = false;
    for (let i = 0; i < ticks; i++) lost = stepAutopilot(s, car, ctxFor()).lost || lost;
    expect(lost).toBe(false);
    expect(s.replans).toBe(1);
    expect(s.path).toHaveLength(0);

    // Engine would re-plan here; simulate that, then stay stuck again.
    planAutopilot(s, world, car, northOf(START, 10));
    s.replans = 1;
    for (let i = 0; i < ticks; i++) lost = stepAutopilot(s, car, ctxFor()).lost || lost;
    expect(lost).toBe(true);
  });
});

/** In-memory localStorage so the engine's save layer works in node. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

describe('engine integration', () => {
  let engine: GameEngine3D;

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    engine = new GameEngine3D();
  });

  /** Advance the engine, collecting every notification text it raises. */
  function tick(n: number, seen: Set<string> = new Set()) {
    for (let i = 0; i < n; i++) {
      engine.update(DT, 1000 + i * DT * 1000);
      for (const note of engine.notifications) seen.add(note.text);
    }
    return seen;
  }

  /** Run one tick with some input fields forced on (simulates key presses). */
  function tickWith(over: Partial<ReturnType<typeof engine.input.getState>>) {
    const original = engine.input.getState.bind(engine.input);
    const spy = vi.spyOn(engine.input, 'getState').mockImplementation((a, b, c) => ({
      ...original(a, b, c), ...over,
    }));
    engine.update(DT, 5000);
    spy.mockRestore();
  }

  it('refuses to engage without a waypoint, and on foot', () => {
    engine.toggleAutopilot();
    expect(engine.autopilot.active).toBe(false);
    expect(engine.notifications.at(-1)?.text).toContain('路標');

    engine.setWaypoint(engine.player.x, engine.player.y - 400);
    engine.player.state = 'onFoot';
    engine.toggleAutopilot();
    expect(engine.autopilot.active).toBe(false);
    expect(engine.notifications.at(-1)?.text).toContain('車上');
  });

  it('drives the player car to a user waypoint and then disengages', () => {
    const sx = engine.player.x;
    const sy = engine.player.y;
    engine.setWaypoint(sx, sy - 12 * TILE_SIZE);
    engine.toggleAutopilot();
    expect(engine.autopilot.active).toBe(true);

    const seen = tick(60 * 25);

    const wx = sx;
    const wy = sy - 12 * TILE_SIZE;
    expect(Math.hypot(engine.player.x - wx, engine.player.y - wy)).toBeLessThan(70);
    expect(engine.autopilot.active).toBe(false);
    expect(engine.waypoint.active).toBe(false);
    expect([...seen].some(t => t.includes('到達'))).toBe(true);
  });

  it('hands control back the moment the player touches the controls', () => {
    engine.setWaypoint(engine.player.x, engine.player.y - 8 * TILE_SIZE);
    engine.toggleAutopilot();
    tick(30);
    expect(engine.autopilot.active).toBe(true);

    tickWith({ left: true });

    expect(engine.autopilot.active).toBe(false);
    expect(engine.notifications.at(-1)?.text).toContain('手動接管');
  });

  it('disengages when the player leaves the car', () => {
    engine.setWaypoint(engine.player.x, engine.player.y - 8 * TILE_SIZE);
    engine.toggleAutopilot();
    tick(10);
    tickWith({ enter: true });
    expect(engine.player.state).toBe('onFoot');
    expect(engine.autopilot.active).toBe(false);
  });

  it('toggles from the C key and keeps following a moved waypoint', () => {
    engine.setWaypoint(engine.player.x, engine.player.y - 8 * TILE_SIZE);
    tickWith({ autopilot: true });
    expect(engine.autopilot.active).toBe(true);
    const firstKey = engine.autopilot.destKey;

    // Re-point the map while driving: the route is re-planned, not dropped.
    engine.setWaypoint(engine.player.x + 8 * TILE_SIZE, engine.player.y - 8 * TILE_SIZE);
    tick(2);
    expect(engine.autopilot.active).toBe(true);
    expect(engine.autopilot.destKey).not.toBe(firstKey);

    tickWith({ autopilot: true });
    expect(engine.autopilot.active).toBe(false);
  });

  it('reports status to the HUD', () => {
    let hud: { autopilot: { active: boolean; distance: number; target: string } | null } | null = null;
    engine.setHUDCallback(d => { hud = d; });
    engine.setWaypoint(engine.player.x, engine.player.y - 8 * TILE_SIZE);
    engine.toggleAutopilot();
    tick(12);
    expect(hud!.autopilot?.active).toBe(true);
    expect(hud!.autopilot?.target).toBe('user');
    expect(hud!.autopilot!.distance).toBeGreaterThan(0);
  });
});
