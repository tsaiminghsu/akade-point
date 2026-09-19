import { Vehicle, VehicleType, Point, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { findRoadPath, nearestRoadTile } from './worldGen';
import { pickSpawnInRing } from './chunks';
import { clampToArena, type DroneBounds } from './droneArena';
import type { PedestrianSystem } from './pedestrians';

const LANE_OFFSET = 9;
export const TRAFFIC_DESPAWN_DISTANCE = 760;
/** Parked cars appear within this radius and are recycled beyond PARKED_DESPAWN. */
const PARKED_SPAWN_RADIUS = 700;
const PARKED_DESPAWN = 900;
export const DEFAULT_MAX_PARKED = 16;
export const TRAFFIC_RESPAWN_MIN = 380;
export const TRAFFIC_RESPAWN_MAX = 680;
/** Random driving destinations are drawn from this ring around the car. */
const ROUTE_DEST_MIN = 320;
const ROUTE_DEST_MAX = 1200;
/** BFS re-routes allowed per updateTraffic call; the rest retry next frame. */
const REROUTE_BUDGET = 3;
let rerouteBudget = REROUTE_BUDGET;

const NPC_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#e67e22', '#16a085', '#d35400', '#2c3e50',
  '#e74c3c', '#3498db', '#2ecc71', '#9b59b6',
];

let vehicleIdCounter = 100;
export function nextVehicleId(): string {
  return `v${++vehicleIdCounter}`;
}

function angleToTarget(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

function laneOffsetForSegment(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx === 0) return { x: 0, y: 0 };
    return { x: 0, y: dx > 0 ? LANE_OFFSET : -LANE_OFFSET };
  }

  if (dy === 0) return { x: 0, y: 0 };
  return { x: dy > 0 ? -LANE_OFFSET : LANE_OFFSET, y: 0 };
}

function applyTrafficLane(point: Point, from: Point, to: Point): Point {
  const offset = laneOffsetForSegment(from, to);
  return { x: point.x + offset.x, y: point.y + offset.y };
}

export function applyTrafficLanes(path: Point[], start: Point): Point[] {
  return path.map((point, index) => {
    const from = index === 0 ? start : path[index - 1];
    const to = path[index + 1] ?? point;
    const segmentTo = (point.x === from.x && point.y === from.y) ? to : point;
    return applyTrafficLane(point, from, segmentTo);
  });
}

/** BFS road path from `start` to `dest`, shifted onto the right-hand lane. */
export function buildLanePath(world: WorldData, start: Point, dest: Point): Point[] {
  const centerPath = findRoadPath(world.grid, start.x, start.y, dest.x, dest.y);
  return applyTrafficLanes(centerPath, start);
}

/**
 * Give a car a fresh destination a few blocks away. Nearby destinations keep
 * the BFS short and stop cars planning cross-map trips they never finish
 * before they are recycled. Returns false when this frame's re-route budget
 * is spent; the caller should retry next frame.
 */
function routeVehicleToRandomRoad(v: Vehicle, world: WorldData): boolean {
  if (rerouteBudget <= 0) return false;
  rerouteBudget--;
  const dest = pickSpawnInRing(world, v.x, v.y, ROUTE_DEST_MIN, ROUTE_DEST_MAX)
    ?? world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)]
    ?? nearestRoadTile(world, world.respawnPos);
  v.waypoints = buildLanePath(world, { x: v.x, y: v.y }, dest);
  v.waypointIndex = 0;
  const first = v.waypoints[0];
  if (first) v.angle = angleToTarget(v, first);
  return true;
}

/** Park a car for a frame while it waits for re-route budget. */
function deferReroute(v: Vehicle): void {
  v.npcState = 'stopped';
  v.waitTimer = 0.05;
}

function isClearOfVehicles(
  candidate: Point,
  vehicles: Map<string, Vehicle>,
  currentVehicleId: string,
  minDistance = 70
): boolean {
  for (const other of vehicles.values()) {
    if (other.id === currentVehicleId) continue;
    if (other.type === VehicleType.HELICOPTER || other.type === VehicleType.RC_DRONE) continue;
    const d = Math.hypot(candidate.x - other.x, candidate.y - other.y);
    if (d < minDistance) return false;
  }
  return true;
}

/**
 * Random road tile in a ring around the player, avoiding the forward view
 * cone. Backed by the chunk road buckets, so it scans a handful of chunks
 * instead of the whole road network.
 */
export function pickSpawnAwayFromPlayer(
  world: WorldData,
  playerX?: number,
  playerY?: number,
  playerAngle?: number,
  minDistance = TRAFFIC_RESPAWN_MIN,
  maxDistance = TRAFFIC_RESPAWN_MAX
): Point | undefined {
  if (playerX === undefined || playerY === undefined) {
    return world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)];
  }
  return pickSpawnInRing(world, playerX, playerY, minDistance, maxDistance, {
    forwardAngle: playerAngle,
  });
}

/** An NPC car standing at `spawn`, already routed to a nearby destination. */
export function createNPCCarAt(world: WorldData, spawn: Point, colorIndex: number): Vehicle {
  const dest = pickSpawnInRing(world, spawn.x, spawn.y, ROUTE_DEST_MIN, ROUTE_DEST_MAX)
    ?? world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)]
    ?? nearestRoadTile(world, world.respawnPos);

  const centerPath = findRoadPath(world.grid, spawn.x, spawn.y, dest.x, dest.y);
  const waypoints = applyTrafficLanes(centerPath, spawn);
  const laneSpawn = waypoints[0] ? applyTrafficLane(spawn, spawn, centerPath[0] ?? dest) : spawn;

  return {
    id: nextVehicleId(),
    type: VehicleType.NPC_CAR,
    x: laneSpawn.x,
    y: laneSpawn.y,
    angle: waypoints[0] ? angleToTarget(laneSpawn, waypoints[0]) : 0,
    speed: 0,
    maxSpeed: 1.8 + Math.random() * 0.8,
    color: NPC_COLORS[colorIndex % NPC_COLORS.length],
    width: 16,
    height: 26,
    occupant: 'npc',
    waypoints,
    waypointIndex: 0,
    npcState: 'driving',
    waitTimer: 0,
    hp: 100,
    driverColorIdx: colorIndex % NPC_COLORS.length,
  };
}

export function createNPCCar(world: WorldData, colorIndex: number): Vehicle {
  const spawn = world.spawnPoints[Math.floor(Math.random() * world.spawnPoints.length)]
    ?? nearestRoadTile(world, world.respawnPos);
  return createNPCCarAt(world, spawn, colorIndex);
}

/**
 * Police cruiser. Slightly faster and heavier than traffic so it can catch
 * and shove the player's car (maxSpeed is px/FRAME, like all AI vehicles).
 */
export function createPoliceCar(spawn: Point): Vehicle {
  return {
    id: nextVehicleId(),
    type: VehicleType.POLICE,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    speed: 0,
    maxSpeed: 2.55,
    color: '#f4f6fa',
    width: 16,
    height: 26,
    occupant: 'npc',
    waypoints: [],
    waypointIndex: 0,
    npcState: 'driving',
    hp: 100,
    mass: 1.3,
  };
}

export function createTaxi(world: WorldData, playerX?: number, playerY?: number, playerAngle?: number): Vehicle {
  let spawn = pickSpawnAwayFromPlayer(world, playerX, playerY, playerAngle, 260, 520);
  if (!spawn) {
    spawn = world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)];
  }

  const at = spawn ?? nearestRoadTile(world, world.respawnPos);
  return {
    id: nextVehicleId(),
    type: VehicleType.TAXI,
    x: at.x,
    y: at.y,
    angle: 0,
    speed: 0,
    maxSpeed: 2.2,
    color: '#ffee00', // Yellow taxi
    width: 16,
    height: 26,
    occupant: 'npc',
    waypoints: [],
    waypointIndex: 0,
    npcState: 'stopped',
    waitTimer: 0,
    isService: true,
    hp: 100,
  };
}

export function createDeliveryScooter(world: WorldData, shopPos?: Point, playerX?: number, playerY?: number, playerAngle?: number): Vehicle {
  let spawn: Point | undefined;

  // Shop positions are building tile corners — spawn on the nearest road instead.
  if (shopPos && world.roadTiles.length > 0) {
    spawn = nearestRoadTile(world, { x: shopPos.x + TILE_SIZE / 2, y: shopPos.y + TILE_SIZE / 2 });
  }

  // No shop provided: find a road tile at a reasonable distance from player
  if (!spawn && playerX !== undefined && playerY !== undefined) {
    spawn = pickSpawnAwayFromPlayer(world, playerX, playerY, playerAngle, 260, 520);
  }

  if (!spawn) {
    spawn = nearestRoadTile(world, world.respawnPos);
  }

  return {
    id: nextVehicleId(),
    type: VehicleType.DELIVERY_SCOOTER,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    speed: 0,
    maxSpeed: 2.5,
    color: '#e67e22',
    width: 10,
    height: 18,
    occupant: 'npc',
    waypoints: [],
    waypointIndex: 0,
    npcState: 'stopped',
    isService: true,
    hp: 100,
  };
}

export function createHelicopter(world: WorldData): Vehicle {
  const helipad = world.helipads[0] ?? world.respawnPos;
  return {
    id: nextVehicleId(),
    type: VehicleType.HELICOPTER,
    x: helipad.x,
    y: helipad.y,
    angle: 0,
    speed: 0,
    maxSpeed: 4,
    color: '#78909c',
    width: 30,
    height: 22,
    occupant: null,
    waypoints: [],
    waypointIndex: 0,
    altitude: 0,
    isService: true,
    hp: 100,
  };
}

export function createDrone(playerX: number, playerY: number): Vehicle {
  return {
    id: nextVehicleId(),
    type: VehicleType.RC_DRONE,
    x: playerX,
    y: playerY,
    angle: 0,
    speed: 0,
    maxSpeed: 3,
    color: '#00bcd4',
    width: 20,
    height: 20,
    occupant: null,
    waypoints: [],
    waypointIndex: 0,
    altitude: 0,
    targetAltitude: 0,
    hp: 100,
  };
}

// Returns the distance to the nearest vehicle directly ahead (within lookAhead units).
// Returns lookAhead if nothing is blocking.
export function getForwardBlockDistance(
  v: Vehicle,
  vehicles: Map<string, Vehicle>,
  lookAhead = 90
): number {
  const fx = Math.sin(v.angle);
  const fy = -Math.cos(v.angle);
  let closest = lookAhead;

  for (const other of vehicles.values()) {
    if (other.id === v.id) continue;
    if (other.type === VehicleType.HELICOPTER || other.type === VehicleType.RC_DRONE) continue;
    const dx = other.x - v.x;
    const dy = other.y - v.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1 || dist > lookAhead) continue;
    const dot = (dx / dist) * fx + (dy / dist) * fy;
    if (dot < 0.55) continue; // not in front
    const cross = Math.abs((dx / dist) * fy - (dy / dist) * fx);
    if (cross > 0.65) continue; // too far sideways
    closest = Math.min(closest, dist);
  }

  return closest;
}

/**
 * Distance to a single point if it lies in the vehicle's forward cone,
 * otherwise `lookAhead`. Used so cars brake for the on-foot player.
 */
export function forwardPointDistance(v: Vehicle, x: number, y: number, lookAhead: number): number {
  const fx = Math.sin(v.angle);
  const fy = -Math.cos(v.angle);
  const dx = x - v.x;
  const dy = y - v.y;
  const d = Math.hypot(dx, dy);
  if (d < 1 || d > lookAhead) return lookAhead;
  const dot = (dx / d) * fx + (dy / d) * fy;
  if (dot < 0.55) return lookAhead;
  const cross = Math.abs((dx / d) * fy - (dy / d) * fx);
  if (cross > 0.5) return lookAhead;
  return d;
}

// Move a vehicle toward its next waypoint.
// speedCap (0–1) lets the caller impose an external speed limit (e.g. for braking).
export function moveVehicleTowardWaypoint(
  v: Vehicle,
  dt: number,
  speedCap = 1
): void {
  if (v.waypoints.length === 0 || v.waypointIndex >= v.waypoints.length) {
    v.speed *= 0.85;
    return;
  }

  const target = v.waypoints[v.waypointIndex];
  const dx = target.x - v.x;
  const dy = target.y - v.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 8) {
    v.waypointIndex++;
    return;
  }

  const targetAngle = Math.atan2(dx, -dy);

  // Smooth angle
  let angleDiff = targetAngle - v.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  v.angle += angleDiff * Math.min(1, dt * 5);

  // Speed — respect both waypoint slow-zone and external cap
  const slowDist = 40;
  const speedFactor = dist < slowDist ? dist / slowDist : 1;
  v.speed = Math.min(v.maxSpeed * speedCap, v.speed + dt * 3) * speedFactor;

  v.x += Math.sin(v.angle) * v.speed;
  v.y -= Math.cos(v.angle) * v.speed;
}

// Update NPC traffic: follow road waypoints, re-route when finished
export function updateTraffic(
  vehicles: Map<string, Vehicle>,
  world: WorldData,
  dt: number,
  playerX?: number,
  playerY?: number,
  playerAngle?: number,
  peds?: PedestrianSystem,
  playerOnFoot?: boolean,
): void {
  rerouteBudget = REROUTE_BUDGET;

  vehicles.forEach((v) => {
    if (v.occupant === 'player') return;
    if (v.isService) return; // Services managed separately
    if (v.isParked) return;  // Parked / abandoned cars stay put
    if (v.hp <= 0) return;   // Wrecks are static obstacles
    if (v.npcState === 'hijacked') return;
    if (v.type === VehicleType.POLICE) return; // Driven by PoliceSystem
    if (v.type === VehicleType.HELICOPTER || v.type === VehicleType.RC_DRONE) return;

    // Teleport NPC cars if they get too far from the player to keep streets populated
    if (playerX !== undefined && playerY !== undefined) {
      const dx = v.x - playerX;
      const dy = v.y - playerY;
      const distToPlayer = Math.sqrt(dx * dx + dy * dy);
      
      if (distToPlayer > TRAFFIC_DESPAWN_DISTANCE && rerouteBudget > 0) {
        const spawn = pickSpawnAwayFromPlayer(world, playerX, playerY, playerAngle);
        if (spawn && isClearOfVehicles(spawn, vehicles, v.id)) {
          v.x = spawn.x;
          v.y = spawn.y;
          v.speed = 0;
          routeVehicleToRandomRoad(v, world);
        }
      }
    }

    if (v.npcState === 'stopped') {
      v.waitTimer = (v.waitTimer ?? 0) - dt;
      if ((v.waitTimer ?? 0) <= 0) v.npcState = 'driving';
      return;
    }

    // Re-route if finished waypoints
    if (v.waypointIndex >= v.waypoints.length) {
      if (!routeVehicleToRandomRoad(v, world)) {
        deferReroute(v);
        return;
      }

      // Occasional stop at intersection
      if (Math.random() < 0.1) {
        v.npcState = 'stopped';
        v.waitTimer = 0.5 + Math.random() * 1.5;
      }
      return;
    }

    // ── Stuck detection ──────────────────────────────────────────────────────
    // Sample position every 2 s; if barely moved → reroute (or teleport if near player)
    v.stuckCheckTimer = (v.stuckCheckTimer ?? 0) - dt;
    if (v.stuckCheckTimer <= 0) {
      if (v.stuckCheckX !== undefined) {
        const movedDist = Math.hypot(v.x - v.stuckCheckX, v.y - (v.stuckCheckY ?? v.y));
        if (movedDist < 18) {
          // Stuck — try to reroute
          if (
            playerX !== undefined && playerY !== undefined &&
            Math.hypot(v.x - playerX, v.y - playerY) < 260
          ) {
            // Too close to player to reroute in-place → teleport to a clear spawn
            const spawn = pickSpawnAwayFromPlayer(world, playerX, playerY, playerAngle);
            if (spawn && isClearOfVehicles(spawn, vehicles, v.id)) {
              v.x = spawn.x;
              v.y = spawn.y;
              v.speed = 0;
            }
          }
          if (routeVehicleToRandomRoad(v, world)) {
            v.npcState = 'driving';
          } else {
            deferReroute(v);
          }
        }
      }
      v.stuckCheckX = v.x;
      v.stuckCheckY = v.y;
      v.stuckCheckTimer = 2;
    }

    // ── Forward look-ahead braking ───────────────────────────────────────────
    // Slow down proportionally when a vehicle, pedestrian, or the on-foot
    // player is directly ahead. Braking for people is what makes it possible
    // to step in front of a car and carjack it.
    let fwdDist = getForwardBlockDistance(v, vehicles);
    if (peds) {
      fwdDist = Math.min(fwdDist, peds.forwardPedDistance(v, 90));
    }
    if (playerOnFoot && playerX !== undefined && playerY !== undefined) {
      fwdDist = Math.min(fwdDist, forwardPointDistance(v, playerX, playerY, 90));
    }
    const brakeCap = fwdDist < 26 ? 0 : fwdDist < 70 ? (fwdDist - 26) / 44 : 1;
    if (brakeCap === 0) {
      v.speed *= 0.82; // hard brake
    } else {
      moveVehicleTowardWaypoint(v, dt, brakeCap);
    }

    // Push apart vehicles that are too close (prevents stacking on same road tile)
    vehicles.forEach((other) => {
      if (other.id === v.id) return;
      if (other.occupant === 'player') return; // don't push player's vehicle
      if (other.type === VehicleType.HELICOPTER || other.type === VehicleType.RC_DRONE) return;
      const sdx = v.x - other.x;
      const sdy = v.y - other.y;
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      const minSep = 22;
      if (sdist < minSep && sdist > 0) {
        v.speed = Math.max(0, v.speed - 4 * dt);
        const push = ((minSep - sdist) / minSep) * 0.5;
        v.x += (sdx / sdist) * push;
        v.y += (sdy / sdist) * push;
      }
    });
  });
}

/** A live AI-driven traffic car (not parked, wrecked, stolen or a service). */
export function isLiveNpcCar(v: Vehicle): boolean {
  return v.type === VehicleType.NPC_CAR
    && v.occupant === 'npc'
    && v.hp > 0
    && !v.isParked
    && !v.isService
    && v.npcState !== 'hijacked';
}

/**
 * Keep the number of live traffic cars at `target`. Wrecks, thefts and
 * despawns used to shrink the fleet for the rest of the session; this tops it
 * up (at most `maxSpawns` per call, in the ring behind the player) and trims
 * the farthest cars when the target is lowered. New cars are collected and
 * inserted after the iteration, never during it.
 */
export function ensureTraffic(
  vehicles: Map<string, Vehicle>,
  world: WorldData,
  player: { x: number; y: number; angle: number },
  target: number,
  maxSpawns = 2,
): number {
  let live = 0;
  let farthest: Vehicle | null = null;
  let farthestD = 0;
  for (const v of vehicles.values()) {
    if (!isLiveNpcCar(v)) continue;
    live++;
    const d = Math.hypot(v.x - player.x, v.y - player.y);
    if (d > farthestD) { farthestD = d; farthest = v; }
  }

  if (live > target) {
    if (farthest && farthestD > TRAFFIC_DESPAWN_DISTANCE) {
      vehicles.delete(farthest.id);
      live--;
    }
    return live;
  }

  const spawned: Vehicle[] = [];
  let attempts = 0;
  while (live + spawned.length < target && spawned.length < maxSpawns && attempts < 6) {
    attempts++;
    const spawn = pickSpawnAwayFromPlayer(world, player.x, player.y, player.angle);
    if (!spawn || !isClearOfVehicles(spawn, vehicles, '')) continue;
    spawned.push(createNPCCarAt(world, spawn, Math.floor(Math.random() * NPC_COLORS.length)));
  }
  for (const v of spawned) vehicles.set(v.id, v);
  return live + spawned.length;
}

/**
 * Populate nearby PARKING blocks with unattended cars, and recycle parked or
 * abandoned cars once the player is far away.
 *
 * `spawnedBlocks` is owned by the caller so blocks repopulate when revisited.
 */
export function updateParkedCars(
  vehicles: Map<string, Vehicle>,
  world: WorldData,
  player: { x: number; y: number },
  currentVehicleId: string | null,
  spawnedBlocks: Set<number>,
  maxParked = DEFAULT_MAX_PARKED,
): void {
  let parkedCount = 0;
  const toDelete: string[] = [];

  vehicles.forEach(v => {
    if (!v.isParked) return;
    parkedCount++;
    if (v.id === currentVehicleId) return;
    if (Math.hypot(v.x - player.x, v.y - player.y) > PARKED_DESPAWN) toDelete.push(v.id);
  });

  for (const id of toDelete) {
    vehicles.delete(id);
    parkedCount--;
  }

  // Let distant blocks repopulate the next time the player comes back.
  for (const block of world.parkingBlocks) {
    if (!spawnedBlocks.has(block.id)) continue;
    if (Math.hypot(block.center.x - player.x, block.center.y - player.y) > PARKED_DESPAWN) {
      spawnedBlocks.delete(block.id);
    }
  }

  if (parkedCount >= maxParked) return;

  for (const block of world.parkingBlocks) {
    if (parkedCount >= maxParked) break;
    if (spawnedBlocks.has(block.id)) continue;
    if (Math.hypot(block.center.x - player.x, block.center.y - player.y) > PARKED_SPAWN_RADIUS) continue;

    spawnedBlocks.add(block.id);
    const n = 2 + Math.floor(Math.random() * 2);
    // Cars in a lot all face the same way, which reads as deliberate parking.
    const angle = Math.random() < 0.5 ? 0 : Math.PI / 2;
    for (let i = 0; i < n && parkedCount < maxParked; i++) {
      const tile = block.tiles[Math.floor(Math.random() * block.tiles.length)];
      if (!tile) continue;
      if (!isClearOfVehicles(tile, vehicles, '', 24)) continue;
      const v: Vehicle = {
        id: nextVehicleId(),
        type: VehicleType.CAR,
        x: tile.x,
        y: tile.y,
        angle,
        speed: 0,
        maxSpeed: 2.0,
        color: NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)],
        width: 16,
        height: 26,
        occupant: null,
        waypoints: [],
        waypointIndex: 0,
        hp: 100,
        mass: 0.6,
        isParked: true,
      };
      vehicles.set(v.id, v);
      parkedCount++;
    }
  }
}

// Update service vehicles (taxi, delivery, helicopter) toward player
export function updateServiceVehicle(
  v: Vehicle,
  targetX: number,
  targetY: number,
  dt: number,
  world: WorldData,
  isAerial = false
): boolean {
  if (isAerial) {
    // Helicopters fly direct
    const dx = targetX - v.x;
    const dy = targetY - v.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    v.altitude = 15; // Fly high in the sky
    if (dist < 20) {
      v.speed *= 0.8;
      return true; // arrived
    }
    const ang = Math.atan2(dy, dx);
    v.angle = ang - Math.PI / 2;
    v.speed = Math.min(v.maxSpeed, v.speed + dt * 2);
    v.x += Math.cos(ang) * v.speed;
    v.y += Math.sin(ang) * v.speed;
    return false;
  }

  // Ground vehicles: route on road
  if (v.waypoints.length === 0 || v.waypointIndex >= v.waypoints.length) {
    const path = buildLanePath(world, { x: v.x, y: v.y }, { x: targetX, y: targetY });
    if (path.length > 0) {
      v.waypoints = path;
      v.waypointIndex = 0;
    } else {
      // Direct
      v.waypoints = [{ x: targetX, y: targetY }];
      v.waypointIndex = 0;
    }
  }

  const dx = targetX - v.x;
  const dy = targetY - v.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 30) {
    v.speed *= 0.8;
    return true;
  }

  moveVehicleTowardWaypoint(v, dt);
  return false;
}

// Update drone physics (Ardupilot-style)
export function updateDrone(
  v: Vehicle,
  throttleUp: boolean,
  throttleDown: boolean,
  pitchFwd: boolean,
  pitchBack: boolean,
  rollLeft: boolean,
  rollRight: boolean,
  yawLeft: boolean,
  yawRight: boolean,
  playerX: number,
  playerY: number,
  dt: number,
  /**
   * Arena bounds while free-flying, or null during a race. When set, the field
   * is treated as having its own ground station: the signal-loss return home is
   * suppressed, because the pilot stays wherever they launched from and would
   * otherwise yank the drone back the moment it crossed the field.
   */
  confine?: DroneBounds | null,
): { signalLost: boolean; hitWall?: boolean } {
  const dx = v.x - playerX;
  const dy = v.y - playerY;
  const distFromPlayer = Math.sqrt(dx * dx + dy * dy);
  const forwardX = Math.sin(v.angle);
  const forwardY = -Math.cos(v.angle);
  const rightX = Math.cos(v.angle);
  const rightY = Math.sin(v.angle);
  const moveSpeed = 180 * dt;

  // Signal loss > 500 units → RTL
  if (!confine && distFromPlayer > 500) {
    // RTL: fly back toward player at a stable altitude
    const ang = Math.atan2(playerY - v.y, playerX - v.x);
    const rtlSpeed = 150; // pixels per second
    v.x += Math.cos(ang) * rtlSpeed * dt;
    v.y += Math.sin(ang) * rtlSpeed * dt;
    
    // Maintain or climb to safe cruising altitude (min 8)
    const currentAlt = v.altitude ?? 8;
    if (currentAlt < 8) {
      v.altitude = Math.min(8, currentAlt + 12 * dt);
    } else {
      v.altitude = currentAlt;
    }
    return { signalLost: true };
  }

  // Altitude
  const alt = v.altitude ?? 0;
  const ceiling = confine ? confine.ceiling : 200;
  if (throttleUp) v.altitude = Math.min(ceiling, alt + 80 * dt);
  else if (throttleDown) v.altitude = Math.max(0, alt - 60 * dt);
  else v.altitude = alt + (0 - alt) * 0.01; // hover drift

  // Only move horizontally if airborne
  if ((v.altitude ?? 0) > 5) {
    if (pitchFwd) {
      v.x += forwardX * moveSpeed;
      v.y += forwardY * moveSpeed;
    }
    if (pitchBack) {
      v.x -= forwardX * moveSpeed * 0.7;
      v.y -= forwardY * moveSpeed * 0.7;
    }
    if (rollLeft) {
      v.x -= rightX * moveSpeed * 0.7;
      v.y -= rightY * moveSpeed * 0.7;
    }
    if (rollRight) {
      v.x += rightX * moveSpeed * 0.7;
      v.y += rightY * moveSpeed * 0.7;
    }
  }

  // Yaw
  if (yawLeft) v.angle -= 2 * dt;
  if (yawRight) v.angle += 2 * dt;

  // Clamp to the arena while free-flying, to the world otherwise.
  let hitWall = false;
  if (confine) {
    const clamped = clampToArena(v.x, v.y, confine);
    v.x = clamped.x;
    v.y = clamped.y;
    v.altitude = Math.min(confine.ceiling, v.altitude ?? 0);
    hitWall = clamped.hit;
  } else {
    v.x = Math.max(0, Math.min(GRID_SIZE * TILE_SIZE, v.x));
    v.y = Math.max(0, Math.min(GRID_SIZE * TILE_SIZE, v.y));
  }

  return { signalLost: false, hitWall };
}
