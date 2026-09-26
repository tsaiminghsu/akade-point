'use client';

// The 大怒神 towers as drawn: each one's acrylic shaft, base and the wooden
// collar round the top (fixed, from the same boxes as the physics), and the
// platform on its coil springs, the acrylic box (split down the middle in a
// 雙格) with the iron disc on its lid, and the dice inside, which follow the
// sim every frame.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ClawSim } from './clawSim';
import { DIE_FACES, TOWER, TOWER_DICE, boxParts, isRed, towerBoxes, type TowerSite } from './tower';

const WOOD = '#d9b98f';
const MDF = '#c8a57a';
/** Most dice a tower can hold: five in each cell of a 雙格. */
const MAX_DICE = TOWER_DICE.max * 2;

/** A die face: white with a rounded edge line, black pips, the 1 and the 4 in red as on Taiwanese dice. */
function faceArt(points: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d6d3d1';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fffefb';
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 120, 18);
    ctx.fill();
    const L = 34, M = 64, H = 94;
    const layout: Record<number, [number, number][]> = {
      1: [[M, M]], 2: [[L, L], [H, H]], 3: [[L, L], [M, M], [H, H]],
      4: [[L, L], [H, L], [L, H], [H, H]], 5: [[L, L], [H, L], [M, M], [L, H], [H, H]],
      6: [[L, L], [H, L], [L, M], [H, M], [L, H], [H, H]],
    };
    ctx.fillStyle = isRed(points) ? '#dc2626' : '#111827';
    for (const [x, y] of layout[points]) {
      ctx.beginPath();
      ctx.arc(x, y, points === 1 ? 24 : 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The name board on the collar's front. */
function nameArt() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = MDF;
    ctx.fillRect(0, 0, 256, 48);
    ctx.strokeStyle = '#6b4f2a';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 6, 176, 36);
    ctx.fillStyle = '#4a3418';
    ctx.font = 'bold 28px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('大 怒 神', 128, 26);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A coil spring of unit height (y 0 to 1), scaled to its length each frame. */
function useSpringGeometry() {
  const geo = useMemo(() => {
    const turns = 6, r = 0.034, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns * 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, i / (turns * 24), Math.sin(a) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.0028, 6, false);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** One tower's shaft, base and collar. */
function TowerShell({ site, name }: { site: TowerSite; name: THREE.Texture | null }) {
  const boxes = useMemo(() => towerBoxes(site), [site]);
  const { x, z, collar } = site;
  const { wall, height: H } = TOWER;
  const ex = site.size.inner.x + wall, ez = site.size.inner.z + wall;
  return (
    <group>
      {boxes.map((b, i) => (
        <mesh
          key={i}
          position={[b.center.x, b.center.y, b.center.z]}
          castShadow={b.part !== 'wall'}
          receiveShadow={b.part !== 'wall'}
          renderOrder={b.part === 'wall' ? 2 : 0}
        >
          <boxGeometry args={[b.half.x * 2, b.half.y * 2, b.half.z * 2]} />
          {b.part === 'wall' ? (
            <meshPhysicalMaterial color="#f8fafc" transparent opacity={0.1} roughness={0.05} clearcoat={1} depthWrite={false} />
          ) : (
            <meshStandardMaterial color={b.part === 'base' ? WOOD : MDF} roughness={0.85} />
          )}
        </mesh>
      ))}
      {/* The acrylic's cut edges catch the light down each corner */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[x + sx * ex, H / 2, z + sz * ez]}>
          <boxGeometry args={[wall * 1.2, H, wall * 1.2]} />
          <meshStandardMaterial color="#e2e8f0" transparent opacity={0.5} roughness={0.2} depthWrite={false} />
        </mesh>
      ))}
      {name && (
        <mesh position={[x, H + TOWER.collar.h / 2, z + collar.z + 0.0008]}>
          <planeGeometry args={[Math.min(collar.x * 2 * 0.9, 0.2), TOWER.collar.h * 0.9]} />
          <meshStandardMaterial map={name} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

/** The 壓克力盒: clear panels (and a 雙格's divider) with bright cut edges, and the iron disc on the lid. */
function AcrylicBox({ site }: { site: TowerSite }) {
  const parts = useMemo(() => boxParts(site), [site]);
  const { x: bx, z: bz } = site.size.box;
  const B = TOWER.box;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(bx * 2, B.h, bz * 2)), [bx, bz, B.h]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} position={[p.offset.x, p.offset.y, p.offset.z]} renderOrder={3}>
          <boxGeometry args={[p.half.x * 2, p.half.y * 2, p.half.z * 2]} />
          <meshPhysicalMaterial color="#f1f5f9" transparent opacity={0.12} roughness={0.05} clearcoat={1} depthWrite={false} />
        </mesh>
      ))}
      <lineSegments geometry={edges} position={[0, B.h / 2, 0]}>
        <lineBasicMaterial color="#e2e8f0" transparent opacity={0.7} />
      </lineSegments>
      {site.kind === 'double' && (
        // The divider's cut edge down the middle.
        <mesh position={[0, B.h / 2, bz - B.wall]}>
          <boxGeometry args={[B.wall * 1.2, B.h - B.wall * 2, 0.002]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.7} />
        </mesh>
      )}
      <mesh position={[0, B.h + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <circleGeometry args={[B.disc, 32]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** One tower's platform, springs, box and dice, placed from the sim each frame. */
function TowerParts({ sim, site, faces }: { sim: ClawSim; site: TowerSite; faces: THREE.Texture[] }) {
  const platform = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const springs = useRef<(THREE.Mesh | null)[]>([]);
  const dice = useRef<(THREE.Mesh | null)[]>([]);
  const springGeo = useSpringGeometry();
  const P = site.size.platform;
  const d = TOWER.die.half * 2;
  const springX = site.size.springs === 1 ? [0] : [-P.x * 0.55, P.x * 0.55];

  useFrame(() => {
    const t = sim.towers.find((w) => w.site.index === site.index && w.site.kind === site.kind);
    if (platform.current) {
      platform.current.visible = !!t;
      if (t) platform.current.position.y = t.y;
    }
    for (const s of springs.current) {
      if (!s) continue;
      s.visible = !!t;
      if (t) s.scale.y = Math.max(0.005, t.y - TOWER.baseTop);
    }
    if (box.current) {
      box.current.visible = !!t;
      if (t) box.current.position.y = t.boxY;
    }
    dice.current.forEach((m, i) => {
      if (!m) return;
      const die = t?.dice[i];
      m.visible = !!die;
      if (!die) return;
      m.position.set(die.x, die.y, die.z);
      m.quaternion.set(die.qx, die.qy, die.qz, die.qw);
    });
  });

  return (
    <group>
      <group ref={platform} position={[site.x, 0, site.z]}>
        {/* 升降台: the wooden block on the springs that the box lands on */}
        <mesh position={[0, TOWER.platform.thick / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[P.x * 2, TOWER.platform.thick, P.z * 2]} />
          <meshStandardMaterial color={WOOD} roughness={0.8} />
        </mesh>
      </group>
      <group ref={box} position={[site.x, 0, site.z]}>
        <AcrylicBox site={site} />
      </group>
      {springX.map((sx, i) => (
        <mesh
          key={i}
          ref={(m) => { springs.current[i] = m; }}
          geometry={springGeo}
          position={[site.x + sx, TOWER.baseTop, site.z]}
        >
          <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: MAX_DICE }, (_, i) => (
        <mesh key={i} ref={(m) => { dice.current[i] = m; }} castShadow visible={false}>
          <boxGeometry args={[d, d, d]} />
          {faces.map((tex, j) => <meshStandardMaterial key={j} attach={`material-${j}`} map={tex} roughness={0.35} />)}
        </mesh>
      ))}
    </group>
  );
}

/** The six face textures of a die, in box-face order (for a box geometry's six materials). */
export function useDiceFaces() {
  const faces = useMemo(
    () => (typeof document === 'undefined' ? [] : DIE_FACES.map((n) => faceArt(n))),
    [],
  );
  useEffect(() => () => faces.forEach((t) => t.dispose()), [faces]);
  return faces;
}

/** The 大怒神 towers where the setup stands them, fixed parts and moving ones. */
export default function TowerView({ sim, sites }: { sim: ClawSim; sites: TowerSite[] }) {
  const faces = useDiceFaces();
  const name = useMemo(() => (typeof document === 'undefined' ? null : nameArt()), []);
  useEffect(() => () => name?.dispose(), [name]);
  return (
    <group>
      {sites.map((site) => (
        <group key={`${site.index}-${site.kind}-${site.x.toFixed(3)}-${site.z.toFixed(3)}`}>
          <TowerShell site={site} name={name} />
          <TowerParts sim={sim} site={site} faces={faces} />
        </group>
      ))}
    </group>
  );
}
