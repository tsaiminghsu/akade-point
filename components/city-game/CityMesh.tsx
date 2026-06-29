'use client';
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldData, TileType, BuildingType, TILE_SIZE, GRID_SIZE, TILE_3D, FLOOR_HEIGHT_3D, WORLD_3D_HALF } from './types';

// ─── Ground texture ──────────────────────────────────────────────────────────

function tileColor(type: TileType, buildingType?: BuildingType): string {
  switch (type) {
    case TileType.ROAD_H:
    case TileType.ROAD_V:
    case TileType.INTERSECTION: return '#323245';
    case TileType.SIDEWALK: return '#4a4a5e';
    case TileType.PARK: return '#22442d';
    case TileType.PARKING: return '#3d3d52';
    case TileType.BUILDING: return buildingType === BuildingType.HOUSE ? '#3d2e27' : '#252538';
    case TileType.HELIPAD: return '#553f00';
    default: return '#1d1d2d';
  }
}

function buildingRGB(floors: number, seed: number, btype?: BuildingType): [number, number, number] {
  const h = (seed * 137) % 360;
  if (btype === BuildingType.HOUSE) {
    return [0.65 + Math.sin(seed) * 0.08, 0.50 + Math.cos(seed) * 0.06, 0.40];
  }
  if (floors >= 15) return [0.55 + Math.sin(seed * 0.7) * 0.08, 0.62 + Math.cos(seed * 0.5) * 0.08, 0.78 + Math.sin(seed) * 0.1];
  if (floors >= 8)  return [0.50 + Math.sin(seed * 0.3) * 0.06, 0.55 + Math.cos(seed * 0.4) * 0.06, 0.68 + Math.sin(seed * 0.6) * 0.08];
  if (floors >= 4)  return [0.55 + Math.sin(h) * 0.06, 0.48 + Math.cos(h) * 0.05, 0.52];
  return [0.52 + Math.sin(seed * 0.5) * 0.06, 0.44, 0.42 + Math.cos(seed * 0.5) * 0.05];
}

// ─── Ground Plane (CanvasTexture) ─────────────────────────────────────────────

export function CityGround({ world }: { world: WorldData }) {
  const texture = useMemo(() => {
    const TEX = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = TEX; canvas.height = TEX;
    const ctx = canvas.getContext('2d')!;
    const step = TEX / GRID_SIZE;

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const tile = world.grid[gy][gx];
        ctx.fillStyle = tileColor(tile.type, tile.buildingType);
        ctx.fillRect(gx * step, gy * step, step + 0.5, step + 0.5);

        // Road center line dashes
        if (tile.type === TileType.ROAD_H) {
          ctx.fillStyle = 'rgba(255,220,0,0.35)';
          ctx.fillRect(gx * step, gy * step + step * 0.47, step, step * 0.06);
        } else if (tile.type === TileType.ROAD_V) {
          ctx.fillStyle = 'rgba(255,220,0,0.35)';
          ctx.fillRect(gx * step + step * 0.47, gy * step, step * 0.06, step);
        }

        // Helipad H marker
        if (tile.type === TileType.HELIPAD) {
          ctx.fillStyle = 'rgba(255,220,0,0.7)';
          ctx.font = `bold ${Math.round(step * 0.7)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('H', gx * step + step / 2, gy * step + step * 0.8);
        }

        // Shop sign colour strip
        if (tile.shopName) {
          ctx.fillStyle = 'rgba(255,100,0,0.5)';
          ctx.fillRect(gx * step, gy * step + step - step * 0.18, step, step * 0.18);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    return tex;
  }, [world]);

  const worldSz = GRID_SIZE * TILE_3D;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
      <planeGeometry args={[worldSz, worldSz, 1, 1]} />
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0.0} />
    </mesh>
  );
}

// ─── Buildings (InstancedMesh) ────────────────────────────────────────────────

const MAX_BUILDINGS = 7000;
const tmpMat4 = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpColor = new THREE.Color();

export function CityBuildings({ world }: { world: WorldData }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let idx = 0;

    for (let gy = 0; gy < GRID_SIZE && idx < MAX_BUILDINGS; gy++) {
      for (let gx = 0; gx < GRID_SIZE && idx < MAX_BUILDINGS; gx++) {
        const tile = world.grid[gy][gx];
        if (tile.type !== TileType.BUILDING && tile.type !== TileType.HELIPAD) continue;

        const floors = tile.floors ?? 1;
        const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const footprint = tile.buildingType === BuildingType.HOUSE ? TILE_3D * 0.72 : TILE_3D * 0.88;

        tmpPos.set(cx, h / 2, cz);
        tmpScale.set(footprint, h, footprint);
        tmpMat4.compose(tmpPos, tmpQuat, tmpScale);
        mesh.setMatrixAt(idx, tmpMat4);

        const [r, g, b] = buildingRGB(floors, tile.colorSeed ?? 0, tile.buildingType);
        tmpColor.setRGB(r, g, b);
        mesh.setColorAt(idx, tmpColor);
        idx++;
      }
    }

    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [world]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_BUILDINGS]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        roughness={0.72}
        metalness={0.15}
        vertexColors
        emissive={new THREE.Color(0.06, 0.06, 0.10)}
        emissiveIntensity={1}
      />
    </instancedMesh>
  );
}

// ─── Window lights (emissive quads on building faces) ────────────────────────

const MAX_WINDOW_SETS = 12000;

export function BuildingWindows({ world }: { world: WorldData }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let idx = 0;
    const winQuat = new THREE.Quaternion();

    for (let gy = 0; gy < GRID_SIZE && idx < MAX_WINDOW_SETS; gy++) {
      for (let gx = 0; gx < GRID_SIZE && idx < MAX_WINDOW_SETS; gx++) {
        const tile = world.grid[gy][gx];
        if (tile.type !== TileType.BUILDING) continue;

        const floors = tile.floors ?? 1;
        if (floors < 3) continue; // skip small buildings

        const h = floors * FLOOR_HEIGHT_3D;
        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const fp = TILE_3D * 0.88;

        const facing = [
          [cx, h * 0.5, cz + fp / 2 + 0.01, 0],
          [cx, h * 0.5, cz - fp / 2 - 0.01, Math.PI],
          [cx + fp / 2 + 0.01, h * 0.5, cz, -Math.PI / 2],
          [cx - fp / 2 - 0.01, h * 0.5, cz, Math.PI / 2],
        ];

        for (const [fx, fy, fz, ry] of facing) {
          if (idx >= MAX_WINDOW_SETS) break;
          winQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
          tmpPos.set(fx, fy as number, fz);
          tmpScale.set(fp * 0.9, h * 0.9, 0.01);
          tmpMat4.compose(tmpPos, winQuat, tmpScale);
          mesh.setMatrixAt(idx, tmpMat4);

          const warmness = 0.6 + ((tile.colorSeed ?? 0) % 10) * 0.04;
          tmpColor.setRGB(warmness * 0.5, warmness * 0.4, warmness * 0.15);
          mesh.setColorAt(idx, tmpColor);
          idx++;
        }
      }
    }

    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [world]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_WINDOW_SETS]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        vertexColors
        emissive={new THREE.Color(1, 0.8, 0.3)}
        emissiveIntensity={1.5}
        transparent
        opacity={0.85}
        alphaTest={0.1}
        side={THREE.FrontSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ─── Trees (instanced) ────────────────────────────────────────────────────────

const MAX_TREES = 800;

export function CityTrees({ world, playerGridX, playerGridY }: { world: WorldData; playerGridX: number; playerGridY: number }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const leafRef  = useRef<THREE.InstancedMesh>(null);
  const R = 25;

  useEffect(() => {
    const trunk = trunkRef.current;
    const leaf  = leafRef.current;
    if (!trunk || !leaf) return;

    let idx = 0;
    const tScale = new THREE.Vector3();
    const lScale = new THREE.Vector3();

    for (let gy = Math.max(0, playerGridY - R); gy < Math.min(GRID_SIZE, playerGridY + R + 1) && idx < MAX_TREES; gy++) {
      for (let gx = Math.max(0, playerGridX - R); gx < Math.min(GRID_SIZE, playerGridX + R + 1) && idx < MAX_TREES; gx++) {
        const tile = world.grid[gy][gx];
        if (tile.type !== TileType.PARK) continue;
        if ((gx + gy * 3) % 3 !== 0) continue; // thin out

        const seed = tile.colorSeed ?? (gx * 7 + gy * 13);
        const off = (seed % 5) * 0.3 - 0.6;
        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF + off;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF + off;

        const tH = 1.2 + (seed % 5) * 0.3;
        const lH = 1.5 + (seed % 4) * 0.4;
        const lR = 0.9 + (seed % 3) * 0.3;

        // Trunk
        tmpPos.set(cx, tH / 2, cz);
        tScale.set(0.18, tH, 0.18);
        tmpMat4.compose(tmpPos, tmpQuat, tScale);
        trunk.setMatrixAt(idx, tmpMat4);

        // Leaf canopy
        tmpPos.set(cx, tH + lH / 2, cz);
        lScale.set(lR * 2, lH, lR * 2);
        tmpMat4.compose(tmpPos, tmpQuat, lScale);
        leaf.setMatrixAt(idx, tmpMat4);

        idx++;
      }
    }

    trunk.count = leaf.count = idx;
    trunk.instanceMatrix.needsUpdate = true;
    leaf.instanceMatrix.needsUpdate  = true;
  }, [world, playerGridX, playerGridY]);

  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, MAX_TREES]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color="#3d2b1a" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, MAX_TREES]} castShadow>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial color="#1a4a20" roughness={0.9} />
      </instancedMesh>
    </>
  );
}

// ─── Street Lights ────────────────────────────────────────────────────────────

const MAX_LIGHTS = 300;

export function StreetLights({ world, playerGridX, playerGridY }: { world: WorldData; playerGridX: number; playerGridY: number }) {
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const R = 25;

  useEffect(() => {
    const mesh = poleRef.current;
    if (!mesh) return;

    let idx = 0;
    const pScale = new THREE.Vector3(0.12, 3.5, 0.12);

    const startGy = Math.floor(Math.max(0, playerGridY - R) / 4) * 4;
    const startGx = Math.floor(Math.max(0, playerGridX - R) / 4) * 4;

    for (let gy = startGy; gy < Math.min(GRID_SIZE, playerGridY + R + 1) && idx < MAX_LIGHTS; gy += 4) {
      for (let gx = startGx; gx < Math.min(GRID_SIZE, playerGridX + R + 1) && idx < MAX_LIGHTS; gx += 4) {
        const tile = world.grid[gy]?.[gx];
        if (!tile) continue;
        if (tile.type !== TileType.SIDEWALK && tile.type !== TileType.INTERSECTION) continue;

        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        tmpPos.set(cx, 1.75, cz);
        tmpMat4.compose(tmpPos, tmpQuat, pScale);
        mesh.setMatrixAt(idx, tmpMat4);
        idx++;
      }
    }
    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
  }, [world, playerGridX, playerGridY]);

  return (
    <instancedMesh ref={poleRef} args={[undefined, undefined, MAX_LIGHTS]} castShadow>
      <cylinderGeometry args={[1, 1, 1, 5]} />
      <meshStandardMaterial color="#444455" roughness={0.5} metalness={0.7} />
    </instancedMesh>
  );
}

// ─── Town Hall 3D ─────────────────────────────────────────────────────────────

export function TownHall3D({ world }: { world: WorldData }) {
  const pos = world.townHallPos;
  // Convert world coords to 3D scene coords
  const cx = pos.x * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;
  const cz = pos.y * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;

  return (
    <group position={[cx, 0, cz]}>
      {/* Main building body */}
      <mesh position={[0, 7, 0]} castShadow receiveShadow>
        <boxGeometry args={[18, 14, 18]} />
        <meshStandardMaterial color="#c8bfa8" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Upper tier / dome base */}
      <mesh position={[0, 15.5, 0]} castShadow>
        <boxGeometry args={[12, 3, 12]} />
        <meshStandardMaterial color="#b8b0a0" roughness={0.55} metalness={0.1} />
      </mesh>

      {/* Dome */}
      <mesh position={[0, 20, 0]} castShadow>
        <sphereGeometry args={[5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#7ba7c7" roughness={0.3} metalness={0.5} />
      </mesh>

      {/* Dome lantern (top) */}
      <mesh position={[0, 25.5, 0]} castShadow>
        <cylinderGeometry args={[0.8, 1.2, 3, 8]} />
        <meshStandardMaterial color="#7ba7c7" metalness={0.6} roughness={0.2} />
      </mesh>

      {/* Flag pole */}
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 8, 6]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Flag */}
      <mesh position={[1.2, 33, 0]}>
        <boxGeometry args={[2.4, 1.4, 0.05]} />
        <meshStandardMaterial color="#e63946" emissive="#c00" emissiveIntensity={0.15} roughness={0.9} />
      </mesh>

      {/* Front columns — south face */}
      {([-5.5, -2.5, 2.5, 5.5] as number[]).map((xo, i) => (
        <mesh key={i} position={[xo, 5.5, -9.5]} castShadow>
          <cylinderGeometry args={[0.6, 0.7, 11, 10]} />
          <meshStandardMaterial color="#d8d0c0" roughness={0.7} metalness={0.05} />
        </mesh>
      ))}

      {/* Pediment / triangular gable */}
      <mesh position={[0, 12.5, -9.4]} castShadow>
        <boxGeometry args={[15, 2.5, 0.5]} />
        <meshStandardMaterial color="#c2b8a5" roughness={0.65} />
      </mesh>

      {/* Entrance steps (south) */}
      {([0, 1, 2] as number[]).map((step) => (
        <mesh key={step} position={[0, step * 0.4, -9 - step * 0.7]} receiveShadow>
          <boxGeometry args={[12 - step * 1.5, 0.4, 1.2]} />
          <meshStandardMaterial color="#ccc5b2" roughness={0.85} />
        </mesh>
      ))}

      {/* Side wings */}
      <mesh position={[-11, 4.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 9, 10]} />
        <meshStandardMaterial color="#c4ba9e" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[11, 4.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 9, 10]} />
        <meshStandardMaterial color="#c4ba9e" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Sign board above entrance */}
      <mesh position={[0, 9.5, -9.7]}>
        <boxGeometry args={[8, 1.2, 0.15]} />
        <meshStandardMaterial color="#1a2e4a" emissive="#1a3a6a" emissiveIntensity={0.5} roughness={0.5} />
      </mesh>

      {/* Warm entrance glow */}
      <pointLight position={[0, 4, -9]} color="#ffe8aa" intensity={2.5} distance={14} decay={2} />
      <pointLight position={[0, 26, 0]} color="#a0c8ff" intensity={3} distance={30} decay={2} />
    </group>
  );
}

// ─── Boundary Walls ───────────────────────────────────────────────────────────

export function BoundaryWalls() {
  const wallHeight = 18;
  const halfHeight = wallHeight / 2;
  const thickness = 2;
  const size = GRID_SIZE * TILE_3D; // 320

  // Pillar positions along one side
  const pillarIntervals = Array.from({ length: Math.floor(size / 16) + 1 }, (_, i) => -size / 2 + i * 16);

  return (
    <group>
      {/* North Wall */}
      <mesh position={[0, halfHeight, -size / 2]} castShadow receiveShadow>
        <boxGeometry args={[size + thickness, wallHeight, thickness]} />
        <meshStandardMaterial color="#1a1e29" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* North Wall Neon strip */}
      <mesh position={[0, 12, -size / 2 + thickness / 2 + 0.05]}>
        <boxGeometry args={[size, 0.3, 0.1]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.8} roughness={0.1} />
      </mesh>
      {/* North Wall Pillars */}
      {pillarIntervals.map((x, i) => (
        <mesh key={`np-${i}`} position={[x, halfHeight + 0.5, -size / 2 + thickness / 2 + 0.2]} castShadow>
          <boxGeometry args={[1.2, wallHeight + 1.0, 1.0]} />
          <meshStandardMaterial color="#0c0f16" roughness={0.6} metalness={0.8} />
        </mesh>
      ))}

      {/* South Wall */}
      <mesh position={[0, halfHeight, size / 2]} castShadow receiveShadow>
        <boxGeometry args={[size + thickness, wallHeight, thickness]} />
        <meshStandardMaterial color="#1a1e29" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* South Wall Neon strip */}
      <mesh position={[0, 12, size / 2 - thickness / 2 - 0.05]}>
        <boxGeometry args={[size, 0.3, 0.1]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.8} roughness={0.1} />
      </mesh>
      {/* South Wall Pillars */}
      {pillarIntervals.map((x, i) => (
        <mesh key={`sp-${i}`} position={[x, halfHeight + 0.5, size / 2 - thickness / 2 - 0.2]} castShadow>
          <boxGeometry args={[1.2, wallHeight + 1.0, 1.0]} />
          <meshStandardMaterial color="#0c0f16" roughness={0.6} metalness={0.8} />
        </mesh>
      ))}

      {/* West Wall */}
      <mesh position={[-size / 2, halfHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, wallHeight, size + thickness]} />
        <meshStandardMaterial color="#1a1e29" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* West Wall Neon strip */}
      <mesh position={[-size / 2 + thickness / 2 + 0.05, 12, 0]}>
        <boxGeometry args={[0.1, 0.3, size]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.8} roughness={0.1} />
      </mesh>
      {/* West Wall Pillars */}
      {pillarIntervals.map((z, i) => (
        <mesh key={`wp-${i}`} position={[-size / 2 + thickness / 2 + 0.2, halfHeight + 0.5, z]} castShadow>
          <boxGeometry args={[1.0, wallHeight + 1.0, 1.2]} />
          <meshStandardMaterial color="#0c0f16" roughness={0.6} metalness={0.8} />
        </mesh>
      ))}

      {/* East Wall */}
      <mesh position={[size / 2, halfHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, wallHeight, size + thickness]} />
        <meshStandardMaterial color="#1a1e29" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* East Wall Neon strip */}
      <mesh position={[size / 2 - thickness / 2 - 0.05, 12, 0]}>
        <boxGeometry args={[0.1, 0.3, size]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.8} roughness={0.1} />
      </mesh>
      {/* East Wall Pillars */}
      {pillarIntervals.map((z, i) => (
        <mesh key={`ep-${i}`} position={[size / 2 - thickness / 2 - 0.2, halfHeight + 0.5, z]} castShadow>
          <boxGeometry args={[1.0, wallHeight + 1.0, 1.2]} />
          <meshStandardMaterial color="#0c0f16" roughness={0.6} metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Robot Police Patrol In Sky ──────────────────────────────────────────────

export function PolicePatrol() {
  const count = 3;
  const groupRefs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];
  const sirenRefs = [
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
  ];

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    groupRefs.forEach((ref, idx) => {
      const g = ref.current;
      if (!g) return;

      // Make them fly in different circles/paths around the city center
      const radius = 50 + idx * 45;
      const speed = 0.12 + idx * 0.03;
      const direction = idx % 2 === 0 ? 1 : -1;
      
      const angle = elapsed * speed * direction + idx * (Math.PI * 2 / count);
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 20 + idx * 4 + Math.sin(elapsed * 1.5 + idx) * 1.5; // fly height with bobbing

      g.position.set(x, y, z);
      
      // Face the direction of motion
      g.rotation.y = -angle + (direction > 0 ? 0 : Math.PI);

      // Searchlight sweeping movement
      const searchlight = g.getObjectByName('searchlight');
      if (searchlight) {
        searchlight.rotation.z = Math.sin(elapsed * 2.0 + idx) * 0.25;
        searchlight.rotation.x = Math.cos(elapsed * 1.5 + idx) * 0.25;
      }
    });

    // Flashing sirens (red and blue alternating)
    sirenRefs.forEach((ref, idx) => {
      const m = ref.current;
      if (!m) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat) {
        const flash = Math.floor(elapsed * 10) % 2 === 0;
        mat.emissiveIntensity = flash ? 3.0 : 0.2;
      }
    });
  });

  return (
    <group>
      {Array.from({ length: count }).map((_, idx) => (
        <group ref={groupRefs[idx]} key={idx}>
          {/* Main sleek spaceship chassis */}
          <mesh castShadow>
            <boxGeometry args={[1.5, 0.4, 2.5]} />
            <meshStandardMaterial color="#0b0f19" roughness={0.3} metalness={0.8} />
          </mesh>

          {/* Cockpit visor/glass (futuristic glowing yellow visor) */}
          <mesh position={[0, 0.1, -0.8]}>
            <boxGeometry args={[1.0, 0.25, 0.4]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.2} />
          </mesh>

          {/* Engines (back) */}
          <mesh position={[-0.5, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} />
          </mesh>
          <mesh position={[-0.5, 0, 1.45]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
            <meshStandardMaterial color="#ff5722" emissive="#ff5722" emissiveIntensity={3} />
          </mesh>
          
          <mesh position={[0.5, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} />
          </mesh>
          <mesh position={[0.5, 0, 1.45]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
            <meshStandardMaterial color="#ff5722" emissive="#ff5722" emissiveIntensity={3} />
          </mesh>

          {/* Left Police Siren (Blue) */}
          <mesh position={[-0.4, 0.25, 0]} ref={idx === 0 ? sirenRefs[0] : idx === 1 ? sirenRefs[1] : sirenRefs[2]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color="#0022ff" emissive="#0022ff" emissiveIntensity={1.5} />
          </mesh>
          {/* Right Police Siren (Red) */}
          <mesh position={[0.4, 0.25, 0]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1.5} />
          </mesh>

          {/* Side wings */}
          <mesh position={[-1.0, -0.05, 0]} rotation={[0, 0, -0.1]}>
            <boxGeometry args={[0.8, 0.1, 1.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.7} />
          </mesh>
          <mesh position={[1.0, -0.05, 0]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.8, 0.1, 1.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.7} />
          </mesh>

          {/* Searchlight Cone and Light Sweep */}
          <group name="searchlight" position={[0, -0.2, -0.5]}>
            {/* The lens */}
            <mesh>
              <sphereGeometry args={[0.18, 8, 8]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
            </mesh>
            {/* Cone representing light beam */}
            <mesh position={[0, -8.0, 0]} rotation={[0, 0, 0]}>
              <cylinderGeometry args={[0.15, 2.5, 16.0, 16, 1, true]} />
              <meshBasicMaterial color="#a0e0ff" transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// ─── Combined City Scene ──────────────────────────────────────────────────────

export default function CityScene({ world, playerGridX, playerGridY }: { world: WorldData; playerGridX: number; playerGridY: number }) {
  return (
    <group>
      <CityGround world={world} />
      <CityBuildings world={world} />
      <BuildingWindows world={world} />
      <CityTrees world={world} playerGridX={playerGridX} playerGridY={playerGridY} />
      <StreetLights world={world} playerGridX={playerGridX} playerGridY={playerGridY} />
      <TownHall3D world={world} />
      <BoundaryWalls />
      <PolicePatrol />
    </group>
  );
}
