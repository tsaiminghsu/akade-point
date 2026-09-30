'use client';
import { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WorldData, ChunkIndex, ChunkLayerName,
  TILE_SIZE, GRID_SIZE, TILE_3D, WORLD_3D_HALF, CHUNK_3D,
  toX3D, toZ3D,
} from './types';
import { LAYER_NAMES, LAMP, capacityFor, chunkDistSq3D } from './chunks';
import { packGroundGrid, renderChunkCanvas } from './groundTiles';
import type { GroundWorkerIn, GroundWorkerOut } from './groundWorker';
import {
  cityUniforms, createFacadeMaterial, createGableGeometry, createLightPoolMaterial,
  createSignalMaterial, followCityLight,
} from './cityMaterials';
import { frameGate } from './frameGate';

// ─── Chunk streaming ──────────────────────────────────────────────────────────
// Static geometry and the ground are streamed per chunk around the player.
// Instance buffers are sized by `capacityFor(MAX_DRAW_DISTANCE)` — the worst
// case visible window — never by the whole map, so a bigger city costs
// nothing until you drive into it.

/** Largest streaming radius the settings may ask for, 3D units. */
export const MAX_DRAW_DISTANCE = 256;
/** Rebuild the visible set after the player moves this far, 3D units. */
const REBUILD_STEP = 16;
/** Chunks stay loaded until this far beyond drawDistance (hysteresis). */
const UNLOAD_MARGIN = 16;

/** What the streaming components read from the engine each frame. */
export interface CityStreamSource {
  player: { x: number; y: number };
  perf: { drawDistance: number; shadowDistance: number; lampLights: number };
}

const tmpMat4 = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// ─── Ground: per-chunk planes with LRU-cached canvas textures ─────────────────

const GROUND_TEX_SIZE = 512;         // 32 px per tile
const GROUND_LRU = 49;               // ~7x7 chunks resident
/** Main-thread fallback: chunks painted per frame. */
const GROUND_BUILDS_PER_FRAME = 2;
/** Worker: chunks requested and not back yet. */
const GROUND_IN_FLIGHT = 4;
/** Chunks around the spawn point painted before anything else. */
const GROUND_FIRST_LOAD = 9;

interface GroundEntry {
  mesh: THREE.Mesh;
  tex: THREE.Texture;
  mat: THREE.MeshStandardMaterial;
  lastUsed: number;
}

/**
 * A worker that paints ground chunks (see groundWorker.ts), or null where the
 * browser has no 2D OffscreenCanvas — those keep painting on the main thread.
 */
function createGroundWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    if (!new OffscreenCanvas(1, 1).getContext('2d')) return null;
    return new Worker(new URL('./groundWorker.ts', import.meta.url));
  } catch {
    return null;
  }
}

function disposeGround(e: GroundEntry): void {
  e.tex.dispose();
  e.mat.dispose();
  // three never closes an ImageBitmap it was given; free it now, not at GC.
  const img = e.tex.image as { close?: () => void } | undefined;
  img?.close?.();
}

export function ChunkedGround({ world, source }: { world: WorldData; source: CityStreamSource }) {
  const groupRef = useRef<THREE.Group>(null);
  const entries = useRef(new Map<number, GroundEntry>());
  const lastPos = useRef({ x: Infinity, z: Infinity, d: 0 });
  const pending = useRef<ChunkIndex[]>([]);
  const inFlight = useRef(new Set<number>());
  const workerRef = useRef<Worker | null>(null);
  /** Set when chunks come or go, so the LRU sort only runs when it can matter. */
  const lruDirty = useRef(false);
  const frame = useRef(0);
  const { gl } = useThree();

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(CHUNK_3D, CHUNK_3D, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const chunkByKey = useMemo(() => new Map(world.chunks.map(c => [c.key, c])), [world]);

  useEffect(() => () => {
    for (const e of entries.current.values()) disposeGround(e);
    entries.current.clear();
    geom.dispose();
  }, [geom]);

  const addEntry = useCallback((c: ChunkIndex, tex: THREE.Texture): GroundEntry | null => {
    const group = groupRef.current;
    if (!group) return null;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.92, metalness: 0,
      // A little self-light so the streets never go pitch black at night.
      emissive: new THREE.Color('#1a1a20'), emissiveIntensity: 0.8,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set((c.minX3 + c.maxX3) / 2, -0.01, (c.minZ3 + c.maxZ3) / 2);
    mesh.receiveShadow = true;
    mesh.userData.ssrWet = true;
    // A chunk can arrive after the player has moved on; show it only if it is
    // still inside the streaming window.
    const keep = lastPos.current.d + UNLOAD_MARGIN;
    mesh.visible = chunkDistSq3D(c, lastPos.current.x, lastPos.current.z) <= keep * keep;
    const e = { mesh, tex, mat, lastUsed: frame.current };
    entries.current.set(c.key, e);
    group.add(mesh);
    lruDirty.current = true;
    return e;
  }, [geom, gl]);

  const paintHere = (c: ChunkIndex) => {
    addEntry(c, new THREE.CanvasTexture(renderChunkCanvas(world, c.cx, c.cy, GROUND_TEX_SIZE)));
  };

  // The worker gets the grid once, then paints on request.
  useEffect(() => {
    const worker = createGroundWorker();
    workerRef.current = worker;
    const flight = inFlight.current;
    if (!worker) return;
    const grid: GroundWorkerIn = { type: 'grid', grid: packGroundGrid(world.grid) };
    worker.postMessage(grid);
    worker.onmessage = (e: MessageEvent<GroundWorkerOut>) => {
      const { key, bitmap } = e.data;
      flight.delete(key);
      const c = chunkByKey.get(key);
      if (!c || entries.current.has(key)) {
        bitmap.close();
        return;
      }
      const tex = new THREE.Texture(bitmap);
      // WebGL ignores UNPACK_FLIP_Y for ImageBitmaps; flip V in the UV
      // transform instead so the canvas top still lands at chunk minZ.
      tex.flipY = false;
      tex.repeat.set(1, -1);
      tex.offset.set(0, 1);
      tex.needsUpdate = true;
      if (!addEntry(c, tex)) bitmap.close();
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      flight.clear();
    };
  }, [world, chunkByKey, addEntry]);

  useFrame(() => {
    // Streaming is per-frame work too; it waits for the fps cap like the rest.
    if (!frameGate.due) return;
    const group = groupRef.current;
    if (!group) return;
    frame.current++;
    const now = frame.current;
    const px3 = toX3D(source.player.x);
    const pz3 = toZ3D(source.player.y);
    const D = source.perf.drawDistance;
    const map = entries.current;

    const moved = Math.hypot(px3 - lastPos.current.x, pz3 - lastPos.current.z);
    if (moved >= REBUILD_STEP || D !== lastPos.current.d) {
      lastPos.current = { x: px3, z: pz3, d: D };
      const keep = D + UNLOAD_MARGIN;
      const keep2 = keep * keep;
      const d2 = D * D;
      const queue: { c: ChunkIndex; dist: number }[] = [];

      for (const c of world.chunks) {
        const dist = chunkDistSq3D(c, px3, pz3);
        const e = map.get(c.key);
        if (e) {
          if (dist <= keep2) { e.lastUsed = now; e.mesh.visible = true; }
          else e.mesh.visible = false;
        } else if (dist <= d2) {
          queue.push({ c, dist });
        }
      }
      queue.sort((a, b) => a.dist - b.dist);
      pending.current = queue.map(q => q.c);
      lruDirty.current = true;
    }

    // The first load around the spawn point goes out all at once so the
    // player never sees a hole; later chunks trickle in.
    const worker = workerRef.current;
    if (worker) {
      const limit = map.size === 0 ? GROUND_FIRST_LOAD : GROUND_IN_FLIGHT;
      while (inFlight.current.size < limit && pending.current.length > 0) {
        const c = pending.current.shift()!;
        if (map.has(c.key) || inFlight.current.has(c.key)) continue;
        inFlight.current.add(c.key);
        const paint: GroundWorkerIn = { type: 'paint', key: c.key, cx: c.cx, cy: c.cy, size: GROUND_TEX_SIZE };
        worker.postMessage(paint);
      }
    } else {
      const budget = map.size === 0 ? GROUND_FIRST_LOAD : GROUND_BUILDS_PER_FRAME;
      for (let i = 0; i < budget && pending.current.length > 0; i++) {
        const c = pending.current.shift()!;
        if (map.has(c.key)) continue;
        paintHere(c);
      }
    }

    // Evict least-recently-used hidden chunks beyond the budget.
    if (map.size > GROUND_LRU && lruDirty.current) {
      lruDirty.current = false;
      const victims = [...map.entries()]
        .filter(([, e]) => !e.mesh.visible)
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [key, e] of victims) {
        if (map.size <= GROUND_LRU) break;
        group.remove(e.mesh);
        disposeGround(e);
        map.delete(key);
      }
    }
  });

  return <group ref={groupRef} />;
}

// ─── Streamed instanced city ──────────────────────────────────────────────────

export function ChunkedCity({ world, source }: { world: WorldData; source: CityStreamSource }) {
  const refs = useRef({} as Record<ChunkLayerName, THREE.InstancedMesh | null>);
  const shadowCounts = useRef({} as Record<ChunkLayerName, number>);
  const totals = useRef({} as Record<ChunkLayerName, number>);

  const caps = useMemo(() => {
    const out = {} as Record<ChunkLayerName, number>;
    for (const name of LAYER_NAMES) out[name] = capacityFor(world.chunks, name, MAX_DRAW_DISTANCE);
    return out;
  }, [world]);

  // One ref callback per layer, created once. An inline `setRef(name)` was a
  // new function every render, so React detached and re-attached every layer
  // on each render — 10 times a second, driven by the HUD — and the attach
  // zeroed `count`, blanking the city until the next streaming rebuild. The
  // shadow pass's onAfterShadow happened to repair it every frame, which is
  // why it only showed once shadows were off (and on the non-casting roofs,
  // windows and doors all along).
  const layerRefs = useMemo(() => {
    const out = {} as Record<ChunkLayerName, (m: THREE.InstancedMesh | null) => void>;
    for (const name of LAYER_NAMES) {
      out[name] = (m) => {
        refs.current[name] = m;
        if (!m) return;
        // Initialized here (ref callback, synchronous at mount) rather than in
        // a useEffect: fiber 9's frame loop can tick before effects run, and
        // this instanceColor is read unconditionally on the very first frame.
        m.frustumCulled = false;
        if (!m.instanceColor) {
          m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caps[name] * 3).fill(1), 3);
        }
        // Whatever has already been streamed in, never a blank.
        m.count = totals.current[name] ?? 0;
        m.onBeforeShadow = () => { m.count = shadowCounts.current[name] ?? 0; };
        m.onAfterShadow = () => { m.count = totals.current[name] ?? 0; };
      };
    }
    return out;
  }, [caps]);

  const res = useMemo(() => {
    const facade = {
      // Glass towers: mirror-like, so they pick up the environment map.
      sky: createFacadeMaterial('sky', { roughness: 0.12, metalness: 0.6, glow: 1.3 }),
      off: createFacadeMaterial('off', { roughness: 0.45, metalness: 0.2, glow: 1.2 }),
      com: createFacadeMaterial('com', { roughness: 0.8, metalness: 0.02, glow: 1.1 }),
      hou: createFacadeMaterial('hou', { roughness: 0.85, metalness: 0, glow: 1.2 }),
      shop: createFacadeMaterial('shop', { roughness: 0.35, metalness: 0.1, glow: 1.5 }),
    };
    const pool = createLightPoolMaterial();
    const signal = createSignalMaterial();
    const lampHead = followCityLight(new THREE.MeshStandardMaterial({
      color: '#d9d5ca', emissive: '#ffbf66', emissiveIntensity: 3, roughness: 0.4, metalness: 0.3,
    }));
    const gable = createGableGeometry();
    const poolPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    return {
      facade, pool, signal, lampHead, gable, poolPlane,
      dispose: () => {
        for (const f of Object.values(facade)) f.dispose();
        pool.dispose();
        signal.dispose();
        lampHead.dispose();
        gable.dispose();
        poolPlane.dispose();
      },
    };
  }, []);
  useEffect(() => res.dispose, [res]);

  const visMask = useRef(new Uint8Array(world.chunks.length));
  const lastPos = useRef({ x: Infinity, z: Infinity, d: 0, sd: 0 });
  const [nearbyLamps, setNearbyLamps] = useState<[number, number][]>([]);
  const lampKey = useRef('');

  // Allocate colour buffers up front and wire the shadow-radius trick: while
  // the shadow map renders, each layer temporarily draws only the instances
  // that belong to chunks inside shadowDistance (they are filled near-to-far).
  useEffect(() => {
    lastPos.current = { x: Infinity, z: Infinity, d: 0, sd: 0 };
  }, [caps, world]);

  useFrame((state) => {
    cityUniforms.uClock.value = state.clock.elapsedTime;

    const px3 = toX3D(source.player.x);
    const pz3 = toZ3D(source.player.y);
    const D = source.perf.drawDistance;
    const SD = source.perf.shadowDistance;
    const moved = Math.hypot(px3 - lastPos.current.x, pz3 - lastPos.current.z);
    if (moved < REBUILD_STEP && D === lastPos.current.d && SD === lastPos.current.sd) return;
    lastPos.current = { x: px3, z: pz3, d: D, sd: SD };

    const d2 = D * D;
    const keep2 = (D + UNLOAD_MARGIN) * (D + UNLOAD_MARGIN);
    const sd2 = SD * SD;
    const mask = visMask.current;
    const visible: { c: ChunkIndex; dist: number }[] = [];
    for (let i = 0; i < world.chunks.length; i++) {
      const c = world.chunks[i];
      const dist = chunkDistSq3D(c, px3, pz3);
      const vis = dist <= (mask[i] ? keep2 : d2);
      mask[i] = vis ? 1 : 0;
      if (vis) visible.push({ c, dist });
    }
    visible.sort((a, b) => a.dist - b.dist);

    for (const name of LAYER_NAMES) {
      const m = refs.current[name];
      if (!m) continue;
      const mats = m.instanceMatrix.array as Float32Array;
      const cols = m.instanceColor!.array as Float32Array;
      const cap = caps[name];
      let offset = 0;
      let shadow = 0;
      for (const { c, dist } of visible) {
        const L = c.layers[name];
        if (L.count === 0) continue;
        if (offset + L.count > cap) break;
        mats.set(L.mats, offset * 16);
        cols.set(L.colors, offset * 3);
        offset += L.count;
        if (dist <= sd2) shadow = offset;
      }
      totals.current[name] = offset;
      shadowCounts.current[name] = shadow;
      m.count = offset;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }

    // Nearest lamps get real point lights. Their count stays fixed so the
    // shaders are not recompiled every time the player crosses a street.
    const lamps: [number, number, number][] = [];
    for (const { c } of visible) {
      const lp = c.lampPositions;
      for (let i = 0; i < lp.length; i += 2) {
        const dx = lp[i] - px3;
        const dz = lp[i + 1] - pz3;
        lamps.push([lp[i], lp[i + 1], dx * dx + dz * dz]);
      }
    }
    lamps.sort((a, b) => a[2] - b[2]);
    const picked = lamps.slice(0, source.perf.lampLights).map(l => [l[0], l[1]] as [number, number]);
    const key = picked.map(p => `${p[0]},${p[1]}`).join('|');
    if (key !== lampKey.current) {
      lampKey.current = key;
      setNearbyLamps(picked);
    }
  });

  return (
    <>
      {/*
        No `vertexColors` on these materials. It defines USE_COLOR in the
        shader, which multiplies by a per-vertex `color` attribute that a
        BoxGeometry does not have. Built-in materials carry no
        defaultAttributeValues, so that attribute reads as (0,0,0) and the
        whole building — facade texture included — renders black.
        instanceColor is applied on its own via USE_INSTANCING_COLOR.
      */}
      <instancedMesh ref={layerRefs.sky} args={[undefined, undefined, caps.sky]} castShadow receiveShadow
        userData={{ ssrTarget: true }}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.facade.sky.material} attach="material" />
      </instancedMesh>
      <instancedMesh ref={layerRefs.off} args={[undefined, undefined, caps.off]} castShadow receiveShadow
        userData={{ ssrTarget: true }}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.facade.off.material} attach="material" />
      </instancedMesh>
      <instancedMesh ref={layerRefs.com} args={[undefined, undefined, caps.com]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.facade.com.material} attach="material" />
      </instancedMesh>
      <instancedMesh ref={layerRefs.hou} args={[undefined, undefined, caps.hou]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.facade.hou.material} attach="material" />
      </instancedMesh>
      {/* Ground-floor storefronts and lobbies */}
      <instancedMesh ref={layerRefs.shop} args={[undefined, undefined, caps.shop]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.facade.shop.material} attach="material" />
      </instancedMesh>

      {/* Roofs: flat caps and eaves, house gables, rooftop plant and chimneys */}
      <instancedMesh ref={layerRefs.roofBase} args={[undefined, undefined, caps.roofBase]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={layerRefs.roofPeak} args={[res.gable, undefined, caps.roofPeak]} castShadow>
        <meshStandardMaterial roughness={0.85} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={layerRefs.roofUnit} args={[undefined, undefined, caps.roofUnit]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.6} metalness={0.3} />
      </instancedMesh>

      <instancedMesh ref={layerRefs.houseDoor} args={[undefined, undefined, caps.houseDoor]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>

      {/* Trees */}
      <instancedMesh ref={layerRefs.treeTrunk} args={[undefined, undefined, caps.treeTrunk]} castShadow>
        <cylinderGeometry args={[0.7, 1, 1, 6]} />
        <meshStandardMaterial color="#4a3726" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={layerRefs.treeLeaf} args={[undefined, undefined, caps.treeLeaf]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>

      {/* Street furniture: lamp and signal masts share one metal layer */}
      <instancedMesh ref={layerRefs.pole} args={[undefined, undefined, caps.pole]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.45} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={layerRefs.lampHead} args={[undefined, undefined, caps.lampHead]}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.lampHead} attach="material" />
      </instancedMesh>
      <instancedMesh ref={layerRefs.lightPool} args={[res.poolPlane, res.pool.material, caps.lightPool]} />
      <instancedMesh ref={layerRefs.signalHead} args={[undefined, undefined, caps.signalHead]}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={res.signal.material} attach="material" />
      </instancedMesh>
      <instancedMesh ref={layerRefs.curb} args={[undefined, undefined, caps.curb]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={layerRefs.prop} args={[undefined, undefined, caps.prop]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.6} metalness={0.1} />
      </instancedMesh>

      {nearbyLamps.map(([x, z], i) => (
        <pointLight key={i} position={[x, LAMP.headY - 0.3, z]}
          color="#ffcc66" intensity={5} distance={20} decay={2} />
      ))}
    </>
  );
}

// ─── BuildingWindows: replaced by emissiveMap in the facade materials ────────
export function BuildingWindows() {
  return null;
}

// ─── Town Hall 3D ─────────────────────────────────────────────────────────────
// Neoclassical civic building facing north (−Z direction).
// Group centre = townHallPos tile (44,44) → 3D (18, 0, 18).
// Building tiles: ty=42-46 (rel Z −10 to +10), tx=41-47 (rel X −14 to +14).
// Plaza tiles:    ty=34-38 (rel Z −42 to −22), same X block.
// Closed road:    ty=40    (rel Z −18 to −14) → TOWN_HALL_PLAZA.

export function TownHall3D({ world, lightsOn = true }: { world: WorldData; lightsOn?: boolean }) {
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
      {/* Only mounted while the player is nearby: point lights are a per-scene
          shader cost, and these are invisible from the far side of the map. */}
      {lightsOn && (
        <>
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
        </>
      )}
    </group>
  );
}

// ─── Boundary Walls ───────────────────────────────────────────────────────────

export function BoundaryWalls() {
  const wallHeight = 18;
  const halfHeight = wallHeight / 2;
  const thickness = 2;
  const size = GRID_SIZE * TILE_3D;

  // Pillar positions along one side
  const pillarIntervals = useMemo(
    () => Array.from({ length: Math.floor(size / 16) + 1 }, (_, i) => -size / 2 + i * 16),
    [size],
  );
  const pillarCount = pillarIntervals.length * 4;
  const pillarRef = useRef<THREE.InstancedMesh>(null);

  // All four sides of pillars in one instanced draw call (they would be
  // ~160 separate meshes on a 160-tile map).
  useEffect(() => {
    const m = pillarRef.current;
    if (!m) return;
    let i = 0;
    const inset = thickness / 2 + 0.2;
    const y = halfHeight + 0.5;
    const along = new THREE.Vector3(1.2, wallHeight + 1.0, 1.0);
    const across = new THREE.Vector3(1.0, wallHeight + 1.0, 1.2);
    for (const p of pillarIntervals) {
      tmpPos.set(p, y, -size / 2 + inset); tmpMat4.compose(tmpPos, tmpQuat, along);  m.setMatrixAt(i++, tmpMat4);
      tmpPos.set(p, y,  size / 2 - inset); tmpMat4.compose(tmpPos, tmpQuat, along);  m.setMatrixAt(i++, tmpMat4);
      tmpPos.set(-size / 2 + inset, y, p); tmpMat4.compose(tmpPos, tmpQuat, across); m.setMatrixAt(i++, tmpMat4);
      tmpPos.set( size / 2 - inset, y, p); tmpMat4.compose(tmpPos, tmpQuat, across); m.setMatrixAt(i++, tmpMat4);
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
  }, [pillarIntervals, size, halfHeight, wallHeight, thickness]);

  return (
    <group>
      <instancedMesh ref={pillarRef} args={[undefined, undefined, pillarCount]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2a2e40" roughness={0.5} metalness={0.3} />
      </instancedMesh>
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

  // getObjectByName walks the subtree; look each searchlight up once.
  const searchlights = useRef<(THREE.Object3D | undefined)[]>([]);

  useFrame((state) => {
    if (!frameGate.due) return;
    const elapsed = state.clock.getElapsedTime();

    groupRefs.forEach((ref, idx) => {
      const g = ref.current;
      if (!g) return;

      // Make them fly in different circles/paths around the city center,
      // scaled to the map so they still cover it on a bigger grid.
      const radius = WORLD_3D_HALF * (0.31 + idx * 0.28);
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
      let searchlight = searchlights.current[idx];
      if (!searchlight || searchlight.parent !== g) {
        searchlight = g.getObjectByName('searchlight');
        searchlights.current[idx] = searchlight;
      }
      if (searchlight) {
        searchlight.rotation.z = Math.sin(elapsed * 2.0 + idx) * 0.25;
        searchlight.rotation.x = Math.cos(elapsed * 1.5 + idx) * 0.25;
      }
    });

    // Flashing sirens (red and blue alternating)
    sirenRefs.forEach((ref) => {
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

/** Town Hall point lights mount within this many tiles (Chebyshev) of the player. */
const TOWN_HALL_LIGHT_TILES = 48;
const TOWN_HALL_LIGHT_HYSTERESIS = 8;

/**
 * Memoised: CityGame re-renders ~10x/s for the HUD, and r3f re-renders the
 * whole canvas tree with it. Nothing in the static city depends on that.
 */
export default memo(function CityScene({
  world, source, playerGridX, playerGridY,
}: {
  world: WorldData;
  source: CityStreamSource;
  playerGridX: number;
  playerGridY: number;
}) {
  const thGx = Math.floor(world.townHallPos.x / TILE_SIZE);
  const thGy = Math.floor(world.townHallPos.y / TILE_SIZE);
  const [nearTownHall, setNearTownHall] = useState(true);

  useEffect(() => {
    const d = Math.max(Math.abs(playerGridX - thGx), Math.abs(playerGridY - thGy));
    setNearTownHall(prev => (prev
      ? d <= TOWN_HALL_LIGHT_TILES + TOWN_HALL_LIGHT_HYSTERESIS
      : d <= TOWN_HALL_LIGHT_TILES));
  }, [playerGridX, playerGridY, thGx, thGy]);

  return (
    <group>
      <ChunkedGround world={world} source={source} />
      <ChunkedCity world={world} source={source} />
      <BuildingWindows />
      <TownHall3D world={world} lightsOn={nearTownHall} />
      <BoundaryWalls />
      <PolicePatrol />
    </group>
  );
});
