import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAR,
  L_BODY, L_CABIN, L_GLASS, L_HEAD, L_TAIL, L_WHEELS, L_LIGHTBAR,
  composeVehicleRoot,
  PED, pedPose, composePedRoot, composePedLeg,
} from '../renderLayout';
import { Pedestrian } from '../types';

/**
 * The instanced renderers place every body part by matrix, so a sign error puts
 * wheels in the sky or people underground with no runtime error at all. These
 * tests pin the geometry down without needing a GPU.
 */

/** World-space translation of a composed matrix. */
function originOf(m: THREE.Matrix4): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(m);
}

function worldPart(root: THREE.Matrix4, local: THREE.Matrix4): THREE.Vector3 {
  return originOf(new THREE.Matrix4().multiplyMatrices(root, local));
}

function makePed(over: Partial<Pedestrian> = {}): Pedestrian {
  return {
    active: true,
    x: 0, y: 0, angle: 0, speed: 0,
    state: 'walk', stateTimer: 0,
    targetX: 0, targetY: 0,
    fleeX: 0, fleeY: 0,
    phase: 0,
    fallT: 0, fallDir: 1,
    flingVx: 0, flingVy: 0,
    colorIdx: 0, skinIdx: 0,
    hitCooldown: 0,
    ...over,
  };
}

describe('car part layout', () => {
  it('keeps every part above the ground', () => {
    const parts = [L_BODY, L_CABIN, ...L_GLASS, ...L_HEAD, ...L_TAIL, ...L_WHEELS, L_LIGHTBAR];
    for (const m of parts) {
      expect(originOf(m).y).toBeGreaterThan(0);
    }
  });

  it('stacks the cabin on top of the body and the light bar on top of the cabin', () => {
    const bodyY = originOf(L_BODY).y;
    const cabinY = originOf(L_CABIN).y;
    const barY = originOf(L_LIGHTBAR).y;
    expect(cabinY).toBeGreaterThan(bodyY);
    expect(barY).toBeGreaterThan(cabinY);
  });

  it('puts the wheels at axle height, straddling the body', () => {
    for (const w of L_WHEELS) {
      expect(originOf(w).y).toBeCloseTo(CAR.axleH, 6);
    }
    const xs = L_WHEELS.map(w => originOf(w).x);
    expect(Math.min(...xs)).toBeLessThan(-CAR.bodyW / 2);
    expect(Math.max(...xs)).toBeGreaterThan(CAR.bodyW / 2);
  });

  it('puts headlights at the front (-z) and taillights at the back (+z)', () => {
    for (const h of L_HEAD) expect(originOf(h).z).toBeLessThan(0);
    for (const t of L_TAIL) expect(originOf(t).z).toBeGreaterThan(0);
  });

  it('keeps all parts inside the car footprint', () => {
    const parts = [L_BODY, L_CABIN, ...L_GLASS, ...L_HEAD, ...L_TAIL, ...L_WHEELS];
    for (const m of parts) {
      const o = originOf(m);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(CAR.bodyW / 2 + 0.1);
      expect(Math.abs(o.z)).toBeLessThanOrEqual(CAR.bodyL / 2 + 0.05);
    }
  });
});

describe('vehicle root transform', () => {
  it('places an unrotated car at its world position', () => {
    const root = composeVehicleRoot(12, -34, 0, false, new THREE.Matrix4());
    const o = originOf(root);
    expect(o.x).toBeCloseTo(12, 6);
    expect(o.y).toBeCloseTo(0, 6);
    expect(o.z).toBeCloseTo(-34, 6);
  });

  it('points the nose north (-z) at angle 0', () => {
    const root = composeVehicleRoot(0, 0, 0, false, new THREE.Matrix4());
    const nose = worldPart(root, L_HEAD[0]);
    expect(nose.z).toBeLessThan(0);
  });

  it('swings the nose to +x when the car faces east', () => {
    // angle = PI/2 is East in the sim's convention.
    const root = composeVehicleRoot(0, 0, Math.PI / 2, false, new THREE.Matrix4());
    const nose = worldPart(root, L_HEAD[0]);
    expect(nose.x).toBeGreaterThan(1);
    expect(Math.abs(nose.z)).toBeLessThan(0.6);
  });

  it('tilts a wreck without sinking it through the road', () => {
    const upright = composeVehicleRoot(0, 0, 0, false, new THREE.Matrix4());
    const wreck = composeVehicleRoot(0, 0, 0, true, new THREE.Matrix4());
    const a = worldPart(upright, L_CABIN);
    const b = worldPart(wreck, L_CABIN);
    expect(b.y).toBeGreaterThan(0);
    // The slump should move it, but only slightly.
    expect(Math.abs(b.y - a.y)).toBeLessThan(0.3);
    expect(b.distanceTo(a)).toBeGreaterThan(0.01);
  });
});

describe('pedestrian pose', () => {
  it('stands upright with the head above the torso and feet near the ground', () => {
    const p = makePed();
    const pose = pedPose(p);
    const root = composePedRoot(0, 0, 0, pose, new THREE.Matrix4());

    const body = worldPart(root, new THREE.Matrix4().makeTranslation(0, PED.bodyOffsetY + pose.bob, 0));
    const head = worldPart(root, new THREE.Matrix4().makeTranslation(0, PED.headOffsetY + pose.bob, 0));
    const leg = originOf(composePedLeg(root, pose, 0, new THREE.Matrix4()));

    expect(head.y).toBeGreaterThan(body.y);
    expect(body.y).toBeGreaterThan(leg.y);
    // Leg centre is half a leg above the foot, so the foot lands near y = 0.
    expect(leg.y - PED.legHalf).toBeCloseTo(0, 1);
  });

  it('drops and rotates flat when knocked down', () => {
    const upright = pedPose(makePed());
    const prone = pedPose(makePed({ fallT: 1, fallDir: 1, state: 'knocked' }));

    expect(prone.hipY).toBeLessThan(upright.hipY);
    expect(prone.tilt).toBeCloseTo(Math.PI / 2, 5);
    // A body lying down should not still be swinging its legs.
    expect(prone.swing).toBe(0);
    expect(prone.bob).toBe(0);

    const root = composePedRoot(0, 0, 0, prone, new THREE.Matrix4());
    const head = worldPart(root, new THREE.Matrix4().makeTranslation(0, PED.headOffsetY, 0));
    // Fallen forward: the head ends up low and displaced along the ground.
    expect(head.y).toBeLessThan(0.3);
    expect(Math.abs(head.z)).toBeGreaterThan(0.4);
  });

  it('falls the other way when fallDir flips', () => {
    const fwd = pedPose(makePed({ fallT: 1, fallDir: 1 }));
    const back = pedPose(makePed({ fallT: 1, fallDir: -1 }));
    expect(fwd.tilt).toBeCloseTo(-back.tilt, 6);

    const rootF = composePedRoot(0, 0, 0, fwd, new THREE.Matrix4());
    const rootB = composePedRoot(0, 0, 0, back, new THREE.Matrix4());
    const hF = worldPart(rootF, new THREE.Matrix4().makeTranslation(0, PED.headOffsetY, 0));
    const hB = worldPart(rootB, new THREE.Matrix4().makeTranslation(0, PED.headOffsetY, 0));
    expect(Math.sign(hF.z)).toBe(-Math.sign(hB.z));
  });

  it('leans further forward while fleeing than while walking', () => {
    expect(pedPose(makePed({ state: 'flee' })).tilt)
      .toBeGreaterThan(pedPose(makePed({ state: 'walk' })).tilt);
  });

  it('swings the legs in antiphase about the hip', () => {
    // Quarter phase gives maximum swing.
    const pose = pedPose(makePed({ phase: Math.PI / 2 }));
    expect(Math.abs(pose.swing)).toBeGreaterThan(0.5);

    const root = composePedRoot(0, 0, 0, pose, new THREE.Matrix4());
    const a = originOf(composePedLeg(root, pose, 0, new THREE.Matrix4()));
    const b = originOf(composePedLeg(root, pose, 1, new THREE.Matrix4()));

    // One leg forward, one back.
    expect(Math.sign(a.z)).toBe(-Math.sign(b.z));
    // Hips are offset left/right.
    expect(Math.sign(a.x)).toBe(-Math.sign(b.x));
    // Neither leg detaches from the body.
    expect(a.y).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThan(0);
  });

  it('positions the crowd at the right world coordinates', () => {
    const pose = pedPose(makePed());
    const root = composePedRoot(-5, 7, 0, pose, new THREE.Matrix4());
    const o = originOf(root);
    expect(o.x).toBeCloseTo(-5, 6);
    expect(o.z).toBeCloseTo(7, 6);
    expect(o.y).toBeCloseTo(PED.hipY, 6);
  });
});
