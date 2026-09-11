import * as THREE from 'three';
import { Pedestrian } from './types';

/**
 * Pure geometry for the instanced renderers.
 *
 * The car fleet and the pedestrian crowd are drawn with InstancedMesh, so every
 * body part is positioned by composing a per-entity root matrix with a constant
 * local offset. That math lives here rather than inside the React components so
 * it can be unit-tested without a GPU — a misplaced part is otherwise invisible
 * until someone looks at the screen.
 *
 * Units are three.js units (1 unit = 10 world px). +y is up, and an entity with
 * angle 0 faces -z (North), matching `rotation.y = -angle` used everywhere else.
 */

// ── Car body proportions ──────────────────────────────────────────────────────
// These must stay in sync with CarMesh in VehicleMeshes.tsx so the player's car
// and the instanced fleet look identical.

export const CAR = {
  bodyW: 1.55,
  bodyL: 3.2,
  bodyH: 0.58,
  cabinW: 1.35,
  cabinL: 1.7,
  cabinH: 0.52,
  wheelR: 0.32,
  axleH: 0.33,
  wheelW: 0.22,
} as const;

export const CAR_BODY_Y = CAR.bodyH / 2 + CAR.axleH - 0.05;
export const CAR_CABIN_Y = CAR.bodyH + CAR.cabinH / 2 + CAR.axleH - 0.05;
export const CAR_CABIN_Z = CAR.bodyL * 0.06;
export const CAR_LIGHT_Y = CAR.axleH + CAR.bodyH * 0.3;

/** Build a constant local part transform. */
export function partMatrix(
  pos: [number, number, number],
  scale: [number, number, number],
  rot?: [number, number, number],
): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  m.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scale));
  return m;
}

export const L_BODY = partMatrix([0, CAR_BODY_Y, 0], [CAR.bodyW, CAR.bodyH, CAR.bodyL]);
export const L_CABIN = partMatrix([0, CAR_CABIN_Y, CAR_CABIN_Z], [CAR.cabinW, CAR.cabinH, CAR.cabinL]);

/** [windscreen, rear window] */
export const L_GLASS = [
  partMatrix(
    [0, CAR_CABIN_Y, CAR_CABIN_Z - CAR.cabinL / 2 - 0.01],
    [CAR.cabinW - 0.1, CAR.cabinH - 0.08, 0.04],
  ),
  partMatrix(
    [0, CAR_CABIN_Y, CAR_CABIN_Z + CAR.cabinL / 2 + 0.01],
    [CAR.cabinW - 0.12, CAR.cabinH - 0.1, 0.04],
  ),
];

/** Headlights sit at the front, which is -z in local space. */
export const L_HEAD = [
  partMatrix([ CAR.bodyW * 0.3, CAR_LIGHT_Y, -CAR.bodyL / 2 - 0.01], [0.3, 0.15, 0.04]),
  partMatrix([-CAR.bodyW * 0.3, CAR_LIGHT_Y, -CAR.bodyL / 2 - 0.01], [0.3, 0.15, 0.04]),
];

export const L_TAIL = [
  partMatrix([ CAR.bodyW * 0.3, CAR_LIGHT_Y, CAR.bodyL / 2 + 0.01], [0.28, 0.12, 0.04]),
  partMatrix([-CAR.bodyW * 0.3, CAR_LIGHT_Y, CAR.bodyL / 2 + 0.01], [0.28, 0.12, 0.04]),
];

/**
 * A unit cylinder runs along +y, so each wheel is rotated onto the x axis and
 * scaled to (radius, width, radius).
 */
export const L_WHEELS = ([
  [-CAR.bodyW / 2 - 0.04,  CAR.bodyL * 0.33],
  [ CAR.bodyW / 2 + 0.04,  CAR.bodyL * 0.33],
  [-CAR.bodyW / 2 - 0.04, -CAR.bodyL * 0.33],
  [ CAR.bodyW / 2 + 0.04, -CAR.bodyL * 0.33],
] as [number, number][]).map(([wx, wz]) =>
  partMatrix([wx, CAR.axleH, wz], [CAR.wheelR, CAR.wheelW, CAR.wheelR], [0, 0, Math.PI / 2]),
);

export const L_TAXI_SIGN = partMatrix(
  [0, CAR.bodyH + CAR.cabinH + CAR.axleH + 0.06, CAR_CABIN_Z],
  [0.5, 0.15, 0.9],
);

export const L_LIGHTBAR = partMatrix(
  [0, CAR.bodyH + CAR.cabinH + CAR.axleH + 0.07, CAR_CABIN_Z],
  [0.9, 0.12, 0.26],
);

/** A wreck slumps sideways so it reads as debris rather than a parked car. */
export const WRECK_PITCH = 0.12;
export const WRECK_ROLL = 0.1;

const vrPos = new THREE.Vector3();
const vrQuat = new THREE.Quaternion();
const vrEuler = new THREE.Euler();
const vrScale = new THREE.Vector3(1, 1, 1);

/**
 * Root transform for one vehicle. `angle` is the sim heading in radians
 * (0 = North, clockwise), converted here to the renderer's `-angle` about y.
 */
export function composeVehicleRoot(
  x3: number,
  z3: number,
  angle: number,
  wrecked: boolean,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  vrPos.set(x3, 0, z3);
  vrEuler.set(wrecked ? WRECK_PITCH : 0, -angle, wrecked ? WRECK_ROLL : 0);
  vrQuat.setFromEuler(vrEuler);
  out.compose(vrPos, vrQuat, vrScale);
  return out;
}

// ── Pedestrian proportions ────────────────────────────────────────────────────

export const PED = {
  hipY: 0.5,
  bodyOffsetY: 0.25,
  headOffsetY: 0.68,
  legHalf: 0.25,
  legX: 0.09,
  /** How far the hips drop when fully prone. */
  fallDrop: 0.38,
  bodyRadius: 0.18,
  bodyLength: 0.5,
  headRadius: 0.14,
} as const;

export interface PedPose {
  /** Rotation about the local x axis: a small lean, or a full fall. */
  tilt: number;
  /** Hip height in three.js units. */
  hipY: number;
  /** Vertical walk-cycle bob applied to the torso and head. */
  bob: number;
  /** Leg swing amplitude in radians (legs move in antiphase). */
  swing: number;
}

/**
 * Derive a pedestrian's pose scalars from simulation state. Knocked-down peds
 * rotate about the waist and drop, which is what sells the ragdoll without any
 * skeletal animation.
 */
export function pedPose(p: Pedestrian): PedPose {
  const falling = p.fallT > 0;
  return {
    tilt: falling
      ? p.fallT * (Math.PI / 2) * p.fallDir
      : (p.state === 'flee' ? 0.15 : 0.04),
    hipY: PED.hipY - PED.fallDrop * p.fallT,
    bob: falling ? 0 : Math.sin(p.phase * 2) * 0.04,
    swing: falling ? 0 : Math.sin(p.phase) * 0.6,
  };
}

const prPos = new THREE.Vector3();
const prQuat = new THREE.Quaternion();
const prEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const prScale = new THREE.Vector3(1, 1, 1);

/** Root transform anchored at the hips, so a fall rotates about the waist. */
export function composePedRoot(
  x3: number,
  z3: number,
  angle: number,
  pose: PedPose,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  prPos.set(x3, pose.hipY, z3);
  prEuler.set(pose.tilt, -angle, 0, 'YXZ');
  prQuat.setFromEuler(prEuler);
  out.compose(prPos, prQuat, prScale);
  return out;
}

const legRot = new THREE.Matrix4();
const legDrop = new THREE.Matrix4();

/**
 * Leg transform for side `k` (0 or 1). Composes as
 * root * T(hip offset) * R_x(swing) * T(down the leg), i.e. a swing about the hip.
 */
export function composePedLeg(
  root: THREE.Matrix4,
  pose: PedPose,
  k: 0 | 1,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  const sign = k === 0 ? 1 : -1;
  legRot.makeRotationX(pose.swing * sign);
  legRot.setPosition(PED.legX * sign, 0, 0);
  legDrop.makeTranslation(0, -PED.legHalf, 0);
  out.multiplyMatrices(root, legRot);
  out.multiply(legDrop);
  return out;
}
