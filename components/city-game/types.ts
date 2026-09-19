export const TILE_SIZE = 40;
export const GRID_SIZE = 160;
export const WORLD_SIZE = TILE_SIZE * GRID_SIZE; // 6400
/** Tile index of the city centre. Must stay a multiple of 8 so it is an intersection. */
export const WORLD_CENTER_TILE = Math.floor(GRID_SIZE / 2); // 80

// 3D rendering constants
export const TILE_3D = 4;                              // Three.js units per tile
export const FLOOR_HEIGHT_3D = 1.4;                   // Three.js units per floor
export const WORLD_3D_HALF = (GRID_SIZE * TILE_3D) / 2; // Center offset = 320

// ── Chunks ───────────────────────────────────────────────────────────────────
// Static geometry and ground textures are streamed per chunk. A chunk is two
// blocks on a side, so chunk edges always fall on roads.
export const CHUNK_TILES = 16;
export const CHUNKS_PER_SIDE = Math.ceil(GRID_SIZE / CHUNK_TILES); // 10
export const CHUNK_3D = CHUNK_TILES * TILE_3D;                     // 64 units
export const CHUNK_PX = CHUNK_TILES * TILE_SIZE;                   // 640 px

export function chunkKey(cx: number, cy: number): number {
  return cy * CHUNKS_PER_SIDE + cx;
}
export function chunkOfTile(gx: number, gy: number): { cx: number; cy: number } {
  return { cx: Math.floor(gx / CHUNK_TILES), cy: Math.floor(gy / CHUNK_TILES) };
}
/** Chunk containing a world-px point. Clamped so edge queries stay in range. */
export function chunkOf(wx: number, wy: number): { cx: number; cy: number } {
  const cx = Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor(wx / CHUNK_PX)));
  const cy = Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor(wy / CHUNK_PX)));
  return { cx, cy };
}

export function toX3D(wx: number): number {
  return wx * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;
}
export function toZ3D(wy: number): number {
  return wy * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;
}
export function fromX3D(x3: number): number {
  return (x3 + WORLD_3D_HALF) * (TILE_SIZE / TILE_3D);
}
export function fromZ3D(z3: number): number {
  return (z3 + WORLD_3D_HALF) * (TILE_SIZE / TILE_3D);
}

export enum TileType {
  EMPTY = 'EMPTY',
  ROAD_H = 'ROAD_H',
  ROAD_V = 'ROAD_V',
  INTERSECTION = 'INTERSECTION',
  SIDEWALK = 'SIDEWALK',
  BUILDING = 'BUILDING',
  PARK = 'PARK',
  PARKING = 'PARKING',
  HELIPAD = 'HELIPAD',
  TOWN_HALL = 'TOWN_HALL',
  TOWN_HALL_PLAZA = 'TOWN_HALL_PLAZA',   // civic grounds — walkable, not drivable
  TOWN_HALL_INTERIOR = 'TOWN_HALL_INTERIOR', // lobby — walkable, enclosed
  DRONE_FIELD = 'DRONE_FIELD',           // drone arena floor — walkable, no props
}

export enum BuildingType {
  COMMERCIAL = 'COMMERCIAL',
  RESIDENTIAL = 'RESIDENTIAL',
  OFFICE = 'OFFICE',
  SHOP = 'SHOP',
  HOUSE = 'HOUSE',
}

export interface Tile {
  type: TileType;
  // building-specific
  floors?: number;
  buildingType?: BuildingType;
  shopName?: string;
  colorSeed?: number;
  isHelipad?: boolean;
  blockId?: number;
}

export enum VehicleType {
  CAR = 'CAR',
  TAXI = 'TAXI',
  DELIVERY_SCOOTER = 'DELIVERY_SCOOTER',
  HELICOPTER = 'HELICOPTER',
  RC_DRONE = 'RC_DRONE',
  NPC_CAR = 'NPC_CAR',
  POLICE = 'POLICE',
}

export interface Point {
  x: number;
  y: number;
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  x: number;
  y: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  color: string;
  width: number;
  height: number;
  occupant: 'player' | 'npc' | null;
  waypoints: Point[];
  waypointIndex: number;
  // drone-specific
  altitude?: number;
  targetAltitude?: number;
  // npc traffic state
  npcState?: 'driving' | 'stopped' | 'waiting' | 'hijacked' | 'pulledOver';
  waitTimer?: number;
  // stuck detection
  stuckCheckX?: number;
  stuckCheckY?: number;
  stuckCheckTimer?: number;
  // service
  isService?: boolean;

  // -- Simulation additions (GTA systems) --------------------------------
  /** Durability 0-100. 0 = wrecked. */
  hp: number;
  /** Collision mass. Default 1; POLICE 1.3; parked 0.6; wreck = immovable. */
  mass?: number;
  /** Position at the start of the tick, used to derive true velocity. */
  prevX?: number;
  prevY?: number;
  /**
   * Derived world velocity in px/SECOND. Always use these across the
   * NPC/player boundary: `speed` is px/s for the player but px/FRAME for NPCs.
   */
  vx?: number;
  vy?: number;
  /** Parked or abandoned: traffic AI skips it, the player may enter freely. */
  isParked?: boolean;
  /** > 0 while this is a static wreck; counts down to despawn. */
  wreckTimer?: number;
  /** Palette index the ejected driver inherits. */
  driverColorIdx?: number;
  /** gameClock.now() of the last damaging impact (cooldown gate). */
  lastHitTime?: number;
}

/**
 * A scripted, input-locking player animation. While this is non-null the
 * normal physics branch is skipped and `updateAction` drives the player.
 */
export type PlayerAction =
  | { kind: 'carjack'; vehicleId: string; timer: number; total: number; fromX: number; fromY: number }
  | { kind: 'busted';  timer: number; total: number }
  | { kind: 'ejected'; timer: number; total: number };

export interface Player {
  x: number;
  y: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  state: 'onFoot' | 'inCar' | 'inHelicopter' | 'inDrone';
  currentVehicleId: string | null;
  health: number;
  /** Jump altitude in world px (0 = ground). Same unit as Vehicle.altitude. */
  z: number;
  /** Vertical velocity in px/s while airborne. */
  jumpVel: number;
  action: PlayerAction | null;
}

export type OrderType = 'taxi' | 'food' | 'helicopter';
export type OrderStatus = 'dispatched' | 'arriving' | 'arrived' | 'completed';

export type CallRecordType = 'taxi' | 'food' | 'helicopter';
export type CallRecordStatus = 'called' | 'arrived' | 'completed' | 'cancelled';

export interface CallRecord {
  id: string;
  type: CallRecordType;
  label: string;
  calledAt: number;
  status: CallRecordStatus;
}

export interface Order {
  id: string;
  type: OrderType;
  status: OrderStatus;
  vehicleId: string;
  eta: number;
  label: string;
}

export interface DroneState {
  active: boolean;
  altitude: number;
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  battery: number;
  signal: number;
  vehicleId: string | null;
}

export interface Waypoint {
  x: number;
  y: number;
  active: boolean;
  /** 'mission' waypoints are owned by MissionManager and cleared with the session. */
  source?: 'user' | 'mission';
}

// -- Minimap -----------------------------------------------------------------

export type BlipKind =
  | 'mission' | 'marker' | 'passenger' | 'police' | 'paynspray' | 'vehicle' | 'custom';

/** A point of interest drawn on the minimap, in world px. */
export interface MinimapBlip {
  x: number;
  y: number;
  kind: BlipKind;
  color: string;
  /** Radians, same convention as Player.angle. Drawn as an arrow when set. */
  heading?: number;
  pulse?: boolean;
  label?: string;
}

// -- Orbit camera ------------------------------------------------------------

/** GTA-style third-person orbit camera. Owned by the engine, applied in GameScene. */
export interface OrbitCamState {
  /** Radians, 0 = North, clockwise-positive (same convention as Player.angle). */
  yaw: number;
  /** Radians above the horizon. */
  pitch: number;
  zoomIdx: 0 | 1 | 2;
  /** Smoothed, occlusion-adjusted boom length in 3D units. */
  dist: number;
  /** gameClock.now() of the last look input. Drives vehicle auto-recenter. */
  lastLookMs: number;
  /** Focus altitude in 3D units (helicopter / drone). */
  focusAlt: number;
}

// -- Pedestrians -------------------------------------------------------------

export type PedState = 'walk' | 'idle' | 'crossing' | 'flee' | 'knocked' | 'getup' | 'waiting';

export interface Pedestrian {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  /** px/s */
  speed: number;
  state: PedState;
  stateTimer: number;
  /** Next tile centre being walked to. */
  targetX: number;
  targetY: number;
  /** Position of the threat being fled from. */
  fleeX: number;
  fleeY: number;
  /** Walk-cycle phase in radians. */
  phase: number;
  /** 0 = upright, 1 = flat on the ground. */
  fallT: number;
  fallDir: 1 | -1;
  /** Decaying post-impact velocity, px/s. */
  flingVx: number;
  flingVy: number;
  colorIdx: number;
  skinIdx: number;
  /** Seconds until this ped can be scored as a fresh hit again. */
  hitCooldown: number;
}

// -- Banners -----------------------------------------------------------------

export interface Banner {
  id: string;
  text: string;
  sub?: string;
  color: string;
  /** gameClock.now() at which the banner expires. */
  until: number;
}

export interface GameState {
  player: Player;
  vehicles: Map<string, Vehicle>;
  orders: Order[];
  drone: DroneState;
  waypoint: Waypoint;
  camera: Point;
  tick: number;
  notifications: Notification[];
  zone: string;
  /** Camera yaw in radians. The minimap rotates by this. */
  camYaw: number;
  /** Cached GPS route to the active waypoint, or null. */
  route: Point[] | null;
  blips: MinimapBlip[];
}

export interface Notification {
  id: string;
  text: string;
  expiresAt: number;
  color?: string;
}

export interface HUDData {
  speed: number;
  speedKMH: number;
  playerState: Player['state'];
  vehicleType: VehicleType | null;
  orders: Order[];
  drone: DroneState;
  waypoint: Waypoint;
  zone: string;
  playerX: number;
  playerY: number;
  notifications: Notification[];
  vehicleAltitude?: number;
  nearTownHall?: boolean;
  callLog: CallRecord[];
  raceSession?: RaceSession | null;

  // -- GTA systems -------------------------------------------------------
  /** Player health 0-100. */
  health: number;
  /** Current vehicle durability 0-100, if in one. */
  vehicleHp?: number;
  wantedStars: number;
  /** True while out of police sight and the star timer is draining. */
  wantedEvading: boolean;
  /** 0-1 while an officer is arresting the player. */
  arrestProgress: number;
  /** 0 = clear, 1 = fully black (Busted transition). */
  screenFade: number;
  screenLabel: string | null;
  /** What pressing F would do right now. Drives the hint and mobile label. */
  nearVehicle: 'none' | 'free' | 'occupied' | 'police';

  // -- Economy and missions ----------------------------------------------
  cash: number;
  /** Floating +$ / -$ figures the HUD animates. */
  cashTicker: { id: string; amount: number; at: number }[];
  mission: MissionHUDLike | null;
  /** Set while standing on an available mission marker. */
  nearMarker: { defId: string; title: string; icon: string } | null;
  canStartTaxi: boolean;
  banner: Banner | null;
  jobs: JobListLike[];
  /** Self-driving status while in a car; null when not driving. */
  autopilot: AutopilotHUD | null;
}

export interface AutopilotHUD {
  active: boolean;
  /** Straight-line distance to the destination, world px. */
  distance: number;
  target: 'user' | 'mission';
}

/**
 * Structural mirrors of the mission manager's DTOs. Declared here so types.ts
 * stays free of imports from the mission layer.
 */
export interface MissionHUDLike {
  defId: string;
  title: string;
  icon: string;
  color: string;
  phase: 'briefing' | 'active' | 'success' | 'failed';
  objectiveText: string;
  progressText: string;
  timeLeft: number | null;
  timeText: string | null;
  earned: number;
  resultText: string;
  cancelArmed: boolean;
  description: string;
  reward: number;
}

export interface JobListLike {
  defId: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  reward: number;
  status: 'available' | 'cooldown' | 'active';
  cooldownLeft: number;
  best: number | null;
  progressText: string | null;
}

export interface ParkingBlock {
  id: number;
  center: Point;
  tiles: Point[];
}

// ── Chunk index ──────────────────────────────────────────────────────────────

/**
 * One instanced-mesh layer of a chunk, pre-baked at world generation.
 * `mats` holds column-major 4x4 matrices (16 floats per instance) and
 * `colors` holds RGB triplets (3 per instance), ready to be copied straight
 * into an InstancedMesh buffer with `Float32Array.set`.
 */
export interface InstanceLayer {
  count: number;
  mats: Float32Array;
  colors: Float32Array;
}

export type ChunkLayerName =
  | 'sky' | 'off' | 'com' | 'hou'
  | 'roofBase' | 'roofPeak'
  | 'houseWin' | 'houseDoor'
  | 'treeTrunk' | 'treeLeaf'
  | 'lampPole' | 'lampHead';

export interface ChunkIndex {
  cx: number;
  cy: number;
  key: number;
  /** Axis-aligned bounds in 3D units (x/z) — used for distance tests. */
  minX3: number;
  maxX3: number;
  minZ3: number;
  maxZ3: number;
  /** Bounds in world px. */
  minPx: number;
  maxPx: number;
  minPy: number;
  maxPy: number;
  layers: Record<ChunkLayerName, InstanceLayer>;
  /** x3,z3 pairs of every street lamp, for the nearest-N point lights. */
  lampPositions: Float32Array;
  roadTiles: Point[];
  sidewalkTiles: Point[];
  parkTiles: Point[];
  parkingBlockIds: number[];
}

export interface WorldData {
  grid: Tile[][];
  helipads: Point[];
  shopPositions: Point[];
  roadTiles: Point[];
  spawnPoints: Point[];
  townHallPos: Point;
  /** Every SIDEWALK tile centre. The pedestrian spawn/wander domain. */
  sidewalkTiles: Point[];
  /** PARKING tiles grouped by block: parked cars and pay-n-spray sites. */
  parkingBlocks: ParkingBlock[];
  /** Walkable Town Hall lobby tile used for the Busted respawn. */
  respawnPos: Point;
  /** Per-chunk baked instance layers and spatial buckets. Built once. */
  chunks: ChunkIndex[];
  /** `roadTiles` bucketed by chunk key, for ring queries. */
  roadTilesByChunk: Point[][];
  /** Where the drone takes off inside the arena. */
  dronePad: Point;
}

// ── Race Mode Types ────────────────────────────────────────────────────────────

export type RaceGateShape = 'ring' | 'rectangle' | 'arch';
export type RacePhase = 'idle' | 'countdown' | 'racing' | 'crashed' | 'finished';

export interface RaceGate {
  id: string;
  order: number;
  x: number;           // world x (0–WORLD_SIZE)
  y: number;           // world y (0–WORLD_SIZE)
  altitude: number;    // altitude units (0–200)
  yaw: number;         // radians — heading direction drone should fly through
  width: number;       // 3D units — opening width
  height: number;      // 3D units — opening height
  thickness: number;   // 3D units — frame bar thickness
  shape: RaceGateShape;
  isCheckpoint?: boolean;
  isFinishGate?: boolean;
  color?: string;
  glow?: boolean;
}

export interface RaceCourse {
  id: string;
  name: string;
  description: string;
  gates: RaceGate[];
  totalLaps: number;
  difficulty: 'easy' | 'medium' | 'hard';
  color: string;
  parTime: number;  // seconds, target for 3★
}

export interface RaceSession {
  courseId: string;
  phase: RacePhase;
  currentGateIndex: number;   // index of next gate to pass
  currentLap: number;
  totalLaps: number;
  startTime: number;          // gameClock.now() at race start
  lapStartTime: number;
  elapsedTime: number;        // seconds since race start
  bestLap: number;            // seconds, 0 = not set yet
  lapTimes: number[];
  splitTimes: number[];       // elapsed time at each gate crossing (current lap)
  lastGateTime: number;       // gameClock.now() when last gate was passed
  crashCount: number;
  lastPassedGateIndex: number; // for respawn (−1 = before start)
  fpvMode: boolean;
  countdownValue: number;     // 3 → 2 → 1 → 0 (GO)
  countdownTimer: number;     // seconds until next countdown tick
  boostActive: boolean;
  boostTimer: number;         // seconds remaining on boost
  boostCooldown: number;      // seconds until boost available again
  cameraShake: number;        // seconds of shake remaining
  autoRespawnTimer: number;   // seconds until auto-respawn after crash (2s)
  respawnInvincTimer: number; // seconds of collision immunity after respawn
  crashesAtCurrentGate: number; // crash loop counter — resets when gate advances
}
