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
  Banner,
  MinimapBlip,
  OrbitCamState,
  Point,
  TILE_SIZE,
  TILE_3D,
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
  updateParkedCars,
  ensureTraffic,
  updateServiceVehicle,
  updateDrone,
  nextVehicleId,
} from './traffic';
import { generateWorld, getZoneName, isSolidAtAltitude } from './worldGen';
import { createRaceSession, tickRace } from './race';
import { getCourse } from './raceCourses';
import {
  CamMode,
  createOrbitCam,
  shortestArc,
  stepOrbitCamera,
} from './orbitCamera';
import { PedestrianSystem } from './pedestrians';
import { CollisionSystem, Impact } from './collision';
import { WantedSystem } from './wanted';
import { PoliceSystem, SIGHT_RANGE } from './police';
import { isWalkable } from './worldGen';
import { RouteCache } from './gpsRoute';
import { Economy, FOOD_MENU, PRICES } from './economy';
import { CitySave, clearSave, loadSave, writeSave } from './save';
import { MissionManager } from './missionManager';
import { Garage, createGarages, garageBlips, updateGarages } from './paynspray';
import {
  AutopilotState,
  createAutopilot,
  planAutopilot,
  stepAutopilot,
  tileKeyOf,
} from './autopilot';
import * as gameClock from './gameClock';
import { DRONE_PAD, droneConfinement, isInsideArena } from './droneArena';

const CAR_MAX_SPEED = 160;      // 2D px / sec
const CAR_ACCELERATION = 280;   // 2D px / sec²
const CAR_DECEL = 200;
const FRICTION = 0.06;           // fraction of speed lost per second (exponential)
const STEER_SPEED = 2.2;         // radians / sec
const FOOT_SPEED = 70;
const FOOT_RUN_SPEED = 130;
const FOOT_TURN_RATE = 12;      // rad / sec — how fast the character faces its heading
const JUMP_VEL = 55;            // px / sec — apex ~9.5px (0.95 three.js units)
const GRAVITY = 160;            // px / sec^2 — ~0.7s hang time
const ENTER_VEHICLE_RADIUS = 35;
/** Default live traffic count. Density is player-relative, so this is per ring, not per map. */
export const NPC_COUNT = 22;

/** Population, effect and streaming budgets. Mutated by the graphics settings. */
export interface PerfProfile {
  maxPeds: number;
  maxPolice: number;
  pedShadows: boolean;
  /** Live NPC traffic cars kept around the player. */
  npcCars: number;
  /** Parked cars kept around the player. */
  parkedCars: number;
  /** Static geometry streaming radius, 3D units. */
  drawDistance: number;
  /** Radius within which static geometry casts shadows, 3D units. */
  shadowDistance: number;
  /** Street lamps that get a real point light. */
  lampLights: number;
}

export const PERF_HIGH: PerfProfile = {
  maxPeds: 96, maxPolice: 5, pedShadows: true,
  npcCars: NPC_COUNT, parkedCars: 16,
  drawDistance: 176, shadowDistance: 96, lampLights: 6,
};
export const PERF_LOW: PerfProfile = {
  maxPeds: 64, maxPolice: 3, pedShadows: false,
  npcCars: 16, parkedCars: 8,
  drawDistance: 112, shadowDistance: 64, lampLights: 6,
};

const EMPTY_BLIPS: MinimapBlip[] = [];

// Carjacking / damage tuning
const CARJACK_TIME = 0.8;             // seconds of animation lock
const CARJACK_MAX_TARGET_SPEED = 60;  // px/s — cannot board a car going faster
const WALL_DAMAGE_MIN_SPEED = 60;     // px/s
const WALL_DAMAGE_COOLDOWN = 400;     // ms between wall dents
const EJECT_HEALTH_LOSS = 40;
const WRECK_LIFETIME = 20;            // seconds a wreck stays as an obstacle
const MAX_WRECKS = 6;
const POLICE_RAM_CRIME_SPEED = 45;    // px/s closing speed that counts as ramming
const POLICE_HIT_COOLDOWN = 3000;     // ms
const BUSTED_TOTAL = 2.4;             // seconds of the whole Busted sequence
const BUSTED_RESPAWN_AT = 1.2;        // seconds — screen is fully black here

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
  // The world is generated once and never rebuilt: `reset()` deliberately
  // keeps it, because a new WorldData reference would force CityMesh to
  // rebuild every instanced batch in the city.
  world: WorldData;
  player!: Player;
  vehicles!: Map<string, Vehicle>;
  orders!: Order[];
  callLog!: CallRecord[];
  drone!: DroneState;
  waypoint!: Waypoint;
  notifications!: Notification[];
  zone!: string;
  tick!: number;
  camera!: { x: number; y: number };
  raceSession: RaceSession | null = null;

  economy: Economy;
  save: CitySave;
  missions: MissionManager;
  banner: Banner | null = null;

  input: InputManager;
  orbitCam!: OrbitCamState;
  pedestrians: PedestrianSystem;
  collisions = new CollisionSystem();
  wanted: WantedSystem;
  police = new PoliceSystem();

  /** 0 = clear, 1 = fully black. Driven by the Busted sequence. */
  screenFade = 0;
  screenLabel: string | null = null;

  /** Cached GPS route to the active waypoint. */
  route = new RouteCache();

  /** Pay-n-Spray garages. Fixed for the life of the world. */
  garages: Garage[] = [];

  /** Self-driving state for the player's car. */
  autopilot: AutopilotState = createAutopilot();

  /** Set by the pause menu. While true `update()` is a no-op. */
  paused = false;

  private lastArenaWallTick = -999;

  private parkedBlocks = new Set<number>();
  private wreckIds: string[] = [];
  private lastPoliceHitMs = 0;
  private bustedRespawned = false;
  private persistTimer = 0;
  private persistDirty = false;

  /** Population / effect / streaming budgets. See PerfProfile. */
  perf: PerfProfile = { ...PERF_HIGH };

  private blipProviders = new Map<string, () => MinimapBlip[]>();
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

    this.save = loadSave();
    this.economy = Economy.fromJSON({ cash: this.save.cash, log: this.save.economyLog });
    this.pedestrians = new PedestrianSystem(this.world, 128);

    this.wanted = new WantedSystem({
      onStarsChanged: (stars, prev) => {
        if (stars > prev) {
          this.addNotification(`★ 通緝等級 ${stars}`, '#ff4444');
        } else if (stars === 0) {
          this.addNotification('✅ 已擺脫警方', '#00ff88');
        }
      },
    });

    this.missions = new MissionManager(this);

    this.registerBlipProvider('police', () => this.police.getBlips(this.vehicles));
    this.registerBlipProvider('missions', () => this.missions.getBlips());
    this.garages = createGarages(this.world);
    this.registerBlipProvider('garages', () => garageBlips(this.garages, gameClock.now()));

    this.initDynamicState();
  }

  /**
   * Build (or rebuild) everything that a restart should wipe. The world,
   * input listeners, economy and save file are intentionally NOT touched here.
   */
  private initDynamicState() {
    this.tick = 0;
    this.zone = '城市區';
    this.notifications = [];
    this.orders = [];
    this.callLog = [];
    this.camera = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
    this.waypoint = { x: 0, y: 0, active: false };
    this.banner = null;
    this.screenFade = 0;
    this.screenLabel = null;
    this.bustedRespawned = false;
    this.raceSession = null;
    this.raceVx = 0;
    this.raceVy = 0;
    this.wreckIds = [];
    this.parkedBlocks.clear();
    this.route.clear();
    this.autopilot = createAutopilot();
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
      z: 0,
      jumpVel: 0,
      action: null,
    };

    this.orbitCam = createOrbitCam();

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
      hp: 100,
    };
    this.vehicles.set(pCar.id, pCar);
    this.player.currentVehicleId = pCar.id;

    // NPC cars
    for (let i = 0; i < this.perf.npcCars; i++) {
      const npc = createNPCCar(this.world, i);
      this.vehicles.set(npc.id, npc);
    }

    this.pedestrians.clear();
    this.pedestrians.populate(sx, sy, this.perf.maxPeds);
    this.police.clear(this.vehicles);
    this.wanted.clear();
  }

  /**
   * Restart. Keeps the generated world (and therefore the whole city mesh)
   * and only rebuilds the simulation on top of it.
   */
  reset(opts: { clearSave: boolean } = { clearSave: false }) {
    if (opts.clearSave) {
      clearSave();
      this.save = loadSave();
      this.economy = Economy.fromJSON({ cash: this.save.cash, log: this.save.economyLog });
    }
    this.missions.reset();
    this.initDynamicState();
    this.persist();
    this.addNotification('🔄 已重新開始', '#00e5ff');
  }

  // ── Autopilot ──────────────────────────────────────────────────────────────

  /** Engage self-driving to the active waypoint, or disengage if already on. */
  toggleAutopilot() {
    if (this.autopilot.active) {
      this.disengageAutopilot('自動駕駛已解除');
      return;
    }
    const car = this.player.state === 'inCar' && this.player.currentVehicleId
      ? this.vehicles.get(this.player.currentVehicleId)
      : null;
    if (!car) {
      this.addNotification('自動駕駛只能在車上使用', '#ffcc00');
      return;
    }
    if (!this.waypoint.active) {
      this.addNotification('先在小地圖設定路標或接任務', '#ffcc00');
      return;
    }
    planAutopilot(this.autopilot, this.world, car, this.waypoint);
    this.autopilot.active = true;
    this.autopilot.replans = 0;
    this.addNotification('🤖 自動駕駛啟動', '#4ade80');
  }

  disengageAutopilot(reason: string | null = null) {
    if (!this.autopilot.active) return;
    this.autopilot.active = false;
    this.autopilot.path = [];
    if (reason) this.addNotification(reason, '#aaa');
  }

  /**
   * While self-driving, synthesise the throttle/brake the car physics expects
   * and apply the steering delta directly. Returns null to fall back to the
   * player's own input (autopilot off, or just disengaged by a manual touch).
   */
  private autopilotInput(
    dt: number,
    input: ReturnType<InputManager['getState']>,
  ): ReturnType<InputManager['getState']> | null {
    const ap = this.autopilot;
    if (!ap.active) return null;

    if (input.up || input.down || input.left || input.right || input.brake) {
      this.disengageAutopilot('手動接管，自動駕駛解除');
      return null;
    }
    const car = this.player.currentVehicleId ? this.vehicles.get(this.player.currentVehicleId) : null;
    if (!car) { this.disengageAutopilot(null); return null; }
    if (!this.waypoint.active) {
      this.disengageAutopilot('路標已清除，自動駕駛解除');
      return null;
    }

    // Destination moved (next mission objective, or the player re-pointed the
    // map) or the route was dropped by stuck/off-path detection: re-plan.
    if (ap.path.length === 0 || tileKeyOf(this.waypoint) !== ap.destKey) {
      const wasReplans = ap.replans;
      planAutopilot(ap, this.world, car, this.waypoint);
      ap.replans = wasReplans;
    }

    const drive = stepAutopilot(ap, car, {
      vehicles: this.vehicles,
      peds: this.pedestrians,
      maxSpeed: CAR_MAX_SPEED,
      steerRate: STEER_SPEED,
      dt,
    });

    if (drive.lost) {
      this.disengageAutopilot('找不到路線，請手動駕駛');
      return null;
    }

    car.angle += drive.steer;

    if (drive.arrived && this.waypoint.source !== 'mission') {
      this.clearWaypoint('user');
      this.disengageAutopilot(null);
      this.addNotification('📍 已到達目的地', '#4ade80');
      return { ...input, up: false, down: false, left: false, right: false, brake: true };
    }
    // Mission targets: hold here and wait; the next objective re-plans.

    return { ...input, up: drive.up, down: false, left: false, right: false, brake: drive.brake };
  }

  /** Touch devices get a smaller crowd, shorter streaming and no pedestrian shadows. */
  setPerfProfile(profile: 'low' | 'high') {
    this.perf = { ...(profile === 'low' ? PERF_LOW : PERF_HIGH) };
  }

  /** Partial override from the graphics settings. Takes effect over the next seconds. */
  applyGraphics(patch: Partial<PerfProfile>) {
    Object.assign(this.perf, patch);
  }

  /** Live traffic cars currently in the world. */
  trafficCount(): number {
    let n = 0;
    for (const v of this.vehicles.values()) {
      if (v.type === VehicleType.NPC_CAR && v.occupant === 'npc' && v.hp > 0
        && !v.isParked && !v.isService && v.npcState !== 'hijacked') n++;
    }
    return n;
  }

  setHUDCallback(cb: HUDCallback3D) { this.hudCallback = cb; }

  // ── MissionHost surface ───────────────────────────────────────────────────

  wantedLevel(): number { return this.wanted.stars; }
  setWantedLevel(n: number) { this.wanted.set(n); }

  /** True speed of the player in px/s, regardless of vehicle bookkeeping. */
  playerSpeed(): number {
    const v = this.player.currentVehicleId ? this.vehicles.get(this.player.currentVehicleId) : null;
    if (v) return Math.hypot(v.vx ?? 0, v.vy ?? 0);
    return Math.abs(this.player.speed);
  }

  showBanner(text: string, sub: string, color: string, ms: number) {
    this.banner = { id: `b${Date.now()}`, text, sub, color, until: gameClock.now() + ms };
  }

  /** Debounced save; call freely. */
  persist() {
    this.persistDirty = true;
  }

  /** Write immediately (page hide / unload). */
  flushSave() {
    this.save.cash = this.economy.cash;
    this.save.economyLog = this.economy.log;
    writeSave(this.save);
    this.persistDirty = false;
    this.persistTimer = 0;
  }

  /**
   * Put a job vehicle within reach of a marker, reusing one that is already
   * parked nearby rather than littering the street with duplicates.
   */
  spawnJobVehicle(type: VehicleType, at: Point): Vehicle | null {
    let existing: Vehicle | null = null;
    this.vehicles.forEach(v => {
      if (existing || v.type !== type) return;
      if (v.occupant === 'player') return;
      if (dist(v.x, v.y, at.x, at.y) < 80) existing = v;
    });
    if (existing) return existing;

    const v = type === VehicleType.TAXI
      ? createTaxi(this.world, at.x, at.y, 0)
      : createDeliveryScooter(this.world, at, at.x, at.y, 0);
    v.x = at.x;
    v.y = at.y;
    v.occupant = null;      // free to board, and not a carjack
    v.isService = true;     // traffic AI leaves it alone
    v.speed = 0;
    this.vehicles.set(v.id, v);
    return v;
  }

  // ── Mission controls exposed to React ─────────────────────────────────────

  acceptMission() { this.missions.accept(); }
  declineMission() { this.missions.decline(); }

  setWaypointToMission(defId: string) {
    const at = this.missions.markerPosition(defId);
    if (!at) { this.addNotification('這個任務沒有地點', '#aaa'); return; }
    this.setWaypoint(at.x, at.y, 'user');
  }

  /**
   * Freeze the simulation. The render loop keeps running so the pause menu
   * shows a live scene behind it.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      gameClock.pause();
    } else {
      gameClock.resume();
      // Anything pressed while the menu was open would otherwise fire now.
      this.input.flush();
    }
  }

  update(dt: number, nowMs: number): void {
    if (this.paused) {
      // flush() normally runs at the bottom of this method. Skipping it would
      // latch one-shots (C, F, E) and fire them all on resume.
      this.input.flush();
      return;
    }
    this.tick++;
    const { player, vehicles, orders, drone } = this;
    const isDriving = player.state === 'inCar' || player.state === 'inHelicopter';
    const isOnFoot  = player.state === 'onFoot';
    const isAirborne = player.state === 'inDrone' || player.state === 'inHelicopter';
    const input = this.input.getState(isDriving, isOnFoot, isAirborne);

    // Expire notifications
    this.notifications = this.notifications.filter(n => n.expiresAt > nowMs);

    // Reset race collision flag each tick
    this.raceDroneCollision = false;

    // Remember where everything was so true velocities can be derived below.
    this.snapshotVelocities();

    // Camera before physics: on-foot movement is relative to this frame's yaw.
    this.updateOrbitCamera(dt, nowMs);

    // Player state update
    if (player.action) {
      this.updateAction(dt);
    } else if (this.missions.isBriefing()) {
      // Hold the player still while reading the brief; traffic keeps moving.
      const held = player.currentVehicleId ? vehicles.get(player.currentVehicleId) : null;
      if (held) held.speed = 0;
      player.speed = 0;
    } else if (player.state === 'inCar') {
      this.updateCarPhysics(dt, this.autopilotInput(dt, input) ?? input);
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
          this.onRaceFinished(course.id, this.raceSession.bestLap, course.parTime);
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

    // Self-driving toggle
    if (input.autopilot) this.toggleAutopilot();

    // Mission interaction
    if (input.interact) this.handleInteract(nowMs);
    if (input.cancelMission) this.missions.requestCancel(nowMs);

    // NPC traffic
    updateTraffic(
      vehicles, this.world, dt,
      this.player.x, this.player.y, this.player.angle,
      this.pedestrians, this.player.state === 'onFoot',
    );

    // Replenish traffic once a second (wrecks, thefts and despawns shrink it).
    if (this.tick % 60 === 0) {
      ensureTraffic(vehicles, this.world, this.player, this.perf.npcCars);
    }

    // Parked / abandoned cars near the player
    updateParkedCars(
      vehicles, this.world, player, player.currentVehicleId, this.parkedBlocks, this.perf.parkedCars,
    );

    // Police pursuit (moves units, may complete an arrest)
    const playerVeh = player.currentVehicleId ? vehicles.get(player.currentVehicleId) : null;
    const arrested = this.police.update({
      world: this.world,
      vehicles,
      player: { x: player.x, y: player.y, state: player.state, speed: player.speed },
      playerSpeed: Math.hypot(playerVeh?.vx ?? 0, playerVeh?.vy ?? 0),
      playerVx: playerVeh?.vx ?? 0,
      playerVy: playerVeh?.vy ?? 0,
      dt,
      isSolidAt: (wx, wy) => this.isSolidAt(wx, wy),
    });

    // Velocities must be derived after ALL movement this frame, because the
    // player's `speed` is px/s while NPC `speed` is px/frame — only position
    // deltas are comparable across that boundary.
    this.deriveVelocities(dt);

    // Vehicle-vs-vehicle impacts
    this.collisions.update({
      vehicles,
      playerVehicleId: player.state === 'inCar' ? player.currentVehicleId : null,
      nowMs,
      onImpact: imp => this.handleImpact(imp, nowMs),
      onDestroyed: v => this.handleDestroyed(v),
    });

    this.updateWrecks(dt);

    // Pedestrians (reads vehicle velocities for knockdowns and panic)
    this.pedestrians.update(dt, {
      player: {
        x: player.x, y: player.y, angle: player.angle, state: player.state,
      },
      playerVehicleId: player.state === 'inCar' ? player.currentVehicleId : null,
      vehicles,
      world: this.world,
      maxPeds: this.perf.maxPeds,
      onHitByPlayer: () => this.onPlayerHitPedestrian(),
    });

    // Wanted level — police presence scales with the star count
    const nearestPolice = this.police.nearestDist({ vehicles, player });
    const seen = nearestPolice < SIGHT_RANGE;
    const targetUnits = this.wanted.update(dt, seen, seen && this.wanted.stars > 0);
    this.police.setTarget(Math.min(this.perf.maxPolice, targetUnits));
    if (arrested === 'busted') this.bust();

    // Pay-n-Spray: pull in slowly with a damaged or wanted car
    this.updateGarages(nowMs);

    // Missions
    this.missions.update(dt, nowMs);

    // Service orders
    this.updateOrders(dt);

    // Drone battery (0.08 %/s → ~20 min flight time)
    if (drone.active && drone.vehicleId) {
      const dv = vehicles.get(drone.vehicleId);
      if (dv) {
        // The arena has its own ground station, so the link stays solid no
        // matter where the pilot is standing. Outside it, range still matters.
        const d = dist(dv.x, dv.y, player.x, player.y);
        drone.signal = isInsideArena(dv.x, dv.y)
          ? 100
          : Math.max(0, 100 - (d / 500) * 100);
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

    // Zone + sightseeing discovery (cheap, but no need to run every frame)
    this.zone = getZoneName(this.world.grid, player.x, player.y);
    if (this.tick % 15 === 0) this.missions.checkDiscovery();

    // Banner expiry
    if (this.banner && nowMs > this.banner.until) this.banner = null;

    // Debounced save (at most once a second)
    if (this.persistDirty) {
      this.persistTimer += dt;
      if (this.persistTimer >= 1) this.flushSave();
    }

    // GPS route — the cache re-runs BFS only when the destination changes or
    // the player leaves the route corridor, so this stays cheap.
    if (this.tick % 10 === 0) {
      this.route.update(this.world.grid, player, this.waypoint);
    }

    // Order ETA
    orders.forEach(o => { o.eta = Math.max(0, o.eta - dt); });

    // HUD throttle (100ms)
    if (nowMs - this.lastHudTime > 100) {
      this.lastHudTime = nowMs;
      this.emitHUD();
    }

    this.input.flush();
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  /** Camera yaw in radians (0 = North, clockwise), same convention as Player.angle. */
  getCameraYaw(): number {
    return this.orbitCam.yaw;
  }

  /** Unit forward vector of the camera in 2D world space. */
  getCameraForward2D(): Point {
    return { x: Math.sin(this.orbitCam.yaw), y: -Math.cos(this.orbitCam.yaw) };
  }

  /**
   * Occlusion probe for the camera boom. Unlike isSolidAt, out-of-bounds is
   * NOT solid — otherwise the camera collapses onto the player at the map edge.
   */
  private cameraBlocked = (wx: number, wy: number, alt: number): boolean => {
    const gx = Math.floor(wx / TILE_SIZE);
    const gy = Math.floor(wy / TILE_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return false;
    return this.isSolidAtAlt(wx, wy, alt);
  };

  private updateOrbitCamera(dt: number, nowMs: number) {
    const { player } = this;
    const mode: CamMode =
      player.state === 'onFoot' ? 'foot'
      : player.state === 'inCar' ? 'vehicle'
      : 'air';

    let vehicleAngle = player.angle;
    let focusAlt = 0;
    if (player.state === 'inDrone' && this.drone.vehicleId) {
      const dv = this.vehicles.get(this.drone.vehicleId);
      if (dv) {
        vehicleAngle = dv.angle;
        focusAlt = ((dv.altitude ?? 0) * TILE_3D) / TILE_SIZE;
      }
    } else if (player.state === 'inHelicopter' && player.currentVehicleId) {
      const hv = this.vehicles.get(player.currentVehicleId);
      if (hv) {
        vehicleAngle = hv.angle;
        focusAlt = ((hv.altitude ?? 0) * TILE_3D) / TILE_SIZE;
      }
    }

    stepOrbitCamera(
      this.orbitCam, dt, nowMs,
      this.input.consumeLook(),
      this.input.consumeWheelSteps(),
      {
        mode,
        vehicleAngle,
        player: { x: player.x, y: player.y },
        focusAlt,
        isBlocked: this.cameraBlocked,
      },
    );
  }

  // ── Velocity bookkeeping ──────────────────────────────────────────────────

  private snapshotVelocities() {
    this.vehicles.forEach(v => {
      v.prevX = v.x;
      v.prevY = v.y;
    });
  }

  private deriveVelocities(dt: number) {
    if (dt <= 0) return;
    const inv = 1 / dt;
    this.vehicles.forEach(v => {
      v.vx = (v.x - (v.prevX ?? v.x)) * inv;
      v.vy = (v.y - (v.prevY ?? v.y)) * inv;
    });
  }

  // ── Scripted player actions ───────────────────────────────────────────────

  /** Advances an input-locking animation (carjack / busted / ejected). */
  private updateAction(dt: number) {
    const act = this.player.action;
    if (!act) return;
    act.timer += dt;

    if (act.kind === 'busted') {
      // Fade to black, swap the player out at full black, then fade back in.
      this.screenFade = act.timer < BUSTED_RESPAWN_AT
        ? Math.min(1, act.timer / 1.0)
        : Math.max(0, 1 - (act.timer - BUSTED_RESPAWN_AT) / 1.2);
      if (act.timer >= BUSTED_RESPAWN_AT && !this.bustedRespawned) {
        this.bustedRespawned = true;
        this.respawnAfterBust();
      }
      if (act.timer >= act.total) {
        this.player.action = null;
        this.screenFade = 0;
        this.screenLabel = null;
        this.bustedRespawned = false;
      }
      return;
    }

    if (act.kind === 'carjack') {
      const v = this.vehicles.get(act.vehicleId);
      if (!v) { this.player.action = null; return; }
      // Slide the player across to the driver's door.
      const t = Math.min(1, act.timer / act.total);
      const doorX = v.x + Math.cos(v.angle) * 11;
      const doorY = v.y + Math.sin(v.angle) * 11;
      this.player.x = act.fromX + (doorX - act.fromX) * t;
      this.player.y = act.fromY + (doorY - act.fromY) * t;
      this.player.angle = v.angle;
      if (act.timer >= act.total) {
        this.player.action = null;
        this.finishCarjack(act.vehicleId);
      }
      return;
    }

    if (act.timer >= act.total) this.player.action = null;
  }

  private onPlayerHitPedestrian() {
    this.wanted.addCrime('hitPed');
  }

  /** E: accept a brief, or start taxi work from inside a cab. */
  private handleInteract(nowMs: number) {
    if (this.missions.isBriefing()) {
      this.missions.accept();
      return;
    }
    if (this.missions.startTaxiFromVehicle(nowMs)) return;
    this.addNotification('這裡沒有可互動的東西', '#666');
  }

  // ── Carjacking ────────────────────────────────────────────────────────────

  private startCarjack(v: Vehicle) {
    v.npcState = 'hijacked';
    v.speed = 0;
    v.waypoints = [];
    v.waypointIndex = 0;
    this.player.action = {
      kind: 'carjack',
      vehicleId: v.id,
      timer: 0,
      total: CARJACK_TIME,
      fromX: this.player.x,
      fromY: this.player.y,
    };
  }

  private finishCarjack(vehicleId: string) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;

    // The driver becomes a fleeing pedestrian, and everyone nearby panics.
    this.pedestrians.spawnEjectedDriver(v, { x: v.x, y: v.y });

    v.occupant = 'player';
    v.isService = false;
    v.isParked = false;
    v.npcState = undefined;
    v.waypoints = [];
    v.waypointIndex = 0;

    this.player.currentVehicleId = v.id;
    this.player.state = 'inCar';
    this.player.z = 0;
    this.player.jumpVel = 0;
    this.orbitCam.lastLookMs = 0;

    this.wanted.addCrime(v.type === VehicleType.POLICE ? 'carjackPolice' : 'carjack');
    this.addNotification('🔓 搶到車了！', '#ff8800');
  }

  // ── Damage, wrecks, Busted ────────────────────────────────────────────────

  private handleImpact(imp: Impact, nowMs: number) {
    const playerVehId = this.player.state === 'inCar' ? this.player.currentVehicleId : null;
    if (!playerVehId) return;

    const other = imp.a.id === playerVehId ? imp.b
      : imp.b.id === playerVehId ? imp.a
      : null;
    if (!other) return;

    if (other.type === VehicleType.POLICE) {
      if (imp.relSpeed > POLICE_RAM_CRIME_SPEED && nowMs - this.lastPoliceHitMs > POLICE_HIT_COOLDOWN) {
        this.lastPoliceHitMs = nowMs;
        this.wanted.addCrime('hitPolice');
      }
      return;
    }

    this.missions.onCollision();

    // Rattled NPC drivers pull up for a moment before carrying on.
    if (other.occupant === 'npc' && !other.isParked) {
      other.npcState = 'stopped';
      other.waitTimer = 1.2 + Math.random() * 1.5;
    }
  }

  private handleDestroyed(v: Vehicle) {
    if ((v.wreckTimer ?? 0) > 0) return;
    v.wreckTimer = WRECK_LIFETIME;
    v.speed = 0;
    v.isParked = true;
    v.npcState = undefined;
    v.waypoints = [];

    const wasPlayers = v.occupant === 'player';
    v.occupant = null;
    this.missions.onVehicleDestroyed(v.id);
    if (wasPlayers) this.ejectPlayer();

    this.wreckIds.push(v.id);
    while (this.wreckIds.length > MAX_WRECKS) {
      const oldest = this.wreckIds.shift();
      if (oldest) this.vehicles.delete(oldest);
    }
    this.addNotification('💥 車輛報廢！', '#ff4444');
  }

  private updateWrecks(dt: number) {
    // Collect first: deleting from a Map while iterating it is legal, but
    // queueing keeps the intent obvious and matches the rest of the engine.
    const expired: string[] = [];
    this.vehicles.forEach(v => {
      if ((v.wreckTimer ?? 0) <= 0) return;
      v.wreckTimer = (v.wreckTimer ?? 0) - dt;
      if ((v.wreckTimer ?? 0) <= 0) expired.push(v.id);
    });
    for (const id of expired) {
      this.vehicles.delete(id);
      const i = this.wreckIds.indexOf(id);
      if (i !== -1) this.wreckIds.splice(i, 1);
    }
  }

  /** Throw the player clear of a destroyed vehicle. */
  private ejectPlayer() {
    const { player } = this;
    const v = player.currentVehicleId ? this.vehicles.get(player.currentVehicleId) : null;

    if (v) {
      const rightX = Math.cos(v.angle);
      const rightY = Math.sin(v.angle);
      const backX = -Math.sin(v.angle);
      const backY = Math.cos(v.angle);
      const sides: Array<[number, number]> = [
        [-rightX * 18, -rightY * 18],
        [rightX * 18, rightY * 18],
        [backX * 22, backY * 22],
      ];
      for (const [ox, oy] of sides) {
        if (isWalkable(this.world.grid, v.x + ox, v.y + oy)) {
          player.x = v.x + ox;
          player.y = v.y + oy;
          break;
        }
      }
    }

    this.disengageAutopilot(null);
    player.state = 'onFoot';
    player.currentVehicleId = null;
    player.z = 0;
    player.jumpVel = 0;
    player.speed = 0;
    player.health = Math.max(5, player.health - EJECT_HEALTH_LOSS);
    player.action = { kind: 'ejected', timer: 0, total: 0.6 };
  }

  /** Start the Busted sequence. Safe to call repeatedly. */
  bust() {
    if (this.player.action?.kind === 'busted') return;
    this.disengageAutopilot(null);
    this.player.action = { kind: 'busted', timer: 0, total: BUSTED_TOTAL };
    this.screenLabel = 'BUSTED';
    this.bustedRespawned = false;
    this.addNotification('🚔 你被逮捕了', '#ff4444');
  }

  private respawnAfterBust() {
    const { player } = this;

    // The car is impounded.
    if (player.currentVehicleId) {
      const v = this.vehicles.get(player.currentVehicleId);
      if (v) {
        v.occupant = null;
        v.isParked = true;
      }
    }

    // townHallPos is a solid TOWN_HALL tile, so respawn in the walkable lobby.
    player.x = this.world.respawnPos.x;
    player.y = this.world.respawnPos.y;
    player.angle = 0;
    player.speed = 0;
    player.z = 0;
    player.jumpVel = 0;
    player.state = 'onFoot';
    player.currentVehicleId = null;
    player.health = 100;

    this.wanted.clear();
    this.police.clear(this.vehicles);
    this.orbitCam.lastLookMs = 0;

    // A partial charge, so a broke player loses what they have rather than
    // going into debt.
    this.economy.charge('busted', 'busted', { allowPartial: true });
    this.save.stats.timesBusted += 1;
    this.missions.onBusted();
    this.persist();
  }

  // ── Minimap blips ─────────────────────────────────────────────────────────

  registerBlipProvider(id: string, fn: () => MinimapBlip[]) {
    this.blipProviders.set(id, fn);
  }

  unregisterBlipProvider(id: string) {
    this.blipProviders.delete(id);
  }

  private collectBlips(): MinimapBlip[] {
    if (this.blipProviders.size === 0) return EMPTY_BLIPS;
    const out: MinimapBlip[] = [];
    this.blipProviders.forEach(fn => {
      const list = fn();
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    });
    return out;
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
      // Head-on into a building: dent the car proportionally to the impact.
      const impactSpeed = Math.abs(car.speed);
      const now = gameClock.now();
      if (impactSpeed > WALL_DAMAGE_MIN_SPEED && now - (car.lastHitTime ?? 0) > WALL_DAMAGE_COOLDOWN) {
        car.lastHitTime = now;
        car.hp = Math.max(0, car.hp - (impactSpeed - 40) * 0.25);
        if (car.hp <= 0) this.handleDestroyed(car);
      }
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
        droneConfinement(this.raceSession),
      );
      if (result.hitWall) this.noteArenaWall();
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

  /**
   * Camera-relative on-foot movement (GTA III style): the stick/WASD direction
   * is interpreted in camera space and the character turns to face it, rather
   * than the old tank controls where A/D rotated the body.
   */
  private updateFootPhysics(dt: number, input: ReturnType<InputManager['getState']>) {
    const { player } = this;

    const axes = this.input.getMoveAxes();
    const yaw = this.orbitCam.yaw;
    // Camera basis in world space, same angle convention as the rest of the sim.
    const fwdX = Math.sin(yaw);
    const fwdY = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightY = Math.sin(yaw);

    const dx = fwdX * axes.y + rightX * axes.x;
    const dy = fwdY * axes.y + rightY * axes.x;
    const mag = Math.hypot(dx, dy);

    if (mag > 0.01) {
      // atan2(dx, -dy) is the inverse of forward = (sin a, -cos a).
      const targetAngle = Math.atan2(dx, -dy);
      player.angle += shortestArc(player.angle, targetAngle) * Math.min(1, FOOT_TURN_RATE * dt);
      const speed = (input.sprint ? FOOT_RUN_SPEED : FOOT_SPEED) * Math.min(1, mag);
      this.tryMoveFoot(
        player.x + (dx / mag) * speed * dt,
        player.y + (dy / mag) * speed * dt,
      );
      player.speed = speed;
    } else {
      player.speed = 0;
    }

    // Jump: a plain parabola on the fake altitude axis. Air control allowed.
    if (input.jump && player.z === 0 && player.jumpVel === 0) {
      player.jumpVel = JUMP_VEL;
    }
    if (player.z > 0 || player.jumpVel !== 0) {
      player.jumpVel -= GRAVITY * dt;
      player.z += player.jumpVel * dt;
      if (player.z <= 0) {
        player.z = 0;
        player.jumpVel = 0;
      }
    }

    player.x = Math.max(5, Math.min(WORLD_SIZE - 5, player.x));
    player.y = Math.max(5, Math.min(WORLD_SIZE - 5, player.y));
  }

  /** Move on foot, sliding along whichever axis is free. */
  private tryMoveFoot(nx: number, ny: number) {
    const { player } = this;
    if (!this.isSolidAt(nx, ny)) {
      player.x = nx;
      player.y = ny;
    } else if (!this.isSolidAt(nx, player.y)) {
      player.x = nx;
    } else if (!this.isSolidAt(player.x, ny)) {
      player.y = ny;
    }
  }

  private handleEnterExit() {
    const { player, vehicles } = this;

    if (player.state === 'inCar' || player.state === 'inHelicopter') {
      const v = player.currentVehicleId ? vehicles.get(player.currentVehicleId) : null;
      if (v) {
        v.occupant = null;
        v.speed = 0;
        // Abandoned where it stands. Traffic skips parked cars, and the
        // despawn ring recycles it once the player is far enough away.
        v.isParked = true;
      }
      this.disengageAutopilot(null);
      player.state = 'onFoot';
      player.currentVehicleId = null;
      player.z = 0;
      player.jumpVel = 0;
      this.addNotification('已下車', '#aaa');
      return;
    }
    if (player.state === 'inDrone') { this.landDrone(); return; }

    let closest: Vehicle | null = null;
    let closestDist = Infinity;
    vehicles.forEach(v => {
      if (v.type === VehicleType.RC_DRONE) return;
      if (v.occupant === 'player') return;
      if (v.hp <= 0) return;   // burnt-out wreck
      const d = dist(player.x, player.y, v.x, v.y);
      if (d < ENTER_VEHICLE_RADIUS && d < closestDist) { closestDist = d; closest = v; }
    });

    if (closest) {
      const v = closest as Vehicle;

      // A vehicle you called is yours to board; anything else with a driver
      // in it has to be taken by force.
      const isOrdered = this.orders.some(o => o.vehicleId === v.id && o.status !== 'completed');
      if (v.occupant === 'npc' && !isOrdered) {
        const speed = Math.hypot(v.vx ?? 0, v.vy ?? 0);
        if (speed > CARJACK_MAX_TARGET_SPEED) {
          this.addNotification('車速太快，攔不下來', '#ffcc00');
          return;
        }
        this.startCarjack(v);
        return;
      }

      v.occupant = 'player';
      v.waypoints = [];
      v.waypointIndex = 0;
      player.currentVehicleId = v.id;
      player.z = 0;
      player.jumpVel = 0;
      // Snap the camera back behind the vehicle immediately.
      this.orbitCam.lastLookMs = 0;
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

  isSolidAt(wx: number, wy: number): boolean {
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
  isSolidAtAlt(wx: number, wy: number, altitude: number): boolean {
    return isSolidAtAltitude(this.world.grid, wx, wy, altitude);
  }

  addNotification(text: string, color = '#fff') {
    // Same clock as the expiry check in update(), so pausing holds them on screen.
    this.notifications.push({ id: notifId(), text, expiresAt: gameClock.now() + 3500, color });
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

  setWaypoint(wx: number, wy: number, source: 'user' | 'mission' = 'user') {
    this.waypoint = { x: wx, y: wy, active: true, source };
    this.route.update(this.world.grid, this.player, this.waypoint);
    if (source === 'user') this.addNotification('📍 路標已設定', '#00e5ff');
  }

  clearWaypoint(source: 'user' | 'mission' = 'user') {
    if (this.waypoint.active && this.waypoint.source && this.waypoint.source !== source) return;
    this.waypoint = { x: 0, y: 0, active: false };
    this.route.clear();
  }

  dispatchTaxi() {
    if (this.orders.find(o => o.type === 'taxi' && o.status !== 'completed')) { this.addNotification('計程車已在路上！', '#ffee00'); return; }
    if (!this.economy.charge(PRICES.phone_taxi, 'phone_taxi')) {
      this.addNotification('💸 現金不足', '#ff4444');
      return;
    }
    const t = createTaxi(this.world, this.player.x, this.player.y, this.player.angle);
    this.vehicles.set(t.id, t);
    const orderId = `o_t_${Date.now()}`;
    this.orders.push({ id: orderId, type: 'taxi', status: 'dispatched', vehicleId: t.id, eta: 60, label: '🚕 計程車' });
    this.callLog.push({ id: orderId, type: 'taxi', label: '🚕 計程車', calledAt: Date.now(), status: 'called' });
    this.addNotification('🚕 計程車已派出！', '#ffee00');
  }

  dispatchFood(shopIdx = 0) {
    if (this.orders.find(o => o.type === 'food' && o.status !== 'completed')) { this.addNotification('外送已在路上！', '#ff8c00'); return; }
    const item = FOOD_MENU[shopIdx % FOOD_MENU.length];
    if (!this.economy.charge(item.price, `food_${item.name}`)) {
      this.addNotification('💸 現金不足', '#ff4444');
      return;
    }
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
    if (!this.economy.charge(PRICES.phone_heli, 'phone_heli')) {
      this.addNotification('💸 現金不足', '#ff4444');
      return;
    }
    const h = createHelicopter(this.world);
    this.vehicles.set(h.id, h);
    const orderId = `o_h_${Date.now()}`;
    this.orders.push({ id: orderId, type: 'helicopter', status: 'dispatched', vehicleId: h.id, eta: 30, label: '🚁 直升機' });
    this.callLog.push({ id: orderId, type: 'helicopter', label: '🚁 直升機', calledAt: Date.now(), status: 'called' });
    this.addNotification('🚁 直升機已起飛！', '#a0d8ef');
  }

  launchDrone() {
    if (this.drone.active) { this.addNotification('無人機已在飛', '#00e5ff'); return; }
    this.missions.onDistraction('離開車輛');
    this.disengageAutopilot(null);
    // Free flight is confined to the arena, so the drone always starts there
    // rather than beside the player. The camera follows it across the map.
    const pad = this.world.dronePad;
    const d = createDrone(pad.x, pad.y);
    d.angle = this.player.angle;
    // Start slightly above ground so it's immediately visible
    d.altitude = 8;
    d.targetAltitude = 8;
    this.vehicles.set(d.id, d);
    this.drone = { active: true, altitude: 8, throttle: 0, pitch: 0, roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: d.id };
    this.player.state = 'inDrone';
    this.addNotification('🚁 無人機於場地起飛！', '#00e5ff');
  }

  landDrone() {
    if (this.raceSession) this.exitRace();
    if (this.drone.vehicleId) this.vehicles.delete(this.drone.vehicleId);
    this.drone = { active: false, altitude: 0, throttle: 0, pitch: 0, roll: 0, yaw: 0, battery: 100, signal: 100, vehicleId: null };
    this.player.state = 'onFoot';
    this.player.z = 0;
    this.player.jumpVel = 0;
    this.addNotification('無人機已降落', '#00e5ff');
  }

  // ── Race management ────────────────────────────────────────────────────────

  startRace(courseId: string) {
    this.missions.onDistraction('開始競速');
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

  /** Pay out a finished race and fold the lap into the unified save. */
  private onRaceFinished(courseId: string, bestLap: number, parTime: number) {
    if (bestLap > 0) {
      const prev = this.save.raceBest[courseId];
      if (!prev || bestLap < prev) this.save.raceBest[courseId] = bestLap;
    }
    // Beating par pays double.
    const prize = bestLap > 0 && bestLap <= parTime ? 600 : 300;
    this.economy.earn(prize, 'race');
    this.showBanner('完賽獎金', `+$${prize}`, '#ffd23f', 2600);
    this.persist();
  }

  exitRace() {
    this.raceSession = null;
    this.raceVx = 0;
    this.raceVy = 0;
    // Reset drone visual tilt
    this.drone.pitch = 0;
    this.drone.roll  = 0;
    this.addNotification('退出賽道模式', '#aaa');
    this.returnDroneToPad();
  }

  /**
   * A race leaves the drone wherever the course ended, which is outside the
   * arena walls that come back up the moment the session is gone. Fly it home
   * instead of stranding it out of bounds.
   */
  private returnDroneToPad() {
    if (!this.drone.active || !this.drone.vehicleId) return;
    const dv = this.vehicles.get(this.drone.vehicleId);
    if (!dv || isInsideArena(dv.x, dv.y)) return;
    dv.x = DRONE_PAD.x;
    dv.y = DRONE_PAD.y;
    dv.altitude = 8;
    dv.targetAltitude = 8;
    this.drone.altitude = 8;
    this.addNotification('🚁 無人機返回場地', '#00e5ff');
  }

  /** Throttled nudge so a player pressing into an arena wall knows why. */
  private noteArenaWall() {
    if (this.tick - this.lastArenaWallTick < 180) return;
    this.lastArenaWallTick = this.tick;
    this.addNotification('已到達場地邊界', '#ffcc00');
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
      camYaw: this.orbitCam.yaw,
      route: this.route.points,
      blips: this.collectBlips(),
    };
  }

  private updateGarages(nowMs: number) {
    const vehicle = this.player.currentVehicleId
      ? this.vehicles.get(this.player.currentVehicleId) ?? null
      : null;

    updateGarages(this.garages, {
      player: this.player,
      vehicle,
      speed: this.playerSpeed(),
      wantedStars: this.wanted.stars,
      nowMs,
      charge: () => {
        const ok = this.economy.charge('paynspray', 'paynspray');
        if (!ok) this.addNotification('💸 噴漆廠：現金不足', '#ff4444');
        return ok;
      },
      onServiced: () => {
        this.wanted.clear();
        this.police.clear(this.vehicles);
        this.addNotification('🎨 噴漆完成，車輛修復', '#22d3ee');
        this.showBanner('Pay-n-Spray', '車輛修復 · 通緝解除', '#22d3ee', 2200);
        this.persist();
      },
    });
  }

  /** True when pressing E would start taxi work from the current vehicle. */
  canStartTaxi(): boolean {
    if (this.missions.session) return false;
    const v = this.player.currentVehicleId ? this.vehicles.get(this.player.currentVehicleId) : null;
    return v?.type === VehicleType.TAXI;
  }

  /** What pressing F would do right now — drives the hint and mobile label. */
  nearestVehicleInfo(): HUDData['nearVehicle'] {
    const { player, vehicles } = this;
    if (player.state !== 'onFoot') return 'none';

    let best: Vehicle | null = null;
    let bestDist = Infinity;
    vehicles.forEach(v => {
      if (v.type === VehicleType.RC_DRONE) return;
      if (v.occupant === 'player') return;
      // Must match handleEnterExit exactly, or the hint promises an action
      // that pressing F will not perform.
      if (v.hp <= 0) return;
      const d = dist(player.x, player.y, v.x, v.y);
      if (d < ENTER_VEHICLE_RADIUS && d < bestDist) { bestDist = d; best = v; }
    });

    if (!best) return 'none';
    const v = best as Vehicle;
    if (v.type === VehicleType.POLICE) return 'police';
    // A dispatched service vehicle is yours to board, not to steal.
    const isOrdered = this.orders.some(o => o.vehicleId === v.id && o.status !== 'completed');
    return v.occupant === 'npc' && !isOrdered ? 'occupied' : 'free';
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
      health: player.health,
      vehicleHp: curVeh?.hp,
      wantedStars: this.wanted.stars,
      wantedEvading: this.wanted.evading,
      arrestProgress: this.police.arrestProgress(),
      screenFade: this.screenFade,
      screenLabel: this.screenLabel,
      nearVehicle: this.nearestVehicleInfo(),
      cash: this.economy.cash,
      cashTicker: this.economy.drainTicks(gameClock.now()),
      mission: this.missions.getHUD(),
      nearMarker: this.missions.nearMarker(),
      canStartTaxi: this.canStartTaxi(),
      banner: this.banner,
      jobs: this.missions.getJobList(),
      autopilot: player.state === 'inCar'
        ? {
            active: this.autopilot.active,
            distance: this.waypoint.active
              ? dist(player.x, player.y, this.waypoint.x, this.waypoint.y)
              : 0,
            target: this.waypoint.source === 'mission' ? 'mission' : 'user',
          }
        : null,
    };
    this.hudCallback(data);
  }
}
