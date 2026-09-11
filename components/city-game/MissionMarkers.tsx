'use client';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { toX3D, toZ3D } from './types';
import type { MissionManager } from './missionManager';

/**
 * Glowing pillars marking where a job can be picked up, plus a beam over the
 * current objective.
 *
 * A fixed pool of groups is positioned imperatively from the frame loop, so
 * adding or cooling down a marker never triggers React work.
 */

const MARKER_SLOTS = 6;
const PULSE_SPEED = 2.2;

export interface MissionMarkersHandle {
  sync(missions: MissionManager, nowSec: number): void;
}

interface Slot {
  group: THREE.Group | null;
  disc: THREE.Mesh | null;
  beam: THREE.Mesh | null;
}

const MissionMarkers = forwardRef<MissionMarkersHandle>((_, ref) => {
  const slots = useRef<Slot[]>(
    Array.from({ length: MARKER_SLOTS }, () => ({ group: null, disc: null, beam: null })),
  );

  useImperativeHandle(ref, () => ({
    sync(missions, nowSec) {
      const data = missions.getMarkerRenderData();
      const pulse = 0.6 + 0.4 * Math.sin(nowSec * PULSE_SPEED);

      for (let i = 0; i < MARKER_SLOTS; i++) {
        const slot = slots.current[i];
        if (!slot.group) continue;

        const marker = data[i];
        if (!marker) {
          slot.group.visible = false;
          continue;
        }

        slot.group.visible = true;
        slot.group.position.set(toX3D(marker.x), 0, toZ3D(marker.y));

        // Cooling-down markers go grey and stop pulsing.
        const intensity = marker.available ? 1.2 + pulse * 1.4 : 0.25;
        const discMat = slot.disc?.material as THREE.MeshStandardMaterial | undefined;
        const beamMat = slot.beam?.material as THREE.MeshStandardMaterial | undefined;
        if (discMat) {
          discMat.color.set(marker.color);
          discMat.emissive.set(marker.color);
          discMat.emissiveIntensity = intensity;
          discMat.opacity = marker.available ? 0.85 : 0.35;
        }
        if (beamMat) {
          beamMat.color.set(marker.color);
          beamMat.emissive.set(marker.color);
          beamMat.emissiveIntensity = intensity * 0.8;
          beamMat.opacity = marker.available ? 0.32 : 0.1;
        }
        if (slot.disc) slot.disc.rotation.y = nowSec * 0.6;
      }
    },
  }));

  return (
    <>
      {Array.from({ length: MARKER_SLOTS }, (_, i) => (
        <group
          key={i}
          visible={false}
          ref={(el) => { slots.current[i].group = el; }}
        >
          <mesh
            position={[0, 0.12, 0]}
            ref={(el) => { slots.current[i].disc = el; }}
          >
            <cylinderGeometry args={[1.7, 1.7, 0.22, 16]} />
            <meshStandardMaterial transparent opacity={0.85} emissiveIntensity={2} />
          </mesh>
          <mesh
            position={[0, 6, 0]}
            ref={(el) => { slots.current[i].beam = el; }}
          >
            <cylinderGeometry args={[0.16, 0.16, 12, 8]} />
            <meshStandardMaterial transparent opacity={0.3} emissiveIntensity={1.6} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
});
MissionMarkers.displayName = 'MissionMarkers';

export default MissionMarkers;
