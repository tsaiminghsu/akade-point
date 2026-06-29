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
}

export interface WorldData {
  grid: Tile[][];
  helipads: Point[];
  shopPositions: Point[];
  roadTiles: Point[];
  spawnPoints: Point[];
  townHallPos: Point;
}
