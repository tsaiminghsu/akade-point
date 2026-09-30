import { describe, it, expect, vi } from 'vitest';
import {
  AI_ARRIVE_SPEED,
  AI_CORNER_SPEED,
  applyTrafficLanes,
  ensureTraffic,
  isLiveNpcCar,
  moveVehicleTowardWaypoint,
  updateTraffic,
} from '../traffic';
import { PoliceSystem } from '../police';
import { GameEngine3D } from '../engine3d';
import { generateWorld } from '../worldGen';
import { Point, Vehicle, VehicleType, WorldData } from '../types';
import { SIM_HZ } from '../timestep';

const DT = 1 / 60;
const world: WorldData = generateWorld(42);

function makeCar(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'npc', type: VehicleType.NPC_CAR, x: 0, y: 0, angle: Math.PI / 2, speed: 0, maxSpeed: 2.2,
    color: '#0bc', width: 16, height: 26, occupant: 'npc',
    waypoints: [], waypointIndex: 0, npcState: 'driving', hp: 100,
    ...over,
  };
}

/** Tile centres as findRoadPath returns them: one point per 40 px tile. */
function tileRun(from: Point, legs: Array<[dx: number, dy: number, tiles: number]>): Point[] {
  const out: Point[] = [];
  let { x, y } = from;
  for (const [dx, dy, n] of legs) {
    for (let i = 0; i < n; i++) {
      x += dx * 40;
      y += dy * 40;
      out.push({ x, y });
    }
  }
  return out;
}

/** A car on the right-hand lane at `start`, facing east, with the lane route. */
function carOnRoute(start: Point, legs: Array<[number, number, number]>, over: Partial<Vehicle> = {}) {
  const waypoints = applyTrafficLanes(tileRun(start, legs), start);
  return makeCar({ x: start.x, y: waypoints[0].y, waypoints, ...over });
}

describe('route following', () => {
  it('cruises at top speed along a route with a point on every tile', () => {
    const v = carOnRoute({ x: 20, y: 20 }, [[1, 0, 30]]);
    for (let i = 0; i < 60; i++) moveVehicleTowardWaypoint(v, DT); // pull away
    const x0 = v.x;
    for (let i = 0; i < 120; i++) moveVehicleTowardWaypoint(v, DT);
    const pxPerSecond = (v.x - x0) / 2;
    // Top speed is 2.2 px/frame = 132 px/s. The old slow zone before every
    // waypoint held this to single figures.
    expect(pxPerSecond).toBeGreaterThan(0.97 * 2.2 * SIM_HZ);
  });

  it('brakes for a corner, takes it at corner speed and stays in its lane', () => {
    // Five tiles east, then north; the northbound lane is 9 px east of centre.
    const v = carOnRoute({ x: 20, y: 420 }, [[1, 0, 5], [0, -1, 8]], { speed: 2.2 });
    const laneX = 220 + 9;
    let minSpeed = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 60 * 4; i++) {
      moveVehicleTowardWaypoint(v, DT);
      if (v.y < 440 && v.y > 300) minSpeed = Math.min(minSpeed, v.speed);
      maxX = Math.max(maxX, v.x);
    }
    expect(minSpeed).toBeLessThanOrEqual(AI_CORNER_SPEED + 1e-9);
    expect(minSpeed).toBeGreaterThan(AI_CORNER_SPEED * 0.5); // eases off, never stops
    expect(maxX).toBeLessThan(240);                          // never leaves the corner tile
    expect(Math.abs(v.x - laneX)).toBeLessThan(3);           // settled in the new lane
    expect(v.y).toBeLessThan(200);                           // and driving on
  });

  it('is back at cruising speed on the straight after a corner', () => {
    const v = carOnRoute({ x: 20, y: 420 }, [[1, 0, 5], [0, -1, 20]], { speed: 2.2 });
    for (let i = 0; i < 60 * 3; i++) moveVehicleTowardWaypoint(v, DT);
    expect(v.speed).toBeCloseTo(2.2, 5);
  });

  it('comes to a stop on the last point of its route', () => {
    const v = carOnRoute({ x: 20, y: 20 }, [[1, 0, 6]], { speed: 2.2 });
    const last = v.waypoints[v.waypoints.length - 1];
    let speedAtEnd = Infinity;
    for (let i = 0; i < 60 * 5; i++) {
      const before = v.waypointIndex;
      moveVehicleTowardWaypoint(v, DT);
      if (before < v.waypoints.length && v.waypointIndex >= v.waypoints.length) speedAtEnd = v.speed;
    }
    expect(v.waypointIndex).toBe(v.waypoints.length);
    expect(speedAtEnd).toBeLessThan(AI_ARRIVE_SPEED * 1.5); // crawling onto it
    expect(Math.hypot(v.x - last.x, v.y - last.y)).toBeLessThan(12);
  });

  it('carries on after swinging wide of a waypoint instead of circling back', () => {
    // Pushed 16 px off the lane, right beside the waypoint it is heading for.
    const v = carOnRoute({ x: 20, y: 20 }, [[1, 0, 30]], { speed: 2.2 });
    v.waypointIndex = 1;
    v.x = v.waypoints[1].x - 2;
    v.y = v.waypoints[1].y + 16;
    for (let i = 0; i < 60; i++) moveVehicleTowardWaypoint(v, DT);
    expect(v.x).toBeGreaterThan(v.waypoints[1].x + 80);
    expect(Math.abs(v.y - v.waypoints[1].y)).toBeLessThan(6);
  });
});

describe('city traffic', () => {
  it('drives at a real speed, not the old crawl', () => {
    const player = { x: world.townHallPos.x, y: world.townHallPos.y - 200, angle: 0 };
    const vehicles = new Map<string, Vehicle>();
    for (let i = 0; i < 10; i++) ensureTraffic(vehicles, world, player, 12);

    const last = new Map<string, Point>();
    let covered = 0;
    let carSeconds = 0;
    for (let f = 0; f < 60 * 20; f++) {
      updateTraffic(vehicles, world, DT, player.x, player.y, player.angle);
      for (const v of vehicles.values()) {
        if (!isLiveNpcCar(v)) continue;
        const p = last.get(v.id);
        const step = p ? Math.hypot(v.x - p.x, v.y - p.y) : 0;
        if (step < 20) covered += step; // ignore respawn teleports
        carSeconds += DT;
        last.set(v.id, { x: v.x, y: v.y });
      }
    }
    // Cars average 1.8–2.6 px/frame at the top (108–156 px/s); corners, route
    // ends and queueing behind each other bring the average down. The old
    // per-waypoint slow zone held it near 6 px/s.
    expect(covered / carSeconds).toBeGreaterThan(70); // measured ~100
  });
});

describe('police pursuit', () => {
  it('reaches a stopped player from its spawn distance within seconds', () => {
    const police = new PoliceSystem();
    const vehicles = new Map<string, Vehicle>();
    const player = world.roadTiles[100];
    police.setTargets({ police: 1 });

    let reachedAt = Infinity;
    for (let f = 0; f < 60 * 30 && reachedAt === Infinity; f++) {
      police.update({
        world, vehicles,
        player: { x: player.x, y: player.y, state: 'inCar', speed: 0 },
        playerSpeed: 0, playerVx: 0, playerVy: 0,
        dt: DT,
        isSolidAt: () => false,
      });
      if (police.units[0]?.state === 'arrest') reachedAt = f * DT;
    }
    // Units spawn 400–650 px out; at the 2.55 px/frame police top speed
    // (153 px/s) that is a few seconds of driving, not the minutes it took.
    expect(reachedAt).toBeLessThan(12); // measured 3–6 s
  });
});

/** Minimal in-memory localStorage so the engine's save layer works in node. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

describe('called services', () => {
  it('a taxi turns up in about the time its order says', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const engine = new GameEngine3D();
    engine.dispatchTaxi();
    const order = engine.orders[0];
    const eta = order.eta;
    let t = 0;
    while (order.status !== 'arrived' && t < 120) {
      engine['updateOrders'](DT);
      t += DT;
    }
    expect(order.status).toBe('arrived');
    // It spawns 260–520 px out: seconds away now (measured 3–6 s), where the
    // old crawl took about the minute the order used to promise.
    expect(t).toBeLessThan(12);
    expect(t).toBeLessThan(eta + 1);
  });
});
