import { VehicleType } from './types';

/**
 * Per-type handling and toughness.
 *
 * One table so that physics, collision, combat and the AI all agree on what a
 * tank is. Pure data plus predicates: no three.js, no engine.
 *
 * UNITS: `driveMax`/`accel` are px/SECOND and apply when the player drives the
 * vehicle. `aiMax` is px/FRAME, the unit `moveVehicleTowardWaypoint` works in.
 */

export interface VehicleSpec {
  /** Player top speed, px/s. */
  driveMax: number;
  /** Player acceleration, px/s². */
  accel: number;
  /** Steering rate, rad/s. */
  steer: number;
  /** Can turn on the spot (tracked vehicles). */
  pivot: boolean;
  /** AI top speed, px/frame. */
  aiMax: number;
  /** Collision mass. */
  mass: number;
  /** Damage multiplier: 1 = ordinary car, lower = tougher. */
  armor: number;
  /** Capsule circle radius and half-length, px. */
  radius: number;
  offset: number;
  /** Rolls over lighter vehicles instead of bouncing off them. */
  crushes: boolean;
}

const CAR_SPEC: VehicleSpec = {
  driveMax: 160, accel: 280, steer: 2.2, pivot: false,
  aiMax: 2.2, mass: 1, armor: 1, radius: 8.5, offset: 6.5, crushes: false,
};

const SPECS: Partial<Record<VehicleType, VehicleSpec>> = {
  [VehicleType.POLICE]: {
    ...CAR_SPEC, driveMax: 175, accel: 300, aiMax: 2.55, mass: 1.3, armor: 0.85,
  },
  [VehicleType.SWAT]: {
    driveMax: 145, accel: 200, steer: 1.9, pivot: false,
    aiMax: 2.35, mass: 2.2, armor: 0.45, radius: 9.5, offset: 8, crushes: false,
  },
  [VehicleType.ARMY_TRUCK]: {
    driveMax: 135, accel: 190, steer: 1.8, pivot: false,
    aiMax: 2.25, mass: 2.5, armor: 0.5, radius: 9.5, offset: 8.5, crushes: false,
  },
  [VehicleType.TANK]: {
    driveMax: 85, accel: 110, steer: 1.4, pivot: true,
    aiMax: 1.35, mass: 9, armor: 0.1, radius: 12, offset: 8, crushes: true,
  },
  [VehicleType.DELIVERY_SCOOTER]: {
    ...CAR_SPEC, mass: 0.5, radius: 6, offset: 0,
  },
};

export function specOf(type: VehicleType): VehicleSpec {
  return SPECS[type] ?? CAR_SPEC;
}

export function armorOf(type: VehicleType): number {
  return specOf(type).armor;
}

/** Flies: excluded from ground collision, traffic spacing and pedestrian hits. */
export function isAirVehicle(type: VehicleType): boolean {
  return type === VehicleType.HELICOPTER
    || type === VehicleType.POLICE_HELI
    || type === VehicleType.RC_DRONE;
}

/** Police, SWAT and the army. Driven by the law systems, never by traffic. */
export function isLawVehicle(type: VehicleType): boolean {
  return type === VehicleType.POLICE
    || type === VehicleType.SWAT
    || type === VehicleType.POLICE_HELI
    || type === VehicleType.ARMY_TRUCK
    || type === VehicleType.TANK;
}

/** Law vehicles that drive on the ground and take part in collisions. */
export function isLawGround(type: VehicleType): boolean {
  return isLawVehicle(type) && type !== VehicleType.POLICE_HELI;
}

/** Spike strips only shred rubber. */
export const SPIKE_SPEED_MULT = 0.55;
