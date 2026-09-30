import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine3D } from '../engine3d';
import { createHelicopter } from '../traffic';
import { HUDData, Vehicle } from '../types';

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

let engine: GameEngine3D;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  engine = new GameEngine3D();
});

function playerCar(): Vehicle {
  return engine.vehicles.get(engine.player.currentVehicleId!)!;
}

function hud(): HUDData {
  let out: HUDData | null = null;
  engine.setHUDCallback(d => { out = d; });
  engine['emitHUD']();
  return out!;
}

describe('launching the drone from the driver seat', () => {
  it('leaves the car parked, so it can be boarded again after landing', () => {
    expect(engine.player.state).toBe('inCar'); // every game starts in a car
    const car = playerCar();

    engine.launchDrone();
    expect(engine.player.currentVehicleId).toBeNull();
    expect(car.occupant).toBeNull();
    expect(car.speed).toBe(0);

    engine.landDrone();
    expect(engine.player.state).toBe('onFoot');
    // The HUD no longer reports the abandoned car as the current vehicle.
    expect(hud().vehicleType).toBeNull();

    engine.player.x = car.x;
    engine.player.y = car.y;
    engine['handleEnterExit']();
    expect(engine.player.state).toBe('inCar');
    expect(engine.player.currentVehicleId).toBe(car.id);
  });
});

describe('helicopter speedometer', () => {
  it('shows the helicopter moving instead of a constant 0', () => {
    engine['handleEnterExit']();
    expect(engine.player.state).toBe('onFoot');
    // Walk well clear of the car so F picks the helicopter.
    engine.player.x += 400;
    const heli = createHelicopter(engine.world);
    heli.x = engine.player.x + 10;
    heli.y = engine.player.y;
    engine.vehicles.set(heli.id, heli);
    engine['handleEnterExit']();
    expect(engine.player.state).toBe('inHelicopter');

    const idle = engine.input.getState(false, false, true);
    engine['updateHelicopterPhysics'](1 / 60, { ...idle, up: true });
    expect(hud().speedKMH).toBe(50); // 200 px/s at 0.25 km/h per px/s

    engine['updateHelicopterPhysics'](1 / 60, { ...idle, down: true });
    expect(hud().speedKMH).toBe(30); // backing off at 60%

    engine['updateHelicopterPhysics'](1 / 60, idle);
    expect(hud().speedKMH).toBe(0);
  });
});
