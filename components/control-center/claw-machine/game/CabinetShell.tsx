'use client';
// Cabinet body for the claw machine, proportioned after a Feiloli-style
// standard cabinet (about 80 × 87 × 191 cm): yellow sheet-metal base with a
// protruding control deck and prize door, yellow-framed tempered-glass box,
// and a lit sign box on top. The play-field geometry (BOX, CHUTE) comes from
// clawSim.ts so what is drawn matches the physics.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOX, CHUTE, type Chute } from './clawSim';

const YELLOW = '#f5c518';
const YELLOW_DARK = '#d9a90b';
const W = BOX.maxX - BOX.minX;
const D = BOX.maxZ - BOX.minZ;
const POST = 0.05;
/** Outer extents of the frame (posts sit just outside the glass). */
const OX = W / 2 + POST;
const OZ = D / 2 + POST;
const BASE_BOTTOM = -0.8;
const ROOF_Y = BOX.height;
const SIGN_H = 0.26;
const DECK_DEPTH = 0.2;

/**
 * Render layer for the roof (ceiling + sign box). Cameras looking down from
 * above disable it so they can see into the cabinet; everything else sees it.
 * Roof meshes must not cast shadows: the shadow pass tests layers against the
 * viewing camera, so a caster here would shade the play field only in some views.
 */
export const ROOF_LAYER = 1;

/** Move every descendant onto a single render layer (layers aren't inherited). */
function OnLayer({ layer, children }: { layer: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => o.layers.set(layer));
  });
  return <group ref={ref}>{children}</group>;
}

function useCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
    // draw is a static function per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);
}

function Yellow({ dark }: { dark?: boolean }) {
  return <meshStandardMaterial color={dark ? YELLOW_DARK : YELLOW} metalness={0.25} roughness={0.42} />;
}

// ── Glass ────────────────────────────────────────────────────────────────────

function GlassPane({ width, height, position, rotationY = 0, streaks = true }: {
  width: number; height: number; position: [number, number, number]; rotationY?: number;
  /** Side panes skip them: seen through the cabinet they cross into an X. */
  streaks?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial
          color="#dff4ff" transparent opacity={0.16} roughness={0.04} metalness={0}
          clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.6}
          side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>
      {/* Reflection streaks so the pane reads as glass */}
      {streaks && [
        { x: -0.28, w: 0.07, o: 0.12 },
        { x: -0.18, w: 0.025, o: 0.1 },
        { x: 0.22, w: 0.05, o: 0.07 },
      ].map((s, i) => (
        <mesh key={i} position={[s.x * width, 0, 0.001]} rotation={[0, 0, -0.5]} renderOrder={3}>
          <planeGeometry args={[s.w, height * 1.05]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={s.o} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Base() {
  const decal = useCanvasTexture(512, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, '#ec4899'); g.addColorStop(0.5, '#f9a8d4'); g.addColorStop(1, '#ec4899');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 18; i++) {
      ctx.beginPath(); ctx.arc(20 + i * 29, 64 + (i % 2 ? 22 : -22), 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#9d174d'; ctx.strokeText('CLAW  GAME', 256, 66);
    ctx.fillText('CLAW  GAME', 256, 66);
  });
  const baseH = -BASE_BOTTOM;
  const doorX = (CHUTE.minX + CHUTE.maxX) / 2;
  return (
    <group>
      {/* Main yellow body */}
      <mesh position={[0, BASE_BOTTOM + baseH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[OX * 2, baseH, OZ * 2]} />
        <Yellow />
      </mesh>
      {/* Kick plate */}
      <mesh position={[0, BASE_BOTTOM + 0.04, OZ + 0.005]}>
        <boxGeometry args={[OX * 2, 0.08, 0.012]} />
        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Decal band */}
      <mesh position={[0.12, -0.42, OZ + 0.0015]}>
        <planeGeometry args={[0.62, 0.15]} />
        <meshStandardMaterial map={decal} roughness={0.6} />
      </mesh>
      {/* Prize outlet: yellow-framed black flap with an anti-pry plate */}
      <group position={[doorX, -0.5, OZ]}>
        <mesh position={[0, 0, 0.004]}>
          <boxGeometry args={[0.24, 0.22, 0.01]} />
          <Yellow dark />
        </mesh>
        <mesh position={[0, 0.005, 0.01]}>
          <boxGeometry args={[0.19, 0.16, 0.006]} />
          <meshStandardMaterial color="#0b0b10" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.095, 0.014]}>
          <boxGeometry args={[0.2, 0.018, 0.004]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.02, 0.0135]}>
          <boxGeometry args={[0.08, 0.012, 0.004]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
      {/* Coin box: slot + reject button + lock */}
      <group position={[0.3, -0.62, OZ]}>
        <mesh position={[0, 0, 0.004]}>
          <boxGeometry args={[0.14, 0.2, 0.01]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.05, 0.01]}>
          <boxGeometry args={[0.012, 0.045, 0.004]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        <mesh position={[0, -0.02, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.008, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, -0.07, 0.011]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.009, 0.009, 0.006, 12]} />
          <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.2} />
        </mesh>
      </group>
      {/* Neon strip along the top of the base */}
      <mesh position={[0, -0.005, OZ + 0.004]}>
        <boxGeometry args={[OX * 2, 0.012, 0.008]} />
        <meshStandardMaterial color="#ff5fd2" emissive="#ff5fd2" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Decorative control deck; the real inputs are the DOM controls below the canvas. */
function ControlDeck() {
  const z = OZ + DECK_DEPTH / 2;
  return (
    <group position={[0, -0.13, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[OX * 2 - 0.04, 0.07, DECK_DEPTH]} />
        <meshStandardMaterial color="#111318" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.005, DECK_DEPTH / 2 + 0.001]}>
        <planeGeometry args={[OX * 2 - 0.04, 0.05]} />
        <Yellow dark />
      </mesh>
      {/* Joystick: dust washer, shaft, red ball top */}
      <group position={[-0.06, 0.035, 0.01]}>
        <mesh><cylinderGeometry args={[0.03, 0.03, 0.004, 20]} /><meshStandardMaterial color="#000" /></mesh>
        <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.005, 0.005, 0.07, 10]} /><meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.2} /></mesh>
        <mesh position={[0, 0.075, 0]} castShadow><sphereGeometry args={[0.022, 20, 16]} /><meshStandardMaterial color="#dc2626" roughness={0.25} /></mesh>
      </group>
      {/* Drop button */}
      <group position={[0.2, 0.035, 0.01]}>
        <mesh><cylinderGeometry args={[0.04, 0.04, 0.01, 24]} /><meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.2} /></mesh>
        <mesh position={[0, 0.012, 0]}><cylinderGeometry args={[0.032, 0.034, 0.016, 24]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} roughness={0.3} /></mesh>
      </group>
      {/* Small LCD */}
      <mesh position={[-0.3, 0.036, 0.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.12, 0.06]} />
        <meshStandardMaterial color="#1a0303" emissive="#ef4444" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function Frame() {
  const posts: [number, number][] = [[-OX + POST / 2, -OZ + POST / 2], [OX - POST / 2, -OZ + POST / 2], [-OX + POST / 2, OZ - POST / 2], [OX - POST / 2, OZ - POST / 2]];
  const railY = [0.02, ROOF_Y - 0.02];
  return (
    <group>
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, ROOF_Y / 2, z]} castShadow>
          <boxGeometry args={[POST, ROOF_Y, POST]} />
          <Yellow />
        </mesh>
      ))}
      {/* LED strips down the front posts */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (OX - POST / 2), ROOF_Y / 2, OZ + 0.002]}>
          <boxGeometry args={[0.012, ROOF_Y - 0.06, 0.004]} />
          <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
      ))}
      {/* Horizontal rails top and bottom on front and sides */}
      {railY.map((y) => (
        <group key={y}>
          <mesh position={[0, y, OZ - POST / 2]}><boxGeometry args={[OX * 2, 0.04, POST]} /><Yellow dark /></mesh>
          <mesh position={[-OX + POST / 2, y, 0]}><boxGeometry args={[POST, 0.04, OZ * 2]} /><Yellow dark /></mesh>
          <mesh position={[OX - POST / 2, y, 0]}><boxGeometry args={[POST, 0.04, OZ * 2]} /><Yellow dark /></mesh>
        </group>
      ))}
      {/* Front door: slim black metal edge, hinge side left, lock right */}
      <group position={[0, ROOF_Y / 2, OZ - POST / 2 + 0.02]}>
        {[[-(W / 2) + 0.004, 0, 0.008, ROOF_Y - 0.08], [W / 2 - 0.004, 0, 0.008, ROOF_Y - 0.08], [0, ROOF_Y / 2 - 0.044, W, 0.008], [0, -ROOF_Y / 2 + 0.044, W, 0.008]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <boxGeometry args={[w, h, 0.01]} />
            <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[W / 2 - 0.03, -0.1, 0.008]}>
          <boxGeometry args={[0.018, 0.08, 0.012]} />
          <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.2} />
        </mesh>
        <mesh position={[W / 2 - 0.03, -0.17, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.008, 12]} />
          <meshStandardMaterial color="#facc15" metalness={1} roughness={0.25} />
        </mesh>
      </group>
      <GlassPane width={W} height={ROOF_Y - 0.08} position={[0, ROOF_Y / 2, OZ - POST / 2 + 0.026]} />
      <GlassPane width={D} height={ROOF_Y - 0.08} position={[-OX + POST / 2, ROOF_Y / 2, 0]} rotationY={-Math.PI / 2} streaks={false} />
      <GlassPane width={D} height={ROOF_Y - 0.08} position={[OX - POST / 2, ROOF_Y / 2, 0]} rotationY={Math.PI / 2} streaks={false} />
    </group>
  );
}

const BULBS = 14;

function SignBox() {
  const sign = useCanvasTexture(1024, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#fff7fb'); g.addColorStop(1, '#ffd6ec');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 256);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 150px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.lineJoin = 'round'; ctx.lineWidth = 22; ctx.strokeStyle = '#be185d';
    ctx.strokeText('飛絡力', 512, 118);
    ctx.fillStyle = '#facc15'; ctx.fillText('飛絡力', 512, 118);
    ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = '#9d174d';
    ctx.fillText('★ 選物販賣機 ★', 512, 222);
  });
  const bulbs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    bulbs.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = 0.4 + 2.2 * Math.max(0, Math.sin(t * 5 - i * 0.9));
    });
  });
  const y = ROOF_Y + SIGN_H / 2;
  return (
    <group>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[OX * 2, SIGN_H, OZ * 2]} />
        <Yellow />
      </mesh>
      {/* Rounded crown */}
      <mesh position={[0, ROOF_Y + SIGN_H, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1]}>
        <cylinderGeometry args={[0.06, 0.06, OX * 2, 24, 1, false, 0, Math.PI]} />
        <Yellow dark />
      </mesh>
      <mesh position={[0, y, OZ + 0.002]}>
        <planeGeometry args={[OX * 2 - 0.1, SIGN_H - 0.07]} />
        <meshStandardMaterial map={sign} emissive="#ffffff" emissiveMap={sign} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      {Array.from({ length: BULBS }, (_, i) => (
        <mesh key={i} position={[-OX + 0.04 + (i * (OX * 2 - 0.08)) / (BULBS - 1), ROOF_Y + 0.018, OZ + 0.01]}>
          <sphereGeometry args={[0.011, 10, 10]} />
          <meshStandardMaterial
            ref={(m) => { bulbs.current[i] = m; }}
            color="#fde68a" emissive="#fbbf24" emissiveIntensity={1} toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Interior({ chute }: { chute: Chute }) {
  const back = useCanvasTexture(256, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#f5d0fe'); g.addColorStop(1, '#a78bfa');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % 256, yy = (i * 53) % 256;
      ctx.beginPath(); ctx.arc(x, yy, 3 + (i % 3) * 2, 0, Math.PI * 2); ctx.fill();
    }
  });
  const mainFloorW = BOX.maxX - chute.maxX;
  const backFloorD = chute.minZ - BOX.minZ;
  const felt = <meshStandardMaterial color="#2563eb" roughness={1} />;
  const acrylic = <meshStandardMaterial color="#fef9c3" transparent opacity={0.3} roughness={0.05} depthWrite={false} />;
  const glow = <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.4} toneMapped={false} />;
  const chuteCx = (chute.minX + chute.maxX) / 2;
  const chuteCz = (chute.minZ + chute.maxZ) / 2;
  const chuteW = chute.maxX - chute.minX;
  const chuteD = chute.maxZ - chute.minZ;
  const wallH = chute.wallH;
  return (
    <group>
      {/* Felt floor: L-shape around the chute hole */}
      {/* Felt sits 2 mm proud of the yellow base top so the two faces don't z-fight */}
      <mesh position={[chute.maxX + mainFloorW / 2, -0.003, 0]} receiveShadow>
        <boxGeometry args={[mainFloorW, 0.01, D]} />{felt}
      </mesh>
      <mesh position={[(BOX.minX + chute.maxX) / 2, -0.003, BOX.minZ + backFloorD / 2]} receiveShadow>
        <boxGeometry args={[chute.maxX - BOX.minX, 0.01, backFloorD]} />{felt}
      </mesh>
      {/* Chute shaft */}
      <mesh position={[chuteCx, -0.2, chuteCz]}>
        <boxGeometry args={[chuteW, 0.4, chuteD]} />
        <meshStandardMaterial color="#05060a" side={THREE.BackSide} />
      </mesh>
      {/* Acrylic 擋板 fencing the chute, with a glowing top edge (or just a lit rim with no 擋板) */}
      {wallH > 0.001 && (
        <>
          <mesh position={[chute.maxX, wallH / 2, chuteCz]}><boxGeometry args={[0.006, wallH, chuteD]} />{acrylic}</mesh>
          <mesh position={[chuteCx, wallH / 2, chute.minZ]}><boxGeometry args={[chuteW, wallH, 0.006]} />{acrylic}</mesh>
        </>
      )}
      <mesh position={[chute.maxX, wallH + 0.002, chuteCz]}><boxGeometry args={[0.01, 0.006, chuteD]} />{glow}</mesh>
      <mesh position={[chuteCx, wallH + 0.002, chute.minZ]}><boxGeometry args={[chuteW, 0.006, 0.01]} />{glow}</mesh>
      {/* Back panel */}
      <mesh position={[0, ROOF_Y / 2, BOX.minZ - 0.004]} receiveShadow>
        <planeGeometry args={[W + 0.02, ROOF_Y]} />
        <meshStandardMaterial map={back} roughness={0.8} />
      </mesh>
      {/* Ceiling + light strip, on the roof layer so top-down cameras see in */}
      <OnLayer layer={ROOF_LAYER}>
          <mesh position={[0, ROOF_Y + 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[W, D]} />
            <meshStandardMaterial color="#1f1433" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, ROOF_Y - 0.004, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[W - 0.1, 0.04]} />
            <meshStandardMaterial color="#fff" emissive="#fff7ed" emissiveIntensity={2} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
      </OnLayer>
    </group>
  );
}

export default function CabinetShell({ chute = CHUTE }: { chute?: Chute }) {
  return (
    <group>
      {/* Arcade floor */}
      <mesh position={[0, BASE_BOTTOM, 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#241634" roughness={0.9} />
      </mesh>
      <Base />
      <ControlDeck />
      <Interior chute={chute} />
      <Frame />
      <OnLayer layer={ROOF_LAYER}><SignBox /></OnLayer>
    </group>
  );
}
