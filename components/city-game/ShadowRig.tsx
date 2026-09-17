'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { GameEngine3D } from './engine3d';
import { toX3D, toZ3D } from './types';

/**
 * Keeps the sun's shadow camera centred on the player.
 *
 * The map is 640 units across, so a world-origin shadow box large enough to
 * reach the edges would have no usable resolution. Instead a small box follows
 * the player, which means it has to be re-aimed every frame — and re-aiming a
 * shadow camera makes the depth texture shimmer along edges unless the box is
 * snapped to whole texels in light space.
 */

/** How far up the light sits along its direction. Must clear the tallest tower. */
const LIGHT_DISTANCE = 220;
/** Bias the box towards where the camera is looking rather than the player. */
const LOOK_AHEAD = 0.35;
/** Below this sun intensity there is nothing meaningful to cast. */
const MIN_SHADOW_INTENSITY = 0.05;

interface Props {
  engine: GameEngine3D;
  sun: React.RefObject<THREE.DirectionalLight | null>;
  /**
   * The weather's sun position. Only its direction is used — this rig owns the
   * light's actual position, so it cannot read the direction back off the light.
   */
  sunPosition: readonly [number, number, number];
  /** Half-extent of the orthographic box, in 3D units. */
  half: number;
  mapSize: number;
  enabled: boolean;
}

export default function ShadowRig({ engine, sun, sunPosition, half, mapSize, enabled }: Props) {
  const { scene, camera } = useThree();
  const focus = useRef(new THREE.Vector3());
  const focusInit = useRef(false);
  const sunDir = useRef(new THREE.Vector3(0, 1, 0));
  const tmp = useRef(new THREE.Vector3());
  const lightSpace = useRef(new THREE.Matrix4());

  // A directional light aims at its target's position, and the target only
  // contributes if it is actually in the scene graph.
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    scene.add(light.target);
    return () => { scene.remove(light.target); };
  }, [scene, sun]);

  // three only reallocates the depth texture when the old one is disposed and
  // the reference cleared, so a plain mapSize change would be ignored.
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.castShadow = enabled;
    if (!enabled) return;

    const shadow = light.shadow;
    if (shadow.mapSize.width !== mapSize) {
      shadow.mapSize.set(mapSize, mapSize);
      shadow.map?.dispose();
      shadow.map = null;
    }
    const cam = shadow.camera;
    cam.near = 1;
    cam.far = LIGHT_DISTANCE * 2;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();

    // normalBias offsets along the surface normal, which handles the shallow
    // grazing angles on building faces far better than a constant bias.
    shadow.bias = -0.0002;
    shadow.normalBias = 0.02;
    shadow.needsUpdate = true;
  }, [sun, half, mapSize, enabled]);

  useFrame(() => {
    const light = sun.current;
    if (!light || !enabled) return;

    sunDir.current.set(sunPosition[0], sunPosition[1], sunPosition[2]);
    if (sunDir.current.lengthSq() < 1e-6) sunDir.current.set(0.4, 1, 0.3);
    sunDir.current.normalize();

    light.castShadow = light.intensity > MIN_SHADOW_INTENSITY;
    if (!light.castShadow) return;

    const px = toX3D(engine.player.x);
    const pz = toZ3D(engine.player.y);

    // Push the box towards what the camera is looking at: the player sits near
    // the bottom of a third-person view, so a centred box wastes half of it.
    camera.getWorldDirection(tmp.current);
    tmp.current.y = 0;
    if (tmp.current.lengthSq() > 1e-6) tmp.current.normalize();
    const targetX = px + tmp.current.x * half * LOOK_AHEAD;
    const targetZ = pz + tmp.current.z * half * LOOK_AHEAD;

    if (!focusInit.current) {
      focus.current.set(targetX, 0, targetZ);
      focusInit.current = true;
    } else {
      focus.current.x += (targetX - focus.current.x) * 0.1;
      focus.current.z += (targetZ - focus.current.z) * 0.1;
    }

    // Snap the anchor to whole shadow-map texels, measured along the light's
    // own axes. Without this the depth samples land differently every frame and
    // every shadow edge crawls as the player moves.
    const texel = (half * 2) / mapSize;
    lightSpace.current.lookAt(sunDir.current, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const basis = lightSpace.current.elements;
    const rightX = basis[0], rightY = basis[1], rightZ = basis[2];
    const upX = basis[4], upY = basis[5], upZ = basis[6];

    const fx = focus.current.x, fy = focus.current.y, fz = focus.current.z;
    let u = fx * rightX + fy * rightY + fz * rightZ;
    let v = fx * upX + fy * upY + fz * upZ;
    const du = Math.round(u / texel) * texel - u;
    const dv = Math.round(v / texel) * texel - v;
    u += du;
    v += dv;

    const snappedX = fx + rightX * du + upX * dv;
    const snappedY = fy + rightY * du + upY * dv;
    const snappedZ = fz + rightZ * du + upZ * dv;

    light.target.position.set(snappedX, snappedY, snappedZ);
    light.target.updateMatrixWorld();
    light.position.set(
      snappedX + sunDir.current.x * LIGHT_DISTANCE,
      snappedY + sunDir.current.y * LIGHT_DISTANCE,
      snappedZ + sunDir.current.z * LIGHT_DISTANCE,
    );
    light.updateMatrixWorld();
    light.shadow.camera.updateMatrixWorld();
  });

  return null;
}
