import { describe, it, expect, beforeEach } from 'vitest';
import {
  BARREL_LENGTH,
  BULLET_PLAYER_DMG,
  BULLET_VEHICLE_DMG,
  CombatHooks,
  CombatSystem,
  EXPLOSION_PLAYER_DMG,
  EXPLOSION_RADIUS,
  EXPLOSION_VEHICLE_DMG,
  SHELL_RANGE,
  SHELL_SPEED,
  Shooter,
  TANK_RANGE,
  bulletHitChance,
  hasLineOfSight,
  headingTo,
  stepTankGunner,
  turnToward,
} from '../combat';
import { Vehicle, VehicleType } from '../types';

function veh(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v', type: VehicleType.NPC_CAR, x: 0, y: 0, angle: 0, speed: 0, maxSpeed: 2,
    color: '#fff', width: 16, height: 26, occupant: 'npc', waypoints: [], waypointIndex: 0,
    hp: 100, ...over,
  };
}

interface Log {
  vehicleHits: Array<{ id: string; amount: number; by: Shooter }>;
  playerHits: number[];
  blasts: number;
  playerBooms: boolean[];
}

function makeHooks(
  vehicles: Vehicle[],
  player: { x: number; y: number; onFoot: boolean },
  solid: (x: number, y: number) => boolean = () => false,
): { hooks: CombatHooks; log: Log } {
  const log: Log = { vehicleHits: [], playerHits: [], blasts: 0, playerBooms: [] };
  const map = new Map(vehicles.map(v => [v.id, v]));
  return {
    log,
    hooks: {
      vehicles: map,
      isSolidAt: solid,
      player,
      damageVehicle: (v, amount, by) => log.vehicleHits.push({ id: v.id, amount, by }),
      damagePlayer: amount => log.playerHits.push(amount),
      blast: () => { log.blasts++; return 0; },
      onPlayerExplosion: (_x, _y, hit) => log.playerBooms.push(hit),
    },
  };
}

/** Step the combat system until nothing is in flight (or give up). */
function settle(c: CombatSystem, hooks: CombatHooks, maxSeconds = 3) {
  for (let i = 0; i < maxSeconds * 60 && c.shells.length > 0; i++) c.update(1 / 60, hooks);
}

let combat: CombatSystem;
beforeEach(() => { combat = new CombatSystem(); });

describe('helpers', () => {
  it('headingTo uses the sim convention (0 = north, clockwise)', () => {
    expect(headingTo(0, 0, 0, -10)).toBeCloseTo(0);
    expect(headingTo(0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(headingTo(0, 0, 0, 10))).toBeCloseTo(Math.PI);
  });

  it('turnToward takes the short way round and respects the rate', () => {
    const a = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 1, 0.05);
    expect(a).toBeGreaterThan(Math.PI - 0.1);   // crossed the seam, not the long way
    expect(turnToward(0, 1, 2, 0.1)).toBeCloseTo(0.2);
    expect(turnToward(0, 0.05, 2, 0.1)).toBeCloseTo(0.05);
  });

  it('line of sight is blocked by anything solid in between', () => {
    // One tile (40px) thick, like the thinnest solid in the world.
    const wall = (x: number) => x >= 80 && x < 120;
    expect(hasLineOfSight(() => false, 0, 0, 300, 0)).toBe(true);
    expect(hasLineOfSight(x => wall(x), 0, 0, 300, 0)).toBe(false);
    expect(hasLineOfSight(x => wall(x), 0, 0, 70, 0)).toBe(true);
  });

  it('gunfire hit chance drops with speed and range, within bounds', () => {
    expect(bulletHitChance(0, 0)).toBeGreaterThan(bulletHitChance(150, 0));
    expect(bulletHitChance(0, 100)).toBeGreaterThan(bulletHitChance(0, 600));
    expect(bulletHitChance(1000, 5000)).toBeGreaterThanOrEqual(0.15);
    expect(bulletHitChance(0, 0)).toBeLessThanOrEqual(0.85);
  });
});

describe('shells', () => {
  it('leave from the barrel tip along the turret, not the hull', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 100, y: 100, angle: 0, turretAngle: Math.PI / 2 });
    const s = combat.fireShell(tank, 'law');
    expect(s.x).toBeCloseTo(100 + BARREL_LENGTH);
    expect(s.y).toBeCloseTo(100);
    expect(s.shooterId).toBe('t');
    // A muzzle flash is shown.
    expect(combat.explosions.length).toBe(1);
  });

  it('fly at the shell speed', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 1000 });
    const { hooks } = makeHooks([tank], { x: 9999, y: 9999, onFoot: false });
    const s = combat.fireShell(tank, 'law');
    const y0 = s.y;
    combat.update(0.1, hooks);
    expect(y0 - s.y).toBeCloseTo(SHELL_SPEED * 0.1);
  });

  it('never hit the tank that fired them', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 1000 });
    const { hooks, log } = makeHooks([tank], { x: 9999, y: 9999, onFoot: false });
    combat.fireShell(tank, 'law');
    combat.update(1 / 60, hooks);
    expect(log.vehicleHits).toHaveLength(0);
    expect(combat.shells).toHaveLength(1);
  });

  it('detonate on the first vehicle in their path', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 1000 });
    const car = veh({ id: 'c', x: 0, y: 800 });
    const { hooks, log } = makeHooks([tank, car], { x: 9999, y: 9999, onFoot: false });
    combat.fireShell(tank, 'law');
    settle(combat, hooks);
    const hit = log.vehicleHits.find(h => h.id === 'c')!;
    expect(hit).toBeDefined();
    expect(hit.amount).toBeGreaterThan(EXPLOSION_VEHICLE_DMG * 0.7);
    expect(hit.by).toBe('law');
  });

  it('detonate against a wall, on its near face', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 1000 });
    const { hooks } = makeHooks([tank], { x: 9999, y: 9999, onFoot: false }, (_x, y) => y < 900);
    combat.fireShell(tank, 'law');
    settle(combat, hooks);
    const boom = combat.explosions.at(-1)!;
    expect(boom.radius).toBe(EXPLOSION_RADIUS);
    expect(boom.y).toBeGreaterThanOrEqual(900);
  });

  it('go off at the end of their range if they hit nothing', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 2000 });
    const { hooks } = makeHooks([tank], { x: 9999, y: 9999, onFoot: false });
    const s = combat.fireShell(tank, 'law');
    const startY = s.y;
    settle(combat, hooks);
    const boom = combat.explosions.at(-1)!;
    expect(startY - boom.y).toBeGreaterThanOrEqual(SHELL_RANGE - 1);
    expect(startY - boom.y).toBeLessThan(SHELL_RANGE + SHELL_SPEED / 60 + 1);
  });

  it('can hit a person on foot, but a player shell never targets the player', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 1000 });
    const enemy = makeHooks([tank], { x: 0, y: 850, onFoot: true });
    combat.fireShell(tank, 'law');
    settle(combat, enemy.hooks);
    expect(enemy.log.playerHits.length).toBe(1);
    expect(enemy.log.playerHits[0]).toBeGreaterThan(EXPLOSION_PLAYER_DMG * 0.7);

    const own = new CombatSystem();
    const mine = veh({ id: 'p', type: VehicleType.TANK, x: 0, y: 1000, occupant: 'player' });
    const friendly = makeHooks([mine], { x: 0, y: 850, onFoot: true });
    own.fireShell(mine, 'player');
    own.update(1 / 60, friendly.hooks);
    // Still flying: the shell passed through the (impossible) on-foot player.
    expect(own.shells).toHaveLength(1);
  });
});

describe('explosions', () => {
  it('fall off linearly to nothing at the edge', () => {
    const near = veh({ id: 'near', x: 10, y: 0 });
    const mid = veh({ id: 'mid', x: EXPLOSION_RADIUS / 2, y: 0 });
    const far = veh({ id: 'far', x: EXPLOSION_RADIUS + 5, y: 0 });
    const { hooks, log } = makeHooks([near, mid, far], { x: 9999, y: 0, onFoot: true });
    combat.explode(0, 0, 'law', hooks);
    const byId = Object.fromEntries(log.vehicleHits.map(h => [h.id, h.amount]));
    expect(byId.near).toBeGreaterThan(byId.mid);
    expect(byId.mid).toBeCloseTo(EXPLOSION_VEHICLE_DMG / 2);
    expect(byId.far).toBeUndefined();
    expect(log.playerHits).toHaveLength(0);
  });

  it('spare wrecks and anything airborne', () => {
    const wreck = veh({ id: 'w', x: 5, y: 0, hp: 0 });
    const heli = veh({ id: 'h', type: VehicleType.POLICE_HELI, x: 5, y: 0 });
    const { hooks, log } = makeHooks([wreck, heli], { x: 9999, y: 0, onFoot: true });
    combat.explode(0, 0, 'law', hooks);
    expect(log.vehicleHits).toHaveLength(0);
  });

  it('report whether a player blast hit anything, for the wanted level', () => {
    const car = veh({ id: 'c', x: 10, y: 0 });
    const a = makeHooks([car], { x: 9999, y: 0, onFoot: false });
    combat.explode(0, 0, 'player', a.hooks);
    expect(a.log.playerBooms).toEqual([true]);

    const b = makeHooks([], { x: 9999, y: 0, onFoot: false });
    combat.explode(0, 0, 'player', b.hooks);
    expect(b.log.playerBooms).toEqual([false]);

    const c = makeHooks([car], { x: 9999, y: 0, onFoot: false });
    combat.explode(0, 0, 'law', c.hooks);
    expect(c.log.playerBooms).toEqual([]);
  });

  it('knock pedestrians about', () => {
    const { hooks, log } = makeHooks([], { x: 9999, y: 0, onFoot: false });
    combat.explode(0, 0, 'law', hooks);
    expect(log.blasts).toBe(1);
  });

  it('fade away', () => {
    combat.addExplosionVisual(0, 0);
    const { hooks } = makeHooks([], { x: 0, y: 0, onFoot: false });
    for (let i = 0; i < 120; i++) combat.update(1 / 60, hooks);
    expect(combat.explosions).toHaveLength(0);
  });
});

describe('helicopter rounds', () => {
  it('hurt an on-foot player directly', () => {
    const { hooks, log } = makeHooks([], { x: 0, y: 0, onFoot: true });
    combat.fireRound({ x: 0, y: -100, alt: 160 }, { x: 0, y: 0 }, true, hooks);
    expect(log.playerHits).toEqual([BULLET_PLAYER_DMG]);
    expect(combat.tracers).toHaveLength(1);
  });

  it('hit the vehicle when the player is driving', () => {
    const car = veh({ id: 'mine', occupant: 'player' });
    const other = veh({ id: 'npc' });
    const { hooks, log } = makeHooks([other, car], { x: 0, y: 0, onFoot: false });
    combat.fireRound({ x: 0, y: -100, alt: 160 }, { x: 0, y: 0 }, true, hooks);
    expect(log.vehicleHits).toEqual([{ id: 'mine', amount: BULLET_VEHICLE_DMG, by: 'law' }]);
    expect(log.playerHits).toHaveLength(0);
  });

  it('miss visibly without doing damage', () => {
    const { hooks, log } = makeHooks([], { x: 0, y: 0, onFoot: true });
    combat.fireRound({ x: 0, y: -100, alt: 160 }, { x: 0, y: 0 }, false, hooks, () => 0.5);
    expect(log.playerHits).toHaveLength(0);
    const t = combat.tracers[0];
    expect(Math.hypot(t.x1, t.y1)).toBeGreaterThan(5);
  });
});

describe('AI tank gunner', () => {
  const clear = () => false;

  it('traverses the turret before firing, and does not fire off-target', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 0, angle: 0, turretAngle: 0, gunCooldown: 0 });
    const target = { x: 300, y: 0, vx: 0, vy: 0 };   // due east
    const fired = stepTankGunner(tank, target, 1 / 60, clear, combat, () => 0.5);
    expect(fired).toBe(false);
    expect(tank.turretAngle!).toBeGreaterThan(0);
    expect(tank.turretAngle!).toBeLessThan(0.1);
  });

  it('fires once lined up and loaded, then reloads', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 0, turretAngle: Math.PI / 2, gunCooldown: 0 });
    const target = { x: 300, y: 0, vx: 0, vy: 0 };
    expect(stepTankGunner(tank, target, 1 / 60, clear, combat, () => 0.5)).toBe(true);
    expect(combat.shells).toHaveLength(1);
    expect(tank.gunCooldown!).toBeGreaterThan(3);
    expect(stepTankGunner(tank, target, 1 / 60, clear, combat, () => 0.5)).toBe(false);
  });

  it('holds fire beyond range or without a clear shot', () => {
    const far = veh({ id: 'f', type: VehicleType.TANK, turretAngle: Math.PI / 2, gunCooldown: 0 });
    expect(stepTankGunner(far, { x: TANK_RANGE + 50, y: 0, vx: 0, vy: 0 }, 1 / 60, clear, combat)).toBe(false);

    const blocked = veh({ id: 'b', type: VehicleType.TANK, turretAngle: Math.PI / 2, gunCooldown: 0 });
    const wall = (x: number) => x > 100 && x < 120;
    expect(stepTankGunner(blocked, { x: 300, y: 0, vx: 0, vy: 0 }, 1 / 60, wall, combat)).toBe(false);
    expect(combat.shells).toHaveLength(0);
  });

  it('leads a moving target', () => {
    const tank = veh({ id: 't', type: VehicleType.TANK, x: 0, y: 0, turretAngle: Math.PI / 2, gunCooldown: 99 });
    // Target due east, driving north fast: the turret should swing north of east.
    for (let i = 0; i < 120; i++) {
      stepTankGunner(tank, { x: 400, y: 0, vx: 0, vy: -150 }, 1 / 60, clear, combat);
    }
    expect(tank.turretAngle!).toBeLessThan(Math.PI / 2 - 0.05);
  });
});
