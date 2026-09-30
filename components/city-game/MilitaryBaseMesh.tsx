'use client';
import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  BASE_TILE_X0,
  BASE_TILE_X1,
  BASE_TILE_Y0,
  BASE_TILE_Y1,
  GATES,
  STRUCTURES,
  WALL_ALT,
  isGateTile,
} from './militaryBase';
import { TILE_3D, TILE_SIZE, toX3D, toZ3D } from './types';

/**
 * Fort Akade's buildings: the perimeter wall, gates, hangars, control tower,
 * watchtowers and helipad.
 *
 * Static and small (a few dozen meshes), so plain JSX is fine. The collider is
 * the tile grid — MILITARY_WALL / MILITARY_HANGAR tiles are solid — and this
 * geometry is sized to fill those tiles so what you hit is what you see.
 */

const PX_TO_3D = TILE_3D / TILE_SIZE;
const WALL_H = WALL_ALT * PX_TO_3D;
const WALL_T = TILE_3D * 0.8;

const CONCRETE = '#7a7d6c';
const OLIVE = '#56613f';
const DARK = '#2b2f24';

function tileX(gx: number): number {
  return toX3D(gx * TILE_SIZE + TILE_SIZE / 2);
}
function tileZ(gy: number): number {
  return toZ3D(gy * TILE_SIZE + TILE_SIZE / 2);
}

interface Segment {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Merge the wall ring into straight runs, broken at the gates. */
function wallSegments(): Segment[] {
  const out: Segment[] = [];
  const runs = (fixed: 'x' | 'y', at: number, from: number, to: number) => {
    let start: number | null = null;
    for (let i = from; i <= to + 1; i++) {
      const gx = fixed === 'y' ? i : at;
      const gy = fixed === 'y' ? at : i;
      const wall = i <= to && !isGateTile(gx, gy);
      if (wall && start === null) start = i;
      if (!wall && start !== null) {
        const n = i - start;
        const mid = (start + i - 1) / 2;
        if (fixed === 'y') {
          out.push({ x: tileX(mid), z: tileZ(at), w: n * TILE_3D, d: WALL_T });
        } else {
          out.push({ x: tileX(at), z: tileZ(mid), w: WALL_T, d: n * TILE_3D });
        }
        start = null;
      }
    }
  };
  runs('y', BASE_TILE_Y0, BASE_TILE_X0, BASE_TILE_X1);
  runs('y', BASE_TILE_Y1, BASE_TILE_X0, BASE_TILE_X1);
  runs('x', BASE_TILE_X0, BASE_TILE_Y0 + 1, BASE_TILE_Y1 - 1);
  runs('x', BASE_TILE_X1, BASE_TILE_Y0 + 1, BASE_TILE_Y1 - 1);
  return out;
}

function useSignTexture(): THREE.CanvasTexture | null {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = '#fff';
    ctx.fillRect(10, 10, 492, 172);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(18, 18, 476, 156);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('⚠ 軍事禁區', 256, 92);
    ctx.font = 'bold 34px monospace';
    ctx.fillText('RESTRICTED AREA', 256, 148);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

function Watchtower({ x, z }: { x: number; z: number }) {
  const h = 5;
  return (
    <group position={[x, 0, z]}>
      {[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([lx, lz]) => (
        <mesh key={`${lx}${lz}`} position={[lx, h / 2, lz]} castShadow>
          <boxGeometry args={[0.18, h, 0.18]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[2.4, 0.9, 2.4]} />
        <meshStandardMaterial color={OLIVE} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.2, 0]} castShadow>
        <coneGeometry args={[1.9, 0.8, 4]} />
        <meshStandardMaterial color={DARK} roughness={0.9} />
      </mesh>
      {/* Searchlight */}
      <mesh position={[0, h + 0.6, -1.1]}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color="#fff7cc" emissive="#fff3a0" emissiveIntensity={2.5} />
      </mesh>
    </group>
  );
}

/** `groupRef` lets the scene hide the whole base once it is beyond draw distance. */
export default memo(function MilitaryBaseMesh({ groupRef }: { groupRef?: React.Ref<THREE.Group> }) {
  const segments = useMemo(wallSegments, []);
  const sign = useSignTexture();

  const corners: [number, number][] = [
    [tileX(BASE_TILE_X0), tileZ(BASE_TILE_Y0)],
    [tileX(BASE_TILE_X1), tileZ(BASE_TILE_Y0)],
    [tileX(BASE_TILE_X0), tileZ(BASE_TILE_Y1)],
    [tileX(BASE_TILE_X1), tileZ(BASE_TILE_Y1)],
  ];

  return (
    <group ref={groupRef} visible={false}>
      {/* ── Perimeter wall ─────────────────────────────────────────── */}
      {segments.map((s, i) => (
        <group key={i}>
          <mesh position={[s.x, WALL_H / 2, s.z]} castShadow receiveShadow>
            <boxGeometry args={[s.w, WALL_H, s.d]} />
            <meshStandardMaterial color={CONCRETE} roughness={0.95} />
          </mesh>
          {/* Coping and a coil of razor wire along the top */}
          <mesh position={[s.x, WALL_H + 0.08, s.z]}>
            <boxGeometry args={[s.w + 0.1, 0.16, s.d + 0.1]} />
            <meshStandardMaterial color="#5f6254" roughness={0.9} />
          </mesh>
          <mesh
            position={[s.x, WALL_H + 0.45, s.z]}
            rotation={s.w > s.d ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.28, 0.28, Math.max(s.w, s.d), 8, 1, true]} />
            <meshStandardMaterial color="#9ca3af" wireframe />
          </mesh>
        </group>
      ))}

      {/* ── Gates: posts, a raised boom, a booth and the warning sign ── */}
      {GATES.map(g => {
        const cx = (tileX(g.gx0) + tileX(g.gx1)) / 2;
        const cz = (tileZ(g.gy0) + tileZ(g.gy1)) / 2;
        const across = g.side === 'S';       // the gap runs along x for the south gate
        const span = across
          ? (g.gx1 - g.gx0 + 1) * TILE_3D
          : (g.gy1 - g.gy0 + 1) * TILE_3D;
        const half = span / 2;
        // Unit vector along the gap, and the outward normal.
        const ax = across ? 1 : 0;
        const az = across ? 0 : 1;
        const ox = across ? 0 : -1;
        const oz = across ? 1 : 0;
        return (
          <group key={g.side}>
            {[-1, 1].map(side => (
              <mesh
                key={side}
                position={[cx + ax * side * (half + 0.3), WALL_H * 0.75, cz + az * side * (half + 0.3)]}
                castShadow
              >
                <boxGeometry args={[0.7, WALL_H * 1.5, 0.7]} />
                <meshStandardMaterial color="#e5e7eb" roughness={0.6} />
              </mesh>
            ))}
            {/* Boom barrier, raised: pivots at one post and points up. */}
            <group
              position={[cx - ax * half, 1.1, cz - az * half]}
              rotation={across ? [0, 0, 1.25] : [-1.25, 0, 0]}
            >
              {Array.from({ length: 6 }, (_, k) => (
                <mesh
                  key={k}
                  position={[ax * (k + 0.5) * (span / 6), 0, az * (k + 0.5) * (span / 6)]}
                >
                  <boxGeometry args={[across ? span / 6 : 0.18, 0.18, across ? 0.18 : span / 6]} />
                  <meshStandardMaterial color={k % 2 === 0 ? '#dc2626' : '#f8fafc'} />
                </mesh>
              ))}
            </group>
            {/* Guard booth, built into the wall beside the gap (a solid tile). */}
            <mesh position={[cx + ax * (half + 2), WALL_H + 1.1, cz + az * (half + 2)]} castShadow>
              <boxGeometry args={[2.2, 2.2, 2.2]} />
              <meshStandardMaterial color="#d6d3c4" roughness={0.8} />
            </mesh>
            {/* Warning sign on the outer face of the wall */}
            {sign && (
              <mesh
                position={[
                  cx - ax * (half + 4) + ox * (WALL_T / 2 + 0.05),
                  WALL_H * 0.55,
                  cz - az * (half + 4) + oz * (WALL_T / 2 + 0.05),
                ]}
                rotation={[0, across ? 0 : -Math.PI / 2, 0]}
              >
                <planeGeometry args={[3.6, 1.35]} />
                <meshBasicMaterial map={sign} toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* ── Hangars and the control tower ─────────────────────────── */}
      {STRUCTURES.map((s, i) => {
        const x = (tileX(s.gx0) + tileX(s.gx1)) / 2;
        const z = (tileZ(s.gy0) + tileZ(s.gy1)) / 2;
        const w = (s.gx1 - s.gx0 + 1) * TILE_3D;
        const d = (s.gy1 - s.gy0 + 1) * TILE_3D;
        if (s.kind === 'tower') {
          const h = s.floors * 1.4;
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, h / 2, 0]} castShadow>
                <boxGeometry args={[2.4, h, 2.4]} />
                <meshStandardMaterial color="#cfcab6" roughness={0.85} />
              </mesh>
              <mesh position={[0, h + 0.7, 0]} castShadow>
                <boxGeometry args={[3.4, 1.4, 3.4]} />
                <meshStandardMaterial color="#1e3a5f" roughness={0.1} metalness={0.6} transparent opacity={0.8} />
              </mesh>
              <mesh position={[0, h + 1.5, 0]}>
                <boxGeometry args={[3.8, 0.2, 3.8]} />
                <meshStandardMaterial color={DARK} />
              </mesh>
              <mesh position={[0, h + 2.6, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 2, 6]} />
                <meshStandardMaterial color="#9ca3af" />
              </mesh>
              <mesh position={[0, h + 3.6, 0]}>
                <sphereGeometry args={[0.15, 8, 6]} />
                <meshStandardMaterial color="#ff2222" emissive="#ff0000" emissiveIntensity={3} />
              </mesh>
            </group>
          );
        }
        const baseH = 1.6;
        const r = w / 2;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, baseH, d]} />
              <meshStandardMaterial color={OLIVE} roughness={0.9} />
            </mesh>
            {/* Barrel roof: a half cylinder along the hangar's depth. Rotating
                +90° about x sends the geometry's -z half upward, hence theta π/2..3π/2. */}
            <mesh position={[0, baseH, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.85]} castShadow>
              <cylinderGeometry args={[r, r, d, 24, 1, false, Math.PI / 2, Math.PI]} />
              <meshStandardMaterial color="#606b48" roughness={0.8} metalness={0.2} side={THREE.DoubleSide} />
            </mesh>
            {/* Door on the south face */}
            <mesh position={[0, baseH + r * 0.3, d / 2 + 0.02]}>
              <planeGeometry args={[w * 0.7, baseH + r * 0.6]} />
              <meshStandardMaterial color="#1c1f17" roughness={0.9} />
            </mesh>
            <mesh position={[0, baseH + r * 0.85 + 0.35, d / 2 + 0.04]}>
              <planeGeometry args={[w * 0.35, 0.8]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* ── Watchtowers on the corners ────────────────────────────── */}
      {corners.map(([x, z], i) => <Watchtower key={i} x={x} z={z} />)}

      {/* ── Helipad on the apron ──────────────────────────────────── */}
      <group position={[tileX(138), 0.05, tileZ(29)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[5, 32]} />
          <meshStandardMaterial color="#3c4130" roughness={1} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[4.3, 4.7, 32]} />
          <meshStandardMaterial color="#facc15" roughness={0.8} />
        </mesh>
        {[-1, 1].map(s => (
          <mesh key={s} position={[s * 1.1, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.5, 3.4]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        ))}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.8, 0.5]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>

      {/* ── Flag by the south gate ────────────────────────────────── */}
      <group position={[tileX(132), 0, tileZ(37)]}>
        <mesh position={[0, 4, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 8, 8]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0.9, 7.2, 0]}>
          <planeGeometry args={[1.8, 1.1]} />
          <meshStandardMaterial color="#3f6212" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
});
