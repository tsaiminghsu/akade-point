'use client';
import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';

import { GameEngine3D } from './engine3d';
import { HUDData } from './types';
import { toX3D, toZ3D, VehicleType, TILE_3D, TILE_SIZE, WORLD_CENTER_TILE, Vehicle } from './types';
import CityScene from './CityMesh';
import { cityUniforms } from './cityMaterials';
import { frameGate } from './frameGate';
import {
  PlayerCar, PlayerCarHandle, HelicopterMesh,
  InstancedCarFleet, CarFleetHandle,
  ScooterPool, ScooterPoolHandle,
} from './VehicleMeshes';
import PedestrianMeshes, { PedestrianMeshesHandle } from './PedestrianMeshes';
import MissionMarkers, { MissionMarkersHandle } from './MissionMarkers';
import RaceGateMeshes from './RaceGateMeshes';
import { getCourse } from './raceCourses';
import { LOOK_TARGET_Y } from './orbitCamera';
import * as gameClock from './gameClock';
import type { ResolvedGraphics } from './graphicsSettings';
import ShadowRig from './ShadowRig';
import DroneArenaMesh from './DroneArenaMesh';
import MilitaryBaseMesh from './MilitaryBaseMesh';
import { distanceToBase } from './militaryBase';
import { LawFleet, LawFleetHandle } from './LawVehicleMeshes';
import { CombatEffects, CombatEffectsHandle } from './CombatEffects';

// Reusable temp objects (never recreate in hot loop)
const tmpVec3  = new THREE.Vector3();
const tmpVec3b = new THREE.Vector3();
const fpvEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const fpvQuat  = new THREE.Quaternion();

// Smoothed camera focus. The orbit itself is not lerped — that would make
// mouse look feel laggy — only the point being looked at.
const focusSm = new THREE.Vector3();
const FOCUS_LERP_RATE = 10;

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

/** Minimap snapshots per second (each one allocates and redraws a 2D canvas). */
const MINIMAP_PERIOD = 0.1;

/** How dark it is, for lit windows, street lamps and light pools (0 day … 1 night). */
const CITY_LIGHT: Record<WeatherType, number> = {
  clear_day: 0.05, snow: 0.2, cloudy: 0.25, foggy: 0.35,
  rain: 0.4, storm: 0.6, dusk: 0.7, night: 1,
};

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

/**
 * Particle count is fixed for the life of the component: the buffers are
 * allocated once. The caller remounts it with a `key` when the density
 * setting changes.
 */
function PrecipitationSystem({
  type, opacity, count: PARTICLE_COUNT,
}: {
  type: 'rain' | 'heavy_rain' | 'snow';
  opacity: number;
  count: number;
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

  useFrame((state) => {
    const pts = pointsRef.current;
    if (!pts || !frameGate.due) return;
    const dt = Math.min(frameGate.delta, 0.1);
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
          args={[posArr.current, 3]}
          count={PARTICLE_COUNT}
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
  graphics: ResolvedGraphics;
  onHUDUpdate: (data: HUDData) => void;
  onPhoneToggle: () => void;
  onMapToggle: () => void;
  onTownHallToggle: () => void;
  onWeatherCycle: () => void;
}

// ─── Main scene ───────────────────────────────────────────────────────────────

export default function GameScene({
  engine, weatherType, graphics, onHUDUpdate, onPhoneToggle, onMapToggle,
  onTownHallToggle, onWeatherCycle,
}: Props) {
  const playerRef     = useRef<PlayerCarHandle>(null);
  const fleetRef      = useRef<CarFleetHandle>(null);
  const scooterRef    = useRef<ScooterPoolHandle>(null);
  const lawRef        = useRef<LawFleetHandle>(null);
  const fxRef         = useRef<CombatEffectsHandle>(null);
  const baseRef       = useRef<THREE.Group>(null);
  const pedRef        = useRef<PedestrianMeshesHandle>(null);
  const markerRef     = useRef<MissionMarkersHandle>(null);
  const droneRef      = useRef<THREE.Group>(null);
  const helicopterRef = useRef<THREE.Group>(null);
  const waypointRef   = useRef<THREE.Group>(null);
  const miniMapTick   = useRef(0);
  const focusInit     = useRef(false);

  // CityGame re-renders ~10x a second for the HUD, so the frame loop reads
  // settings through a ref rather than closing over the prop.
  const gfxRef = useRef(graphics);
  gfxRef.current = graphics;

  // Light refs for dynamic weather
  const ambientRef  = useRef<THREE.AmbientLight>(null);
  const sunRef      = useRef<THREE.DirectionalLight>(null);
  const fillRef     = useRef<THREE.DirectionalLight>(null);
  const hemiRef     = useRef<THREE.HemisphereLight>(null);

  // Current interpolated weather values (live lerp in useFrame)
  const liveW = useRef({ ...WEATHER.clear_day });
  // Lightning state
  const lightningTimer = useRef(0);
  const lightningActive = useRef(false);
  const lightningCountdown = useRef(0);

  const [playerGrid, setPlayerGrid] = useState({ x: WORLD_CENTER_TILE, y: WORLD_CENTER_TILE });
  const playerGridRef = useRef({ x: WORLD_CENTER_TILE, y: WORLD_CENTER_TILE });

  // Which mesh represents the player, and in what colour. This is React state
  // rather than a prop read during render because GameScene deliberately does
  // not re-render every frame — it is updated from useFrame only when it
  // actually changes (e.g. stepping out of a car, or stealing a red one).
  const [playerVisual, setPlayerVisual] = useState({
    onFoot: false,
    type: VehicleType.CAR,
    color: '#00bcd4',
  });
  const playerVisualRef = useRef(playerVisual);


  // Keyboard capture is tied to the engine's lifetime only. It must NOT depend
  // on the UI callbacks below: those change identity on every render, which
  // would detach and re-attach input ~10 times a second and can leave the game
  // with no keyboard at all if a cleanup lands without a matching attach.
  useEffect(() => {
    engine.input.attach();
    return () => engine.input.detach();
  }, [engine]);

  // UI hotkeys go through a ref so the listener binds once.
  const hotkeysRef = useRef({ onPhoneToggle, onMapToggle, onTownHallToggle, onWeatherCycle });
  hotkeysRef.current = { onPhoneToggle, onMapToggle, onTownHallToggle, onWeatherCycle };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in the pause menu must not also cycle the weather.
      if (engine.paused) return;
      const h = hotkeysRef.current;
      if (e.code === 'KeyP') h.onPhoneToggle();
      if (e.code === 'KeyM') h.onMapToggle();
      if (e.code === 'KeyT') h.onTownHallToggle();
      if (e.code === 'KeyG') h.onWeatherCycle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  useEffect(() => {
    engine.setHUDCallback(onHUDUpdate);
  }, [engine, onHUDUpdate]);

  // Dev-only handle: lets the console (and the verification scripts) reach the
  // renderer, scene and camera through the same window.cityEngine object.
  const { scene, gl, camera } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (engine as unknown as { three?: unknown }).three = { scene, gl, camera };
  }, [engine, scene, gl, camera]);

  // Mouse look is driven off the WebGL canvas: click to lock, Esc to release.
  useEffect(() => {
    const el = gl.domElement;
    engine.input.attachPointer(el);
    return () => engine.input.detachPointer();
  }, [engine, gl]);

  // Snap target weather immediately on change (lerp handles smooth transition)
  const targetW = WEATHER[weatherType];

  // The fps cap is decided here, before every other frame callback (-2 runs
  // first); the rest of the scene reads frameGate.due.
  useFrame((_, rawDelta) => frameGate.advance(rawDelta, gfxRef.current.fpsCap), -2);

  useFrame((state) => {
    // Frame cap: between steps the simulation, camera and every sync below are
    // skipped entirely, which is where the CPU time goes (otherwise the sim runs
    // at the monitor's refresh rate — 144 times a second on some screens).
    // PostFX skips its draw on the same frames.
    if (!frameGate.due) return;
    const delta = frameGate.delta;
    const dt  = Math.min(delta, 0.05);
    const now = gameClock.now();

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

    // ─ Player mesh identity (only when it changes) ───────────────────
    const curVeh = player.currentVehicleId ? engine.vehicles.get(player.currentVehicleId) : null;
    const onFoot = player.state === 'onFoot';
    const visType = curVeh?.type ?? VehicleType.CAR;
    const visColor = onFoot ? '#00bcd4' : (curVeh?.color ?? '#00bcd4');
    const pv = playerVisualRef.current;
    if (pv.onFoot !== onFoot || pv.type !== visType || pv.color !== visColor) {
      const next = { onFoot, type: visType, color: visColor };
      playerVisualRef.current = next;
      Promise.resolve().then(() => setPlayerVisual(next));
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
      } else if (player.state === 'onFoot') {
        // Jump arc — player.z is world px on the same axis as vehicle altitude.
        py = (player.z * TILE_3D) / TILE_SIZE;
      }
      pGroup.position.y = py;
      pGroup.rotation.y = -player.angle;
      // A stolen tank's turret follows the camera independently of the hull.
      const turret = playerRef.current?.turret;
      if (turret && curVeh) turret.rotation.y = -((curVeh.turretAngle ?? curVeh.angle) - curVeh.angle);
    }

    // ─ Traffic + crowd (instanced, written imperatively) ──────────────
    // Only the vehicle the player is *currently* driving is hidden; a car the
    // player has left stays visible where it was abandoned.
    const drivenId = player.state === 'inCar' || player.state === 'inHelicopter'
      ? player.currentVehicleId
      : null;
    fleetRef.current?.sync(engine.vehicles, drivenId, now / 1000);
    scooterRef.current?.sync(engine.vehicles, drivenId);
    lawRef.current?.sync(engine.vehicles, drivenId, engine.helis.units, now / 1000, dt);
    fxRef.current?.sync(engine.combat, engine.roadblocks.strips());
    // The base is static and out of the chunk streamer, so cull it by hand.
    if (baseRef.current) {
      baseRef.current.visible =
        distanceToBase(player.x, player.y) < engine.perf.drawDistance * (TILE_SIZE / TILE_3D) + 200;
    }
    pedRef.current?.sync(engine.pedestrians);
    markerRef.current?.sync(engine.missions, now / 1000);

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
    const droneVeh  = player.state === 'inDrone' && engine.drone.vehicleId
      ? engine.vehicles.get(engine.drone.vehicleId) : null;

    // ── FPV Race Camera ────────────────────────────────────────────────
    const rs = engine.raceSession;
    if (rs?.fpvMode && droneVeh && rs.phase !== 'idle') {
      const dAngle = droneVeh.angle;
      const dx = toX3D(droneVeh.x);
      const dz = toZ3D(droneVeh.y);
      const dy = (droneVeh.altitude ?? 0) * TILE_3D / TILE_SIZE;

      // Position: slightly behind drone nose
      const BACK = 0.25;
      const camX = dx - Math.sin(dAngle) * BACK;
      const camZ = dz + Math.cos(dAngle) * BACK;
      const camY = dy + 0.12;

      state.camera.position.lerp(tmpVec3.set(camX, camY, camZ), 0.85);

      // Orientation: yaw + visual pitch/roll
      const pitchTilt = engine.drone.pitch * -0.22;
      const rollTilt  = engine.drone.roll  *  0.18;
      fpvEuler.set(pitchTilt, -dAngle, rollTilt);
      fpvQuat.setFromEuler(fpvEuler);
      state.camera.quaternion.slerp(fpvQuat, 0.85);

      // Dynamic FOV (70–95°)
      const spd = Math.sqrt((engine.raceVx ?? 0) ** 2 + (engine.raceVy ?? 0) ** 2);
      const targetFov = 70 + Math.min(1, spd / 320) * 25;
      if (Math.abs((state.camera as THREE.PerspectiveCamera).fov - targetFov) > 0.5) {
        (state.camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
          (state.camera as THREE.PerspectiveCamera).fov, targetFov, 0.1,
        );
        (state.camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }

      // Camera shake on crash
      if (rs.cameraShake > 0) {
        state.camera.position.x += (Math.random() - 0.5) * 0.2;
        state.camera.position.y += (Math.random() - 0.5) * 0.12;
        state.camera.position.z += (Math.random() - 0.5) * 0.2;
      }
    } else {
      // ── Third-person camera ──────────────────────────────────────────
      // Ease back to the configured FOV after FPV, or after a settings change.
      const targetFov = gfxRef.current.fov;
      const cam = state.camera as THREE.PerspectiveCamera;
      if (Math.abs(cam.fov - targetFov) > 0.01) {
        cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, 0.05);
        if (Math.abs(cam.fov - targetFov) <= 0.01) cam.fov = targetFov;
        cam.updateProjectionMatrix();
      }

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

      // Smooth the focus point only; the orbit angles come straight from the
      // engine so mouse look has no perceptible lag.
      tmpVec3.set(focusX, focusY, focusZ);
      if (!focusInit.current) {
        focusSm.copy(tmpVec3);
        focusInit.current = true;
      } else {
        focusSm.lerp(tmpVec3, 1 - Math.exp(-FOCUS_LERP_RATE * delta));
      }

      const oc = engine.orbitCam;
      const hd = oc.dist * Math.cos(oc.pitch);
      const vd = oc.dist * Math.sin(oc.pitch);
      state.camera.position.set(
        focusSm.x - Math.sin(oc.yaw) * hd,
        Math.max(0.7, focusSm.y + LOOK_TARGET_Y + vd),
        focusSm.z + Math.cos(oc.yaw) * hd,
      );
      tmpVec3b.set(focusSm.x, focusSm.y + LOOK_TARGET_Y, focusSm.z);
      state.camera.lookAt(tmpVec3b);

      // Nearby blasts jolt the camera.
      let shake = 0;
      for (const e of engine.combat.explosions) {
        if (e.radius < 30 || e.t > 0.35) continue;
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        shake = Math.max(shake, (1 - e.t / 0.35) * Math.max(0, 1 - d / 400));
      }
      if (shake > 0) {
        state.camera.position.x += (Math.random() - 0.5) * 0.7 * shake;
        state.camera.position.y += (Math.random() - 0.5) * 0.5 * shake;
        state.camera.position.z += (Math.random() - 0.5) * 0.7 * shake;
      }
    }

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
    const cl = cityUniforms.uCityLight;
    cl.value += (CITY_LIGHT[weatherType] - cl.value) * L;

    // Fog mutation. Far is clamped just inside the streaming radius so
    // buildings pop in behind the fog instead of in plain view.
    const fog = state.scene.fog as THREE.Fog | null;
    if (fog) {
      const far = Math.min(lw.fogFar, engine.perf.drawDistance - 16);
      fog.far  = far;
      fog.near = Math.min(lw.fogNear, far - 40);
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

    // ─ Mini-map update (10 Hz, whatever the frame rate) ─────────────
    miniMapTick.current += dt;
    if (miniMapTick.current >= MINIMAP_PERIOD) {
      miniMapTick.current = 0;
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

      {/* Shadow camera bounds, aiming and texel snapping live in ShadowRig. */}
      <directionalLight
        ref={sunRef}
        position={cfg.sunPosition}
        intensity={cfg.sunIntensity}
        color={cfg.sunColor}
      />
      <ShadowRig
        engine={engine}
        sun={sunRef}
        sunPosition={cfg.sunPosition as unknown as [number, number, number]}
        half={graphics.shadowHalf}
        mapSize={graphics.shadowMapSize}
        enabled={graphics.shadowsEnabled}
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
      {showPrecip && graphics.particleCount > 0 && (
        <PrecipitationSystem
          key={graphics.particleCount}
          count={graphics.particleCount}
          type={cfg.particles as 'rain' | 'heavy_rain' | 'snow'}
          opacity={cfg.particleOpacity}
        />
      )}

      {/* ── Drone arena boundary ─────────────────────────────────── */}
      <DroneArenaMesh />

      {/* ── Military base (walls, gates, hangars) ────────────────── */}
      <MilitaryBaseMesh groupRef={baseRef} />

      {/* ── City ─────────────────────────────────────────────────── */}
      <CityScene world={engine.world} source={engine} playerGridX={playerGrid.x} playerGridY={playerGrid.y} />

      {/* ── Player vehicle or on-foot character ─────────────────── */}
      <PlayerCar
        ref={playerRef}
        color={playerVisual.color}
        isOnFoot={playerVisual.onFoot}
        vehicleType={playerVisual.type}
      />

      {/* ── Dispatched service helicopter ────────────────────────── */}
      <HelicopterMesh groupRef={helicopterRef} color="#78909c" />

      {/* ── NPC traffic (8 draw calls for the whole fleet) ───────── */}
      <InstancedCarFleet ref={fleetRef} />
      <ScooterPool ref={scooterRef} />

      {/* ── SWAT, army, police helicopters; shells and explosions ─── */}
      <LawFleet ref={lawRef} />
      <CombatEffects ref={fxRef} />

      {/* ── Pedestrians (3 draw calls for the whole crowd) ───────── */}
      <PedestrianMeshes ref={pedRef} castShadow={graphics.perfPatch.pedShadows ?? engine.perf.pedShadows} />

      {/* ── Mission pickup markers ───────────────────────────────── */}
      <MissionMarkers ref={markerRef} />

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

      {/* ── Race gate meshes ─────────────────────────────────────── */}
      <RaceGateMeshes
        course={engine.raceSession ? getCourse(engine.raceSession.courseId) : null}
        currentGateIndex={engine.raceSession?.currentGateIndex ?? 0}
        phase={engine.raceSession?.phase ?? 'idle'}
      />
    </>
  );
}
