import {
  GameState,
  Player,
  Vehicle,
  VehicleType,
  TileType,
  Order,
  DroneState,
  Waypoint,
  Notification,
  WorldData,
  HUDData,
  CallRecord,
  RaceSession,
  TILE_SIZE,
  GRID_SIZE,
  WORLD_SIZE,
} from './types';
import { InputManager } from './controls';
import {
  createNPCCar,
  createTaxi,
  createDeliveryScooter,
  createHelicopter,
  createDrone,
  updateTraffic,
  updateServiceVehicle,
  updateDrone,
  nextVehicleId,
} from './traffic';
import { generateWorld, getZoneName } from './worldGen';
import { createRaceSession, tickRace } from './race';
import { getCourse } from './raceCourses';

const CAR_MAX_SPEED = 160;      // 2D px / sec
const CAR_ACCELERATION = 280;   // 2D px / sec²
const CAR_DECEL = 200;
const FRICTION = 0.06;           // fraction of speed lost per second (exponential)
const STEER_SPEED = 2.2;         // radians / sec
const FOOT_SPEED = 70;
const ENTER_VEHICLE_RADIUS = 35;
const NPC_COUNT = 22;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}
function notifId() { return `n${Date.now()}_${Math.random().toString(36).slice(2, 5)}`; }

export type HUDCallback3D = (data: HUDData) => void;

// Race-mode drone physics constants (faster than free-fly)
const RACE_FWD_SPEED  = 320;  // px/sec
const RACE_SIDE_SPEED = 220;  // px/sec
const RACE_YAW_RATE   = 3.5;  // rad/sec
const RACE_THROTTLE   = 120;  // altitude units/sec
const RACE_BOOST_MULT = 1.5;

export class GameEngine3D {
  world: WorldData;
  player: Player;
  vehicles: Map<string, Vehicle>;
  orders: Order[];
  callLog: CallRecord[];
  drone: DroneState;
  waypoint: Waypoint;
  notifications: Notification[];
  zone: string;
  tick: number;
  camera: { x: number; y: number };
  raceSession: RaceSession | null = null;

  input: InputManager;
  private hudCallback: HUDCallback3D | null = null;
  private lastHudTime = 0;
  private racePrevX = 0;
  private racePrevY = 0;
  private racePrevAlt = 0;
  private raceDroneCollision = false;
  // Per-axis velocity for inertia in race mode (public for FPV FOV calculation in GameScene)
  raceVx = 0;
  raceVy = 0;

  constructor() {
    this.input = new InputManager();
    this.world = generateWorld(42);
    this.tick = 0;
    this.zone = '城市區';
    this.notifications = [];
    this.orders = [];
    this.callLog = [];
    this.camera = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
    this.waypoint = { x: 0, y: 0, active: false };
    this.drone = {
      active: false, altitude: 0, throttle: 0, pitch: 0,
      roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: null,
    };

    // Start player on a road tile near center
    const sx = Math.floor(GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
    const sy = Math.floor(GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;

    this.player = {
      x: sx, y: sy,
      angle: 0, speed: 0,
      maxSpeed: CAR_MAX_SPEED,
      state: 'inCar',
      currentVehicleId: null,
      health: 100,
    };

    this.vehicles = new Map();

    // Create player's car
    const pCar: Vehicle = {
      id: nextVehicleId(),
      type: VehicleType.CAR,
      x: sx, y: sy,
      angle: 0, speed: 0, maxSpeed: CAR_MAX_SPEED,
      color: '#00bcd4',
      width: 16, height: 26,
      occupant: 'player',
      waypoints: [], waypointIndex: 0,
    };
    this.vehicles.set(pCar.id, pCar);
    this.player.currentVehicleId = pCar.id;

    // NPC cars
    for (let i = 0; i < NPC_COUNT; i++) {
      const npc = createNPCCar(this.world, i);
      this.vehicles.set(npc.id, npc);
    }
  }

  setHUDCallback(cb: HUDCallback3D) { this.hudCallback = cb; }

  update(dt: number, nowMs: number): void {
    this.tick++;
    const { player, vehicles, orders, drone } = this;
    const isDriving = player.state === 'inCar' || player.state === 'inHelicopter';
    const input = this.input.getState(isDriving);

    // Expire notifications
    this.notifications = this.notifications.filter(n => n.expiresAt > nowMs);

    // Reset race collision flag each tick
    this.raceDroneCollision = false;

    // Player state update
    if (player.state === 'inCar') {
      this.updateCarPhysics(dt, input);
    } else if (player.state === 'inHelicopter') {
      this.updateHelicopterPhysics(dt, input);
    } else if (player.state === 'inDrone') {
      this.updateDronePhysics(dt, input);
    } else {
      this.updateFootPhysics(dt, input);
    }

    // Race session tick (after drone physics so prevX/Y/Alt are stale-from-last-frame)
    if (this.raceSession && drone.vehicleId) {
      const dv = vehicles.get(drone.vehicleId);
      if (dv) {
        const course = getCourse(this.raceSession.courseId);
        // tickRace mutates session in place — no allocation
        const event = tickRace(
          this.raceSession,
          this.racePrevX, this.racePrevY, this.racePrevAlt,
          dv.x, dv.y, dv.altitude ?? 0,
          course, dt, nowMs,
          input.boost,
          this.raceDroneCollision,
        );

        if (event === 'gate') {
          this.addNotification(`✓ 通過 ${this.raceSession.lastPassedGateIndex + 1}/${course.gates.length}`, '#00ff88');
        } else if (event === 'lap') {
          this.addNotification(`✅ 第 ${this.raceSession.currentLap - 1} 圈完成！`, '#ffff00');
        } else if (event === 'finish') {
          this.addNotification('🏁 完賽！', '#ffffff');
        } else if (event === 'crash') {
          this.addNotification('💥 撞機！自動重生中...', '#ff4444');
        } else if (event === 'respawn') {
          // Auto-respawn: teleport drone to last gate
          this.respawnAtLastGate();
        }

        // Sync boost state to drone for physics multiplier
        drone.throttle = this.raceSession.boostActive ? 1 : 0;

        // Store prev position for next frame
        this.racePrevX   = dv.x;
        this.racePrevY   = dv.y;
        this.racePrevAlt = dv.altitude ?? 0;
      }
    }

    // Race control inputs (FPV toggle, respawn)
    if (input.fpvToggle && this.raceSession) this.toggleFPV();
    if (input.respawn  && this.raceSession) this.manualRespawn();

    // Enter / exit vehicle
    if (input.enter) this.handleEnterExit();

    // NPC traffic
    updateTraffic(vehicles, this.world, dt, this.player.x, this.player.y, this.player.angle);

    // Service orders
    this.updateOrders(dt);

    // Drone battery (0.08 %/s → ~20 min flight time)
    if (drone.active && drone.vehicleId) {
      const dv = vehicles.get(drone.vehicleId);
      if (dv) {
        const d = dist(dv.x, dv.y, player.x, player.y);
        drone.signal = Math.max(0, 100 - (d / 500) * 100);
        drone.battery = Math.max(0, drone.battery - dt * 0.08);
        drone.altitude = dv.altitude ?? 0;
        if (drone.battery <= 0) {
          this.landDrone();
          this.addNotification('⚠️ 電量耗盡，自動降落', '#ff4444');
        }
      }
    }

    // Camera (2D mini-map tracking)
    this.camera.x = lerp(this.camera.x, player.x, 0.1);
    this.camera.y = lerp(this.camera.y, player.y, 0.1);

    // Zone
    this.zone = getZoneName(this.world.grid, player.x, player.y);

    // Order ETA
    orders.forEach(o => { o.eta = Math.max(0, o.eta - dt); });

    // HUD throttle (100ms)
    if (nowMs - this.lastHudTime > 100) {
      this.lastHudTime = nowMs;
      this.emitHUD();
    }

    this.input.flush();
  }

  private updateCarPhysics(dt: number, input: ReturnType<InputManager['getState']>) {
    const { player, vehicles } = this;
    if (!player.currentVehicleId) return;
    const car = vehicles.get(player.currentVehicleId);
    if (!car) return;

    // Acceleration / braking
    if (input.up) {
      car.speed = Math.min(CAR_MAX_SPEED, car.speed + CAR_ACCELERATION * dt);
    } else if (input.down) {
      car.speed = Math.max(-CAR_MAX_SPEED * 0.45, car.speed - CAR_DECEL * dt);
    } else {
      const frict = Math.pow(1 - FRICTION, dt * 60);
      car.speed *= frict;
      if (Math.abs(car.speed) < 0.5) car.speed = 0;
    }

    if (input.brake) car.speed *= Math.pow(0.7, dt * 60);

    // Steering: A/D turns, positive speed = turn right with D
    if (Math.abs(car.speed) > 2) {
      const steer = STEER_SPEED * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 50);
      if (input.left)  car.angle -= steer * dt;
      if (input.right) car.angle += steer * dt;
    }

    // Forward direction: angle=0 points North (−Y in 2D canvas)
    // angle increases clockwise. sin/cos gives East for angle=PI/2.
    // Use angle directly: W drives toward decreasing Y.
    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const ny = car.y - Math.cos(car.angle) * car.speed * dt;

    // Collision with buildings (half-tile shrink for car edges)
    const halfCar = 10; // px
    if (!this.isSolidAt(nx, ny) && !this.isSolidAt(nx + halfCar, ny) && !this.isSolidAt(nx - halfCar, ny)) {
      car.x = nx; car.y = ny;
    } else if (!this.isSolidAt(nx, car.y) && !this.isSolidAt(nx + halfCar, car.y) && !this.isSolidAt(nx - halfCar, car.y)) {
      car.x = nx;
      car.speed *= 0.5;
    } else if (!this.isSolidAt(car.x, ny) && !this.isSolidAt(car.x + halfCar, ny) && !this.isSolidAt(car.x - halfCar, ny)) {
      car.y = ny;
      car.speed *= 0.5;
    } else {
      car.speed *= 0.1;
    }

    car.x = Math.max(5, Math.min(WORLD_SIZE - 5, car.x));
    car.y = Math.max(5, Math.min(WORLD_SIZE - 5, car.y));
    player.x = car.x; player.y = car.y;
    player.angle = car.angle; player.speed = car.speed;
  }

  private updateHelicopterPhysics(dt: number, input: ReturnType<InputManager['getState']>) {
    const { player, vehicles } = this;
    if (!player.currentVehicleId) return;
    const heli = vehicles.get(player.currentVehicleId);
    if (!heli) return;

    // Altitude control using Space (ascend) and Q (descend)
    const alt = heli.altitude ?? 0;
    if (input.droneThrottleUp) heli.altitude = Math.min(60, alt + 15 * dt);
    else if (input.droneThrottleDown) heli.altitude = Math.max(0, alt - 12 * dt);
    else heli.altitude = alt;

    const spd = 200 * dt; // frame-rate independent speed in px/sec
    if (input.up) {
      heli.x += Math.sin(heli.angle) * spd;
      heli.y -= Math.cos(heli.angle) * spd;
    }
    if (input.down) {
      heli.x -= Math.sin(heli.angle) * spd * 0.6;
      heli.y += Math.cos(heli.angle) * spd * 0.6;
    }
    if (input.left) heli.angle -= 1.8 * dt;
    if (input.right) heli.angle += 1.8 * dt;

    heli.x = Math.max(5, Math.min(WORLD_SIZE - 5, heli.x));
    heli.y = Math.max(5, Math.min(WORLD_SIZE - 5, heli.y));
    player.x = heli.x; player.y = heli.y; player.angle = heli.angle;
  }

  private updateDronePhysics(dt: number, input: ReturnType<InputManager['getState']>) {
    const { drone, vehicles, player } = this;
    if (!drone.vehicleId) return;
    const dv = vehicles.get(drone.vehicleId);
    if (!dv) return;
    const prevX = dv.x;
    const prevY = dv.y;

    const inRace = !!this.raceSession && this.raceSession.phase === 'racing';

    if (inRace) {
      this.updateRaceDronePhysics(dt, input, dv);
    } else {
      // Normal free-fly drone physics
      // Skip physics entirely if crashed (race mode crashed phase)
      if (this.raceSession?.phase === 'crashed') {
        return;
      }
      const result = updateDrone(
        dv,
        input.droneThrottleUp, input.droneThrottleDown,
        input.up, input.down, input.left, input.right,
        input.droneYawLeft, input.droneYawRight,
        player.x, player.y, dt,
      );
      if (result.signalLost && drone.signal < 5) {
        const alreadyNotified = this.notifications.some(n => n.text === '⚠️ 訊號失聯，自動返航');
        if (!alreadyNotified) this.addNotification('⚠️ 訊號失聯，自動返航', '#ff4444');
      }
    }

    const halfDrone = 9;
    const alt = dv.altitude ?? 0;
    const canOccupy = (x: number, y: number) =>
      !this.isSolidAtAlt(x, y, alt) &&
      !this.isSolidAtAlt(x + halfDrone, y, alt) &&
      !this.isSolidAtAlt(x - halfDrone, y, alt) &&
      !this.isSolidAtAlt(x, y + halfDrone, alt) &&
      !this.isSolidAtAlt(x, y - halfDrone, alt);

    if (!canOccupy(dv.x, dv.y)) {
      if (inRace) {
        // In race mode, register collision (tickRace will handle crash state)
        this.raceDroneCollision = true;
      }
      // Slide along axes or revert
      if (canOccupy(dv.x, prevY)) {
        dv.y = prevY;
      } else if (canOccupy(prevX, dv.y)) {
        dv.x = prevX;
      } else {
        dv.x = prevX;
        dv.y = prevY;
      }
    }

    player.angle = dv.angle;
  }

  private updateRaceDronePhysics(dt: number, input: ReturnType<InputManager['getState']>, dv: Vehicle) {
    const rs = this.raceSession!;
    const boost = rs.boostActive ? RACE_BOOST_MULT : 1;

    // Yaw
    if (input.droneYawLeft)  dv.angle -= RACE_YAW_RATE * dt;
    if (input.droneYawRight) dv.angle += RACE_YAW_RATE * dt;

    // Altitude (only when alt > 1 to ensure it's airborne)
    const alt = dv.altitude ?? 0;
    if (input.droneThrottleUp) {
      dv.altitude = Math.min(200, alt + RACE_THROTTLE * dt);
    } else if (input.droneThrottleDown) {
      dv.altitude = Math.max(0, alt - RACE_THROTTLE * dt);
    }
    // Slight hover drift
    dv.altitude = Math.max(0, (dv.altitude ?? 0) + ((dv.targetAltitude ?? 0) - (dv.altitude ?? 0)) * 0.01);

    if ((dv.altitude ?? 0) < 2) return; // must be airborne to move

    // Target horizontal velocities based on input (in local frame)
    const fwdSpeed  = RACE_FWD_SPEED  * boost;
    const sideSpeed = RACE_SIDE_SPEED * boost;
    const targetVfwd  = input.up ? fwdSpeed : input.down ? -fwdSpeed * 0.6 : 0;
    const targetVside = input.right ? sideSpeed : input.left ? -sideSpeed : 0;

    // Rotate local velocity to world space using drone angle
    const sin = Math.sin(dv.angle);
    const cos = Math.cos(dv.angle);
    const targetVx = sin * targetVfwd + cos * targetVside;
    const targetVy = -cos * targetVfwd + sin * targetVside;

    // Inertia: lerp toward target velocity
    const inertiaRate = 8; // higher = snappier
    this.raceVx += (targetVx - this.raceVx) * Math.min(1, inertiaRate * dt);
    this.raceVy += (targetVy - this.raceVy) * Math.min(1, inertiaRate * dt);

    dv.x += this.raceVx * dt;
    dv.y += this.raceVy * dt;
    dv.x = Math.max(5, Math.min(WORLD_SIZE - 5, dv.x));
    dv.y = Math.max(5, Math.min(WORLD_SIZE - 5, dv.y));

    // Update visual pitch/roll on drone state
    this.drone.pitch = targetVfwd / fwdSpeed;
    this.drone.roll  = targetVside / sideSpeed;
  }

  private updateFootPhysics(dt: number, input: ReturnType<InputManager['getState']>) {
    const { player } = this;
    const dx = Math.sin(player.angle) * FOOT_SPEED * dt;
    const dy = -Math.cos(player.angle) * FOOT_SPEED * dt;
    if (input.left)  player.angle -= 2.5 * dt;
    if (input.right) player.angle += 2.5 * dt;
    if (input.up) {
      const nx = player.x + dx, ny = player.y + dy;
      if (!this.isSolidAt(nx, ny)) { player.x = nx; player.y = ny; }
      else if (!this.isSolidAt(nx, player.y)) player.x = nx;
      else if (!this.isSolidAt(player.x, ny)) player.y = ny;
    }
    if (input.down) {
      const nx = player.x - dx * 0.5, ny = player.y - dy * 0.5;
      if (!this.isSolidAt(nx, ny)) { player.x = nx; player.y = ny; }
      else if (!this.isSolidAt(nx, player.y)) player.x = nx;
      else if (!this.isSolidAt(player.x, ny)) player.y = ny;
    }
    player.x = Math.max(5, Math.min(WORLD_SIZE - 5, player.x));
    player.y = Math.max(5, Math.min(WORLD_SIZE - 5, player.y));
  }

  private handleEnterExit() {
    const { player, vehicles } = this;

    if (player.state === 'inCar' || player.state === 'inHelicopter') {
      const v = player.currentVehicleId ? vehicles.get(player.currentVehicleId) : null;
      if (v) {
        v.occupant = null;
        v.speed = 0;
        // Mark as "parked" — traffic system skips isService vehicles
        // so the car stays where the player left it
        v.isService = true;
      }
      player.state = 'onFoot';
      player.currentVehicleId = null;
      this.addNotification('已下車', '#aaa');
      return;
    }
    if (player.state === 'inDrone') { this.landDrone(); return; }

    let closest: Vehicle | null = null;
    let closestDist = Infinity;
    vehicles.forEach(v => {
      if (v.type === VehicleType.RC_DRONE) return;
      if (v.occupant === 'player') return;
      const d = dist(player.x, player.y, v.x, v.y);
      if (d < ENTER_VEHICLE_RADIUS && d < closestDist) { closestDist = d; closest = v; }
    });

    if (closest) {
      const v = closest as Vehicle;
      v.occupant = 'player';
      v.waypoints = [];
      v.waypointIndex = 0;
      player.currentVehicleId = v.id;
      if (v.type === VehicleType.HELICOPTER) {
        player.state = 'inHelicopter';
        this.addNotification('🚁 已登上直升機！', '#a0d8ef');
        const o = this.orders.find(o => o.vehicleId === v.id);
        if (o) {
          o.status = 'completed';
          const record = this.callLog.find(r => r.id === o.id);
          if (record) record.status = 'completed';
        }
      } else {
        player.state = 'inCar';
        const lbl = v.type === VehicleType.TAXI ? '🚕 上車！' : v.type === VehicleType.DELIVERY_SCOOTER ? '📦 上機車！' : '🚗 上車！';
        this.addNotification(lbl, '#00ff88');
        const o = this.orders.find(o => o.vehicleId === v.id);
        if (o) {
          o.status = 'completed';
          const record = this.callLog.find(r => r.id === o.id);
          if (record) record.status = 'completed';
        }
      }
    } else {
      this.addNotification('附近沒有車輛 (F)', '#666');
    }
  }

  private updateOrders(dt: number) {
    const { orders, vehicles, player } = this;
    orders.forEach(order => {
      if (order.status === 'completed') return;
      const v = vehicles.get(order.vehicleId);
      if (!v) return;
      // Once arrived, freeze the vehicle in place so it waits for the player
      if (order.status === 'arrived') {
        v.speed = 0;
        v.waypoints = [];
        v.waypointIndex = 0;
        return;
      }
      const isAerial = order.type === 'helicopter';
      const arrived = updateServiceVehicle(v, player.x, player.y, dt, this.world, isAerial);
      if (arrived) {
        order.status = 'arrived';
        const record = this.callLog.find(r => r.id === order.id);
        if (record) record.status = 'arrived';
        const msg = order.type === 'taxi' ? '🚕 計程車到了！按 F 上車'
          : order.type === 'food' ? '🍕 外送到了！按 F 上機車'
          : '🚁 直升機到了！按 F 登機';
        this.addNotification(msg, '#00ff88');
      }
    });
    if (orders.filter(o => o.status !== 'completed').length < orders.length - 3) {
      this.orders = orders.filter(o => o.status !== 'completed');
    }
  }

  private isSolidAt(wx: number, wy: number): boolean {
    const gx = Math.floor(wx / TILE_SIZE);
    const gy = Math.floor(wy / TILE_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return true;
    const tile = this.world.grid[gy]?.[gx];
    // TOWN_HALL_INTERIOR and TOWN_HALL_PLAZA are walkable — only TOWN_HALL is solid
    return tile?.type === TileType.BUILDING
      || tile?.type === TileType.HELIPAD
      || tile?.type === TileType.TOWN_HALL;
  }

  // Altitude-aware solid check for drones. Returns false if the drone is physically
  // above the building's roof (altitude > floors * 14 + 5 safety buffer).
  private isSolidAtAlt(wx: number, wy: number, altitude: number): boolean {
    const gx = Math.floor(wx / TILE_SIZE);
    const gy = Math.floor(wy / TILE_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return true;
    const tile = this.world.grid[gy]?.[gx];
    if (!tile) return false;
    // 14 altitude units per floor (FLOOR_HEIGHT_3D=1.4 / (TILE_3D/TILE_SIZE)=0.1)
    const ALT_PER_FLOOR = 14;
    const BUFFER = 5;
    if (tile.type === TileType.BUILDING) {
      return altitude < (tile.floors ?? 1) * ALT_PER_FLOOR + BUFFER;
    }
    if (tile.type === TileType.HELIPAD) {
      return altitude < (tile.floors ?? 15) * ALT_PER_FLOOR + BUFFER;
    }
    if (tile.type === TileType.TOWN_HALL) {
      return altitude < (tile.floors ?? 8) * ALT_PER_FLOOR + BUFFER;
    }
    return false;
  }

  addNotification(text: string, color = '#fff') {
    // Use performance.now() to match the expiry check in update()
    this.notifications.push({ id: notifId(), text, expiresAt: performance.now() + 3500, color });
    if (this.notifications.length > 5) this.notifications.shift();
  }

  cancelOrder(orderId: string) {
    const idx = this.orders.findIndex(o => o.id === orderId);
    if (idx === -1) return;
    const o = this.orders[idx];
    // Remove service vehicle
    this.vehicles.delete(o.vehicleId);
    this.orders.splice(idx, 1);
    const record = this.callLog.find(r => r.id === orderId);
    if (record) record.status = 'cancelled';
    this.addNotification('❌ 已取消服務', '#aaa');
  }

  setWaypoint(wx: number, wy: number) {
    this.waypoint = { x: wx, y: wy, active: true };
    this.addNotification('📍 路標已設定', '#00e5ff');
  }

  dispatchTaxi() {
    if (this.orders.find(o => o.type === 'taxi' && o.status !== 'completed')) { this.addNotification('計程車已在路上！', '#ffee00'); return; }
    const t = createTaxi(this.world, this.player.x, this.player.y, this.player.angle);
    this.vehicles.set(t.id, t);
    const orderId = `o_t_${Date.now()}`;
    this.orders.push({ id: orderId, type: 'taxi', status: 'dispatched', vehicleId: t.id, eta: 60, label: '🚕 計程車' });
    this.callLog.push({ id: orderId, type: 'taxi', label: '🚕 計程車', calledAt: Date.now(), status: 'called' });
    this.addNotification('🚕 計程車已派出！', '#ffee00');
  }

  dispatchFood(shopIdx = 0) {
    if (this.orders.find(o => o.type === 'food' && o.status !== 'completed')) { this.addNotification('外送已在路上！', '#ff8c00'); return; }
    const shop = this.world.shopPositions[shopIdx % Math.max(1, this.world.shopPositions.length)];
    const s = createDeliveryScooter(this.world, shop, this.player.x, this.player.y, this.player.angle);
    this.vehicles.set(s.id, s);
    const orderId = `o_f_${Date.now()}`;
    this.orders.push({ id: orderId, type: 'food', status: 'dispatched', vehicleId: s.id, eta: 90, label: '🍕 外送' });
    this.callLog.push({ id: orderId, type: 'food', label: '🍕 外送', calledAt: Date.now(), status: 'called' });
    this.addNotification('🍕 外送已出發！', '#ff8c00');
  }

  dispatchHelicopter() {
    if (this.orders.find(o => o.type === 'helicopter' && o.status !== 'completed')) { this.addNotification('直升機已在路上！', '#a0d8ef'); return; }
    const h = createHelicopter(this.world);
    this.vehicles.set(h.id, h);
    const orderId = `o_h_${Date.now()}`;
    this.orders.push({ id: orderId, type: 'helicopter', status: 'dispatched', vehicleId: h.id, eta: 30, label: '🚁 直升機' });
    this.callLog.push({ id: orderId, type: 'helicopter', label: '🚁 直升機', calledAt: Date.now(), status: 'called' });
    this.addNotification('🚁 直升機已起飛！', '#a0d8ef');
  }

  launchDrone() {
    if (this.drone.active) { this.addNotification('無人機已在飛', '#00e5ff'); return; }
    const d = createDrone(this.player.x, this.player.y);
    d.angle = this.player.angle;
    // Start slightly above ground so it's immediately visible
    d.altitude = 8;
    d.targetAltitude = 8;
    this.vehicles.set(d.id, d);
    this.drone = { active: true, altitude: 8, throttle: 0, pitch: 0, roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: d.id };
    this.player.state = 'inDrone';
    this.addNotification('🚁 無人機起飛！', '#00e5ff');
  }

  landDrone() {
    if (this.raceSession) this.exitRace();
    if (this.drone.vehicleId) this.vehicles.delete(this.drone.vehicleId);
    this.drone = { active: false, altitude: 0, throttle: 0, pitch: 0, roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: null };
    this.player.state = 'onFoot';
    this.addNotification('無人機已降落', '#00e5ff');
  }

  // ── Race management ────────────────────────────────────────────────────────

  startRace(courseId: string) {
    const course = getCourse(courseId);
    if (!this.drone.active) {
      this.launchDrone();
    }
    // Teleport drone to start gate
    if (this.drone.vehicleId) {
      const sf = course.gates[0];
      const dv = this.vehicles.get(this.drone.vehicleId);
      if (dv && sf) {
        const APPROACH_DIST = 100;
        const nx = Math.sin(sf.yaw);
        const nz = -Math.cos(sf.yaw);
        dv.x = sf.x - nx * APPROACH_DIST;
        dv.y = sf.y - nz * APPROACH_DIST;
        dv.altitude = sf.altitude;
        dv.targetAltitude = sf.altitude;
        dv.angle = sf.yaw;
        this.player.angle = sf.yaw;
      }
    }
    this.raceSession = { ...createRaceSession(course), respawnInvincTimer: 2.0 };
    this.raceVx = 0;
    this.raceVy = 0;
    this.raceDroneCollision = false;
    if (this.drone.vehicleId) {
      const dv = this.vehicles.get(this.drone.vehicleId);
      this.racePrevX   = dv?.x   ?? this.player.x;
      this.racePrevY   = dv?.y   ?? this.player.y;
      this.racePrevAlt = dv?.altitude ?? 8;
    }
    this.addNotification(`🏁 ${course.name} — 準備起飛！`, course.color);
  }

  exitRace() {
    this.raceSession = null;
    this.raceVx = 0;
    this.raceVy = 0;
    // Reset drone visual tilt
    this.drone.pitch = 0;
    this.drone.roll  = 0;
    this.addNotification('退出賽道模式', '#aaa');
  }

  respawnAtLastGate() {
    if (!this.raceSession || !this.drone.vehicleId) return;
    const course = getCourse(this.raceSession.courseId);
    // Respawn before the next gate to pass (currentGateIndex), or before gate 0 if none passed
    const nextIdx = Math.min(this.raceSession.currentGateIndex, course.gates.length - 1);
    const gate = course.gates[nextIdx];
    if (!gate) return;

    // Place drone 100px BEFORE the gate (approaching from correct side)
    const APPROACH_DIST = 100;
    const nx = Math.sin(gate.yaw);
    const nz = -Math.cos(gate.yaw);
    const dv = this.vehicles.get(this.drone.vehicleId);
    if (dv) {
      dv.x = gate.x - nx * APPROACH_DIST;
      dv.y = gate.y - nz * APPROACH_DIST;
      dv.altitude = gate.altitude;
      dv.targetAltitude = gate.altitude;
      dv.angle = gate.yaw;
      this.player.angle = gate.yaw;
    }
    this.raceVx = 0;
    this.raceVy = 0;
    this.racePrevX   = dv?.x   ?? this.player.x;
    this.racePrevY   = dv?.y   ?? this.player.y;
    this.racePrevAlt = dv?.altitude ?? gate.altitude;
    // Mutate in place — no allocation
    this.raceSession.phase = 'racing';
    this.raceSession.autoRespawnTimer = 0;
    this.raceSession.cameraShake = 0;
    this.raceSession.respawnInvincTimer = 1.5;  // 1.5s collision immunity after respawn
  }

  manualRespawn() {
    if (!this.raceSession) return;
    if (this.raceSession.phase === 'crashed' || this.raceSession.phase === 'racing') {
      this.respawnAtLastGate();
    }
  }

  toggleFPV() {
    if (!this.raceSession) return;
    this.raceSession.fpvMode = !this.raceSession.fpvMode;
  }

  retryRace() {
    if (!this.raceSession) return;
    const courseId = this.raceSession.courseId;
    this.startRace(courseId);
  }

  // For mini-map (returns 2D world state snapshot)
  getStateSnapshot(): GameState {
    return {
      player: { ...this.player },
      vehicles: this.vehicles,
      orders: this.orders,
      drone: { ...this.drone },
      waypoint: { ...this.waypoint },
      camera: { ...this.camera },
      tick: this.tick,
      notifications: this.notifications,
      zone: this.zone,
    };
  }

  private emitHUD() {
    if (!this.hudCallback) return;
    const { player, orders, drone, waypoint, zone, notifications } = this;
    const curVeh = player.currentVehicleId ? this.vehicles.get(player.currentVehicleId) : null;
    const speedPxS = Math.abs(curVeh?.speed ?? player.speed);
    const data: HUDData = {
      speed: speedPxS,
      speedKMH: Math.round(speedPxS * 0.25),
      playerState: player.state,
      vehicleType: curVeh?.type ?? null,
      orders: [...orders],
      drone: { ...drone },
      waypoint: { ...waypoint },
      zone,
      playerX: Math.round(player.x),
      playerY: Math.round(player.y),
      notifications: [...notifications],
      vehicleAltitude: curVeh?.altitude,
      nearTownHall: dist(player.x, player.y, this.world.townHallPos.x, this.world.townHallPos.y) < 220,
      callLog: [...this.callLog],
      raceSession: this.raceSession ? { ...this.raceSession } : null,
    };
    this.hudCallback(data);
  }
}
