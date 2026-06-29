'use client';
import { useRef, forwardRef, useImperativeHandle, useState } from 'react';
import * as THREE from 'three';
import { VehicleType } from './types';

// ─── Player Car ────────────────────────────────────────────────────────────────
// Exposed handle: position (THREE.Vector3) and angle (number)

export interface PlayerCarHandle {
  group: THREE.Group | null;
}

interface PlayerCarProps {
  color?: string;
  vehicleType?: VehicleType;
  isOnFoot?: boolean;
}

export const PlayerCar = forwardRef<PlayerCarHandle, PlayerCarProps>(
  ({ color = '#00bcd4', vehicleType = VehicleType.CAR, isOnFoot = false }, ref) => {
    const groupRef = useRef<THREE.Group>(null);

    useImperativeHandle(ref, () => ({
      get group() { return groupRef.current; },
    }));

    // ── On-foot futuristic robot character ───────────────────────────
    if (isOnFoot) {
      return (
        <group ref={groupRef}>
          {/* Left leg (mechanical block/joint) */}
          <mesh position={[-0.14, 0.45, 0]} castShadow>
            <boxGeometry args={[0.16, 0.75, 0.16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[-0.14, 0.85, 0]} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Right leg */}
          <mesh position={[0.14, 0.45, 0]} castShadow>
            <boxGeometry args={[0.16, 0.75, 0.16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0.14, 0.85, 0]} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Torso (armored metallic frame) */}
          <mesh position={[0, 1.25, 0]} castShadow>
            <boxGeometry args={[0.42, 0.7, 0.28]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.15} />
          </mesh>
          {/* Glowing Energy Core in Chest */}
          <mesh position={[0, 1.35, 0.15]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={3} />
          </mesh>

          {/* Left Arm (segmented cylinder/joints) */}
          <mesh position={[-0.32, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>
          <mesh position={[-0.32, 1.05, 0]} rotation={[0, 0, 0.1]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
          </mesh>

          {/* Right Arm */}
          <mesh position={[0.32, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>
          <mesh position={[0.32, 1.05, 0]} rotation={[0, 0, -0.1]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
          </mesh>

          {/* Neck */}
          <mesh position={[0, 1.63, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.12, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.7} />
          </mesh>

          {/* Robot Head (sleek futuristic helmet block) */}
          <mesh position={[0, 1.78, 0]} castShadow>
            <boxGeometry args={[0.26, 0.22, 0.26]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
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
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, bodyH + cabinH / 2 + axleH - 0.05, bodyL * 0.06]} castShadow>
        <boxGeometry args={[cabinW, cabinH, cabinL]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.6} />
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
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Tail boom */}
      <mesh position={[0, 0, 1.6]} castShadow>
        <boxGeometry args={[0.18, 0.18, 1.4]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Main rotor */}
      <mesh position={[0, 0.75, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[4.5, 0.06, 0.2]} />
        <meshStandardMaterial color="#333" roughness={0.8} />
      </mesh>
      {/* Skids */}
      <mesh position={[-0.6, -0.7, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 2.5]} />
        <meshStandardMaterial color="#555" metalness={0.7} />
      </mesh>
      <mesh position={[0.6, -0.7, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 2.5]} />
        <meshStandardMaterial color="#555" metalness={0.7} />
      </mesh>
    </group>
  );
}

// ─── NPC Cars ──────────────────────────────────────────────────────────────────

export interface NPCCarsHandle {
  update(positions: Array<{ x: number; z: number; angle: number; color: string; type: VehicleType }>): void;
}

export const NPCCars = forwardRef<NPCCarsHandle>((_, ref) => {
  const [carList, setCarList] = useState<Array<{ id: string; x: number; z: number; angle: number; color: string; type: VehicleType }>>([]);

  useImperativeHandle(ref, () => ({
    update(cars) {
      setCarList(cars.map((c, i) => ({ id: `npc_${i}`, ...c })));
    },
  }));

  return (
    <group>
      {carList.map(car => (
        <group key={car.id} position={[car.x, 0, car.z]} rotation={[0, car.angle, 0]}>
          <CarMesh color={car.color} vehicleType={car.type} />
        </group>
      ))}
    </group>
  );
});
NPCCars.displayName = 'NPCCars';
