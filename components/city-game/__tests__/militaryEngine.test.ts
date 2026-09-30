import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine3D } from '../engine3d';
import { PRICES } from '../economy';
import { STEALABLE_TANK, TRESPASS_STARS, isInsideBase } from '../militaryBase';
import { Vehicle, VehicleType, TILE_SIZE } from '../types';

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

/** Open apron in the middle of the base. */
const APRON = { x: 132 * TILE_SIZE + 20, y: 30 * TILE_SIZE + 20 };
/** A long straight north-south road (gx 64), clear of buildings to the north. */
const ROAD = { x: 64 * TILE_SIZE + 20, y: 60 * TILE_SIZE + 20 };

let engine: GameEngine3D;
let clock = 0;

function step(seconds: number) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    clock += dt * 1000;
    engine.update(dt, clock);
  }
}

function playerCar(): Vehicle {
  return engine.vehicles.get(engine.player.currentVehicleId!)!;
}

/** Put the player (in their car) somewhere, keeping car and player in sync. */
function teleport(x: number, y: number) {
  const car = playerCar();
  car.x = x; car.y = y; car.speed = 0;
  engine.player.x = x;
  engine.player.y = y;
}

function stepOut() {
  engine['handleEnterExit']();
  expect(engine.player.state).toBe('onFoot');
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  engine = new GameEngine3D();
  clock = 0;
});

describe('trespassing on the base', () => {
  it('raises the wanted level to four stars and keeps it there while inside', () => {
    teleport(APRON.x, APRON.y);
    step(0.1);
    expect(engine.wanted.stars).toBe(TRESPASS_STARS);
    expect(engine.banner?.text).toContain('軍事禁區');

    // Hiding does not work inside the fence: the evade clock never runs.
    step(1.5);
    expect(engine.wanted.stars).toBeGreaterThanOrEqual(TRESPASS_STARS);
    expect(engine.wanted.evadeTimer).toBe(0);
    expect(engine.guards.engaged()).toBe(true);
  });

  it('only warns someone loitering at the fence', () => {
    teleport(APRON.x, (30 + 12) * TILE_SIZE);   // just south of the wall
    step(0.1);
    expect(engine.wanted.stars).toBe(0);
    expect(engine.notifications.some(n => n.text.includes('軍事禁區'))).toBe(true);
  });

  it('garrisons the base as the player drives up', () => {
    teleport(APRON.x, APRON.y + 1200);
    step(0.1);
    const tanks = [...engine.vehicles.values()].filter(v => v.type === VehicleType.TANK);
    const trucks = [...engine.vehicles.values()].filter(v => v.type === VehicleType.ARMY_TRUCK);
    expect(tanks.length).toBeGreaterThanOrEqual(3);   // two guards + the stealable one
    expect(trucks.length).toBeGreaterThanOrEqual(2);
    expect(engine.wanted.stars).toBe(0);   // just driving past is legal
  });
});

describe('stealing the tank', () => {
  function walkToTank() {
    teleport(APRON.x, APRON.y + 1200);
    step(0.05);   // garrison spawns
    stepOut();
    const tank = engine.vehicles.get(engine.guards.stealableId!)!;
    engine.player.x = tank.x + 20;
    engine.player.y = tank.y;
    return tank;
  }

  it('lets the player board the unattended tank, for a star', () => {
    const tank = walkToTank();
    engine.wanted.set(TRESPASS_STARS);
    engine['handleEnterExit']();
    expect(engine.player.state).toBe('inCar');
    expect(engine.player.currentVehicleId).toBe(tank.id);
    expect(engine.wanted.stars).toBe(TRESPASS_STARS + 1);
    expect(engine.guards.stealableId).toBeNull();
  });

  it('refuses a crewed tank', () => {
    walkToTank();
    const guardTank = engine.guards.guards.find(g => g.kind === 'tank')!;
    const v = engine.vehicles.get(guardTank.vehicleId)!;
    engine.vehicles.delete(engine.guards.stealableId!);
    engine.player.x = v.x + 20;
    engine.player.y = v.y;
    expect(engine.nearestVehicleInfo()).toBe('none');
    engine['handleEnterExit']();
    expect(engine.player.state).toBe('onFoot');
  });

  it('fires the main gun with a reload between shots', () => {
    walkToTank();
    engine['handleEnterExit']();
    engine['updatePlayerGun'](1 / 60, true);
    expect(engine.combat.shells).toHaveLength(1);
    expect(engine.combat.shells[0].owner).toBe('player');
    engine['updatePlayerGun'](1 / 60, true);
    expect(engine.combat.shells).toHaveLength(1);
  });

  it('drives like a tank: slow, and turns on the spot', () => {
    const tank = walkToTank();
    engine['handleEnterExit']();
    const a0 = tank.angle;
    engine['updateCarPhysics'](0.5, { ...engine.input.getState(true), right: true });
    expect(tank.angle).toBeGreaterThan(a0);   // pivoted without moving
    for (let i = 0; i < 300; i++) {
      engine['updateCarPhysics'](1 / 60, { ...engine.input.getState(true), up: true });
    }
    expect(Math.abs(tank.speed)).toBeLessThan(100);
  });
});

describe('explosions and the wanted level', () => {
  it('shelling a car is a crime', () => {
    teleport(ROAD.x, ROAD.y);
    const tank = playerCar();
    tank.type = VehicleType.TANK;
    tank.turretAngle = 0;
    const victim: Vehicle = {
      ...tank, id: 'victim', type: VehicleType.NPC_CAR, occupant: 'npc',
      x: ROAD.x, y: ROAD.y - 100, turretAngle: undefined,
    };
    engine.vehicles.set(victim.id, victim);
    const hooks = engine['combatHooks']();
    engine.combat.fireShell(tank, 'player');
    for (let i = 0; i < 60 && engine.combat.shells.length; i++) engine.combat.update(1 / 60, hooks);
    expect(victim.hp).toBeLessThan(100);
    expect(engine.wanted.stars).toBeGreaterThanOrEqual(1);
  });

  it('wrecking a police car with the gun is another', () => {
    const cop: Vehicle = {
      ...playerCar(), id: 'cop', type: VehicleType.POLICE, occupant: 'npc', hp: 10, x: 100, y: 100,
    };
    engine.vehicles.set(cop.id, cop);
    engine['damageVehicle'](cop, 100, 'player');
    expect(cop.hp).toBe(0);
    expect(engine.wanted.stars).toBe(1);
  });
});

describe('WASTED', () => {
  it('fades out, sends the player to hospital and clears the law', () => {
    stepOut();
    engine.wanted.set(5);
    engine['damagePlayer'](500);
    expect(engine.player.action?.kind).toBe('wasted');
    expect(engine.screenLabel).toBe('WASTED');

    step(4);
    expect(engine.player.action).toBeNull();
    expect(engine.player.health).toBe(100);
    expect(engine.wanted.stars).toBe(0);
    expect(engine.police.units).toHaveLength(0);
    expect(engine.helis.units).toHaveLength(0);
    // Exact cash is not stable (respawning at the town hall can pay out a
    // sightseeing bonus), so check the ledger for the hospital bill itself.
    expect(engine.economy.log.some(t => t.reason === 'hospital' && t.amount === -PRICES.hospital)).toBe(true);
    expect(engine.save.stats.timesWasted).toBe(1);
    expect(engine.player.x).toBe(engine.world.respawnPos.x);
  });

  it('only hurts people on foot; a car soaks up gunfire', () => {
    const car = playerCar();
    engine['damagePlayer'](50);
    expect(engine.player.health).toBe(100);
    engine.combat.fireRound({ x: car.x, y: car.y - 100, alt: 160 }, engine.player, true, engine['combatHooks']());
    expect(car.hp).toBeLessThan(100);
    expect(engine.player.health).toBe(100);
  });

  it('heals slowly once nobody is after the player', () => {
    stepOut();
    engine.player.health = 50;
    engine['lastHurtMs'] = -Infinity;
    step(5);
    expect(engine.player.health).toBeGreaterThan(60);
  });
});

describe('dispatch follows the stars', () => {
  it('sends a helicopter at three stars and the army at six', () => {
    teleport(ROAD.x, ROAD.y);
    // Sit in a tank so nobody can end the test early with an arrest.
    playerCar().type = VehicleType.TANK;
    engine.wanted.set(3);
    step(1);
    expect(engine.helis.units.length).toBeGreaterThanOrEqual(1);
    expect(engine.police.units.every(u => u.kind === 'police')).toBe(true);

    engine.wanted.set(6);
    step(10);
    const kinds = new Set(engine.police.units.filter(u => u.state !== 'retreat').map(u => u.kind));
    expect(kinds.has('tanks')).toBe(true);
    expect(kinds.has('police')).toBe(false);
    expect(isInsideBase(engine.player.x, engine.player.y)).toBe(false);
  });

  it('a Pay-n-Spray-style stand-down clears helicopters, roadblocks and shells too', () => {
    teleport(ROAD.x, ROAD.y);
    engine.wanted.set(5);
    step(6);
    engine.combat.fireShell(playerCar(), 'law');
    engine['standDownLaw']();
    expect(engine.wanted.stars).toBe(0);
    expect(engine.helis.units).toHaveLength(0);
    expect(engine.roadblocks.blocks).toHaveLength(0);
    expect(engine.combat.shells).toHaveLength(0);
  });
});

describe('restart', () => {
  it('wipes every new system', () => {
    teleport(APRON.x, APRON.y);
    step(2);
    engine.reset({ clearSave: true });
    expect(engine.wanted.stars).toBe(0);
    expect(engine.helis.units).toHaveLength(0);
    expect(engine.guards.guards).toHaveLength(0);
    expect(engine.combat.shells).toHaveLength(0);
    expect(engine.hurtFlash).toBe(0);
    expect(STEALABLE_TANK).toBeDefined();
  });
});
