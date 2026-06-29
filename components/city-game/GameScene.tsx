'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky, Environment } from '@react-three/drei';
import * as THREE from 'three';

import { GameEngine3D } from './engine3d';
import { HUDData } from './types';
import { toX3D, toZ3D, VehicleType, TILE_3D, GRID_SIZE, TILE_SIZE, Vehicle } from './types';
import CityScene from './CityMesh';
import { PlayerCar, PlayerCarHandle, NPCCars, NPCCarsHandle, HelicopterMesh } from './VehicleMeshes';

// Reusable temp objects (never recreate in hot loop)
const tmpVec3  = new THREE.Vector3();
const tmpVec3b = new THREE.Vector3();
const tmpQuat  = new THREE.Quaternion();
const Y_AXIS   = new THREE.Vector3(0, 1, 0);

// Camera config
const CAM_DIST_CAR  = 13;
const CAM_HEIGHT_CAR = 5.5;
const CAM_DIST_FOOT  = 8;
const CAM_HEIGHT_FOOT = 4;
const CAM_LERP = 4;

interface Props {
  engine: GameEngine3D;
  onHUDUpdate: (data: HUDData) => void;
  onPhoneToggle: () => void;
  onMapToggle: () => void;
  onTownHallToggle: () => void;
}

export default function GameScene({ engine, onHUDUpdate, onPhoneToggle, onMapToggle, onTownHallToggle }: Props) {
  const playerRef     = useRef<PlayerCarHandle>(null);
  const npcRef        = useRef<NPCCarsHandle>(null);
  const droneRef      = useRef<THREE.Group>(null);
  const helicopterRef = useRef<THREE.Group>(null);
  const waypointRef   = useRef<THREE.Group>(null);
  const miniMapTick   = useRef(0);
  const lastCarIdRef  = useRef<string | null>(null);  // tracks the last vehicle player was in

  const [playerGrid, setPlayerGrid] = useState({ x: 40, y: 40 });
  const playerGridRef = useRef({ x: 40, y: 40 });

  useEffect(() => {
    engine.input.attach();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') onPhoneToggle();
      if (e.code === 'KeyM') onMapToggle();
      if (e.code === 'KeyT') onTownHallToggle();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      engine.input.detach();
      window.removeEventListener('keydown', onKey);
    };
  }, [engine, onPhoneToggle, onMapToggle, onTownHallToggle]);

  useEffect(() => {
    engine.setHUDCallback(onHUDUpdate);
  }, [engine, onHUDUpdate]);

  useFrame((state, delta) => {
    const dt   = Math.min(delta, 0.05);
    const now  = performance.now();

    engine.update(dt, now);

    const player = engine.player;
    const px3 = toX3D(player.x);
    const pz3 = toZ3D(player.y);

    // Quantize grid updates to every 4 tiles (160 units) to avoid CPU-GPU sync stalls
    const QUANTIZE = 4;
    const gx = Math.floor(player.x / (TILE_SIZE * QUANTIZE)) * QUANTIZE;
    const gy = Math.floor(player.y / (TILE_SIZE * QUANTIZE)) * QUANTIZE;
    if (gx !== playerGridRef.current.x || gy !== playerGridRef.current.y) {
      playerGridRef.current = { x: gx, y: gy };
      Promise.resolve().then(() => {
        setPlayerGrid({ x: gx, y: gy });
      });
    }

    // ─ Player vehicle mesh ─────────────────────────────────────────
    const pGroup = playerRef.current?.group;
    if (pGroup) {
      pGroup.position.x = px3;
      pGroup.position.z = pz3;
      let py = 0;
      if (player.state === 'inHelicopter') {
        const heli = engine.vehicles.get(player.currentVehicleId ?? '');
        py = ((heli?.altitude ?? 0) * TILE_3D) / TILE_SIZE;
      }
      pGroup.position.y = py;
      // 2D angle: 0 = North (-Z in Three.js), clockwise positive
      // Three.js rotation.y: 0 = +Z, CCW positive → negate and no offset needed
      pGroup.rotation.y = -player.angle;
    }

    // ─ NPC cars (exclude player car AND recently-exited parked car) ─
    const npcData: Array<{ x: number; z: number; angle: number; color: string; type: VehicleType }> = [];
    // Track which car player is currently in
    if (player.currentVehicleId) lastCarIdRef.current = player.currentVehicleId;
    engine.vehicles.forEach(v => {
      if (v.id === player.currentVehicleId) return;  // skip actively driven car
      if (v.id === lastCarIdRef.current && player.state !== 'inCar') return;  // skip parked car (shown separately)
      if (v.type === VehicleType.RC_DRONE)  return;
      if (v.type === VehicleType.HELICOPTER) return;
      npcData.push({ x: toX3D(v.x), z: toZ3D(v.y), angle: -v.angle, color: v.color, type: v.type });
    });
    npcRef.current?.update(npcData);

    // ─ Drone mesh in the sky ──────────────────────────────────────
    const droneVehId = engine.drone.vehicleId;
    const dg = droneRef.current;
    if (dg) {
      if (droneVehId) {
        const dv = engine.vehicles.get(droneVehId);
        if (dv) {
          dg.visible = true;
          dg.position.set(toX3D(dv.x), (dv.altitude ?? 0) * TILE_3D / TILE_SIZE, toZ3D(dv.y));
          dg.rotation.y = -dv.angle;
        }
      } else {
        dg.visible = false;
      }
    }

    // ─ Dispatched helicopter mesh in the sky ──────────────────────
    const hg = helicopterRef.current;
    if (hg) {
      let activeHeli: Vehicle | null = null;
      engine.vehicles.forEach(v => {
        if (v.type === VehicleType.HELICOPTER && v.id !== player.currentVehicleId) {
          activeHeli = v;
        }
      });
      if (activeHeli) {
        const v = activeHeli as Vehicle;
        hg.visible = true;
        hg.position.set(toX3D(v.x), (v.altitude ?? 15) * TILE_3D / TILE_SIZE, toZ3D(v.y));
        hg.rotation.y = -v.angle;
      } else {
        hg.visible = false;
      }
    }

    // ─ Waypoint marker ────────────────────────────────────────────
    const wp = engine.waypoint;
    if (waypointRef.current) {
      waypointRef.current.visible = wp.active;
      if (wp.active) {
        waypointRef.current.position.set(toX3D(wp.x), 0, toZ3D(wp.y));
        waypointRef.current.rotation.y += delta * 1.5;
      }
    }

    // ─ Camera ────────────────────────────────────────────────────
    const isDriving = player.state === 'inCar' || player.state === 'inHelicopter';
    const droneVeh  = player.state === 'inDrone' && engine.drone.vehicleId
      ? engine.vehicles.get(engine.drone.vehicleId) : null;

    let focusX = px3, focusZ = pz3, focusY = 0;
    if (player.state === 'inHelicopter') {
      const heli = engine.vehicles.get(player.currentVehicleId ?? '');
      focusY = ((heli?.altitude ?? 0) * TILE_3D) / TILE_SIZE;
    }
    if (droneVeh) {
      focusX = toX3D(droneVeh.x);
      focusZ = toZ3D(droneVeh.y);
      focusY = (droneVeh.altitude ?? 0) * TILE_3D / TILE_SIZE;
    }

    const camDist   = isDriving ? CAM_DIST_CAR  : CAM_DIST_FOOT;
    const camHeight = isDriving ? CAM_HEIGHT_CAR : CAM_HEIGHT_FOOT;

    // Camera sits BEHIND the entity: no +PI offset
    const camAngle = -player.angle;
    tmpVec3.set(
      focusX + Math.sin(camAngle) * camDist,
      focusY + camHeight,
      focusZ + Math.cos(camAngle) * camDist
    );

    state.camera.position.lerp(tmpVec3, Math.min(1, delta * CAM_LERP));
    tmpVec3b.set(focusX, focusY + 1.4, focusZ);
    state.camera.lookAt(tmpVec3b);

    // ─ Mini-map update (every 6 frames) ──────────────────────────
    miniMapTick.current++;
    if (miniMapTick.current % 6 === 0) {
      // Dispatched as custom event that MiniMap component listens to
      const ev = new CustomEvent('city:minimap', { detail: engine.getStateSnapshot() });
      window.dispatchEvent(ev);
    }
  });

  // World size for skybox
  const worldSz = GRID_SIZE * TILE_3D;

  return (
    <>
      {/* ── Lighting ─────────────────────────────────────────────── */}
      <ambientLight intensity={0.75} color="#c8d8f0" />

      {/* Sun — low angle for GTA V late-afternoon look */}
      <directionalLight
        position={[80, 60, 40]}
        intensity={2.4}
        color="#fff5e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-camera-left={-180}
        shadow-camera-right={180}
        shadow-camera-top={180}
        shadow-camera-bottom={-180}
        shadow-bias={-0.0003}
      />

      {/* Fill light from opposite side */}
      <directionalLight position={[-60, 30, -80]} intensity={0.65} color="#a0c0ff" />

      {/* Street ambience */}
      <hemisphereLight args={['#c0d8ff', '#1a2a10', 0.5]} />

      {/* ── Sky ──────────────────────────────────────────────────── */}
      <Sky
        distance={3000}
        sunPosition={[80, 60, 40]}
        inclination={0.52}
        azimuth={0.22}
        turbidity={6}
        rayleigh={0.5}
      />

      {/* ── Fog ──────────────────────────────────────────────────── */}
      <fog attach="fog" args={['#8aa8c8', 80, 180]} />

      {/* ── City ─────────────────────────────────────────────────── */}
      <CityScene world={engine.world} playerGridX={playerGrid.x} playerGridY={playerGrid.y} />

      {/* ── Player vehicle or on-foot character ─────────────────── */}
      <PlayerCar
        ref={playerRef}
        color="#00bcd4"
        isOnFoot={engine.player.state === 'onFoot'}
        vehicleType={engine.vehicles.get(engine.player.currentVehicleId ?? '')?.type ?? VehicleType.CAR}
      />

      {/* ── Dispatched service helicopter ────────────────────────── */}
      <HelicopterMesh groupRef={helicopterRef} color="#78909c" />

      {/* ── NPC traffic ──────────────────────────────────────────── */}
      <NPCCars ref={npcRef} />

      {/* ── Drone in sky ─────────────────────────────────────────── */}
      <group ref={droneRef} visible={false}>
        {/* Scale up 5x so it's clearly visible in the sky */}
        <group scale={5}>
          {/* Central body */}
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.1, 0.28]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.5} metalness={0.8} />
          </mesh>
          {/* 4 arms + motors + props */}
          {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz], i) => (
            <group key={i} position={[sx * 0.35, 0, sz * 0.35]}>
              {/* Arm bar */}
              <mesh rotation={[0, Math.atan2(sz, sx), 0]}>
                <boxGeometry args={[0.5, 0.04, 0.06]} />
                <meshStandardMaterial color="#444" metalness={0.8} />
              </mesh>
              {/* Motor housing */}
              <mesh position={[0, 0.06, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 0.09, 8]} />
                <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
              </mesh>
              {/* Spinning prop disc */}
              <mesh position={[0, 0.12, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.015, 16]} />
                <meshStandardMaterial color="#00e5ff" transparent opacity={0.45}
                  emissive="#00e5ff" emissiveIntensity={1.2} />
              </mesh>
            </group>
          ))}
          {/* Status LED */}
          <mesh position={[0, -0.08, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#ff3300" emissive="#ff3300" emissiveIntensity={4} />
          </mesh>
        </group>
        {/* Point light to illuminate drone surroundings */}
        <pointLight color="#00e5ff" intensity={3} distance={12} decay={2} />
      </group>

      {/* ── Waypoint group (diamond + vertical beam) ─────────────── */}
      <group ref={waypointRef} visible={false}>
        {/* Diamond */}
        <mesh position={[0, 1.2, 0]} castShadow={false}>
          <octahedronGeometry args={[1.1, 0]} />
          <meshStandardMaterial color="#ff3232" emissive="#ff1111" emissiveIntensity={1.5} transparent opacity={0.9} />
        </mesh>
        {/* Vertical beam */}
        <mesh position={[0, 15, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 30, 6]} />
          <meshStandardMaterial color="#ff3232" emissive="#ff1111" emissiveIntensity={2} transparent opacity={0.45} />
        </mesh>
      </group>
    </>
  );
}
