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
  TILE_SIZE,
  GRID_SIZE,
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
import { renderFrame } from './renderer';
import { generateWorld, getZoneName } from './worldGen';

const CAR_ACCELERATION = 120; // world units / sec^2
const CAR_MAX_SPEED = 180;    // world units / sec
const CAR_FRICTION = 0.88;
const FOOT_SPEED = 70;
const ENTER_VEHICLE_RADIUS = 35;
const NPC_COUNT = 20;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function notifId(): string {
  return `n${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export type HUDCallback = (data: {
  speed: number;
  playerState: Player['state'];
  vehicleType: VehicleType | null;
  orders: Order[];
  drone: DroneState;
  waypoint: Waypoint;
  zone: string;
  playerX: number;
  playerY: number;
  notifications: Notification[];
}) => void;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: WorldData;
  private state: GameState;
  private input: InputManager;
  private rafId: number = 0;
  private lastTime: number = 0;
  private hudCallback: HUDCallback | null = null;
  private lastHudUpdate: number = 0;
  private playerVehicle: Vehicle | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.world = generateWorld(42);
    this.input = new InputManager();

    // Player start position: near center on a road
    const startX = Math.floor(GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
    const startY = Math.floor(GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;

    const playerCar = this.createPlayerCar(startX + TILE_SIZE, startY);

    const vehicles = new Map<string, Vehicle>();
    vehicles.set(playerCar.id, playerCar);

    // Spawn NPC cars
    for (let i = 0; i < NPC_COUNT; i++) {
      const npc = createNPCCar(this.world, i);
      vehicles.set(npc.id, npc);
    }

    this.state = {
      player: {
        x: startX,
        y: startY,
        angle: 0,
        speed: 0,
        maxSpeed: FOOT_SPEED,
        state: 'onFoot',
        currentVehicleId: null,
        health: 100,
      },
      vehicles,
      orders: [],
      drone: {
        active: false,
        altitude: 0,
        throttle: 0,
        pitch: 0,
        roll: 0,
        yaw: 0,
        battery: 100,
        signal: 100,
        vehicleId: null,
      },
      waypoint: { x: 0, y: 0, active: false },
      camera: { x: startX, y: startY },
      tick: 0,
      notifications: [],
      zone: '城市區',
    };
  }

  private createPlayerCar(x: number, y: number): Vehicle {
    return {
      id: nextVehicleId(),
      type: VehicleType.CAR,
      x, y,
      angle: 0,
      speed: 0,
      maxSpeed: CAR_MAX_SPEED,
      color: '#00bcd4',
      width: 16,
      height: 26,
      occupant: null,
      waypoints: [],
      waypointIndex: 0,
    };
  }

  setHUDCallback(cb: HUDCallback): void {
    this.hudCallback = cb;
  }

  setWaypoint(wx: number, wy: number): void {
    this.state.waypoint = { x: wx, y: wy, active: true };
    this.addNotification('📍 路標已設定', '#00e5ff');
  }

  dispatchTaxi(): void {
    if (this.state.orders.find(o => o.type === 'taxi' && o.status !== 'completed')) {
      this.addNotification('計程車已在路上了！', '#ffee00');
      return;
    }
    const taxi = createTaxi(this.world);
    this.state.vehicles.set(taxi.id, taxi);
    const order: Order = {
      id: `o_taxi_${Date.now()}`,
      type: 'taxi',
      status: 'dispatched',
      vehicleId: taxi.id,
      eta: 60,
      label: '🚕 計程車',
    };
    this.state.orders.push(order);
    this.addNotification('🚕 計程車已派出！', '#ffee00');
  }

  dispatchFood(shopIndex = 0): void {
    if (this.state.orders.find(o => o.type === 'food' && o.status !== 'completed')) {
      this.addNotification('外送已在路上了！', '#ff8c00');
      return;
    }
    const shop = this.world.shopPositions[shopIndex % Math.max(1, this.world.shopPositions.length)];
    const scooter = createDeliveryScooter(this.world, shop);
    this.state.vehicles.set(scooter.id, scooter);
    const order: Order = {
      id: `o_food_${Date.now()}`,
      type: 'food',
      status: 'dispatched',
      vehicleId: scooter.id,
      eta: 90,
      label: '🍕 外送',
    };
    this.state.orders.push(order);
    this.addNotification('🍕 外送已出發！', '#ff8c00');
  }

  dispatchHelicopter(): void {
    if (this.state.orders.find(o => o.type === 'helicopter' && o.status !== 'completed')) {
      this.addNotification('直升機已在路上了！', '#a0d8ef');
      return;
    }
    const heli = createHelicopter(this.world);
    this.state.vehicles.set(heli.id, heli);
    const order: Order = {
      id: `o_heli_${Date.now()}`,
      type: 'helicopter',
      status: 'dispatched',
      vehicleId: heli.id,
      eta: 30,
      label: '🚁 直升機',
    };
    this.state.orders.push(order);
    this.addNotification('🚁 直升機已起飛！', '#a0d8ef');
  }

  launchDrone(): void {
    if (this.state.drone.active) {
      this.addNotification('無人機已在飛行中', '#00e5ff');
      return;
    }
    const drone = createDrone(this.state.player.x, this.state.player.y);
    this.state.vehicles.set(drone.id, drone);
    this.state.drone = {
      active: true,
      altitude: 0,
      throttle: 0,
      pitch: 0,
      roll: 0,
      yaw: 0,
      battery: 100,
      signal: 100,
      vehicleId: drone.id,
    };
    this.addNotification('🚁 無人機已起飛！切換至無人機控制', '#00e5ff');
    this.state.player.state = 'inDrone';
  }

  landDrone(): void {
    if (!this.state.drone.active) return;
    const droneId = this.state.drone.vehicleId;
    if (droneId) this.state.vehicles.delete(droneId);
    this.state.drone = { active: false, altitude: 0, throttle: 0, pitch: 0, roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: null };
    this.state.player.state = 'onFoot';
    this.addNotification('無人機已降落', '#00e5ff');
  }

  private addNotification(text: string, color = '#fff'): void {
    const notif: Notification = {
      id: notifId(),
      text,
      expiresAt: Date.now() + 3500,
      color,
    };
    this.state.notifications.push(notif);
    if (this.state.notifications.length > 5) {
      this.state.notifications.shift();
    }
  }

  start(): void {
    this.input.attach();
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  stop(): void {
    this.input.detach();
    cancelAnimationFrame(this.rafId);
  }

  private loop(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.state.tick++;

    this.update(dt);
    this.render();

    // Throttle HUD updates to 10fps
    if (time - this.lastHudUpdate > 100) {
      this.lastHudUpdate = time;
      this.emitHUD();
    }

    this.input.flush();
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  private update(dt: number): void {
    const { player, vehicles, orders, drone } = this.state;
    const input = this.input.getState(player.state === 'inCar');

    // Toggle phone / map via key (handled in React, just flush)
    if (input.phone) this.input.consume('KeyP');
    if (input.mapToggle) this.input.consume('KeyM');

    // Expire notifications
    const now = Date.now();
    this.state.notifications = this.state.notifications.filter(n => n.expiresAt > now);

    // State-specific updates
    if (player.state === 'inDrone') {
      this.updateDroneControl(dt, input);
    } else if (player.state === 'inCar') {
      this.updateCarControl(dt, input);
    } else if (player.state === 'inHelicopter') {
      this.updateHelicopterControl(dt, input);
    } else {
      this.updateFootControl(dt, input);
    }

    // Enter/exit vehicle
    if (input.enter) {
      this.handleEnterExit();
    }

    // Update NPC traffic
    updateTraffic(vehicles, this.world, dt);

    // Update service orders
    this.updateOrders(dt);

    // Drain drone battery
    if (drone.active && drone.vehicleId) {
      const droneVeh = vehicles.get(drone.vehicleId);
      if (droneVeh) {
        const dx = droneVeh.x - player.x;
        const dy = droneVeh.y - player.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        drone.signal = Math.max(0, 100 - (d / 500) * 100);
        drone.battery = Math.max(0, drone.battery - dt * 1.5);
        drone.altitude = droneVeh.altitude ?? 0;
        if (drone.battery <= 0) {
          this.landDrone();
          this.addNotification('⚠️ 無人機電量耗盡，自動降落', '#ff4444');
        }
      }
    }

    // Camera smooth follow
    const targetX = player.state === 'inDrone' && drone.vehicleId
      ? vehicles.get(drone.vehicleId)?.x ?? player.x
      : player.x;
    const targetY = player.state === 'inDrone' && drone.vehicleId
      ? vehicles.get(drone.vehicleId)?.y ?? player.y
      : player.y;
    this.state.camera.x = lerp(this.state.camera.x, targetX, 0.1);
    this.state.camera.y = lerp(this.state.camera.y, targetY, 0.1);

    // Zone
    this.state.zone = getZoneName(this.world.grid, player.x, player.y);

    // Order ETA countdown
    orders.forEach(o => { o.eta = Math.max(0, o.eta - dt); });
  }

  private updateFootControl(dt: number, input: ReturnType<InputManager['getState']>): void {
    const { player } = this.state;
    const speed = FOOT_SPEED;

    if (input.up) {
      player.x += Math.cos(player.angle - Math.PI / 2) * speed * dt;
      player.y += Math.sin(player.angle - Math.PI / 2) * speed * dt;
    }
    if (input.down) {
      player.x -= Math.cos(player.angle - Math.PI / 2) * speed * dt * 0.6;
      player.y -= Math.sin(player.angle - Math.PI / 2) * speed * dt * 0.6;
    }

    let turn = 0;
    if (input.left) turn -= 2.5;
    if (input.right) turn += 2.5;
    player.angle += turn * dt;

    // Clamp to world
    player.x = Math.max(5, Math.min(GRID_SIZE * TILE_SIZE - 5, player.x));
    player.y = Math.max(5, Math.min(GRID_SIZE * TILE_SIZE - 5, player.y));
  }

  private updateCarControl(dt: number, input: ReturnType<InputManager['getState']>): void {
    const { player, vehicles } = this.state;
    if (!player.currentVehicleId) return;
    const car = vehicles.get(player.currentVehicleId);
    if (!car) return;

    const accel = CAR_ACCELERATION * dt;

    if (input.up) car.speed = Math.min(car.maxSpeed * dt, car.speed + accel);
    else if (input.down) car.speed = Math.max(-car.maxSpeed * 0.5 * dt, car.speed - accel);
    else car.speed *= CAR_FRICTION;

    if (input.brake) car.speed *= 0.8;

    // Steering (proportional to speed)
    const steerStrength = 2.5 * Math.min(1, Math.abs(car.speed) / (car.maxSpeed * dt * 0.5));
    if (input.left) car.angle -= steerStrength * dt * Math.sign(car.speed);
    if (input.right) car.angle += steerStrength * dt * Math.sign(car.speed);

    // Move
    const fwdAngle = car.angle + Math.PI / 2;
    const newX = car.x + Math.cos(fwdAngle) * car.speed;
    const newY = car.y + Math.sin(fwdAngle) * car.speed;

    // Simple collision: don't enter buildings
    const blocked = this.isSolidAt(newX, newY);
    if (!blocked) {
      car.x = newX;
      car.y = newY;
    } else {
      // Slide
      const blockedX = this.isSolidAt(newX, car.y);
      const blockedY = this.isSolidAt(car.x, newY);
      if (!blockedX) car.x = newX;
      if (!blockedY) car.y = newY;
      car.speed *= 0.3;
    }

    // Clamp
    car.x = Math.max(5, Math.min(GRID_SIZE * TILE_SIZE - 5, car.x));
    car.y = Math.max(5, Math.min(GRID_SIZE * TILE_SIZE - 5, car.y));

    // Sync player position to car
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = car.speed;
  }

  private updateHelicopterControl(dt: number, input: ReturnType<InputManager['getState']>): void {
    const { player, vehicles } = this.state;
    if (!player.currentVehicleId) return;
    const heli = vehicles.get(player.currentVehicleId);
    if (!heli) return;

    const speed = 3;
    if (input.up) {
      heli.x += Math.cos(heli.angle + Math.PI / 2) * speed;
      heli.y += Math.sin(heli.angle + Math.PI / 2) * speed;
    }
    if (input.down) {
      heli.x -= Math.cos(heli.angle + Math.PI / 2) * speed * 0.6;
      heli.y -= Math.sin(heli.angle + Math.PI / 2) * speed * 0.6;
    }
    if (input.left) heli.angle -= 2 * dt;
    if (input.right) heli.angle += 2 * dt;

    heli.x = Math.max(5, Math.min(GRID_SIZE * TILE_SIZE - 5, heli.x));
    heli.y = Math.max(5, Math.min(GRID_SIZE * TILE_SIZE - 5, heli.y));

    player.x = heli.x;
    player.y = heli.y;
    player.angle = heli.angle;
  }

  private updateDroneControl(dt: number, input: ReturnType<InputManager['getState']>): void {
    const { drone, vehicles } = this.state;
    if (!drone.vehicleId) return;
    const droneVeh = vehicles.get(drone.vehicleId);
    if (!droneVeh) return;

    const result = updateDrone(
      droneVeh,
      input.droneThrottleUp,
      input.droneThrottleDown,
      input.up,
      input.down,
      input.left,
      input.right,
      input.droneYawLeft,
      input.droneYawRight,
      this.state.player.x,
      this.state.player.y,
      dt
    );

    if (result.signalLost && drone.signal < 5) {
      this.addNotification('⚠️ 無人機訊號失聯，自動返航', '#ff4444');
    }
  }

  private handleEnterExit(): void {
    const { player, vehicles } = this.state;

    if (player.state === 'inCar' || player.state === 'inHelicopter') {
      // Exit
      const vid = player.currentVehicleId;
      if (vid) {
        const v = vehicles.get(vid);
        if (v) { v.occupant = null; v.speed = 0; }
      }
      player.state = 'onFoot';
      player.currentVehicleId = null;
      this.addNotification('已下車', '#aaa');
      return;
    }

    if (player.state === 'inDrone') {
      this.landDrone();
      return;
    }

    // Try to enter nearby vehicle
    let closest: Vehicle | null = null;
    let closestDist = Infinity;
    vehicles.forEach(v => {
      if (v.occupant === 'npc' && v.type !== VehicleType.RC_DRONE) return;
      if (v.occupant === 'player') return;
      const d = dist(player.x, player.y, v.x, v.y);
      if (d < ENTER_VEHICLE_RADIUS && d < closestDist) {
        closestDist = d;
        closest = v;
      }
    });

    if (closest) {
      const v = closest as Vehicle;
      v.occupant = 'player';
      player.currentVehicleId = v.id;

      if (v.type === VehicleType.HELICOPTER) {
        player.state = 'inHelicopter';
        this.addNotification('🚁 已登上直升機！', '#a0d8ef');
        // Mark helicopter order complete
        const order = this.state.orders.find(o => o.vehicleId === v.id);
        if (order) order.status = 'completed';
      } else {
        player.state = 'inCar';
        const label = v.type === VehicleType.TAXI ? '🚕 已上計程車！'
          : v.type === VehicleType.DELIVERY_SCOOTER ? '📦 已上外送機車！'
          : '🚗 已上車！';
        this.addNotification(label, v.color);
        const order = this.state.orders.find(o => o.vehicleId === v.id);
        if (order) order.status = 'completed';
      }
    } else {
      this.addNotification('附近沒有車輛', '#666');
    }
  }

  private isSolidAt(wx: number, wy: number): boolean {
    const gx = Math.floor(wx / TILE_SIZE);
    const gy = Math.floor(wy / TILE_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return true;
    const tile = this.world.grid[gy]?.[gx];
    if (!tile) return true;
    return tile.type === TileType.BUILDING || tile.type === TileType.HELIPAD;
  }

  private updateOrders(dt: number): void {
    const { orders, vehicles, player } = this.state;

    orders.forEach(order => {
      if (order.status === 'completed') return;
      const v = vehicles.get(order.vehicleId);
      if (!v) return;

      const isAerial = order.type === 'helicopter';
      const arrived = updateServiceVehicle(v, player.x, player.y, dt, this.world, isAerial);

      if (arrived && order.status !== 'arrived') {
        order.status = 'arrived';
        order.eta = 0;
        const msg = order.type === 'taxi' ? '🚕 計程車到了！按 F 上車'
          : order.type === 'food' ? '🍕 外送到了！按 F 取餐'
          : '🚁 直升機到了！按 F 登機';
        this.addNotification(msg, '#00ff88');
      }
    });

    // Remove old completed orders
    const cutoff = orders.filter(o => o.status !== 'completed').length;
    if (orders.length > cutoff + 3) {
      this.state.orders = orders.filter(o => o.status !== 'completed');
    }
  }

  private render(): void {
    renderFrame(
      this.ctx,
      this.state,
      this.world,
      this.canvas.width,
      this.canvas.height
    );
  }

  getWorld(): WorldData {
    return this.world;
  }

  private emitHUD(): void {
    if (!this.hudCallback) return;
    const { player, orders, drone, waypoint, zone, notifications } = this.state;
    const curVeh = player.currentVehicleId
      ? this.state.vehicles.get(player.currentVehicleId)
      : null;

    this.hudCallback({
      speed: curVeh ? Math.abs(curVeh.speed) * 60 : Math.abs(player.speed) * 0.6,
      playerState: player.state,
      vehicleType: curVeh?.type ?? null,
      orders: [...orders],
      drone: { ...drone },
      waypoint: { ...waypoint },
      zone,
      playerX: Math.round(player.x),
      playerY: Math.round(player.y),
      notifications: [...notifications],
    });
  }

  // Expose a lightweight snapshot for mini-map rendering
  getStateSnapshot(): GameState {
    return this.state;
  }

  // For phone key presses forwarded from React
  handlePhoneKey(): boolean {
    return this.input.wasJustPressed('KeyP');
  }

  handleMapKey(): boolean {
    return this.input.wasJustPressed('KeyM');
  }
}
