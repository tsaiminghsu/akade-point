'use client';
import { useMemo } from 'react';
import * as THREE from 'three';

import {
  ARENA_CEILING,
  ARENA_X0,
  ARENA_X1,
  ARENA_Y0,
  ARENA_Y1,
  DRONE_PAD,
} from './droneArena';
import { TILE_3D, TILE_SIZE, toX3D, toZ3D } from './types';

/**
 * The drone arena's boundary, drawn as a faint glowing shell.
 *
 * Purely cosmetic, exactly like `BoundaryWalls`: the simulation enforces the
 * same box numerically in `updateDrone`, so nothing here carries a collider.
 * Keeping the two apart is what lets racing fly straight through the walls
 * without having to tear the geometry down.
 */

const PX_TO_3D = TILE_3D / TILE_SIZE;   // 0.1

/** Faint enough to see the city through, solid enough to read as a wall. */
const WALL_OPACITY = 0.1;
const EDGE_COLOR = '#00e5ff';

export default function DroneArenaMesh() {
  const box = useMemo(() => {
    const x0 = toX3D(ARENA_X0);
    const x1 = toX3D(ARENA_X1);
    const z0 = toZ3D(ARENA_Y0);
    const z1 = toZ3D(ARENA_Y1);
    return {
      x0, x1, z0, z1,
      cx: (x0 + x1) / 2,
      cz: (z0 + z1) / 2,
      width: x1 - x0,
      depth: z1 - z0,
      height: ARENA_CEILING * PX_TO_3D,
    };
  }, []);

  // Corner posts, plus a post every 8 tiles along each side, so the extent
  // reads at a glance from ground level.
  const posts = useMemo(() => {
    const step = 8 * TILE_3D;
    const out: [number, number][] = [];
    for (let x = box.x0; x <= box.x1 + 0.01; x += step) {
      out.push([x, box.z0], [x, box.z1]);
    }
    for (let z = box.z0 + step; z <= box.z1 - step + 0.01; z += step) {
      out.push([box.x0, z], [box.x1, z]);
    }
    return out;
  }, [box]);

  const wallMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: EDGE_COLOR,
    transparent: true,
    opacity: WALL_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  }), []);

  const padY = 0.06;

  return (
    <group>
      {/* Four walls. Planes rather than boxes: the drone should be able to see
          out of the field, and a solid shell would fog the whole city in. */}
      <mesh position={[box.cx, box.height / 2, box.z0]} material={wallMaterial}>
        <planeGeometry args={[box.width, box.height]} />
      </mesh>
      <mesh position={[box.cx, box.height / 2, box.z1]} material={wallMaterial}>
        <planeGeometry args={[box.width, box.height]} />
      </mesh>
      <mesh position={[box.x0, box.height / 2, box.cz]} rotation={[0, Math.PI / 2, 0]} material={wallMaterial}>
        <planeGeometry args={[box.depth, box.height]} />
      </mesh>
      <mesh position={[box.x1, box.height / 2, box.cz]} rotation={[0, Math.PI / 2, 0]} material={wallMaterial}>
        <planeGeometry args={[box.depth, box.height]} />
      </mesh>

      {/* Ceiling, so the lid is visible rather than an invisible surprise. */}
      <mesh position={[box.cx, box.height, box.cz]} rotation={[-Math.PI / 2, 0, 0]} material={wallMaterial}>
        <planeGeometry args={[box.width, box.depth]} />
      </mesh>

      {/* Bright rails along the top and bottom edges of each wall. */}
      {[0.15, box.height].map((y, i) => (
        <group key={i}>
          <mesh position={[box.cx, y, box.z0]}>
            <boxGeometry args={[box.width, 0.25, 0.25]} />
            <meshBasicMaterial color={EDGE_COLOR} toneMapped={false} />
          </mesh>
          <mesh position={[box.cx, y, box.z1]}>
            <boxGeometry args={[box.width, 0.25, 0.25]} />
            <meshBasicMaterial color={EDGE_COLOR} toneMapped={false} />
          </mesh>
          <mesh position={[box.x0, y, box.cz]}>
            <boxGeometry args={[0.25, 0.25, box.depth]} />
            <meshBasicMaterial color={EDGE_COLOR} toneMapped={false} />
          </mesh>
          <mesh position={[box.x1, y, box.cz]}>
            <boxGeometry args={[0.25, 0.25, box.depth]} />
            <meshBasicMaterial color={EDGE_COLOR} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Corner and interval posts. */}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, box.height / 2, z]}>
          <boxGeometry args={[0.5, box.height, 0.5]} />
          <meshStandardMaterial
            color="#123840"
            emissive={EDGE_COLOR}
            emissiveIntensity={0.35}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>
      ))}

      {/* Landing pad at the centre of the field. */}
      <mesh position={[toX3D(DRONE_PAD.x), padY, toZ3D(DRONE_PAD.y)]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[TILE_3D * 1.5, 32]} />
        <meshBasicMaterial color="#0d2a30" toneMapped={false} />
      </mesh>
      <mesh position={[toX3D(DRONE_PAD.x), padY + 0.01, toZ3D(DRONE_PAD.y)]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TILE_3D * 1.1, TILE_3D * 1.3, 32]} />
        <meshBasicMaterial color={EDGE_COLOR} toneMapped={false} />
      </mesh>
    </group>
  );
}
