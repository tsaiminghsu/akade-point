import { Vehicle, VehicleType, Point, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { findRoadPath } from './worldGen';

const LANE_OFFSET = 9;
const TRAFFIC_DESPAWN_DISTANCE = 760;
const TRAFFIC_RESPAWN_MIN = 380;
const TRAFFIC_RESPAWN_MAX = 680;

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

function applyTrafficLanes(path: Point[], start: Point): Point[] {
  return path.map((point, index) => {
    const from = index === 0 ? start : path[index - 1];
    const to = path[index + 1] ?? point;
    const segmentTo = (point.x === from.x && point.y === from.y) ? to : point;
    return applyTrafficLane(point, from, segmentTo);
  });
}

function buildLanePath(world: WorldData, start: Point, dest: Point): Point[] {
  const centerPath = findRoadPath(world.grid, start.x, start.y, dest.x, dest.y);
  return applyTrafficLanes(centerPath, start);
}

function routeVehicleToRandomRoad(v: Vehicle, world: WorldData): void {
  const dest = world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)] ??
    { x: 400, y: 400 };
  v.waypoints = buildLanePath(world, { x: v.x, y: v.y }, dest);
  v.waypointIndex = 0;
  const first = v.waypoints[0];
  if (first) v.angle = angleToTarget(v, first);
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

function pickSpawnAwayFromPlayer(
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

  const fx = playerAngle === undefined ? 0 : Math.sin(playerAngle);
  const fy = playerAngle === undefined ? 0 : -Math.cos(playerAngle);

  const candidates = world.roadTiles.filter(t => {
    const dx = t.x - playerX;
    const dy = t.y - playerY;
    const d = Math.hypot(dx, dy);
    if (d < minDistance || d > maxDistance) return false;
    if (playerAngle === undefined || d === 0) return true;

    const forwardDot = (dx / d) * fx + (dy / d) * fy;
    return forwardDot < 0.2;
  });

  const pool = candidates.length > 0
    ? candidates
    : world.roadTiles.filter(t => {
        const d = Math.hypot(t.x - playerX, t.y - playerY);
        return d > minDistance && d < maxDistance;
      });

  return pool[Math.floor(Math.random() * pool.length)];
}

export function createNPCCar(world: WorldData, colorIndex: number): Vehicle {
  const spawn = world.spawnPoints[Math.floor(Math.random() * world.spawnPoints.length)] ??
    { x: 200, y: 200 };

  // Pick a random road destination
  const dest = world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)] ??
    { x: 400, y: 400 };

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
  };
}

export function createTaxi(world: WorldData, playerX?: number, playerY?: number, playerAngle?: number): Vehicle {
  let spawn = pickSpawnAwayFromPlayer(world, playerX, playerY, playerAngle, 260, 520);
  if (!spawn) {
    spawn = world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)];
  }

  return {
    id: nextVehicleId(),
    type: VehicleType.TAXI,
    x: spawn?.x ?? 320,
    y: spawn?.y ?? 320,
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
  };
}

export function createDeliveryScooter(world: WorldData, shopPos?: Point, playerX?: number, playerY?: number, playerAngle?: number): Vehicle {
  let spawn: Point | undefined;

  // Shop positions are building tiles — find the nearest road tile to spawn on instead
  if (shopPos && world.roadTiles.length > 0) {
    spawn = world.roadTiles.reduce((best, t) => {
      const d = Math.hypot(t.x - shopPos.x, t.y - shopPos.y);
      const bd = Math.hypot(best.x - shopPos.x, best.y - shopPos.y);
      return d < bd ? t : best;
    });
  }

  // No shop provided: find a road tile at a reasonable distance from player
  if (!spawn && playerX !== undefined && playerY !== undefined) {
    spawn = pickSpawnAwayFromPlayer(world, playerX, playerY, playerAngle, 260, 520);
  }

  if (!spawn) {
    spawn = world.roadTiles[0] ?? { x: 160, y: 160 };
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
  };
}

export function createHelicopter(world: WorldData): Vehicle {
  const helipad = world.helipads[0] ?? { x: TILE_SIZE * 40, y: TILE_SIZE * 40 };
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
  };
}

// Move a vehicle toward its next waypoint
export function moveVehicleTowardWaypoint(
  v: Vehicle,
  dt: number
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

  // Speed
  const slowDist = 40;
  const speedFactor = dist < slowDist ? dist / slowDist : 1;
  v.speed = Math.min(v.maxSpeed, v.speed + dt * 3) * speedFactor;

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
  playerAngle?: number
): void {
  vehicles.forEach((v) => {
    if (v.occupant === 'player') return;
    if (v.isService) return; // Services managed separately
    if (v.type === VehicleType.HELICOPTER || v.type === VehicleType.RC_DRONE) return;

    // Teleport NPC cars if they get too far from the player to keep streets populated
    if (playerX !== undefined && playerY !== undefined) {
      const dx = v.x - playerX;
      const dy = v.y - playerY;
      const distToPlayer = Math.sqrt(dx * dx + dy * dy);
      
      if (distToPlayer > TRAFFIC_DESPAWN_DISTANCE) {
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
      routeVehicleToRandomRoad(v, world);

      // Occasional stop at intersection
      if (Math.random() < 0.1) {
        v.npcState = 'stopped';
        v.waitTimer = 0.5 + Math.random() * 1.5;
      }
      return;
    }

    moveVehicleTowardWaypoint(v, dt);

    // Push apart vehicles that are too close (prevents stacking on same road tile)
    vehicles.forEach((other) => {
      if (other.id === v.id) return;
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
  dt: number
): { signalLost: boolean } {
  const dx = v.x - playerX;
  const dy = v.y - playerY;
  const distFromPlayer = Math.sqrt(dx * dx + dy * dy);

  // Signal loss > 500 units → RTL
  if (distFromPlayer > 500) {
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
  if (throttleUp) v.altitude = Math.min(200, alt + 80 * dt);
  else if (throttleDown) v.altitude = Math.max(0, alt - 60 * dt);
  else v.altitude = alt + (0 - alt) * 0.01; // hover drift

  // Only move horizontally if airborne
  if ((v.altitude ?? 0) > 5) {
    if (pitchFwd) {
      v.x += Math.cos(v.angle + Math.PI / 2) * v.maxSpeed;
      v.y += Math.sin(v.angle + Math.PI / 2) * v.maxSpeed;
    }
    if (pitchBack) {
      v.x -= Math.cos(v.angle + Math.PI / 2) * v.maxSpeed * 0.7;
      v.y -= Math.sin(v.angle + Math.PI / 2) * v.maxSpeed * 0.7;
    }
    if (rollLeft) {
      v.x += Math.cos(v.angle) * v.maxSpeed * 0.7;
      v.y += Math.sin(v.angle) * v.maxSpeed * 0.7;
    }
    if (rollRight) {
      v.x -= Math.cos(v.angle) * v.maxSpeed * 0.7;
      v.y -= Math.sin(v.angle) * v.maxSpeed * 0.7;
    }
  }

  // Yaw
  if (yawLeft) v.angle -= 2 * dt;
  if (yawRight) v.angle += 2 * dt;

  // Clamp to world
  v.x = Math.max(0, Math.min(GRID_SIZE * TILE_SIZE, v.x));
  v.y = Math.max(0, Math.min(GRID_SIZE * TILE_SIZE, v.y));

  return { signalLost: false };
}
