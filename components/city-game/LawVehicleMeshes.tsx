'use client';
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Vehicle, VehicleType, TILE_3D, TILE_SIZE, toX3D, toZ3D } from './types';
import { WRECK_PITCH, WRECK_ROLL } from './renderLayout';
import type { HeliUnit } from './policeHeli';
import { SPOT_RADIUS } from './policeHeli';

/**
 * Police, SWAT and army vehicles.
 *
 * There are only ever a handful of each on screen, so they are small pools of
 * real meshes (like the scooter pool) rather than more instance tables. Each
 * slot owns its body material so a wreck can go dark on its own.
 *
 * Local space matches the car fleet: +y up, the nose points down -z, and the
 * root is rotated by `-angle`.
 */

const PX_TO_3D = TILE_3D / TILE_SIZE;
const WRECK_COLOR = new THREE.Color('#161616');

// ─── Shared parts ─────────────────────────────────────────────────────────────

function Wheel({ x, z, r = 0.36, w = 0.26 }: { x: number; z: number; r?: number; w?: number }) {
  return (
    <mesh position={[x, r, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[r, r, w, 12]} />
      <meshStandardMaterial color="#141414" roughness={0.9} />
    </mesh>
  );
}

interface BodyProps {
  /** Receives the slot's body material so the pool can darken wrecks. */
  bodyMat?: (m: THREE.MeshStandardMaterial | null) => void;
  color: string;
}

// ─── SWAT van ─────────────────────────────────────────────────────────────────

export function SwatVanMesh({ color, bodyMat, barMat }: BodyProps & { barMat?: THREE.Material }) {
  return (
    <group>
      <mesh position={[0, 1.05, 0.15]} castShadow>
        <boxGeometry args={[1.85, 1.35, 3.3]} />
        <meshStandardMaterial ref={bodyMat} color={color} roughness={0.55} metalness={0.35} />
      </mesh>
      {/* Sloped nose */}
      <mesh position={[0, 0.72, -1.72]} castShadow>
        <boxGeometry args={[1.8, 0.7, 0.6]} />
        <meshStandardMaterial color="#111827" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Windscreen slit and side stripe */}
      <mesh position={[0, 1.4, -1.46]}>
        <boxGeometry args={[1.5, 0.32, 0.04]} />
        <meshStandardMaterial color="#1e293b" roughness={0.1} metalness={0.6} />
      </mesh>
      {[-0.94, 0.94].map(x => (
        <mesh key={x} position={[x, 1.0, 0.15]}>
          <boxGeometry args={[0.03, 0.22, 3.0]} />
          <meshStandardMaterial color="#e5e7eb" emissive="#9ca3af" emissiveIntensity={0.2} />
        </mesh>
      ))}
      {/* Light bar */}
      <mesh position={[0, 1.8, -0.9]} material={barMat}>
        <boxGeometry args={[1.2, 0.14, 0.3]} />
      </mesh>
      {/* Push bar */}
      <mesh position={[0, 0.55, -2.05]}>
        <boxGeometry args={[1.6, 0.25, 0.12]} />
        <meshStandardMaterial color="#0b0b0b" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Headlights */}
      {[-0.6, 0.6].map(x => (
        <mesh key={x} position={[x, 0.78, -2.03]}>
          <boxGeometry args={[0.3, 0.14, 0.04]} />
          <meshStandardMaterial color="#ffffcc" emissive="#ffff88" emissiveIntensity={1.4} />
        </mesh>
      ))}
      {[[-0.8, -1.1], [0.8, -1.1], [-0.8, 1.2], [0.8, 1.2]].map(([x, z]) => (
        <Wheel key={`${x}${z}`} x={x} z={z} />
      ))}
    </group>
  );
}

// ─── Army truck ───────────────────────────────────────────────────────────────

export function ArmyTruckMesh({ color, bodyMat }: BodyProps) {
  return (
    <group>
      {/* Cab */}
      <mesh position={[0, 1.05, -1.25]} castShadow>
        <boxGeometry args={[1.85, 1.2, 1.2]} />
        <meshStandardMaterial ref={bodyMat} color={color} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.25, -1.86]}>
        <boxGeometry args={[1.5, 0.4, 0.04]} />
        <meshStandardMaterial color="#1f2a1a" roughness={0.1} metalness={0.5} />
      </mesh>
      {/* Chassis */}
      <mesh position={[0, 0.55, 0.3]} castShadow>
        <boxGeometry args={[1.8, 0.3, 3.8]} />
        <meshStandardMaterial color="#2b2f22" roughness={0.9} />
      </mesh>
      {/* Canvas-covered bed */}
      <mesh position={[0, 1.3, 0.85]} castShadow>
        <boxGeometry args={[1.85, 1.2, 2.3]} />
        <meshStandardMaterial color="#5d6b3c" roughness={1} />
      </mesh>
      <mesh position={[0, 1.9, 0.85]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.92, 0.92, 2.3, 12, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#5d6b3c" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* White star */}
      <mesh position={[0.93, 1.45, 0.85]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.28, 5]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      {[-0.55, 0.55].map(x => (
        <mesh key={x} position={[x, 0.95, -1.87]}>
          <boxGeometry args={[0.24, 0.14, 0.04]} />
          <meshStandardMaterial color="#ffffcc" emissive="#ffff88" emissiveIntensity={1.2} />
        </mesh>
      ))}
      {[[-0.85, -1.25], [0.85, -1.25], [-0.85, 0.6], [0.85, 0.6], [-0.85, 1.55], [0.85, 1.55]].map(([x, z]) => (
        <Wheel key={`${x}${z}`} x={x} z={z} r={0.4} w={0.3} />
      ))}
    </group>
  );
}

// ─── Tank ─────────────────────────────────────────────────────────────────────

export function TankMesh({
  color,
  bodyMat,
  turretRef,
}: BodyProps & { turretRef?: React.Ref<THREE.Group> }) {
  return (
    <group>
      {/* Tracks */}
      {[-1.1, 1.1].map(x => (
        <group key={x}>
          <mesh position={[x, 0.42, 0]} castShadow>
            <boxGeometry args={[0.55, 0.84, 3.9]} />
            <meshStandardMaterial color="#1f2317" roughness={0.95} />
          </mesh>
          {[-1.2, 0, 1.2].map(z => (
            <mesh key={z} position={[x * 1.02, 0.42, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.58, 10]} />
              <meshStandardMaterial color="#3a3f2c" roughness={0.8} metalness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Hull */}
      <mesh position={[0, 0.95, 0.05]} castShadow>
        <boxGeometry args={[1.75, 0.62, 3.6]} />
        <meshStandardMaterial ref={bodyMat} color={color} roughness={0.75} metalness={0.25} />
      </mesh>
      {/* Glacis plate */}
      <mesh position={[0, 0.9, -1.85]} rotation={[0.6, 0, 0]} castShadow>
        <boxGeometry args={[1.75, 0.5, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.75} metalness={0.25} />
      </mesh>
      {/* Turret: rotates independently about y */}
      <group ref={turretRef} position={[0, 1.26, 0.2]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[1.45, 0.58, 1.75]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.66, 0.35]} castShadow>
          <cylinderGeometry args={[0.28, 0.32, 0.18, 10]} />
          <meshStandardMaterial color="#3a4428" roughness={0.7} />
        </mesh>
        {/* Barrel, pointing forward (-z) */}
        <mesh position={[0, 0.34, -1.95]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.13, 2.5, 10]} />
          <meshStandardMaterial color="#2c3320" roughness={0.6} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.34, -3.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.22, 10]} />
          <meshStandardMaterial color="#1b1f14" roughness={0.6} metalness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

// ─── Police helicopter ────────────────────────────────────────────────────────

export function PoliceHeliMesh({ rotorRef }: { rotorRef?: React.Ref<THREE.Group> }) {
  return (
    <group scale={1.5}>
      <mesh castShadow>
        <capsuleGeometry args={[0.6, 2.0, 8, 12]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* White belly band */}
      <mesh position={[0, -0.18, 0]}>
        <capsuleGeometry args={[0.61, 1.6, 6, 12]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, 0.15, -0.95]}>
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.6} roughness={0.1} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.1, 1.7]}>
        <boxGeometry args={[0.16, 0.16, 1.6]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.4} />
      </mesh>
      <mesh position={[0.1, 0.35, 2.45]}>
        <boxGeometry args={[0.04, 0.5, 0.35]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.4} />
      </mesh>
      {/* Main rotor */}
      <group ref={rotorRef} position={[0, 0.78, 0]}>
        <mesh>
          <boxGeometry args={[4.6, 0.05, 0.18]} />
          <meshStandardMaterial color="#222" roughness={0.8} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[4.6, 0.05, 0.18]} />
          <meshStandardMaterial color="#222" roughness={0.8} />
        </mesh>
      </group>
      {/* Skids */}
      {[-0.55, 0.55].map(x => (
        <mesh key={x} position={[x, -0.72, 0]}>
          <boxGeometry args={[0.06, 0.06, 2.3]} />
          <meshStandardMaterial color="#555" metalness={0.2} />
        </mesh>
      ))}
      {/* Searchlight housing */}
      <mesh position={[0, -0.55, -0.8]}>
        <sphereGeometry args={[0.16, 8, 6]} />
        <meshStandardMaterial color="#fff7cc" emissive="#fff3a0" emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

// ─── Pool ─────────────────────────────────────────────────────────────────────

// Sized to the most the game can field at once: 3 SWAT (5★), 2 army + 2 guard
// trucks, 2 army + 2 guard tanks + the apron tank, 2 helicopters. Every slot is
// a live scene-graph subtree, so spares cost matrix updates every frame.
const SLOTS: Record<'swat' | 'truck' | 'tank', number> = { swat: 3, truck: 4, tank: 5 };
const HELI_SLOTS = 2;

interface Slot {
  group: THREE.Group | null;
  body: THREE.MeshStandardMaterial | null;
  turret: THREE.Group | null;
  baseColor: string;
}

function makeSlots(n: number, color: string): Slot[] {
  return Array.from({ length: n }, () => ({ group: null, body: null, turret: null, baseColor: color }));
}

export interface LawFleetHandle {
  sync(
    vehicles: Map<string, Vehicle>,
    excludeId: string | null,
    heliUnits: HeliUnit[],
    nowSec: number,
    dt: number,
  ): void;
}

const KIND_OF: Partial<Record<VehicleType, 'swat' | 'truck' | 'tank'>> = {
  [VehicleType.SWAT]: 'swat',
  [VehicleType.ARMY_TRUCK]: 'truck',
  [VehicleType.TANK]: 'tank',
};

const upAxis = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

const LawFleetImpl = forwardRef<LawFleetHandle>((_, ref) => {
  const slots = useRef({
    swat: makeSlots(SLOTS.swat, '#1f2937'),
    truck: makeSlots(SLOTS.truck, '#4d5a32'),
    tank: makeSlots(SLOTS.tank, '#5b6b3a'),
  });
  const heliGroups = useRef<Array<THREE.Group | null>>(Array(HELI_SLOTS).fill(null));
  const heliRotors = useRef<Array<THREE.Group | null>>(Array(HELI_SLOTS).fill(null));
  const beams = useRef<Array<THREE.Mesh | null>>(Array(HELI_SLOTS).fill(null));
  const pools = useRef<Array<THREE.Mesh | null>>(Array(HELI_SLOTS).fill(null));

  // SWAT light bars all flash together; one shared material is enough.
  const barMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff2b2b', toneMapped: false }), []);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#fff6c8', transparent: true, opacity: 0.12, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  }), []);
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#fff3b0', transparent: true, opacity: 0.35, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }), []);

  useImperativeHandle(ref, () => ({
    sync(vehicles, excludeId, heliUnits, nowSec, dt) {
      barMat.color.set(Math.floor(nowSec * 8) % 2 === 0 ? '#2b6cff' : '#ff2b2b');

      const used = { swat: 0, truck: 0, tank: 0 };
      let heliN = 0;

      vehicles.forEach(v => {
        if (v.id === excludeId) return;

        if (v.type === VehicleType.POLICE_HELI) {
          if (heliN >= HELI_SLOTS) return;
          const g = heliGroups.current[heliN];
          const alt3 = (v.altitude ?? 0) * PX_TO_3D;
          if (g) {
            g.visible = true;
            g.position.set(toX3D(v.x), alt3, toZ3D(v.y));
            g.rotation.set(0, -v.angle, 0);
          }
          const rotor = heliRotors.current[heliN];
          if (rotor) rotor.rotation.y += dt * 28;

          const unit = heliUnits.find(u => u.vehicleId === v.id);
          const beam = beams.current[heliN];
          const pool = pools.current[heliN];
          if (unit && unit.state === 'pursue' && beam && pool) {
            const sx = toX3D(unit.spotX);
            const sz = toZ3D(unit.spotY);
            const hx = toX3D(v.x);
            const hz = toZ3D(v.y);
            tmpDir.set(hx - sx, alt3, hz - sz);
            const len = tmpDir.length();
            tmpDir.normalize();
            beam.visible = true;
            beam.position.set((hx + sx) / 2, alt3 / 2, (hz + sz) / 2);
            beam.quaternion.setFromUnitVectors(upAxis, tmpDir);
            beam.scale.set(1, len, 1);
            pool.visible = true;
            pool.position.set(sx, 0.09, sz);
          } else {
            if (beam) beam.visible = false;
            if (pool) pool.visible = false;
          }
          heliN++;
          return;
        }

        const kind = KIND_OF[v.type];
        if (!kind) return;
        const list = slots.current[kind];
        const i = used[kind];
        if (i >= list.length) return;
        used[kind]++;
        const s = list[i];
        if (!s.group) return;
        const wrecked = v.hp <= 0;
        s.group.visible = true;
        s.group.position.set(toX3D(v.x), 0, toZ3D(v.y));
        s.group.rotation.set(wrecked ? WRECK_PITCH : 0, -v.angle, wrecked ? WRECK_ROLL : 0);
        if (s.body) {
          if (wrecked) s.body.color.copy(WRECK_COLOR);
          else s.body.color.set(s.baseColor).lerp(WRECK_COLOR, 1 - Math.max(0, Math.min(1, v.hp / 100)));
        }
        if (s.turret) s.turret.rotation.y = -((v.turretAngle ?? v.angle) - v.angle);
      });

      for (const kind of ['swat', 'truck', 'tank'] as const) {
        const list = slots.current[kind];
        for (let i = used[kind]; i < list.length; i++) {
          if (list[i].group) list[i].group!.visible = false;
        }
      }
      for (let i = heliN; i < HELI_SLOTS; i++) {
        if (heliGroups.current[i]) heliGroups.current[i]!.visible = false;
        if (beams.current[i]) beams.current[i]!.visible = false;
        if (pools.current[i]) pools.current[i]!.visible = false;
      }
    },
  }));

  const spot3 = SPOT_RADIUS * PX_TO_3D;

  return (
    <>
      {slots.current.swat.map((s, i) => (
        <group key={`s${i}`} ref={el => { s.group = el; }} visible={false}>
          <SwatVanMesh color={s.baseColor} barMat={barMat} bodyMat={m => { s.body = m; }} />
        </group>
      ))}
      {slots.current.truck.map((s, i) => (
        <group key={`t${i}`} ref={el => { s.group = el; }} visible={false}>
          <ArmyTruckMesh color={s.baseColor} bodyMat={m => { s.body = m; }} />
        </group>
      ))}
      {slots.current.tank.map((s, i) => (
        <group key={`k${i}`} ref={el => { s.group = el; }} visible={false}>
          <TankMesh color={s.baseColor} bodyMat={m => { s.body = m; }} turretRef={el => { s.turret = el; }} />
        </group>
      ))}
      {Array.from({ length: HELI_SLOTS }, (_, i) => (
        <group key={`h${i}`}>
          <group ref={el => { heliGroups.current[i] = el; }} visible={false}>
            <PoliceHeliMesh rotorRef={el => { heliRotors.current[i] = el; }} />
          </group>
          {/* Searchlight: an open cone from the helicopter to the lit spot. */}
          <mesh ref={el => { beams.current[i] = el; }} visible={false} material={beamMat}>
            <cylinderGeometry args={[0.15, spot3, 1, 20, 1, true]} />
          </mesh>
          <mesh ref={el => { pools.current[i] = el; }} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={poolMat}>
            <circleGeometry args={[spot3, 24]} />
          </mesh>
        </group>
      ))}
    </>
  );
});
LawFleetImpl.displayName = 'LawFleet';
// No props: memo keeps the HUD's 10Hz re-renders from reconciling every pooled mesh.
export const LawFleet = memo(LawFleetImpl);
