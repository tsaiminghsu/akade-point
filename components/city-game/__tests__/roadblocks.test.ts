import { describe, it, expect, beforeEach } from 'vitest';
import {
  BLOCK_MAX_DIST,
  BLOCK_MIN_DIST,
  RoadblockContext,
  RoadblockSystem,
  findBlockSite,
  onStrip,
} from '../roadblocks';
import { generateWorld } from '../worldGen';
import { TileType, Vehicle, VehicleType, WorldData, TILE_SIZE } from '../types';

const world: WorldData = generateWorld(42);

/** On the north-south road at gx 64, heading north. */
const START = { x: 64 * TILE_SIZE + 20, y: 60 * TILE_SIZE + 20 };

function car(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'mine', type: VehicleType.CAR, x: START.x, y: START.y, angle: 0, speed: 120, maxSpeed: 160,
    color: '#0bc', width: 16, height: 26, occupant: 'player', waypoints: [], waypointIndex: 0, hp: 100,
    ...over,
  };
}

let vehicles: Map<string, Vehicle>;
let rb: RoadblockSystem;
let mine: Vehicle;

function ctx(over: Partial<RoadblockContext> = {}): RoadblockContext {
  return {
    world,
    vehicles,
    player: { x: mine.x, y: mine.y, angle: mine.angle, state: 'inCar' },
    playerSpeed: 120,
    playerVehicle: mine,
    dt: 1 / 60,
    ...over,
  };
}

const ON = { roadblocks: true, spikeStrips: false, stars: 2 };
const SPIKES = { roadblocks: true, spikeStrips: true, stars: 5 };
const OFF = { roadblocks: false, spikeStrips: false, stars: 0 };

beforeEach(() => {
  vehicles = new Map();
  rb = new RoadblockSystem();
  mine = car();
  vehicles.set(mine.id, mine);
});

describe('findBlockSite', () => {
  it('finds a straight stretch of the same road, ahead', () => {
    expect(world.grid[60][64].type).toBe(TileType.ROAD_V);
    const site = findBlockSite(world, START.x, START.y, 0)!;
    expect(site).not.toBeNull();
    expect(site.axis).toBe('v');
    expect(site.x).toBe(START.x);
    const d = START.y - site.y;
    expect(d).toBeGreaterThanOrEqual(BLOCK_MIN_DIST);
    expect(d).toBeLessThanOrEqual(BLOCK_MAX_DIST);
    const gy = Math.floor(site.y / TILE_SIZE);
    expect(world.grid[gy][64].type).toBe(TileType.ROAD_V);
  });

  it('snaps a slightly-off heading to the road', () => {
    expect(findBlockSite(world, START.x, START.y, 0.3)?.axis).toBe('v');
  });

  it('refuses when the player is not on a road', () => {
    const sidewalk = world.sidewalkTiles[0];
    expect(findBlockSite(world, sidewalk.x, sidewalk.y, 0)).toBeNull();
  });

  it('refuses when heading off the road', () => {
    // East from a north-south road runs straight into the block.
    expect(findBlockSite(world, START.x, START.y, Math.PI / 2)).toBeNull();
  });
});

describe('placement', () => {
  it('parks two cruisers across the road ahead', () => {
    rb.update(ctx(), ON);
    expect(rb.blocks).toHaveLength(1);
    const b = rb.blocks[0];
    expect(b.vehicleIds).toHaveLength(2);
    const cars = b.vehicleIds.map(id => vehicles.get(id)!);
    for (const c of cars) {
      expect(c.type).toBe(VehicleType.POLICE);
      expect(c.isParked).toBe(true);
      expect(c.occupant).toBe('npc');
      expect(c.y).toBe(b.y);
    }
    // Side by side across the lane, broadside.
    expect(Math.abs(cars[0].x - cars[1].x)).toBeGreaterThan(15);
    for (const c of cars) expect(Math.abs(Math.abs(c.angle) - Math.PI / 2)).toBeLessThan(0.5);
    expect(b.strip).toBeNull();
  });

  it('waits out a cooldown between blocks', () => {
    rb.update(ctx(), ON);
    for (let i = 0; i < 60; i++) rb.update(ctx(), ON);
    expect(rb.blocks).toHaveLength(1);
  });

  it('does not bother for a slow car or a pedestrian', () => {
    rb.update(ctx({ playerSpeed: 20 }), ON);
    expect(rb.blocks).toHaveLength(0);
    rb.update(ctx({ player: { x: START.x, y: START.y, angle: 0, state: 'onFoot' } }), ON);
    expect(rb.blocks).toHaveLength(0);
  });

  it('packs up when the level no longer calls for roadblocks', () => {
    rb.update(ctx(), ON);
    const ids = rb.blocks[0].vehicleIds;
    rb.update(ctx(), OFF);
    expect(rb.blocks).toHaveLength(0);
    for (const id of ids) expect(vehicles.has(id)).toBe(false);
  });

  it('clears blocks the player has left far behind', () => {
    rb.update(ctx(), ON);
    const ids = rb.blocks[0].vehicleIds;
    mine.y = START.y + 1500;
    rb.update(ctx({ playerSpeed: 0 }), ON);
    expect(rb.blocks).toHaveLength(0);
    for (const id of ids) expect(vehicles.has(id)).toBe(false);
  });

  it('leaves behind a cruiser the player has stolen', () => {
    rb.update(ctx(), ON);
    const stolen = vehicles.get(rb.blocks[0].vehicleIds[0])!;
    stolen.occupant = 'player';
    rb.update(ctx(), OFF);
    expect(vehicles.has(stolen.id)).toBe(true);
  });

  it('counts the officers as eyes on the player', () => {
    rb.update(ctx(), ON);
    const b = rb.blocks[0];
    expect(rb.nearestDist(vehicles, { x: b.x, y: b.y + 20 })).toBeLessThan(40);
  });
});

describe('spike strips', () => {
  it('are laid in front of the block at five stars', () => {
    rb.update(ctx(), SPIKES);
    const b = rb.blocks[0];
    expect(b.strip).not.toBeNull();
    expect(b.strip!.y).toBeGreaterThan(b.y);   // between the player and the cars
    expect(rb.strips()).toHaveLength(1);
  });

  it('shred the tyres of a car driving over them, once', () => {
    rb.update(ctx(), SPIKES);
    const s = rb.strips()[0];
    mine.x = s.x;
    mine.y = s.y + 5;
    expect(rb.update(ctx(), SPIKES)).toBe(true);
    expect(mine.tiresPopped).toBe(true);
    expect(rb.update(ctx(), SPIKES)).toBe(false);
  });

  it('do nothing to tank tracks', () => {
    mine.type = VehicleType.TANK;
    rb.update(ctx(), SPIKES);
    const s = rb.strips()[0];
    mine.x = s.x;
    mine.y = s.y;
    expect(rb.update(ctx(), SPIKES)).toBe(false);
    expect(mine.tiresPopped).toBeFalsy();
  });

  it('onStrip covers the road width and a car length', () => {
    const s = { x: 100, y: 100, axis: 'v' as const };
    expect(onStrip(s, 100, 100)).toBe(true);
    expect(onStrip(s, 118, 110)).toBe(true);
    expect(onStrip(s, 130, 100)).toBe(false);
    expect(onStrip(s, 100, 120)).toBe(false);
  });
});
