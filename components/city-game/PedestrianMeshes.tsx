'use client';
import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { toX3D, toZ3D } from './types';
import { PedestrianSystem, PED_SHIRT_COLORS, PED_SKIN_COLORS } from './pedestrians';
import { PED, pedPose, composePedRoot, composePedLeg } from './renderLayout';

/**
 * Instanced pedestrian rendering: 3 draw calls for the whole crowd.
 *
 * There is no skeletal animation here. Every pose — walk bob, leg swing, flee
 * lean, and lying flat after a knockdown — is baked into the per-instance
 * matrices, which is what keeps ~100 people affordable on a phone.
 */

const CAPACITY = 128;

// Scratch — never allocate inside sync().
const pmRoot = new THREE.Matrix4();
const pmPart = new THREE.Matrix4();
const pmLocal = new THREE.Matrix4();
const pmColor = new THREE.Color();

const shirtColors = PED_SHIRT_COLORS.map(c => new THREE.Color(c));
const skinColors = PED_SKIN_COLORS.map(c => new THREE.Color(c));

export interface PedestrianMeshesHandle {
  sync(system: PedestrianSystem): void;
}

interface Props {
  castShadow?: boolean;
}

const PedestrianMeshes = forwardRef<PedestrianMeshesHandle, Props>(
  ({ castShadow = true }, ref) => {
    const bodyRef = useRef<THREE.InstancedMesh>(null);
    const headRef = useRef<THREE.InstancedMesh>(null);
    const legRef = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
      for (const r of [bodyRef, headRef, legRef]) {
        const m = r.current;
        if (!m) continue;
        // The crowd moves every frame, so the baked bounding sphere is always
        // stale; culling against it makes people vanish.
        m.frustumCulled = false;
      }
      // instanceColor is null until the first setColorAt.
      for (const r of [bodyRef, headRef]) {
        const m = r.current;
        if (!m) continue;
        for (let i = 0; i < CAPACITY; i++) m.setColorAt(i, pmColor.setRGB(1, 1, 1));
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }, []);

    useImperativeHandle(ref, () => ({
      sync(system) {
        const body = bodyRef.current;
        const head = headRef.current;
        const leg = legRef.current;
        if (!body || !head || !leg) return;

        const peds = system.peds;
        let n = 0;

        for (let i = 0; i < peds.length && n < CAPACITY; i++) {
          const p = peds[i];
          if (!p.active) continue;

          const pose = pedPose(p);
          composePedRoot(toX3D(p.x), toZ3D(p.y), p.angle, pose, pmRoot);

          pmLocal.makeTranslation(0, PED.bodyOffsetY + pose.bob, 0);
          pmPart.multiplyMatrices(pmRoot, pmLocal);
          body.setMatrixAt(n, pmPart);
          body.setColorAt(n, shirtColors[p.colorIdx % shirtColors.length]);

          pmLocal.makeTranslation(0, PED.headOffsetY + pose.bob, 0);
          pmPart.multiplyMatrices(pmRoot, pmLocal);
          head.setMatrixAt(n, pmPart);
          head.setColorAt(n, skinColors[p.skinIdx % skinColors.length]);

          // Legs swing in antiphase, pivoting at the hip.
          composePedLeg(pmRoot, pose, 0, pmPart);
          leg.setMatrixAt(n * 2, pmPart);
          composePedLeg(pmRoot, pose, 1, pmPart);
          leg.setMatrixAt(n * 2 + 1, pmPart);

          n++;
        }

        body.count = n;
        head.count = n;
        leg.count = n * 2;
        body.instanceMatrix.needsUpdate = true;
        head.instanceMatrix.needsUpdate = true;
        leg.instanceMatrix.needsUpdate = true;
        if (body.instanceColor) body.instanceColor.needsUpdate = true;
        if (head.instanceColor) head.instanceColor.needsUpdate = true;
      },
    }));

    return (
      <>
        {/* No `vertexColors`: it would define USE_COLOR and multiply by a
            missing geometry `color` attribute, rendering everyone black.
            instanceColor is applied on its own via USE_INSTANCING_COLOR. */}
        <instancedMesh ref={bodyRef} args={[undefined, undefined, CAPACITY]} castShadow={castShadow}>
          <capsuleGeometry args={[PED.bodyRadius, PED.bodyLength, 4, 8]} />
          <meshStandardMaterial roughness={0.8} />
        </instancedMesh>

        <instancedMesh ref={headRef} args={[undefined, undefined, CAPACITY]} castShadow={castShadow}>
          <sphereGeometry args={[PED.headRadius, 8, 6]} />
          <meshStandardMaterial roughness={0.75} />
        </instancedMesh>

        <instancedMesh ref={legRef} args={[undefined, undefined, CAPACITY * 2]}>
          <boxGeometry args={[0.13, PED.legHalf * 2, 0.13]} />
          <meshStandardMaterial color="#2b3242" roughness={0.85} />
        </instancedMesh>
      </>
    );
  },
);
PedestrianMeshes.displayName = 'PedestrianMeshes';

export default PedestrianMeshes;
