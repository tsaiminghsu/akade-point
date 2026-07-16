export const TILE_SIZE = 40;
export const GRID_SIZE = 80;
export const WORLD_SIZE = TILE_SIZE * GRID_SIZE; // 3200

// 3D rendering constants
export const TILE_3D = 4;                              // Three.js units per tile
export const FLOOR_HEIGHT_3D = 1.4;                   // Three.js units per floor
export const WORLD_3D_HALF = (GRID_SIZE * TILE_3D) / 2; // Center offset = 160

export function toX3D(wx: number): number {
  return wx * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;
}
export function toZ3D(wy: number): number {
  return wy * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;
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
  npcState?: 'driving' | 'stopped' | 'waiting';
  waitTimer?: number;
  // stuck detection
  stuckCheckX?: number;
  stuckCheckY?: number;
  stuckCheckTimer?: number;
  // service
  isService?: boolean;
}

export interface Player {
  x: number;
  y: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  state: 'onFoot' | 'inCar' | 'inHelicopter' | 'inDrone';
  currentVehicleId: string | null;
  health: number;
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
}

export interface WorldData {
  grid: Tile[][];
  helipads: Point[];
  shopPositions: Point[];
  roadTiles: Point[];
  spawnPoints: Point[];
  townHallPos: Point;
}

// ── Race Mode Types ────────────────────────────────────────────────────────────

export type RaceGateShape = 'ring' | 'rectangle' | 'arch';
export type RacePhase = 'idle' | 'countdown' | 'racing' | 'crashed' | 'finished';

export interface RaceGate {
  id: string;
  order: number;
  x: number;           // world x (0–3200)
  y: number;           // world y (0–3200)
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
  startTime: number;          // performance.now() at race start
  lapStartTime: number;
  elapsedTime: number;        // seconds since race start
  bestLap: number;            // seconds, 0 = not set yet
  lapTimes: number[];
  splitTimes: number[];       // elapsed time at each gate crossing (current lap)
  lastGateTime: number;       // performance.now() when last gate was passed
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
