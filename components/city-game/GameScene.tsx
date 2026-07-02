'use client';
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';

import { GameEngine3D } from './engine3d';
import { HUDData } from './types';
import { toX3D, toZ3D, VehicleType, TILE_3D, GRID_SIZE, TILE_SIZE, Vehicle } from './types';
import CityScene from './CityMesh';
import { PlayerCar, PlayerCarHandle, NPCCars, NPCCarsHandle, HelicopterMesh } from './VehicleMeshes';

// Reusable temp objects (never recreate in hot loop)
const tmpVec3  = new THREE.Vector3();
const tmpVec3b = new THREE.Vector3();

// Camera config
const CAM_DIST_CAR  = 13;
const CAM_HEIGHT_CAR = 5.5;
const CAM_DIST_FOOT  = 8;
const CAM_HEIGHT_FOOT = 4;
const CAM_LERP = 4;

// ─── Weather system ───────────────────────────────────────────────────────────

export type WeatherType = 'clear_day' | 'dusk' | 'night' | 'cloudy' | 'rain' | 'storm' | 'foggy' | 'snow';

interface WeatherConfig {
  // Sky component settings
  sunPosition: [number, number, number];
  turbidity: number;
  rayleigh: number;
  // Ambient light
  ambientIntensity: number;
  ambientColor: string;
  // Sun directional light
  sunIntensity: number;
  sunColor: string;
  // Fill light
  fillIntensity: number;
  // Hemisphere
  hemiIntensity: number;
  skyColor: string;
  groundColor: string;
  // Fog
  fogColor: string;
  fogNear: number;
  fogFar: number;
  // Particles
  particles: 'none' | 'rain' | 'heavy_rain' | 'snow';
  particleOpacity: number;
  // Lightning
  lightning: boolean;
}

const WEATHER: Record<WeatherType, WeatherConfig> = {
  clear_day: {
    sunPosition: [80, 60, 40], turbidity: 6, rayleigh: 0.5,
    ambientIntensity: 0.75, ambientColor: '#c8d8f0',
    sunIntensity: 2.4, sunColor: '#fff5e0',
    fillIntensity: 0.65,
    hemiIntensity: 0.5, skyColor: '#c0d8ff', groundColor: '#1a2a10',
    fogColor: '#8aa8c8', fogNear: 80, fogFar: 180,
    particles: 'none', particleOpacity: 0, lightning: false,
  },
  dusk: {
    sunPosition: [120, 4, 0], turbidity: 14, rayleigh: 2.5,
    ambientIntensity: 0.45, ambientColor: '#f5c07a',
    sunIntensity: 1.6, sunColor: '#ff8c2a',
    fillIntensity: 0.25,
    hemiIntensity: 0.3, skyColor: '#f59642', groundColor: '#1a0a05',
    fogColor: '#c47a3a', fogNear: 60, fogFar: 140,
    particles: 'none', particleOpacity: 0, lightning: false,
  },
  night: {
    sunPosition: [80, -60, 40], turbidity: 1, rayleigh: 0.1,
    ambientIntensity: 0.70, ambientColor: '#4a5a7a',
    sunIntensity: 0.0, sunColor: '#1a2a4a',
    fillIntensity: 0.52,
    hemiIntensity: 0.55, skyColor: '#050a1a', groundColor: '#101828',
    fogColor: '#050a14', fogNear: 60, fogFar: 160,
    particles: 'none', particleOpacity: 0, lightning: false,
  },
  cloudy: {
    sunPosition: [60, 50, 30], turbidity: 20, rayleigh: 0.2,
    ambientIntensity: 0.65, ambientColor: '#b0b8c8',
    sunIntensity: 0.8, sunColor: '#d0d8e0',
    fillIntensity: 0.5,
    hemiIntensity: 0.4, skyColor: '#9aa8b8', groundColor: '#18201a',
    fogColor: '#8090a0', fogNear: 50, fogFar: 130,
    particles: 'none', particleOpacity: 0, lightning: false,
  },
  rain: {
    sunPosition: [60, 30, 20], turbidity: 20, rayleigh: 0.1,
    ambientIntensity: 0.45, ambientColor: '#7090a8',
    sunIntensity: 0.4, sunColor: '#8090a0',
    fillIntensity: 0.30,
    hemiIntensity: 0.28, skyColor: '#506070', groundColor: '#0a1208',
    fogColor: '#506070', fogNear: 35, fogFar: 110,
    particles: 'rain', particleOpacity: 0.55, lightning: false,
  },
  storm: {
    sunPosition: [40, 20, 10], turbidity: 20, rayleigh: 0.05,
    ambientIntensity: 0.35, ambientColor: '#405060',
    sunIntensity: 0.2, sunColor: '#607080',
    fillIntensity: 0.22,
    hemiIntensity: 0.20, skyColor: '#303840', groundColor: '#080a0e',
    fogColor: '#303840', fogNear: 25, fogFar: 90,
    particles: 'heavy_rain', particleOpacity: 0.70, lightning: true,
  },
  foggy: {
    sunPosition: [80, 60, 40], turbidity: 20, rayleigh: 0.8,
    ambientIntensity: 0.55, ambientColor: '#c8c8c0',
    sunIntensity: 0.5, sunColor: '#d8d8d0',
    fillIntensity: 0.4,
    hemiIntensity: 0.35, skyColor: '#c0c0b8', groundColor: '#141410',
    fogColor: '#b8b8b0', fogNear: 5, fogFar: 40,
    particles: 'none', particleOpacity: 0, lightning: false,
  },
  snow: {
    sunPosition: [80, 55, 40], turbidity: 10, rayleigh: 0.3,
    ambientIntensity: 0.70, ambientColor: '#d8e8f8',
    sunIntensity: 1.2, sunColor: '#f0f8ff',
    fillIntensity: 0.5,
    hemiIntensity: 0.4, skyColor: '#d0e8ff', groundColor: '#202820',
    fogColor: '#d8e8f8', fogNear: 60, fogFar: 150,
    particles: 'snow', particleOpacity: 0.70, lightning: false,
  },
};

// ─── Rain / Snow particle system ──────────────────────────────────────────────

const PARTICLE_COUNT = 10000;

function PrecipitationSystem({
  type, opacity, cameraRef,
}: {
  type: 'rain' | 'heavy_rain' | 'snow';
  opacity: number;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const posArr = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT * 3));
  const velArr = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT));

  // Initialize positions and velocities once
  useMemo(() => {
    const pos = posArr.current;
    const vel = velArr.current;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = Math.random() * 80;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
      vel[i] = 25 + Math.random() * 15; // fall speed per particle
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useFrame((state, dt) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const pos = posArr.current;
    const vel = velArr.current;
    const isSnow = type === 'snow';
    const fallSpeed = isSnow ? 3 : (type === 'heavy_rain' ? 50 : 35);
    const driftAmp  = isSnow ? 1.2 : 0.3;

    // Move particles relative to camera so they always surround the player
    const cam = state.camera;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const base = i * 3;
      pos[base + 1] -= (vel[i] / 25) * fallSpeed * dt;
      if (isSnow) {
        pos[base]     += Math.sin(state.clock.elapsedTime * 0.5 + i) * driftAmp * dt;
        pos[base + 2] += Math.cos(state.clock.elapsedTime * 0.4 + i) * driftAmp * dt;
      }
      // Reset to top when below ground (world-relative, keep centered on cam)
      if (pos[base + 1] < cam.position.y - 5) {
        pos[base]     = cam.position.x + (Math.random() - 0.5) * 160;
        pos[base + 1] = cam.position.y + 75;
        pos[base + 2] = cam.position.z + (Math.random() - 0.5) * 160;
      }
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  const isSnow = type === 'snow';
  const color  = isSnow ? '#e8f0ff' : '#aaccee';
  const size   = isSnow ? 0.18 : (type === 'heavy_rain' ? 0.07 : 0.05);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={posArr.current}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  engine: GameEngine3D;
  weatherType: WeatherType;
  onHUDUpdate: (data: HUDData) => void;
  onPhoneToggle: () => void;
  onMapToggle: () => void;
  onTownHallToggle: () => void;
  onWeatherCycle: () => void;
}

// ─── Main scene ───────────────────────────────────────────────────────────────

export default function GameScene({
  engine, weatherType, onHUDUpdate, onPhoneToggle, onMapToggle,
  onTownHallToggle, onWeatherCycle,
}: Props) {
  const playerRef     = useRef<PlayerCarHandle>(null);
  const npcRef        = useRef<NPCCarsHandle>(null);
  const droneRef      = useRef<THREE.Group>(null);
  const helicopterRef = useRef<THREE.Group>(null);
  const waypointRef   = useRef<THREE.Group>(null);
  const miniMapTick   = useRef(0);
  const lastCarIdRef  = useRef<string | null>(null);

  // Light refs for dynamic weather
  const ambientRef  = useRef<THREE.AmbientLight>(null);
  const sunRef      = useRef<THREE.DirectionalLight>(null);
  const fillRef     = useRef<THREE.DirectionalLight>(null);
  const hemiRef     = useRef<THREE.HemisphereLight>(null);
  const cameraRef   = useRef<THREE.Camera | null>(null);

  // Current interpolated weather values (live lerp in useFrame)
  const liveW = useRef({ ...WEATHER.clear_day });
  // Lightning state
  const lightningTimer = useRef(0);
  const lightningActive = useRef(false);
  const lightningCountdown = useRef(0);

  const [playerGrid, setPlayerGrid] = useState({ x: 40, y: 40 });
  const playerGridRef = useRef({ x: 40, y: 40 });

  // Fog object to mutate per-frame
  const fogRef = useRef<THREE.Fog | null>(null);

  useEffect(() => {
    engine.input.attach();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') onPhoneToggle();
      if (e.code === 'KeyM') onMapToggle();
      if (e.code === 'KeyT') onTownHallToggle();
      if (e.code === 'KeyG') onWeatherCycle();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      engine.input.detach();
      window.removeEventListener('keydown', onKey);
    };
  }, [engine, onPhoneToggle, onMapToggle, onTownHallToggle, onWeatherCycle]);

  useEffect(() => {
    engine.setHUDCallback(onHUDUpdate);
  }, [engine, onHUDUpdate]);

  // Snap target weather immediately on change (lerp handles smooth transition)
  const targetW = WEATHER[weatherType];

  useFrame((state, delta) => {
    const dt  = Math.min(delta, 0.05);
    const now = performance.now();
    cameraRef.current = state.camera;

    engine.update(dt, now);

    const player = engine.player;
    const px3 = toX3D(player.x);
    const pz3 = toZ3D(player.y);

    // ─ Grid update (every 4 tiles to avoid sync stalls) ──────────────
    const QUANTIZE = 4;
    const gx = Math.floor(player.x / (TILE_SIZE * QUANTIZE)) * QUANTIZE;
    const gy = Math.floor(player.y / (TILE_SIZE * QUANTIZE)) * QUANTIZE;
    if (gx !== playerGridRef.current.x || gy !== playerGridRef.current.y) {
      playerGridRef.current = { x: gx, y: gy };
      Promise.resolve().then(() => setPlayerGrid({ x: gx, y: gy }));
    }

    // ─ Player vehicle mesh ────────────────────────────────────────────
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
      pGroup.rotation.y = -player.angle;
    }

    // ─ NPC cars ───────────────────────────────────────────────────────
    const npcData: Array<{ x: number; z: number; angle: number; color: string; type: VehicleType }> = [];
    if (player.currentVehicleId) lastCarIdRef.current = player.currentVehicleId;
    engine.vehicles.forEach(v => {
      if (v.id === player.currentVehicleId) return;
      if (v.id === lastCarIdRef.current && player.state !== 'inCar') return;
      if (v.type === VehicleType.RC_DRONE)  return;
      if (v.type === VehicleType.HELICOPTER) return;
      npcData.push({ x: toX3D(v.x), z: toZ3D(v.y), angle: -v.angle, color: v.color, type: v.type });
    });
    npcRef.current?.update(npcData);

    // ─ Drone mesh ─────────────────────────────────────────────────────
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

    // ─ Dispatched helicopter ──────────────────────────────────────────
    const hg = helicopterRef.current;
    if (hg) {
      let activeHeli: Vehicle | null = null;
      engine.vehicles.forEach(v => {
        if (v.type === VehicleType.HELICOPTER && v.id !== player.currentVehicleId) activeHeli = v;
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

    // ─ Waypoint marker ────────────────────────────────────────────────
    const wp = engine.waypoint;
    if (waypointRef.current) {
      waypointRef.current.visible = wp.active;
      if (wp.active) {
        waypointRef.current.position.set(toX3D(wp.x), 0, toZ3D(wp.y));
        waypointRef.current.rotation.y += delta * 1.5;
      }
    }

    // ─ Camera ─────────────────────────────────────────────────────────
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
    const camAngle  = -player.angle;
    tmpVec3.set(
      focusX + Math.sin(camAngle) * camDist,
      focusY + camHeight,
      focusZ + Math.cos(camAngle) * camDist
    );
    state.camera.position.lerp(tmpVec3, Math.min(1, delta * CAM_LERP));
    tmpVec3b.set(focusX, focusY + 1.4, focusZ);
    state.camera.lookAt(tmpVec3b);

    // ─ Weather lerp (smooth transitions) ─────────────────────────────
    const L = Math.min(1, dt * 1.5); // lerp speed: full transition in ~0.7s
    const lw = liveW.current;
    const tw = targetW;

    lw.ambientIntensity = lw.ambientIntensity + (tw.ambientIntensity - lw.ambientIntensity) * L;
    lw.sunIntensity     = lw.sunIntensity     + (tw.sunIntensity     - lw.sunIntensity)     * L;
    lw.fillIntensity    = lw.fillIntensity    + (tw.fillIntensity    - lw.fillIntensity)    * L;
    lw.hemiIntensity    = lw.hemiIntensity    + (tw.hemiIntensity    - lw.hemiIntensity)    * L;
    lw.fogNear          = lw.fogNear          + (tw.fogNear          - lw.fogNear)          * L;
    lw.fogFar           = lw.fogFar           + (tw.fogFar           - lw.fogFar)           * L;

    // Apply to lights
    if (ambientRef.current)  ambientRef.current.intensity  = lw.ambientIntensity;
    if (sunRef.current)      sunRef.current.intensity      = lw.sunIntensity;
    if (fillRef.current)     fillRef.current.intensity     = lw.fillIntensity;
    if (hemiRef.current)     hemiRef.current.intensity     = lw.hemiIntensity;

    // Lerp environment intensity: brighter at night (no sun) to keep materials visible
    const targetEnvIntensity = weatherType === 'night' ? 0.75 : 0.35;
    state.scene.environmentIntensity = (state.scene.environmentIntensity ?? 0.5) +
      (targetEnvIntensity - (state.scene.environmentIntensity ?? 0.5)) * L;

    // Fog mutation
    const fog = state.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = lw.fogNear;
      fog.far  = lw.fogFar;
      fog.color.set(tw.fogColor);
    }

    // ─ Lightning (storm) ──────────────────────────────────────────────
    if (tw.lightning && ambientRef.current) {
      lightningTimer.current -= dt;
      if (lightningActive.current) {
        lightningCountdown.current -= dt;
        ambientRef.current.intensity = 4.5;
        if (lightningCountdown.current <= 0) {
          lightningActive.current = false;
          ambientRef.current.intensity = lw.ambientIntensity;
        }
      } else if (lightningTimer.current <= 0) {
        lightningActive.current   = true;
        lightningCountdown.current = 0.08; // 80 ms flash
        lightningTimer.current    = 2.5 + Math.random() * 4;
      }
    } else if (lightningActive.current) {
      lightningActive.current = false;
      if (ambientRef.current) ambientRef.current.intensity = lw.ambientIntensity;
    }

    // ─ Mini-map update (every 6 frames) ──────────────────────────────
    miniMapTick.current++;
    if (miniMapTick.current % 6 === 0) {
      const ev = new CustomEvent('city:minimap', { detail: engine.getStateSnapshot() });
      window.dispatchEvent(ev);
    }
  });

  const cfg = WEATHER[weatherType];
  const showPrecip = cfg.particles !== 'none';

  return (
    <>
      {/* ── Lighting ─────────────────────────────────────────────── */}
      <ambientLight ref={ambientRef} intensity={cfg.ambientIntensity} color={cfg.ambientColor} />

      <directionalLight
        ref={sunRef}
        position={cfg.sunPosition}
        intensity={cfg.sunIntensity}
        color={cfg.sunColor}
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

      <directionalLight
        ref={fillRef}
        position={[-60, 30, -80]}
        intensity={cfg.fillIntensity}
        color="#a0c0ff"
      />

      <hemisphereLight
        ref={hemiRef}
        args={[cfg.skyColor as THREE.ColorRepresentation, cfg.groundColor as THREE.ColorRepresentation, cfg.hemiIntensity]}
      />

      {/* ── Sky ──────────────────────────────────────────────────── */}
      <Sky
        distance={3000}
        sunPosition={cfg.sunPosition}
        turbidity={cfg.turbidity}
        rayleigh={cfg.rayleigh}
        inclination={0.52}
        azimuth={0.22}
      />

      {/* ── Fog ──────────────────────────────────────────────────── */}
      <fog attach="fog" args={[cfg.fogColor, cfg.fogNear, cfg.fogFar]} />

      {/* ── Precipitation ────────────────────────────────────────── */}
      {showPrecip && (
        <PrecipitationSystem
          type={cfg.particles as 'rain' | 'heavy_rain' | 'snow'}
          opacity={cfg.particleOpacity}
          cameraRef={cameraRef}
        />
      )}

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
        <group scale={5}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.1, 0.28]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.5} metalness={0.2} />
          </mesh>
          {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz], i) => (
            <group key={i} position={[sx * 0.35, 0, sz * 0.35]}>
              <mesh rotation={[0, Math.atan2(sz, sx), 0]}>
                <boxGeometry args={[0.5, 0.04, 0.06]} />
                <meshStandardMaterial color="#444" metalness={0.2} />
              </mesh>
              <mesh position={[0, 0.06, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 0.09, 8]} />
                <meshStandardMaterial color="#111" metalness={0.2} roughness={0.1} />
              </mesh>
              <mesh position={[0, 0.12, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.015, 16]} />
                <meshStandardMaterial color="#00e5ff" transparent opacity={0.45}
                  emissive="#00e5ff" emissiveIntensity={1.2} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.08, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#ff3300" emissive="#ff3300" emissiveIntensity={4} />
          </mesh>
        </group>
        <pointLight color="#00e5ff" intensity={3} distance={12} decay={2} />
      </group>

      {/* ── Waypoint group (diamond + vertical beam) ─────────────── */}
      <group ref={waypointRef} visible={false}>
        <mesh position={[0, 1.2, 0]} castShadow={false}>
          <octahedronGeometry args={[1.1, 0]} />
          <meshStandardMaterial color="#ff3232" emissive="#ff1111" emissiveIntensity={1.5} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 15, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 30, 6]} />
          <meshStandardMaterial color="#ff3232" emissive="#ff1111" emissiveIntensity={2} transparent opacity={0.45} />
        </mesh>
      </group>
    </>
  );
}
