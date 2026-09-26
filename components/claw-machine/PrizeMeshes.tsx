'use client';
// Meshes for every stockable prize. Each draws around its own centre at the
// size clawSim gave it (r for round items, halfX/Y/Z for boxes), so what you
// see is exactly what the physics collides with.

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Prize } from './clawSim';

// ── Printed box art (canvas textures, cached per design) ─────────────────────

const artCache = new Map<string, THREE.CanvasTexture>();

function boxArt(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = artCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  artCache.set(key, tex);
  return tex;
}

function snackArt(color: string, accent: string) {
  return boxArt(`snack:${color}:${accent}`, 256, 128, (ctx) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.ellipse(70, 64, 46, 40, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    for (const [x, y] of [[55, 50], [85, 58], [65, 80], [88, 82]]) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = '900 44px "Microsoft JhengHei","PingFang TC",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.strokeText('好吃', 180, 58);
    ctx.fillStyle = accent; ctx.fillText('好吃', 180, 58);
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText('SNACK', 180, 100);
  });
}

function figureArt(color: string, accent: string) {
  return boxArt(`figure:${color}:${accent}`, 128, 192, (ctx) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 192);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 128, 30); ctx.fillRect(0, 170, 128, 22);
    ctx.fillStyle = color;
    ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FIGURE', 64, 15);
    // Window cut-out behind which the figure stands (drawn as a mesh).
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(16, 42, 96, 118);
    ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.strokeRect(16, 42, 96, 118);
  });
}

function drinkArt(color: string, accent: string) {
  return boxArt(`drink:${color}:${accent}`, 128, 208, (ctx) => {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 128, 208);
    ctx.fillStyle = color; ctx.fillRect(0, 60, 128, 148);
    // Fruit / leaf badge and the brand
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(64, 118, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(64, 118, 18, 0, Math.PI * 2); ctx.fill();
    ctx.font = '900 30px "Microsoft JhengHei","PingFang TC",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText('好喝', 64, 32);
    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText('250ml', 64, 180);
  });
}

/** A die face with 1–6 pips, laid out as on a real die. */
function pipArt(n: number, face: string, pip: string) {
  return boxArt(`pips:${n}:${face}:${pip}`, 128, 128, (ctx) => {
    ctx.fillStyle = face; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 122, 122);
    const L = 34, M = 64, H = 94;
    const layout: Record<number, [number, number][]> = {
      1: [[M, M]], 2: [[L, L], [H, H]], 3: [[L, L], [M, M], [H, H]],
      4: [[L, L], [H, L], [L, H], [H, H]], 5: [[L, L], [H, L], [M, M], [L, H], [H, H]],
      6: [[L, L], [H, L], [L, M], [H, M], [L, H], [H, H]],
    };
    ctx.fillStyle = n === 1 && face !== '#dc2626' ? '#dc2626' : pip;
    for (const [x, y] of layout[n]) { ctx.beginPath(); ctx.arc(x, y, n === 1 ? 16 : 11, 0, Math.PI * 2); ctx.fill(); }
  });
}

function numberArt(n: number, ink: string) {
  return boxArt(`num:${n}:${ink}`, 64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ink; ctx.fillText(String(n), 32, 34);
    if (n === 6 || n === 9) ctx.fillRect(20, 52, 24, 4); // underline, as dice do
  });
}

// ── Items ────────────────────────────────────────────────────────────────────

function PlushBody({ prize }: { prize: Prize }) {
  const { r, color, accent, kind } = prize;
  const mat = <meshStandardMaterial color={color} roughness={0.95} />;
  const dark = <meshStandardMaterial color="#111" roughness={0.4} />;
  const eyeY = r * 0.18, eyeX = r * 0.32, eyeZ = r * 0.9;
  return (
    <>
      <mesh castShadow receiveShadow scale={[1, kind === 'chick' ? 1 : 0.94, 1]}>
        <sphereGeometry args={[r, 20, 16]} />{mat}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * eyeX, eyeY, eyeZ]}>
          <sphereGeometry args={[r * 0.09, 8, 8]} />{dark}
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[s * r * 0.55, -r * 0.1, r * 0.78]} scale={[1, 0.6, 0.4]}>
          <sphereGeometry args={[r * 0.12, 8, 8]} />
          <meshStandardMaterial color="#fb7185" roughness={1} transparent opacity={0.7} />
        </mesh>
      ))}
      {kind === 'bear' && [-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.62, r * 0.72, 0]} castShadow>
          <sphereGeometry args={[r * 0.3, 10, 10]} />{mat}
        </mesh>
      ))}
      {kind === 'bear' && (
        <mesh position={[0, -r * 0.12, r * 0.88]} scale={[1, 0.75, 0.6]}>
          <sphereGeometry args={[r * 0.28, 10, 10]} />
          <meshStandardMaterial color={accent} roughness={1} />
        </mesh>
      )}
      {kind === 'cat' && [-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.55, r * 0.85, 0]} rotation={[0, 0, -s * 0.35]} castShadow>
          <coneGeometry args={[r * 0.3, r * 0.5, 4]} />{mat}
        </mesh>
      ))}
      {kind === 'bunny' && [-1, 1].map((s) => (
        <mesh key={s} position={[s * r * 0.35, r * 1.2, 0]} rotation={[0, 0, -s * 0.18]} scale={[0.35, 1, 0.22]} castShadow>
          <sphereGeometry args={[r * 0.6, 10, 10]} />{mat}
        </mesh>
      ))}
      {kind === 'chick' && (
        <>
          <mesh position={[0, 0, r * 1.0]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[r * 0.16, r * 0.3, 8]} />
            <meshStandardMaterial color={accent} roughness={0.6} />
          </mesh>
          <mesh position={[0, r * 1.02, 0]}>
            <coneGeometry args={[r * 0.12, r * 0.3, 6]} />{mat}
          </mesh>
        </>
      )}
      {kind === 'frog' && [-1, 1].map((s) => (
        <group key={s} position={[s * r * 0.42, r * 0.78, r * 0.3]}>
          <mesh castShadow><sphereGeometry args={[r * 0.26, 10, 10]} />{mat}</mesh>
          <mesh position={[0, r * 0.05, r * 0.2]}>
            <sphereGeometry args={[r * 0.1, 8, 8]} />{dark}
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Gashapon capsule: tinted clear top, solid coloured bottom, a toy inside. */
function Capsule({ prize }: { prize: Prize }) {
  const { r, color, accent } = prize;
  return (
    <>
      <mesh castShadow>
        <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color={accent} transparent opacity={0.45} roughness={0.05} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshPhysicalMaterial color={color} roughness={0.15} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 1.005, r * 0.05, 6, 32]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.3} />
      </mesh>
      {/* the toy inside */}
      <mesh position={[0, r * 0.25, 0]}>
        <sphereGeometry args={[r * 0.4, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </>
  );
}

/** Ball: body plus seam rings (basketball / soccer / volleyball colourways). */
function Ball({ prize }: { prize: Prize }) {
  const { r, color, accent } = prize;
  const seam = <meshStandardMaterial color={accent} roughness={0.7} />;
  return (
    <>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[r, 24, 18]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r * 1.003, r * 0.035, 6, 40]} />{seam}</mesh>
      <mesh><torusGeometry args={[r * 1.003, r * 0.035, 6, 40]} />{seam}</mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[r * 1.003, r * 0.035, 6, 40]} />{seam}</mesh>
    </>
  );
}

/** Boxed figure: printed box, clear window on the front, the figure inside. */
function FigureBox({ prize }: { prize: Prize }) {
  const { halfX, halfY, halfZ, color, accent } = prize;
  const art = useMemo(() => figureArt(color, accent), [color, accent]);
  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[halfX * 2, halfY * 2, halfZ * 2]} />
        {/* Face order: +x, -x, +y (lid), -y, +z (printed front), -z */}
        {[color, color, accent, color, null, color].map((c, i) => (
          c === null
            ? <meshStandardMaterial key={i} attach={`material-${i}`} map={art} roughness={0.5} />
            : <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.6} />
        ))}
      </mesh>
      {/* Figure standing behind the window */}
      <group position={[0, -halfY * 0.1, halfZ * 0.4]}>
        <mesh position={[0, -halfY * 0.25, 0]}>
          <cylinderGeometry args={[halfX * 0.28, halfX * 0.35, halfY * 0.7, 12]} />
          <meshStandardMaterial color={accent} roughness={0.4} />
        </mesh>
        <mesh position={[0, halfY * 0.28, 0]}>
          <sphereGeometry args={[halfX * 0.3, 14, 12]} />
          <meshStandardMaterial color="#fde7c8" roughness={0.5} />
        </mesh>
      </group>
    </>
  );
}

/** Flat snack box with printed lid. */
function SnackBox({ prize }: { prize: Prize }) {
  const { halfX, halfY, halfZ, color, accent } = prize;
  const art = useMemo(() => snackArt(color, accent), [color, accent]);
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[halfX * 2, halfY * 2, halfZ * 2]} />
      {/* Printed lid (+y) and front (+z); plain colour elsewhere */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        i === 2 || i === 4
          ? <meshStandardMaterial key={i} attach={`material-${i}`} map={art} roughness={0.45} />
          : <meshStandardMaterial key={i} attach={`material-${i}`} color={color} roughness={0.55} />
      ))}
    </mesh>
  );
}

/** 250 ml Tetra Pak: printed carton, sealed top fin, straw in its wrapper on the back. */
function DrinkBox({ prize }: { prize: Prize }) {
  const { halfX, halfY, halfZ, color, accent } = prize;
  const art = useMemo(() => drinkArt(color, accent), [color, accent]);
  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[halfX * 2, halfY * 2, halfZ * 2]} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          i === 4 || i === 5
            ? <meshStandardMaterial key={i} attach={`material-${i}`} map={art} roughness={0.4} />
            : <meshStandardMaterial key={i} attach={`material-${i}`} color={i === 2 ? '#f8fafc' : color} roughness={0.45} />
        ))}
      </mesh>
      {/* Folded top fin */}
      <mesh position={[0, halfY + 0.002, 0]}>
        <boxGeometry args={[halfX * 2, 0.004, halfZ * 0.5]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      {/* Straw in its wrapper, stuck on the back */}
      <mesh position={[halfX * 0.45, halfY * 0.05, -halfZ - 0.003]} rotation={[0, 0, 0.12]}>
        <cylinderGeometry args={[0.003, 0.003, halfY * 1.6, 6]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
      </mesh>
    </>
  );
}

/** Pips per box face (+x, -x, +y, -y, +z, -z): opposite faces add up to 7. */
const D6_FACES = [3, 4, 1, 6, 2, 5];

/** Big foam die with pips. */
function Dice6({ prize }: { prize: Prize }) {
  const { halfX, halfY, halfZ, color, accent } = prize;
  const arts = useMemo(() => D6_FACES.map((n) => pipArt(n, color, accent)), [color, accent]);
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[halfX * 2, halfY * 2, halfZ * 2]} />
      {arts.map((art, i) => <meshStandardMaterial key={i} attach={`material-${i}`} map={art} roughness={0.7} />)}
    </mesh>
  );
}

/** Face centres (unit normals) of the dodecahedron the physics uses. */
const DODECA_NORMALS: THREE.Vector3[] = (() => {
  const f = (1 + Math.sqrt(5)) / 2;
  const out: THREE.Vector3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    out.push(new THREE.Vector3(0, a * f, b).normalize(), new THREE.Vector3(a, 0, b * f).normalize(), new THREE.Vector3(a * f, b, 0).normalize());
  }
  return out;
})();

/** Dodecahedron geometry matching the collider (vertices on the circumsphere r). */
function useDodecaGeometry(r: number) {
  return useMemo(() => {
    const f = (1 + Math.sqrt(5)) / 2, g = 1 / f;
    const pts: THREE.Vector3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(new THREE.Vector3(x, y, z));
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      pts.push(new THREE.Vector3(0, a * g, b * f), new THREE.Vector3(a * g, b * f, 0), new THREE.Vector3(a * f, 0, b * g));
    }
    const s = r / Math.sqrt(3);
    const scaled = pts.map((v) => v.multiplyScalar(s));
    // ConvexGeometry isn't in core three; build faces from each face normal's five nearest vertices.
    const positions: number[] = [];
    for (const n of DODECA_NORMALS) {
      const face = scaled
        .map((v) => ({ v, d: v.dot(n) }))
        .sort((a, b) => b.d - a.d)
        .slice(0, 5)
        .map((e) => e.v);
      const c = face.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / 5);
      const u = new THREE.Vector3().subVectors(face[0], c).normalize();
      const w = new THREE.Vector3().crossVectors(n, u);
      face.sort((a, b) => {
        const pa = new THREE.Vector3().subVectors(a, c), pb = new THREE.Vector3().subVectors(b, c);
        return Math.atan2(pa.dot(w), pa.dot(u)) - Math.atan2(pb.dot(w), pb.dot(u));
      });
      for (let i = 1; i < 4; i++) positions.push(...face[0].toArray(), ...face[i].toArray(), ...face[i + 1].toArray());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [r]);
}

/** 12-sided die: the collider's own dodecahedron, flat-shaded, numbered 1–12. */
function Dice12({ prize }: { prize: Prize }) {
  const { r, color, accent } = prize;
  const geo = useDodecaGeometry(r);
  const inR = r * 0.7947;
  return (
    <>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.35} flatShading />
      </mesh>
      {DODECA_NORMALS.map((n, i) => (
        <mesh
          key={i}
          position={n.clone().multiplyScalar(inR + 0.0008)}
          quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)}
        >
          <planeGeometry args={[r * 0.5, r * 0.5]} />
          <meshBasicMaterial map={numberArt(i + 1, accent)} transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

/** Polished steel ball. */
function SteelBall({ prize }: { prize: Prize }) {
  const { r, color } = prize;
  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[r, 28, 20]} />
      {/* Not fully metallic: in the dim cabinet a pure mirror reads as black. */}
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.22} envMapIntensity={1.6} />
    </mesh>
  );
}

/**
 * One prize. ClawScene copies the rigid body's position and orientation onto
 * the registered group every frame, so it tumbles exactly as the physics does.
 */
export function PrizeMesh({ prize, register }: { prize: Prize; register: (id: number, g: THREE.Group | null) => void }) {
  let body: React.ReactNode;
  switch (prize.category) {
    case 'plush': body = <PlushBody prize={prize} />; break;
    case 'capsule': body = <Capsule prize={prize} />; break;
    case 'ball': body = <Ball prize={prize} />; break;
    case 'figure': body = <FigureBox prize={prize} />; break;
    case 'snack': body = <SnackBox prize={prize} />; break;
    case 'drink': body = <DrinkBox prize={prize} />; break;
    case 'dice6': body = <Dice6 prize={prize} />; break;
    case 'dice12': body = <Dice12 prize={prize} />; break;
    case 'steel': body = <SteelBall prize={prize} />; break;
  }
  return (
    <group ref={(g) => register(prize.id, g)}>
      {body}
    </group>
  );
}
