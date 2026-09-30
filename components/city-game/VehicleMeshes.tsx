'use client';
import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { VehicleType, Vehicle, toX3D, toZ3D } from './types';
import {
  L_BODY, L_CABIN, L_GLASS, L_HEAD, L_TAIL, L_WHEELS, L_TAXI_SIGN, L_LIGHTBAR,
  composeVehicleRoot,
} from './renderLayout';
import { ArmyTruckMesh, SwatVanMesh, TankMesh } from './LawVehicleMeshes';

// ─── Player Car ────────────────────────────────────────────────────────────────
// Exposed handle: position (THREE.Vector3) and angle (number)

export interface PlayerCarHandle {
  group: THREE.Group | null;
  /** The turret, when the player is driving a tank. */
  turret: THREE.Group | null;
}

interface PlayerCarProps {
  color?: string;
  vehicleType?: VehicleType;
  isOnFoot?: boolean;
}

export const PlayerCar = forwardRef<PlayerCarHandle, PlayerCarProps>(
  ({ color = '#00bcd4', vehicleType = VehicleType.CAR, isOnFoot = false }, ref) => {
    const groupRef = useRef<THREE.Group>(null);
    const turretRef = useRef<THREE.Group>(null);

    useImperativeHandle(ref, () => ({
      get group() { return groupRef.current; },
      get turret() { return turretRef.current; },
    }));

    // ── On-foot futuristic robot character ───────────────────────────
    if (isOnFoot) {
      return (
        <group ref={groupRef}>
          {/* Left leg (mechanical block/joint) */}
          <mesh position={[-0.14, 0.45, 0]} castShadow>
            <boxGeometry args={[0.16, 0.75, 0.16]} />
            <meshStandardMaterial color="#2a3a50" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[-0.14, 0.85, 0]} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#4a5a70" metalness={0.3} roughness={0.5} />
          </mesh>

          {/* Right leg */}
          <mesh position={[0.14, 0.45, 0]} castShadow>
            <boxGeometry args={[0.16, 0.75, 0.16]} />
            <meshStandardMaterial color="#2a3a50" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0.14, 0.85, 0]} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#4a5a70" metalness={0.3} roughness={0.5} />
          </mesh>

          {/* Torso (armored metallic frame) */}
          <mesh position={[0, 1.25, 0]} castShadow>
            <boxGeometry args={[0.42, 0.7, 0.28]} />
            <meshStandardMaterial color="#2e4060" metalness={0.3} roughness={0.4} />
          </mesh>
          {/* Glowing Energy Core in Chest */}
          <mesh position={[0, 1.35, 0.15]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={3} />
          </mesh>

          {/* Left Arm (segmented cylinder/joints) */}
          <mesh position={[-0.32, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#4a5a70" metalness={0.3} />
          </mesh>
          <mesh position={[-0.32, 1.05, 0]} rotation={[0, 0, 0.1]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color="#2a3a50" metalness={0.3} roughness={0.5} />
          </mesh>

          {/* Right Arm */}
          <mesh position={[0.32, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#4a5a70" metalness={0.3} />
          </mesh>
          <mesh position={[0.32, 1.05, 0]} rotation={[0, 0, -0.1]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color="#2a3a50" metalness={0.3} roughness={0.5} />
          </mesh>

          {/* Neck */}
          <mesh position={[0, 1.63, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.12, 8]} />
            <meshStandardMaterial color="#607080" metalness={0.3} />
          </mesh>

          {/* Robot Head (sleek futuristic helmet block) */}
          <mesh position={[0, 1.78, 0]} castShadow>
            <boxGeometry args={[0.26, 0.22, 0.26]} />
            <meshStandardMaterial color="#2e4060" metalness={0.3} roughness={0.4} />
          </mesh>
          {/* Glowing horizontal visor (Daft Punk style) */}
          <mesh position={[0, 1.80, 0.12]}>
            <boxGeometry args={[0.2, 0.05, 0.04]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={3} />
          </mesh>

          {/* Player indicator arrow */}
          <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.18, 0.38, 5]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.2} transparent opacity={0.9} />
          </mesh>
        </group>
      );
    }

    // ── Vehicle meshes below ─────────────────────────────────────────
    if (vehicleType === VehicleType.HELICOPTER) {
      return <HelicopterMesh groupRef={groupRef} color={color} />;
    }

    const arrow = (
      <mesh position={[0, 3.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.25, 0.5, 5]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.0} transparent opacity={0.85} />
      </mesh>
    );
    if (vehicleType === VehicleType.TANK) {
      return <group ref={groupRef}><TankMesh color={color} turretRef={turretRef} />{arrow}</group>;
    }
    if (vehicleType === VehicleType.SWAT) {
      return <group ref={groupRef}><SwatVanMesh color={color} />{arrow}</group>;
    }
    if (vehicleType === VehicleType.ARMY_TRUCK) {
      return <group ref={groupRef}><ArmyTruckMesh color={color} />{arrow}</group>;
    }

    return (
      <group ref={groupRef}>
        <CarMesh color={color} vehicleType={vehicleType} />
        {/* Player indicator arrow above car */}
        <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.25, 0.5, 5]} />
          <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.0} transparent opacity={0.85} />
        </mesh>
      </group>
    );
  }
);
PlayerCar.displayName = 'PlayerCar';


// ─── Reusable Car Mesh Component ──────────────────────────────────────────────────

export function CarMesh({ color, vehicleType }: { color: string; vehicleType: VehicleType }) {
  const isScooter = vehicleType === VehicleType.DELIVERY_SCOOTER;
  const bodyW  = isScooter ? 0.55 : 1.55;
  const bodyL  = isScooter ? 1.8  : 3.2;
  const bodyH  = isScooter ? 0.7  : 0.58;
  const cabinW = isScooter ? 0.5  : 1.35;
  const cabinL = isScooter ? 1.0  : 1.7;
  const cabinH = isScooter ? 0.5  : 0.52;
  const wheelR = isScooter ? 0.22 : 0.32;
  const axleH  = isScooter ? 0.22 : 0.33;
  const wheelW = isScooter ? 0.12 : 0.22;

  const wheels = isScooter
    ? [[-0.0, axleH, bodyL * 0.38], [-0.0, axleH, -bodyL * 0.38]]
    : [
        [-bodyW / 2 - 0.04, axleH, bodyL * 0.33],
        [ bodyW / 2 + 0.04, axleH, bodyL * 0.33],
        [-bodyW / 2 - 0.04, axleH, -bodyL * 0.33],
        [ bodyW / 2 + 0.04, axleH, -bodyL * 0.33],
      ];

  return (
    <group>
      {/* Car body */}
      <mesh position={[0, bodyH / 2 + axleH - 0.05, 0]} castShadow>
        <boxGeometry args={[bodyW, bodyH, bodyL]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, bodyH + cabinH / 2 + axleH - 0.05, bodyL * 0.06]} castShadow>
        <boxGeometry args={[cabinW, cabinH, cabinL]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Windshield (front) */}
      <mesh position={[0, bodyH + cabinH * 0.5 + axleH - 0.05, bodyL * 0.06 - cabinL / 2 - 0.01]} castShadow={false}>
        <boxGeometry args={[cabinW - 0.1, cabinH - 0.08, 0.04]} />
        <meshStandardMaterial color="#88ccff" transparent opacity={0.55} roughness={0.1} metalness={0.1} />
      </mesh>

      {/* Rear window */}
      <mesh position={[0, bodyH + cabinH * 0.5 + axleH - 0.05, bodyL * 0.06 + cabinL / 2 + 0.01]}>
        <boxGeometry args={[cabinW - 0.12, cabinH - 0.1, 0.04]} />
        <meshStandardMaterial color="#88ccff" transparent opacity={0.4} roughness={0.1} metalness={0.1} />
      </mesh>

      {/* Headlights */}
      <mesh position={[bodyW * 0.3, axleH + bodyH * 0.3, -bodyL / 2 - 0.01]}>
        <boxGeometry args={[0.3, 0.15, 0.04]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffff88" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[-bodyW * 0.3, axleH + bodyH * 0.3, -bodyL / 2 - 0.01]}>
        <boxGeometry args={[0.3, 0.15, 0.04]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffff88" emissiveIntensity={1.5} />
      </mesh>

      {/* Taillights */}
      <mesh position={[bodyW * 0.3, axleH + bodyH * 0.3, bodyL / 2 + 0.01]}>
        <boxGeometry args={[0.28, 0.12, 0.04]} />
        <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[-bodyW * 0.3, axleH + bodyH * 0.3, bodyL / 2 + 0.01]}>
        <boxGeometry args={[0.28, 0.12, 0.04]} />
        <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={1.2} />
      </mesh>

      {/* Taxi sign */}
      {vehicleType === VehicleType.TAXI && (
        <mesh position={[0, bodyH + cabinH + axleH + 0.06, bodyL * 0.06]}>
          <boxGeometry args={[0.5, 0.15, 0.9]} />
          <meshStandardMaterial color="#ffee00" emissive="#ffcc00" emissiveIntensity={0.8} />
        </mesh>
      )}

      {/* Delivery box */}
      {isScooter && (
        <mesh position={[0, bodyH + cabinH + axleH + 0.1, 0]} castShadow>
          <boxGeometry args={[0.55, 0.4, 0.55]} />
          <meshStandardMaterial color="#8d6e63" roughness={0.9} />
        </mesh>
      )}

      {/* Wheels */}
      {wheels.map(([wx, wy, wz], i) => (
        <mesh key={i} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wheelR, wheelR, wheelW, 14]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}


// ─── Helicopter Mesh ──────────────────────────────────────────────────────────

export function HelicopterMesh({ groupRef, color }: { groupRef: React.Ref<THREE.Group>; color: string }) {
  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.6, 2.2, 8, 12]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Tail boom */}
      <mesh position={[0, 0, 1.6]} castShadow>
        <boxGeometry args={[0.18, 0.18, 1.4]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Main rotor */}
      <mesh position={[0, 0.75, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[4.5, 0.06, 0.2]} />
        <meshStandardMaterial color="#333" roughness={0.8} />
      </mesh>
      {/* Skids */}
      <mesh position={[-0.6, -0.7, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 2.5]} />
        <meshStandardMaterial color="#555" metalness={0.15} />
      </mesh>
      <mesh position={[0.6, -0.7, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 2.5]} />
        <meshStandardMaterial color="#555" metalness={0.15} />
      </mesh>
    </group>
  );
}

// ─── Instanced NPC car fleet ──────────────────────────────────────────────────
//
// The previous implementation rebuilt ~22 React <group> subtrees from useFrame
// every single frame (~240 draw calls). This replaces it with 8 InstancedMeshes
// written imperatively, which keeps the cost flat as police cars and parked
// cars are added later.

// 40 traffic + 5 police + 24 parked + 6 wrecks + service/job vehicles.
const FLEET_CAPACITY = 96;

// Scratch objects — never allocate inside sync().
const fmMat = new THREE.Matrix4();
const fmPart = new THREE.Matrix4();
const fmColor = new THREE.Color();
const fmWreck = new THREE.Color('#141414');

export interface CarFleetHandle {
  /** Write every visible ground vehicle into the instance buffers. */
  sync(vehicles: Map<string, Vehicle>, excludeId: string | null, nowSec: number): void;
}

export const InstancedCarFleet = forwardRef<CarFleetHandle>((_, ref) => {
  const bodyRef  = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const headRef  = useRef<THREE.InstancedMesh>(null);
  const tailRef  = useRef<THREE.InstancedMesh>(null);
  const signRef  = useRef<THREE.InstancedMesh>(null);
  const barRef   = useRef<THREE.InstancedMesh>(null);

  // Moving instance clouds must not be frustum-culled against their (stale)
  // bounding sphere, and instanceColor only exists after the first setColorAt.
  useEffect(() => {
    const all = [bodyRef, cabinRef, wheelRef, glassRef, headRef, tailRef, signRef, barRef];
    for (const r of all) {
      const m = r.current;
      if (!m) continue;
      m.frustumCulled = false;
    }
    for (const r of [bodyRef, cabinRef, barRef]) {
      const m = r.current;
      if (!m) continue;
      for (let i = 0; i < m.count; i++) m.setColorAt(i, fmColor.setRGB(1, 1, 1));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    sync(vehicles, excludeId, nowSec) {
      const body = bodyRef.current, cabin = cabinRef.current, wheel = wheelRef.current;
      const glass = glassRef.current, head = headRef.current, tail = tailRef.current;
      const sign = signRef.current, bar = barRef.current;
      if (!body || !cabin || !wheel || !glass || !head || !tail || !sign || !bar) return;

      let n = 0;      // cars
      let nSign = 0;
      let nBar = 0;
      // Police light bars alternate red/blue at 8 Hz.
      const barBlue = Math.floor(nowSec * 8) % 2 === 0;

      vehicles.forEach(v => {
        if (n >= FLEET_CAPACITY) return;
        if (v.id === excludeId) return;
        if (v.type === VehicleType.RC_DRONE) return;
        if (v.type === VehicleType.HELICOPTER) return;
        if (v.type === VehicleType.DELIVERY_SCOOTER) return;   // handled by the pool below
        // SWAT, army and helicopters have their own models (LawFleet).
        if (v.type === VehicleType.SWAT || v.type === VehicleType.ARMY_TRUCK
          || v.type === VehicleType.TANK || v.type === VehicleType.POLICE_HELI) return;

        const wrecked = v.hp <= 0;
        composeVehicleRoot(toX3D(v.x), toZ3D(v.y), v.angle, wrecked, fmMat);

        fmPart.multiplyMatrices(fmMat, L_BODY);
        body.setMatrixAt(n, fmPart);
        fmPart.multiplyMatrices(fmMat, L_CABIN);
        cabin.setMatrixAt(n, fmPart);

        // Darken towards charcoal as durability drops.
        if (wrecked) {
          fmColor.copy(fmWreck);
        } else {
          fmColor.set(v.color).lerp(fmWreck, 1 - Math.max(0, Math.min(1, v.hp / 100)));
        }
        body.setColorAt(n, fmColor);
        cabin.setColorAt(n, fmColor);

        for (let k = 0; k < 4; k++) {
          fmPart.multiplyMatrices(fmMat, L_WHEELS[k]);
          wheel.setMatrixAt(n * 4 + k, fmPart);
        }
        for (let k = 0; k < 2; k++) {
          fmPart.multiplyMatrices(fmMat, L_GLASS[k]);
          glass.setMatrixAt(n * 2 + k, fmPart);
          fmPart.multiplyMatrices(fmMat, L_HEAD[k]);
          head.setMatrixAt(n * 2 + k, fmPart);
          fmPart.multiplyMatrices(fmMat, L_TAIL[k]);
          tail.setMatrixAt(n * 2 + k, fmPart);
        }

        if (v.type === VehicleType.TAXI && nSign < FLEET_CAPACITY) {
          fmPart.multiplyMatrices(fmMat, L_TAXI_SIGN);
          sign.setMatrixAt(nSign++, fmPart);
        }
        if (v.type === VehicleType.POLICE && nBar < FLEET_CAPACITY) {
          fmPart.multiplyMatrices(fmMat, L_LIGHTBAR);
          bar.setMatrixAt(nBar, fmPart);
          bar.setColorAt(nBar, fmColor.set(barBlue ? '#2b6cff' : '#ff2b2b'));
          nBar++;
        }

        n++;
      });

      body.count = n;
      cabin.count = n;
      wheel.count = n * 4;
      glass.count = n * 2;
      head.count = n * 2;
      tail.count = n * 2;
      sign.count = nSign;
      bar.count = nBar;

      body.instanceMatrix.needsUpdate = true;
      cabin.instanceMatrix.needsUpdate = true;
      wheel.instanceMatrix.needsUpdate = true;
      glass.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      tail.instanceMatrix.needsUpdate = true;
      sign.instanceMatrix.needsUpdate = true;
      bar.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      if (cabin.instanceColor) cabin.instanceColor.needsUpdate = true;
      if (bar.instanceColor) bar.instanceColor.needsUpdate = true;
    },
  }));

  return (
    <>
        {/* No `vertexColors` here: it defines USE_COLOR, which multiplies by a
            per-vertex `color` attribute the geometry does not have (built-in
            materials have no defaultAttributeValues, so it reads as black).
            USE_INSTANCING_COLOR alone applies instanceColor correctly. */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, FLEET_CAPACITY]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.2} />
      </instancedMesh>

      <instancedMesh ref={cabinRef} args={[undefined, undefined, FLEET_CAPACITY]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.2} />
      </instancedMesh>

      <instancedMesh ref={wheelRef} args={[undefined, undefined, FLEET_CAPACITY * 4]}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </instancedMesh>

      <instancedMesh ref={glassRef} args={[undefined, undefined, FLEET_CAPACITY * 2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#88ccff" transparent opacity={0.5} roughness={0.1} metalness={0.1} />
      </instancedMesh>

      <instancedMesh ref={headRef} args={[undefined, undefined, FLEET_CAPACITY * 2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffcc" emissive="#ffff88" emissiveIntensity={1.5} />
      </instancedMesh>

      <instancedMesh ref={tailRef} args={[undefined, undefined, FLEET_CAPACITY * 2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={1.2} />
      </instancedMesh>

      <instancedMesh ref={signRef} args={[undefined, undefined, FLEET_CAPACITY]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffee00" emissive="#ffcc00" emissiveIntensity={0.8} />
      </instancedMesh>

      <instancedMesh ref={barRef} args={[undefined, undefined, FLEET_CAPACITY]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
});
InstancedCarFleet.displayName = 'InstancedCarFleet';

// ─── Delivery scooter pool ────────────────────────────────────────────────────
// At most a couple exist at once (service vehicles), so a tiny ref pool of real
// meshes is simpler than a second set of instance tables.

const SCOOTER_SLOTS = 3;

export interface ScooterPoolHandle {
  sync(vehicles: Map<string, Vehicle>, excludeId: string | null): void;
}

export const ScooterPool = forwardRef<ScooterPoolHandle>((_, ref) => {
  const slots = useRef<Array<THREE.Group | null>>(Array(SCOOTER_SLOTS).fill(null));

  useImperativeHandle(ref, () => ({
    sync(vehicles, excludeId) {
      let n = 0;
      vehicles.forEach(v => {
        if (v.type !== VehicleType.DELIVERY_SCOOTER) return;
        if (v.id === excludeId) return;
        if (n >= SCOOTER_SLOTS) return;
        const g = slots.current[n];
        if (g) {
          g.visible = true;
          g.position.set(toX3D(v.x), 0, toZ3D(v.y));
          g.rotation.y = -v.angle;
        }
        n++;
      });
      for (let i = n; i < SCOOTER_SLOTS; i++) {
        const g = slots.current[i];
        if (g) g.visible = false;
      }
    },
  }));

  return (
    <>
      {Array.from({ length: SCOOTER_SLOTS }, (_, i) => (
        <group key={i} ref={(el) => { slots.current[i] = el; }} visible={false}>
          <CarMesh color="#e67e22" vehicleType={VehicleType.DELIVERY_SCOOTER} />
        </group>
      ))}
    </>
  );
});
ScooterPool.displayName = 'ScooterPool';
