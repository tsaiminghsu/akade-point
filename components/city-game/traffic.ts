import { Vehicle, VehicleType, Point, WorldData, TILE_SIZE, GRID_SIZE } from './types';
import { findRoadPath } from './worldGen';

const NPC_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#e67e22', '#16a085', '#d35400', '#2c3e50',
  '#e74c3c', '#3498db', '#2ecc71', '#9b59b6',
];

let vehicleIdCounter = 100;
export function nextVehicleId(): string {
  return `v${++vehicleIdCounter}`;
}

export function createNPCCar(world: WorldData, colorIndex: number): Vehicle {
  const spawn = world.spawnPoints[Math.floor(Math.random() * world.spawnPoints.length)] ??
    { x: 200, y: 200 };

  // Pick a random road destination
  const dest = world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)] ??
    { x: 400, y: 400 };

  const waypoints = findRoadPath(world.grid, spawn.x, spawn.y, dest.x, dest.y);

  return {
    id: nextVehicleId(),
    type: VehicleType.NPC_CAR,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
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

export function createTaxi(world: WorldData, playerX?: number, playerY?: number): Vehicle {
  // Find a road tile that is at a reasonable distance (200 - 350 units) from the player
  let spawn;
  if (playerX !== undefined && playerY !== undefined) {
    spawn = world.roadTiles.find(t => {
      const d = Math.sqrt((t.x - playerX) ** 2 + (t.y - playerY) ** 2);
      return d > 200 && d < 350;
    });
  }
  // Fallback to any road tile if none in range or coordinates not provided
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

export function createDeliveryScooter(world: WorldData, shopPos?: Point, playerX?: number, playerY?: number): Vehicle {
  let spawn = shopPos;
  // If no shop, try to find a nearby spawn point
  if (!spawn && playerX !== undefined && playerY !== undefined) {
    spawn = world.roadTiles.find(t => {
      const d = Math.sqrt((t.x - playerX) ** 2 + (t.y - playerY) ** 2);
      return d > 200 && d < 350;
    });
  }
  if (!spawn) {
    spawn = world.shopPositions[0] ?? world.roadTiles[0] ?? { x: 160, y: 160 };
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

  const targetAngle = Math.atan2(dy, dx) - Math.PI / 2;

  // Smooth angle
  let angleDiff = targetAngle - v.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  v.angle += angleDiff * Math.min(1, dt * 5);

  // Speed
  const slowDist = 40;
  const speedFactor = dist < slowDist ? dist / slowDist : 1;
  v.speed = Math.min(v.maxSpeed, v.speed + dt * 3) * speedFactor;

  const fwd = v.angle + Math.PI / 2;
  v.x += Math.cos(fwd) * v.speed;
  v.y += Math.sin(fwd) * v.speed;
}

// Update NPC traffic: follow road waypoints, re-route when finished
export function updateTraffic(
  vehicles: Map<string, Vehicle>,
  world: WorldData,
  dt: number,
  playerX?: number,
  playerY?: number
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
      
      if (distToPlayer > 400) {
        // Pick a RANDOM road tile near the player so multiple NPCs don't stack on the same spot
        const candidates = world.roadTiles.filter(t => {
          const d = Math.sqrt((t.x - playerX) ** 2 + (t.y - playerY) ** 2);
          return d > 180 && d < 300;
        });
        if (candidates.length > 0) {
          const nearbyTile = candidates[Math.floor(Math.random() * candidates.length)];
          v.x = nearbyTile.x;
          v.y = nearbyTile.y;
          v.speed = 0;
          v.waypoints = [];
          v.waypointIndex = 0;
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
      const dest = world.roadTiles[Math.floor(Math.random() * world.roadTiles.length)];
      v.waypoints = findRoadPath(world.grid, v.x, v.y, dest.x, dest.y);
      v.waypointIndex = 0;

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
    const path = findRoadPath(world.grid, v.x, v.y, targetX, targetY);
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
