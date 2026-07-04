'use client';
import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldData, TileType, BuildingType, TILE_SIZE, GRID_SIZE, TILE_3D, FLOOR_HEIGHT_3D, WORLD_3D_HALF } from './types';

// ─── Realistic building facade textures ──────────────────────────────────────

type FacadeType = 'skyscraper' | 'office' | 'commercial' | 'house';

function createFacadeColorTex(type: FacadeType): THREE.CanvasTexture {
  const W = 64, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (type === 'skyscraper') {
    // Glass curtain wall — 1 window bay × 1 floor
    ctx.fillStyle = '#0e1520';
    ctx.fillRect(0, 0, W, H);
    // Top floor divider / spandrel band
    ctx.fillStyle = '#111a28';
    ctx.fillRect(0, 0, W, 7);
    // Column frames (left 4px, right 4px)
    ctx.fillStyle = '#1a2335';
    ctx.fillRect(0, 0, 4, H);
    ctx.fillRect(60, 0, 4, H);
    // Glass with blue gradient
    const gS = ctx.createLinearGradient(4, 7, 60, H);
    gS.addColorStop(0, '#5080b8');
    gS.addColorStop(0.4, '#3a6090');
    gS.addColorStop(1, '#1e3a68');
    ctx.fillStyle = gS;
    ctx.fillRect(4, 7, 56, H - 7);
    // Reflection highlight (left edge of glass)
    ctx.fillStyle = 'rgba(180,220,255,0.14)';
    ctx.fillRect(4, 7, 10, H - 7);
    // Horizontal mullion mid-floor
    ctx.fillStyle = 'rgba(10,18,30,0.55)';
    ctx.fillRect(4, 36, 56, 1);

  } else if (type === 'office') {
    // Concrete spandrel + glass — 1 bay × 1 floor
    ctx.fillStyle = '#38404a';
    ctx.fillRect(0, 0, W, H);
    // Concrete spandrel top 10px
    ctx.fillStyle = '#303840';
    ctx.fillRect(0, 0, W, 10);
    // Column piers
    ctx.fillStyle = '#404850';
    ctx.fillRect(0, 0, 6, H);
    ctx.fillRect(58, 0, 6, H);
    // Glass
    const gO = ctx.createLinearGradient(6, 10, 58, H - 4);
    gO.addColorStop(0, '#3e6080');
    gO.addColorStop(0.5, '#2a4e6e');
    gO.addColorStop(1, '#1a3050');
    ctx.fillStyle = gO;
    ctx.fillRect(6, 10, 52, H - 14);
    // Subtle reflection
    ctx.fillStyle = 'rgba(160,200,230,0.10)';
    ctx.fillRect(6, 10, 14, H - 14);
    // Window sill
    ctx.fillStyle = '#2e3840';
    ctx.fillRect(6, H - 4, 52, 4);

  } else if (type === 'commercial') {
    // Concrete/brick wall with punched window opening
    ctx.fillStyle = '#484648';
    ctx.fillRect(0, 0, W, H);
    // Brick rows (staggered)
    for (let row = 0; row < 5; row++) {
      const off = row % 2 === 0 ? 0 : 8;
      for (let col = -1; col < 5; col++) {
        const bx = col * 16 + off;
        const by = row * 13;
        const shade = ((row * 3 + col * 7) % 5) * 4;
        const br = 64 + shade;
        ctx.fillStyle = `rgb(${br + 8},${br},${br - 6})`;
        ctx.fillRect(bx + 1, by + 1, 14, 11);
      }
    }
    // Window punch-out
    ctx.fillStyle = '#1e2530';
    ctx.fillRect(10, 12, 44, 36);
    // Window frame
    ctx.fillStyle = '#252020';
    ctx.fillRect(10, 12, 44, 2);
    ctx.fillRect(10, 46, 44, 2);
    ctx.fillRect(10, 12, 2, 36);
    ctx.fillRect(52, 12, 2, 36);
    // Central divider
    ctx.fillRect(30, 12, 2, 36);
    // Glass
    const gC = ctx.createLinearGradient(12, 14, 52, 46);
    gC.addColorStop(0, '#2e5070');
    gC.addColorStop(1, '#1a3050');
    ctx.fillStyle = gC;
    ctx.fillRect(12, 14, 18, 30);
    ctx.fillRect(32, 14, 18, 30);

  } else { // house
    // Warm brick residential
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(0, 0, W, H);
    // Brick pattern
    for (let row = 0; row < 8; row++) {
      const off = row % 2 === 0 ? 0 : 10;
      for (let col = -1; col < 5; col++) {
        const bx = col * 20 + off;
        const by = row * 8;
        const bright = (row + col * 3) % 3;
        const br = 90 + bright * 8;
        ctx.fillStyle = `rgb(${br + 10},${br - 8},${br - 20})`;
        ctx.fillRect(bx + 1, by + 1, 18, 6);
      }
    }
    // Two small windows (left + right)
    for (const wx of [6, 36]) {
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(wx, 10, 22, 22);
      const gH = ctx.createLinearGradient(wx, 10, wx + 22, 32);
      gH.addColorStop(0, '#a8c0d0');
      gH.addColorStop(1, '#7090a8');
      ctx.fillStyle = gH;
      ctx.fillRect(wx + 2, 12, 18, 18);
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(wx + 10, 12, 2, 18);
      ctx.fillRect(wx + 2, 20, 18, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

function createFacadeEmissiveTex(type: FacadeType): THREE.CanvasTexture {
  const W = 64, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  if (type === 'skyscraper') {
    ctx.fillStyle = '#18284a';
    ctx.fillRect(4, 7, 56, H - 7);
  } else if (type === 'office') {
    ctx.fillStyle = '#121c2e';
    ctx.fillRect(6, 10, 52, H - 14);
  } else if (type === 'commercial') {
    ctx.fillStyle = '#0c1218';
    ctx.fillRect(12, 14, 18, 30);
    ctx.fillRect(32, 14, 18, 30);
  } else { // house
    ctx.fillStyle = '#281808';
    ctx.fillRect(8, 12, 18, 18);
    ctx.fillRect(38, 12, 18, 18);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Ground texture ──────────────────────────────────────────────────────────

function tileColor(type: TileType, buildingType?: BuildingType): string {
  switch (type) {
    case TileType.ROAD_H:
    case TileType.ROAD_V:
    case TileType.INTERSECTION: return '#606078';
    case TileType.SIDEWALK: return '#747488';
    case TileType.PARK: return '#22442d';
    case TileType.PARKING: return '#3d3d52';
    case TileType.BUILDING: return buildingType === BuildingType.HOUSE ? '#3d2e27' : '#252538';
    case TileType.HELIPAD: return '#553f00';
    default: return '#1d1d2d';
  }
}

function facadeVertexColor(floors: number, seed: number, btype?: BuildingType): [number, number, number] {
  if (btype === BuildingType.HOUSE) {
    const v: [number,number,number][] = [
      [1.00, 0.88, 0.72], // warm tan brick
      [0.95, 0.72, 0.62], // red-brown brick
      [0.88, 0.88, 0.85], // light stone
      [1.00, 0.96, 0.80], // cream sandstone
    ];
    return v[seed % 4];
  }
  if (floors >= 15) {
    // Skyscrapers: slight blue/teal/silver tint variation
    const t = (seed % 8) / 8;
    return [0.80 + t * 0.12, 0.90 + t * 0.06, 1.00] as [number,number,number];
  }
  if (floors >= 8) {
    // Office: blue-gray range
    const t = (seed % 6) / 6;
    return [0.82 + t * 0.10, 0.88 + t * 0.08, 0.96 + t * 0.04] as [number,number,number];
  }
  // Commercial: warm-to-cool concrete range
  const t = (seed % 5) / 5;
  return [0.88 + t * 0.08, 0.84 + t * 0.10, 0.80 + t * 0.12] as [number,number,number];
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
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0.0}
        emissive="#252545" emissiveIntensity={0.80} />
    </mesh>
  );
}

// ─── Buildings (split by category for per-type facade materials) ──────────────

const MAX_SKYSCRAPER = 1200;
const MAX_OFFICE     = 2000;
const MAX_COMMERCIAL = 2500;
const MAX_HOUSE      = 1800;

const tmpMat4 = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpColor = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export function CityBuildings({ world }: { world: WorldData }) {
  const skyRef = useRef<THREE.InstancedMesh>(null);
  const offRef = useRef<THREE.InstancedMesh>(null);
  const comRef = useRef<THREE.InstancedMesh>(null);
  const houRef = useRef<THREE.InstancedMesh>(null);

  const textures = useMemo(() => ({
    sky: { map: createFacadeColorTex('skyscraper'), em: createFacadeEmissiveTex('skyscraper') },
    off: { map: createFacadeColorTex('office'),     em: createFacadeEmissiveTex('office')     },
    com: { map: createFacadeColorTex('commercial'), em: createFacadeEmissiveTex('commercial') },
    hou: { map: createFacadeColorTex('house'),      em: createFacadeEmissiveTex('house')      },
  }), []);

  useEffect(() => {
    textures.sky.map.repeat.set(3, 12); textures.sky.em.repeat.set(3, 12);
    textures.off.map.repeat.set(3, 8);  textures.off.em.repeat.set(3, 8);
    textures.com.map.repeat.set(2, 5);  textures.com.em.repeat.set(2, 5);
    textures.hou.map.repeat.set(2, 2);  textures.hou.em.repeat.set(2, 2);
  }, [textures]);

  useEffect(() => {
    const meshes = { sky: skyRef.current, off: offRef.current, com: comRef.current, hou: houRef.current };
    if (!meshes.sky || !meshes.off || !meshes.com || !meshes.hou) return;

    const counts = { sky: 0, off: 0, com: 0, hou: 0 };
    const maxes  = { sky: MAX_SKYSCRAPER, off: MAX_OFFICE, com: MAX_COMMERCIAL, hou: MAX_HOUSE };

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const tile = world.grid[gy][gx];
        if (tile.type !== TileType.BUILDING && tile.type !== TileType.HELIPAD) continue;

        const floors = tile.floors ?? 1;
        const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const seed = tile.colorSeed ?? 0;

        let cat: 'sky' | 'off' | 'com' | 'hou';
        let fp: number;

        if (tile.buildingType === BuildingType.HOUSE) {
          cat = 'hou'; fp = TILE_3D * 0.72;
        } else if (floors >= 15) {
          cat = 'sky'; fp = TILE_3D * 0.88;
        } else if (floors >= 8) {
          cat = 'off'; fp = TILE_3D * 0.88;
        } else {
          cat = 'com'; fp = TILE_3D * 0.88;
        }

        if (counts[cat] >= maxes[cat]) continue;

        tmpPos.set(cx, h / 2, cz);
        tmpScale.set(fp, h, fp);
        tmpMat4.compose(tmpPos, tmpQuat, tmpScale);
        meshes[cat]!.setMatrixAt(counts[cat], tmpMat4);

        const [r, g, b] = facadeVertexColor(floors, seed, tile.buildingType);
        tmpColor.setRGB(r, g, b);
        meshes[cat]!.setColorAt(counts[cat], tmpColor);
        counts[cat]++;
      }
    }

    for (const cat of ['sky', 'off', 'com', 'hou'] as const) {
      const m = meshes[cat]!;
      m.count = counts[cat];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [world]);

  return (
    <>
      <instancedMesh ref={skyRef} args={[undefined, undefined, MAX_SKYSCRAPER]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={textures.sky.map} emissiveMap={textures.sky.em}
          emissive={WHITE} emissiveIntensity={1.0} roughness={0.20} metalness={0.35} vertexColors />
      </instancedMesh>

      <instancedMesh ref={offRef} args={[undefined, undefined, MAX_OFFICE]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={textures.off.map} emissiveMap={textures.off.em}
          emissive={WHITE} emissiveIntensity={0.85} roughness={0.55} metalness={0.15} vertexColors />
      </instancedMesh>

      <instancedMesh ref={comRef} args={[undefined, undefined, MAX_COMMERCIAL]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={textures.com.map} emissiveMap={textures.com.em}
          emissive={WHITE} emissiveIntensity={0.65} roughness={0.75} metalness={0.05} vertexColors />
      </instancedMesh>

      <instancedMesh ref={houRef} args={[undefined, undefined, MAX_HOUSE]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={textures.hou.map} emissiveMap={textures.hou.em}
          emissive={WHITE} emissiveIntensity={0.75} roughness={0.85} metalness={0.0} vertexColors />
      </instancedMesh>
    </>
  );
}

// ─── Minecraft Roofs (block caps on buildings) ───────────────────────────────

const MAX_ROOF_BASE = 3500;
const MAX_ROOF_PEAK = 2000;

function roofBaseColor(floors: number, seed: number, btype?: BuildingType): THREE.Color {
  if (btype === BuildingType.HOUSE) {
    return seed % 2 === 0 ? new THREE.Color('#5c2a18') : new THREE.Color('#3d2810');
  }
  if (floors >= 15) return new THREE.Color('#0a1820');
  if (floors >= 8)  return new THREE.Color('#1a2030');
  if (floors >= 4)  return new THREE.Color('#2a2830');
  return new THREE.Color('#222230');
}

export function MinecraftRoofs({ world }: { world: WorldData }) {
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const peakRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const baseMesh = baseRef.current;
    const peakMesh = peakRef.current;
    if (!baseMesh || !peakMesh) return;

    let bIdx = 0, pIdx = 0;
    const bScale = new THREE.Vector3();
    const pScale = new THREE.Vector3();

    for (let gy = 0; gy < GRID_SIZE && bIdx < MAX_ROOF_BASE; gy++) {
      for (let gx = 0; gx < GRID_SIZE && bIdx < MAX_ROOF_BASE; gx++) {
        const tile = world.grid[gy][gx];
        if (tile.type !== TileType.BUILDING && tile.type !== TileType.HELIPAD) continue;

        const floors = tile.floors ?? 1;
        const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const footprint = tile.buildingType === BuildingType.HOUSE ? TILE_3D * 0.72 : TILE_3D * 0.88;
        const seed = tile.colorSeed ?? 0;

        // Base roof cap: slight overhang, 0.5 tall
        tmpPos.set(cx, h + 0.25, cz);
        bScale.set(footprint * 1.08, 0.5, footprint * 1.08);
        tmpMat4.compose(tmpPos, tmpQuat, bScale);
        baseMesh.setMatrixAt(bIdx, tmpMat4);
        baseMesh.setColorAt(bIdx, roofBaseColor(floors, seed, tile.buildingType));
        bIdx++;

        // Peak cap: houses only — stepped second layer
        if (tile.buildingType === BuildingType.HOUSE && pIdx < MAX_ROOF_PEAK) {
          tmpPos.set(cx, h + 0.75, cz);
          pScale.set(footprint * 0.62, 0.5, footprint * 0.62);
          tmpMat4.compose(tmpPos, tmpQuat, pScale);
          peakMesh.setMatrixAt(pIdx, tmpMat4);
          peakMesh.setColorAt(pIdx, new THREE.Color(seed % 2 === 0 ? '#3d1a0a' : '#251808'));
          pIdx++;
        }
      }
    }

    baseMesh.count = bIdx;
    baseMesh.instanceMatrix.needsUpdate = true;
    if (baseMesh.instanceColor) baseMesh.instanceColor.needsUpdate = true;

    peakMesh.count = pIdx;
    peakMesh.instanceMatrix.needsUpdate = true;
    if (peakMesh.instanceColor) peakMesh.instanceColor.needsUpdate = true;
  }, [world]);

  return (
    <>
      <instancedMesh ref={baseRef} args={[undefined, undefined, MAX_ROOF_BASE]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.9} metalness={0.05}
          emissive={new THREE.Color(0.05, 0.04, 0.04)} emissiveIntensity={1} />
      </instancedMesh>
      <instancedMesh ref={peakRef} args={[undefined, undefined, MAX_ROOF_PEAK]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.03}
          emissive={new THREE.Color(0.04, 0.03, 0.03)} emissiveIntensity={1} />
      </instancedMesh>
    </>
  );
}

// ─── BuildingWindows: replaced by emissiveMap in CityBuildings materials ─────
// Window lighting is now baked into the facade emissive texture per building
// category (skyscraper/office/commercial/house), removing the large per-face
// emissive plane that caused the "glowing stripe" appearance.
export function BuildingWindows(_props: { world: WorldData }) {
  return null;
}

// ─── House Details (individual windows + door for 1-floor houses) ────────────

const MAX_HOUSE_WINDOWS = 2000;
const MAX_HOUSE_DOORS   = 500;

export function HouseDetails({ world }: { world: WorldData }) {
  const winRef  = useRef<THREE.InstancedMesh>(null);
  const doorRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const winMesh  = winRef.current;
    const doorMesh = doorRef.current;
    if (!winMesh || !doorMesh) return;

    let wIdx = 0, dIdx = 0;
    const winQuat  = new THREE.Quaternion(); // south face, no rotation needed
    const wScale   = new THREE.Vector3(0.5, 0.5, 0.01);
    const dScale   = new THREE.Vector3(0.42, 0.70, 0.01);

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const tile = world.grid[gy][gx];
        if (tile.type !== TileType.BUILDING) continue;
        if (tile.buildingType !== BuildingType.HOUSE) continue;
        const floors = tile.floors ?? 1;
        if (floors !== 1) continue; // only 1-floor houses; 2F+ use BuildingWindows

        const h = Math.max(0.5, floors * FLOOR_HEIGHT_3D);
        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const fp = TILE_3D * 0.72;
        const faceZ = cz + fp / 2 + 0.015; // south face

        // Two windows: left and right of center
        for (const xOff of [-fp * 0.25, fp * 0.25]) {
          if (wIdx >= MAX_HOUSE_WINDOWS) break;
          tmpPos.set(cx + xOff, h * 0.62, faceZ);
          tmpMat4.compose(tmpPos, winQuat, wScale);
          winMesh.setMatrixAt(wIdx, tmpMat4);
          wIdx++;
        }

        // Door: centered, lower half
        if (dIdx < MAX_HOUSE_DOORS) {
          tmpPos.set(cx, h * 0.35, faceZ);
          tmpMat4.compose(tmpPos, winQuat, dScale);
          doorMesh.setMatrixAt(dIdx, tmpMat4);
          dIdx++;
        }
      }
    }

    winMesh.count  = wIdx;
    doorMesh.count = dIdx;
    winMesh.instanceMatrix.needsUpdate  = true;
    doorMesh.instanceMatrix.needsUpdate = true;
  }, [world]);

  return (
    <>
      <instancedMesh ref={winRef} args={[undefined, undefined, MAX_HOUSE_WINDOWS]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          color="#ffee88"
          emissive="#ffcc44"
          emissiveIntensity={2.5}
          transparent
          opacity={0.92}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh ref={doorRef} args={[undefined, undefined, MAX_HOUSE_DOORS]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          color="#3d1f0a"
          emissive="#2a1508"
          emissiveIntensity={0.4}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </instancedMesh>
    </>
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
const MAX_LAMP_POINT_LIGHTS = 6;

export function StreetLights({ world, playerGridX, playerGridY }: { world: WorldData; playerGridX: number; playerGridY: number }) {
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const [nearbyLamps, setNearbyLamps] = useState<[number, number][]>([]);
  const R = 25;

  useEffect(() => {
    const poleMesh = poleRef.current;
    const headMesh = headRef.current;
    if (!poleMesh || !headMesh) return;

    let idx = 0;
    const pScale = new THREE.Vector3(0.12, 3.5, 0.12);
    const hScale = new THREE.Vector3(0.55, 0.28, 0.55);
    const allPositions: [number, number, number][] = [];

    const startGy = Math.floor(Math.max(0, playerGridY - R) / 4) * 4;
    const startGx = Math.floor(Math.max(0, playerGridX - R) / 4) * 4;

    const playerX3 = playerGridX * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
    const playerZ3 = playerGridY * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;

    for (let gy = startGy; gy < Math.min(GRID_SIZE, playerGridY + R + 1) && idx < MAX_LIGHTS; gy += 4) {
      for (let gx = startGx; gx < Math.min(GRID_SIZE, playerGridX + R + 1) && idx < MAX_LIGHTS; gx += 4) {
        const tile = world.grid[gy]?.[gx];
        if (!tile) continue;
        if (tile.type !== TileType.SIDEWALK && tile.type !== TileType.INTERSECTION) continue;

        const cx = gx * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;
        const cz = gy * TILE_3D + TILE_3D / 2 - WORLD_3D_HALF;

        // Pole
        tmpPos.set(cx, 1.75, cz);
        tmpMat4.compose(tmpPos, tmpQuat, pScale);
        poleMesh.setMatrixAt(idx, tmpMat4);

        // Lamp head (box at top of pole)
        tmpPos.set(cx, 3.65, cz);
        tmpMat4.compose(tmpPos, tmpQuat, hScale);
        headMesh.setMatrixAt(idx, tmpMat4);

        const dx = cx - playerX3;
        const dz = cz - playerZ3;
        allPositions.push([cx, cz, dx * dx + dz * dz]);
        idx++;
      }
    }

    poleMesh.count = idx;
    headMesh.count = idx;
    poleMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;

    // Pick nearest N lamps for point lights
    allPositions.sort((a, b) => a[2] - b[2]);
    setNearbyLamps(allPositions.slice(0, MAX_LAMP_POINT_LIGHTS).map(p => [p[0], p[1]]));
  }, [world, playerGridX, playerGridY]);

  return (
    <>
      <instancedMesh ref={poleRef} args={[undefined, undefined, MAX_LIGHTS]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 5]} />
        <meshStandardMaterial color="#444455" roughness={0.5} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, MAX_LIGHTS]} castShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#ffe090"
          emissive="#ffaa33"
          emissiveIntensity={2.5}
          roughness={0.4}
          metalness={0.2}
        />
      </instancedMesh>
      {nearbyLamps.map(([x, z], i) => (
        <pointLight key={i} position={[x, 3.8, z]}
          color="#ffcc66" intensity={4} distance={18} decay={2} />
      ))}
    </>
  );
}

// ─── Town Hall 3D ─────────────────────────────────────────────────────────────
// Neoclassical civic building facing north (−Z direction).
// Group centre = townHallPos tile (44,44) → 3D (18, 0, 18).
// Building tiles: ty=42-46 (rel Z −10 to +10), tx=41-47 (rel X −14 to +14).
// Plaza tiles:    ty=34-38 (rel Z −42 to −22), same X block.
// Closed road:    ty=40    (rel Z −18 to −14) → TOWN_HALL_PLAZA.

export function TownHall3D({ world }: { world: WorldData }) {
  const pos = world.townHallPos;
  const cx = pos.x * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;
  const cz = pos.y * (TILE_3D / TILE_SIZE) - WORLD_3D_HALF;

  const porticoXs = [-9, -5.4, -1.8, 1.8, 5.4, 9] as const;

  return (
    <group position={[cx, 0, cz]}>

      {/* ── Foundation plinth ─────────────────────────────────────────────── */}
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[26, 1, 22]} />
        <meshStandardMaterial color="#c8c0a8" roughness={0.82} metalness={0} />
      </mesh>

      {/* ── Main building body — split into wall panels with entrance opening ─ */}
      {/* Opening: X −3.6 to +3.6, Y 0 to 8.8 (north face, facing −Z / plaza road) */}
      {/* North face — left of door */}
      <mesh position={[-6.8, 9, -10.25]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 18, 0.5]} />
        <meshStandardMaterial color="#d8cdb5" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* North face — right of door */}
      <mesh position={[6.8, 9, -10.25]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 18, 0.5]} />
        <meshStandardMaterial color="#d8cdb5" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* North face — above door opening (Y 8.8 → 18) */}
      <mesh position={[0, 13.4, -10.25]} castShadow>
        <boxGeometry args={[20, 9.2, 0.5]} />
        <meshStandardMaterial color="#d8cdb5" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* East face */}
      <mesh position={[10.25, 9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 18, 20]} />
        <meshStandardMaterial color="#ccc4ae" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* West face */}
      <mesh position={[-10.25, 9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 18, 20]} />
        <meshStandardMaterial color="#ccc4ae" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* South face */}
      <mesh position={[0, 9, 10.25]} castShadow receiveShadow>
        <boxGeometry args={[20, 18, 0.5]} />
        <meshStandardMaterial color="#d0c8b0" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Interior ceiling slab */}
      <mesh position={[0, 18.1, 0]}>
        <boxGeometry args={[20, 0.5, 20]} />
        <meshStandardMaterial color="#ccc4ae" roughness={0.78} />
      </mesh>
      {/* Cornice band at roofline */}
      <mesh position={[0, 18.2, 0]} castShadow>
        <boxGeometry args={[21.5, 0.8, 21.5]} />
        <meshStandardMaterial color="#c8c0a8" roughness={0.76} metalness={0.04} />
      </mesh>

      {/* ── Upper tier ────────────────────────────────────────────────────── */}
      <mesh position={[0, 22, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, 6, 14]} />
        <meshStandardMaterial color="#ccc4ae" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh position={[0, 25.3, 0]} castShadow>
        <boxGeometry args={[15.5, 0.7, 15.5]} />
        <meshStandardMaterial color="#bfb8a0" roughness={0.75} />
      </mesh>

      {/* ── Central tower ─────────────────────────────────────────────────── */}
      <mesh position={[0, 28.5, 0]} castShadow>
        <boxGeometry args={[8, 5, 8]} />
        <meshStandardMaterial color="#c8bfa8" roughness={0.68} metalness={0.05} />
      </mesh>

      {/* ── Dome ──────────────────────────────────────────────────────────── */}
      <mesh position={[0, 32, 0]} castShadow>
        <sphereGeometry args={[4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#6a9a8a" roughness={0.38} metalness={0.3} />
      </mesh>
      <mesh position={[0, 36.3, 0]} castShadow>
        <cylinderGeometry args={[0.72, 1.1, 3, 8]} />
        <meshStandardMaterial color="#6a9a8a" roughness={0.35} metalness={0.32} />
      </mesh>

      {/* Flag pole + flag */}
      <mesh position={[0, 41.5, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 8, 6]} />
        <meshStandardMaterial color="#b8b8b8" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[1.9, 44.8, 0]}>
        <boxGeometry args={[3.5, 1.8, 0.05]} />
        <meshStandardMaterial color="#e63946" emissive="#aa0010" emissiveIntensity={0.18} roughness={0.9} />
      </mesh>

      {/* ── Side wings ────────────────────────────────────────────────────── */}
      <mesh position={[-12, 5.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 11, 14]} />
        <meshStandardMaterial color="#d2c8ac" roughness={0.7} metalness={0.04} />
      </mesh>
      <mesh position={[-12, 11.4, 0]} castShadow>
        <boxGeometry args={[5.2, 0.7, 15.2]} />
        <meshStandardMaterial color="#c0b89a" roughness={0.75} />
      </mesh>
      <mesh position={[12, 5.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 11, 14]} />
        <meshStandardMaterial color="#d2c8ac" roughness={0.7} metalness={0.04} />
      </mesh>
      <mesh position={[12, 11.4, 0]} castShadow>
        <boxGeometry args={[5.2, 0.7, 15.2]} />
        <meshStandardMaterial color="#c0b89a" roughness={0.75} />
      </mesh>

      {/* ── Portico — north-facing (−Z) ────────────────────────────────────── */}
      {/* Portico base platform */}
      <mesh position={[0, 1, -10.5]} receiveShadow>
        <boxGeometry args={[22, 2, 2]} />
        <meshStandardMaterial color="#bfb8a0" roughness={0.82} />
      </mesh>

      {/* 6 Doric columns */}
      {porticoXs.map((xo, i) => (
        <mesh key={`col-${i}`} position={[xo, 10, -10.5]} castShadow>
          <cylinderGeometry args={[0.52, 0.65, 20, 12]} />
          <meshStandardMaterial color="#ece4d0" roughness={0.75} metalness={0.03} />
        </mesh>
      ))}
      {/* Column capitals */}
      {porticoXs.map((xo, i) => (
        <mesh key={`cap-${i}`} position={[xo, 20.4, -10.5]}>
          <boxGeometry args={[1.5, 0.8, 1.5]} />
          <meshStandardMaterial color="#e8e0cc" roughness={0.7} />
        </mesh>
      ))}

      {/* Entablature (horizontal beam over columns) */}
      <mesh position={[0, 21.5, -10.5]} castShadow>
        <boxGeometry args={[22.5, 2.2, 1.3]} />
        <meshStandardMaterial color="#d4ccb8" roughness={0.7} metalness={0.04} />
      </mesh>

      {/* Triangular pediment */}
      <mesh position={[0, 24, -10.4]} castShadow>
        <boxGeometry args={[22.5, 4.5, 1.1]} />
        <meshStandardMaterial color="#ccc5aa" roughness={0.7} />
      </mesh>
      {/* Pediment base cornice */}
      <mesh position={[0, 22.5, -10.9]}>
        <boxGeometry args={[23, 0.4, 0.4]} />
        <meshStandardMaterial color="#b8b0a0" roughness={0.8} />
      </mesh>

      {/* ── Entrance steps (4 steps toward −Z / plaza) ────────────────────── */}
      <mesh position={[0, 1.75, -10.5]} receiveShadow>
        <boxGeometry args={[14, 0.5, 1.5]} />
        <meshStandardMaterial color="#b0a898" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.25, -12]} receiveShadow>
        <boxGeometry args={[17, 0.5, 1.5]} />
        <meshStandardMaterial color="#b0a898" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.75, -13.5]} receiveShadow>
        <boxGeometry args={[20, 0.5, 1.5]} />
        <meshStandardMaterial color="#b0a898" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.25, -15]} receiveShadow>
        <boxGeometry args={[23, 0.5, 1.5]} />
        <meshStandardMaterial color="#b0a898" roughness={0.85} />
      </mesh>

      {/* ── Entrance doors (on north face, relative Z=−10) ────────────────── */}
      {/* Door frame — surrounds the opening, doors left open for interior visibility */}
      <mesh position={[0, 4.3, -10.3]}>
        <boxGeometry args={[7.2, 8.8, 0.16]} />
        <meshStandardMaterial color="#7a5520" roughness={0.6} metalness={0.12} />
      </mesh>
      {/* Left door panel — open inward (visible on interior west wall) */}
      <mesh position={[-4.5, 4.1, -9.5]}>
        <boxGeometry args={[0.12, 7.6, 2.8]} />
        <meshStandardMaterial color="#2d1505" roughness={0.85} metalness={0} />
      </mesh>
      {/* Right door panel — open inward */}
      <mesh position={[4.5, 4.1, -9.5]}>
        <boxGeometry args={[0.12, 7.6, 2.8]} />
        <meshStandardMaterial color="#2d1505" roughness={0.85} metalness={0} />
      </mesh>

      {/* ── Windows — south face (Z=+10.55, outside new south panel) ──────── */}
      {([-6, -2, 2, 6] as const).flatMap(x =>
        ([4, 9, 14] as const).map(y => (
          <mesh key={`sw-${x}-${y}`} position={[x, y, 10.55]}>
            <boxGeometry args={[2.4, 3.5, 0.1]} />
            <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.55} roughness={0.12} metalness={0.15} />
          </mesh>
        ))
      )}

      {/* ── Windows — east face (X=+10.55, outside new east panel) ─────────── */}
      {([-5, 0, 5] as const).flatMap(z =>
        ([5, 11] as const).map(y => (
          <mesh key={`ew-${z}-${y}`} position={[10.55, y, z]}>
            <boxGeometry args={[0.1, 3.2, 2.4]} />
            <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.5} roughness={0.12} metalness={0.15} />
          </mesh>
        ))
      )}

      {/* ── Windows — west face (X=−10.55, outside new west panel) ─────────── */}
      {([-5, 0, 5] as const).flatMap(z =>
        ([5, 11] as const).map(y => (
          <mesh key={`ww-${z}-${y}`} position={[-10.55, y, z]}>
            <boxGeometry args={[0.1, 3.2, 2.4]} />
            <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.5} roughness={0.12} metalness={0.15} />
          </mesh>
        ))
      )}

      {/* ── Windows — north face above door (Z=−10.55, outside north-top panel) */}
      {([-4, 4] as const).map((x, i) => (
        <mesh key={`nw-${i}`} position={[x, 16.5, -10.55]}>
          <boxGeometry args={[2.5, 3.5, 0.1]} />
          <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.4} roughness={0.12} />
        </mesh>
      ))}

      {/* ── Windows — upper tier (all four faces) ────────────────────────── */}
      {([-3.5, 3.5] as const).map((x, i) => (
        <mesh key={`uts-${i}`} position={[x, 22.5, 7.1]}>
          <boxGeometry args={[2.5, 3, 0.1]} />
          <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.6} roughness={0.12} />
        </mesh>
      ))}
      {([-3.5, 3.5] as const).map((x, i) => (
        <mesh key={`utn-${i}`} position={[x, 22.5, -7.1]}>
          <boxGeometry args={[2.5, 3, 0.1]} />
          <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.6} roughness={0.12} />
        </mesh>
      ))}
      {([7.1, -7.1] as const).map((x, i) => (
        <mesh key={`utew-${i}`} position={[x, 22.5, 0]}>
          <boxGeometry args={[0.1, 3, 2.5]} />
          <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.6} roughness={0.12} />
        </mesh>
      ))}

      {/* ── Windows — wing outer faces ────────────────────────────────────── */}
      {([-14.1, 14.1] as const).flatMap((xf, wi) =>
        ([-3.5, 3.5] as const).flatMap(z =>
          ([4, 8] as const).map(y => (
            <mesh key={`wgw-${wi}-${z}-${y}`} position={[xf, y, z]}>
              <boxGeometry args={[0.1, 2.3, 2.3]} />
              <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.45} roughness={0.15} />
            </mesh>
          ))
        )
      )}
      {/* Wing front-face windows (north face of wings, Z=−7) */}
      {([-12, 12] as const).flatMap((xc, wi) =>
        ([4, 8] as const).map(y => (
          <mesh key={`wgfr-${wi}-${y}`} position={[xc, y, -7.1]}>
            <boxGeometry args={[3, 2.5, 0.1]} />
            <meshStandardMaterial color="#88aacc" emissive="#aaccff" emissiveIntensity={0.45} roughness={0.15} />
          </mesh>
        ))
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          INTERIOR LOBBY (visible through entrance opening)
          Lobby tiles: ty=42-44, tx=43-45 → rel X −6 to +6, rel Z −10 to +2
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Marble floor */}
      <mesh position={[0, 0.07, -4]} receiveShadow>
        <boxGeometry args={[12, 0.14, 12]} />
        <meshStandardMaterial color="#f0ece0" roughness={0.2} metalness={0.05} />
      </mesh>

      {/* Interior ceiling */}
      <mesh position={[0, 8.15, -4]}>
        <boxGeometry args={[12, 0.22, 12]} />
        <meshStandardMaterial color="#e8e4d8" roughness={0.8} />
      </mesh>

      {/* Interior side walls */}
      <mesh position={[-6.1, 4.5, -4]}>
        <boxGeometry args={[0.4, 10, 12]} />
        <meshStandardMaterial color="#ddd5c0" roughness={0.78} />
      </mesh>
      <mesh position={[6.1, 4.5, -4]}>
        <boxGeometry args={[0.4, 10, 12]} />
        <meshStandardMaterial color="#ddd5c0" roughness={0.78} />
      </mesh>

      {/* Interior columns — front pair (near entrance) */}
      {([-4.5, 4.5] as const).map((x, i) => (
        <mesh key={`ic-f-${i}`} position={[x, 4.5, -7]} castShadow>
          <cylinderGeometry args={[0.42, 0.5, 9, 10]} />
          <meshStandardMaterial color="#ddd8cc" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}

      {/* Interior columns — back pair */}
      {([-4.5, 4.5] as const).map((x, i) => (
        <mesh key={`ic-b-${i}`} position={[x, 4.5, -1]} castShadow>
          <cylinderGeometry args={[0.42, 0.5, 9, 10]} />
          <meshStandardMaterial color="#ddd8cc" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}

      {/* Interior back wall */}
      <mesh position={[0, 4.5, 2.6]}>
        <boxGeometry args={[12, 10, 0.4]} />
        <meshStandardMaterial color="#ddd5c0" roughness={0.78} />
      </mesh>
      {/* Back wall high windows */}
      {([-3, 3] as const).map((x, i) => (
        <mesh key={`bww-${i}`} position={[x, 7.8, 2.7]}>
          <boxGeometry args={[2.8, 4, 0.08]} />
          <meshStandardMaterial color="#c8dff0" emissive="#c8dff0" emissiveIntensity={0.52} roughness={0.12} />
        </mesh>
      ))}

      {/* Interior high side windows (daylight) */}
      <mesh position={[-5.95, 7.5, -4]}>
        <boxGeometry args={[0.08, 3.5, 4]} />
        <meshStandardMaterial color="#ddeeff" emissive="#ddeeff" emissiveIntensity={0.4} roughness={0.12} />
      </mesh>
      <mesh position={[5.95, 7.5, -4]}>
        <boxGeometry args={[0.08, 3.5, 4]} />
        <meshStandardMaterial color="#ddeeff" emissive="#ddeeff" emissiveIntensity={0.4} roughness={0.12} />
      </mesh>

      {/* Reception / service counter */}
      <mesh position={[0, 1.25, 1.2]} castShadow>
        <boxGeometry args={[7.5, 2.5, 1.5]} />
        <meshStandardMaterial color="#4a2e10" roughness={0.75} metalness={0} />
      </mesh>
      <mesh position={[0, 2.55, 1.2]}>
        <boxGeometry args={[7.8, 0.12, 1.7]} />
        <meshStandardMaterial color="#3a2008" roughness={0.55} metalness={0.06} />
      </mesh>

      {/* Chandelier */}
      <mesh position={[0, 7.9, -4]}>
        <cylinderGeometry args={[0.12, 0.12, 1.1, 6]} />
        <meshStandardMaterial color="#c8a840" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 7.2, -4]}>
        <cylinderGeometry args={[1.3, 0.9, 0.55, 10]} />
        <meshStandardMaterial color="#c8a840" metalness={0.6} roughness={0.25} emissive="#aa8030" emissiveIntensity={0.6} />
      </mesh>

      {/* ══════════════════════════════════════════════════════════════════════
          PLAZA & FORECOURT
          Plaza tiles: gy=34-38 → group-relative Z −42 to −22 (center −32, size 20).
          Road gy=40 (rel Z −18 to −14) left uncovered — shows normal road texture.
          Sidewalks gy=39, 41 also left uncovered by regular ground canvas.
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Main plaza stone floor — covers only plaza tiles gy=34-38 */}
      <mesh position={[0, 0.05, -32]} receiveShadow>
        <boxGeometry args={[22, 0.1, 20]} />
        <meshStandardMaterial color="#b8b2a5" roughness={0.88} metalness={0} />
      </mesh>

      {/* Left boundary wall — trimmed to plaza extent */}
      <mesh position={[-11.2, 0.9, -32]} castShadow>
        <boxGeometry args={[0.35, 1.8, 20]} />
        <meshStandardMaterial color="#9a9288" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Right boundary wall — trimmed to plaza extent */}
      <mesh position={[11.2, 0.9, -32]} castShadow>
        <boxGeometry args={[0.35, 1.8, 20]} />
        <meshStandardMaterial color="#9a9288" roughness={0.8} metalness={0.05} />
      </mesh>

      {/* North gate posts */}
      <mesh position={[-5, 2.5, -43]} castShadow>
        <boxGeometry args={[1.1, 5, 1.1]} />
        <meshStandardMaterial color="#c8c0a8" roughness={0.7} />
      </mesh>
      <mesh position={[5, 2.5, -43]} castShadow>
        <boxGeometry args={[1.1, 5, 1.1]} />
        <meshStandardMaterial color="#c8c0a8" roughness={0.7} />
      </mesh>
      <mesh position={[-5, 5.5, -43]}>
        <sphereGeometry args={[0.75, 8, 6]} />
        <meshStandardMaterial color="#b8a060" roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[5, 5.5, -43]}>
        <sphereGeometry args={[0.75, 8, 6]} />
        <meshStandardMaterial color="#b8a060" roughness={0.55} metalness={0.25} />
      </mesh>

      {/* Flag poles × 2 */}
      <mesh position={[-7.5, 9, -32]}>
        <cylinderGeometry args={[0.09, 0.09, 18, 6]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[7.5, 9, -32]}>
        <cylinderGeometry args={[0.09, 0.09, 18, 6]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[-6, 17.5, -32]}>
        <boxGeometry args={[3, 2, 0.05]} />
        <meshStandardMaterial color="#e63946" emissive="#aa0010" emissiveIntensity={0.15} roughness={0.9} />
      </mesh>
      <mesh position={[9, 17.5, -32]}>
        <boxGeometry args={[3, 2, 0.05]} />
        <meshStandardMaterial color="#003087" emissive="#001e6e" emissiveIntensity={0.12} roughness={0.9} />
      </mesh>

      {/* Plaza lamp posts × 2 — moved into plaza (Z=−28), away from road */}
      <mesh position={[-8, 3.5, -28]}>
        <cylinderGeometry args={[0.13, 0.2, 7, 6]} />
        <meshStandardMaterial color="#444455" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[-8, 7.3, -28]}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial color="#ffe090" emissive="#ffaa33" emissiveIntensity={2.5} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[8, 3.5, -28]}>
        <cylinderGeometry args={[0.13, 0.2, 7, 6]} />
        <meshStandardMaterial color="#444455" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[8, 7.3, -28]}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial color="#ffe090" emissive="#ffaa33" emissiveIntensity={2.5} roughness={0.4} metalness={0.2} />
      </mesh>

      {/* ── Lighting ──────────────────────────────────────────────────────── */}
      {/* Entrance warm glow */}
      <pointLight position={[0, 5, -12]} color="#ffe8aa" intensity={3.5} distance={18} decay={2} />
      {/* Interior chandelier */}
      <pointLight position={[0, 6.5, -4]} color="#ffe8cc" intensity={3.2} distance={12} decay={2} />
      {/* Interior wall sconces */}
      <pointLight position={[-4.5, 4, -6]} color="#ffddaa" intensity={1.6} distance={8} decay={2} />
      <pointLight position={[4.5, 4, -6]} color="#ffddaa" intensity={1.6} distance={8} decay={2} />
      {/* Dome accent */}
      <pointLight position={[0, 32, 0]} color="#a0c8ff" intensity={3.5} distance={35} decay={2} />
      {/* Plaza lamps — matched to moved lamp posts at Z=−28 */}
      <pointLight position={[-8, 7, -28]} color="#ffcc66" intensity={2.5} distance={15} decay={2} />
      <pointLight position={[8, 7, -28]} color="#ffcc66" intensity={2.5} distance={15} decay={2} />
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
        <meshStandardMaterial color="#3a4055" roughness={0.6} metalness={0.2} />
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
          <meshStandardMaterial color="#2a2e40" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}

      {/* South Wall */}
      <mesh position={[0, halfHeight, size / 2]} castShadow receiveShadow>
        <boxGeometry args={[size + thickness, wallHeight, thickness]} />
        <meshStandardMaterial color="#3a4055" roughness={0.6} metalness={0.2} />
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
          <meshStandardMaterial color="#2a2e40" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}

      {/* West Wall */}
      <mesh position={[-size / 2, halfHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, wallHeight, size + thickness]} />
        <meshStandardMaterial color="#3a4055" roughness={0.6} metalness={0.2} />
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
          <meshStandardMaterial color="#2a2e40" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}

      {/* East Wall */}
      <mesh position={[size / 2, halfHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, wallHeight, size + thickness]} />
        <meshStandardMaterial color="#3a4055" roughness={0.6} metalness={0.2} />
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
          <meshStandardMaterial color="#2a2e40" roughness={0.5} metalness={0.3} />
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
            <meshStandardMaterial color="#0b0f19" roughness={0.3} metalness={0.15} />
          </mesh>

          {/* Cockpit visor/glass (futuristic glowing yellow visor) */}
          <mesh position={[0, 0.1, -0.8]}>
            <boxGeometry args={[1.0, 0.25, 0.4]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.2} />
          </mesh>

          {/* Engines (back) */}
          <mesh position={[-0.5, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.15} />
          </mesh>
          <mesh position={[-0.5, 0, 1.45]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
            <meshStandardMaterial color="#ff5722" emissive="#ff5722" emissiveIntensity={3} />
          </mesh>

          <mesh position={[0.5, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.15} />
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
            <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.15} />
          </mesh>
          <mesh position={[1.0, -0.05, 0]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.8, 0.1, 1.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.15} />
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
      <MinecraftRoofs world={world} />
      <BuildingWindows world={world} />
      <HouseDetails world={world} />
      <CityTrees world={world} playerGridX={playerGridX} playerGridY={playerGridY} />
      <StreetLights world={world} playerGridX={playerGridX} playerGridY={playerGridY} />
      <TownHall3D world={world} />
      <BoundaryWalls />
      <PolicePatrol />
    </group>
  );
}
