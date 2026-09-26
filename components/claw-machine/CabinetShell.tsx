'use client';
// Cabinet body for the claw machine, proportioned after a Feiloli-style
// standard cabinet (about 80 × 87 × 191 cm) and dressed after the user's
// photo of a yellow 選物販賣機 II代: yellow aluminium frame and glass door
// (lock on the left, hinges on the right), a bubbly lit header, a
// holographic back wall over a white plush floor, and a printed panel with
// the 取物 button, joystick and LCD below. The play-field geometry (BOX,
// CHUTE) comes from clawSim.ts so what is drawn matches the physics.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BOX, CHUTE, ROPES, bedHeight, bedRopes, craterOf, craterRopes, craterStruts, fieldDesc, holeBox, holeNets, isCorded,
  type Chute, type Crater, type FieldType, type Rect,
} from './clawSim';
import type { FieldDesc, FieldRope } from './physics';

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

function useCanvasTexture(
  w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void,
  opts: { key?: string; repeat?: [number, number] } = {},
) {
  const { key = '', repeat = [1, 1] } = opts;
  const [rx, ry] = repeat;
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rx !== 1 || ry !== 1) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
    }
    return t;
    // draw is a static function per call site; `key` stands for what it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, key, rx, ry]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** A repeatable pseudo-random sequence, so the printed art comes out the same every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

// ── Printed art (the cabinet's stickers, drawn on canvases) ──────────────────

const TC_FONT = '"PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';

/** A glossy bubble, as printed all over the cabinet. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, color);
  g.addColorStop(1, color);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A wrapped gift box with a ribbon and bow. */
function gift(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, body: string, ribbon: string, dots?: string) {
  ctx.save();
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w, h);
  if (dots) {
    ctx.fillStyle = dots;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      ctx.beginPath(); ctx.arc(x + ((i + 0.5) * w) / 4, y + ((j + 0.5) * h) / 3, Math.min(w, h) * 0.06, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = ribbon;
  ctx.fillRect(x + w * 0.44, y, w * 0.12, h);
  ctx.fillRect(x, y + h * 0.4, w, h * 0.14);
  ctx.beginPath(); ctx.ellipse(x + w * 0.38, y - h * 0.08, w * 0.12, h * 0.1, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + w * 0.62, y - h * 0.08, w * 0.12, h * 0.1, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** A twist-wrapped candy. */
function candy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.9, 0);
    ctx.lineTo(s * r * 1.9, -r * 0.7);
    ctx.lineTo(s * r * 1.9, r * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (const [dx, dy] of [[-0.4, -0.3], [0.3, -0.35], [0, 0.2], [-0.5, 0.35], [0.55, 0.25]]) {
    ctx.beginPath(); ctx.arc(dx * r, dy * r, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Text in the sign's style: a dark outline, a white one inside it, and a two-tone fill. */
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, top: string, bottom: string, dark: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.3;
  ctx.strokeStyle = dark;
  ctx.strokeText(text, x, y);
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(text, x, y);
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** The sign's mascot: a round little penguin in a crash helmet, peeking in from the corner. */
function mascot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 0.72, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x - r * 0.1, y - r * 1.2, r * 0.2, r * 0.5);
  ctx.fillStyle = '#111827';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * 0.28, y + r * 0.05, r * 0.12, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.moveTo(x - r * 0.15, y + r * 0.3); ctx.lineTo(x + r * 0.15, y + r * 0.3); ctx.lineTo(x, y + r * 0.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 「請勿搖晃機台」: a red no-entry ring and bar over someone rocking the cabinet. */
function noShaking(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#111827';
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';
  // The cabinet, tipped, and a figure shoving it.
  ctx.save();
  ctx.translate(x + r * 0.2, y + r * 0.05);
  ctx.rotate(0.2);
  ctx.strokeRect(-r * 0.2, -r * 0.45, r * 0.4, r * 0.8);
  ctx.restore();
  ctx.beginPath(); ctx.arc(x - r * 0.4, y - r * 0.35, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y - r * 0.22); ctx.lineTo(x - r * 0.45, y + r * 0.2);
  ctx.moveTo(x - r * 0.42, y - r * 0.1); ctx.lineTo(x - r * 0.05, y - r * 0.12);
  ctx.moveTo(x - r * 0.45, y + r * 0.2); ctx.lineTo(x - r * 0.6, y + r * 0.55);
  ctx.moveTo(x - r * 0.45, y + r * 0.2); ctx.lineTo(x - r * 0.3, y + r * 0.55);
  ctx.stroke();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 0.62, y - r * 0.62); ctx.lineTo(x + r * 0.62, y + r * 0.62); ctx.stroke();
  ctx.restore();
}

/** The printed panels round the controls: warm yellow-orange, bubbles, gifts and candy. */
function giftArt(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#fde047');
  g.addColorStop(0.55, '#fbbf24');
  g.addColorStop(1, '#fb923c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(seed);
  const colors = ['#f472b6', '#4ade80', '#f87171', '#60a5fa', '#c084fc', '#fef08a'];
  for (let i = 0; i < 9; i++) {
    bubble(ctx, rnd() * w, rnd() * h, h * (0.12 + rnd() * 0.22), colors[i % colors.length]);
  }
  const gifts: [string, string, string | undefined][] = [
    ['#7c3aed', '#fde68a', '#c4b5fd'], ['#2563eb', '#f9a8d4', undefined], ['#f8fafc', '#ef4444', '#93c5fd'], ['#16a34a', '#fef08a', undefined],
  ];
  for (let i = 0; i < 4; i++) {
    const gw = h * (0.3 + rnd() * 0.15), gh = gw * (0.7 + rnd() * 0.3);
    const [body, ribbon, dots] = gifts[i];
    gift(ctx, (i + 0.15 + rnd() * 0.5) * (w / 4), h * 0.25 + rnd() * (h * 0.7 - gh), gw, gh, body, ribbon, dots);
  }
  candy(ctx, w * 0.08, h * 0.75, h * 0.08, '#2563eb', -0.4);
  candy(ctx, w * 0.9, h * 0.3, h * 0.08, '#db2777', 0.5);
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
  // The printed panel under the door: bubbles, gifts and candy, and the 請勿搖晃 sticker.
  const print = useCanvasTexture(1024, 320, (ctx) => {
    giftArt(ctx, 1024, 320, 7);
    noShaking(ctx, 950, 70, 52);
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
      {/* Printed panel round the controls, framed in yellow */}
      <mesh position={[0, -0.19, OZ + 0.0015]}>
        <planeGeometry args={[OX * 2 - 0.08, 0.3]} />
        <meshStandardMaterial map={print} roughness={0.55} />
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
    </group>
  );
}

/**
 * Decorative control panel, printed like the rest of the front: the round
 * 取物 button, the joystick with its yellow ball, and the little LCD. The
 * real inputs are the DOM controls below the canvas.
 */
function ControlDeck() {
  const z = OZ + DECK_DEPTH / 2;
  const top = useCanvasTexture(1024, 214, (ctx) => {
    giftArt(ctx, 1024, 214, 3);
  });
  const button = useCanvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(52, 48, 6, 64, 64, 64);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#fde68a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#1f2937';
    ctx.font = `900 40px ${TC_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('取物', 64, 66);
  });
  const lcd = useCanvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#a3b899';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#1f2a1c';
    ctx.font = `bold 34px ${TC_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('歡迎光臨', 128, 44);
    ctx.font = 'bold 30px monospace';
    ctx.fillText('CREDIT 00', 128, 92);
  });
  const deckTop = 0.035;
  return (
    <group position={[0, -0.13, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[OX * 2 - 0.04, 0.07, DECK_DEPTH]} />
        <Yellow dark />
      </mesh>
      <mesh position={[0, deckTop + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OX * 2 - 0.06, DECK_DEPTH - 0.02]} />
        <meshStandardMaterial map={top} roughness={0.5} />
      </mesh>
      {/* 取物 button on the left of the stick, as on the reference cabinet */}
      <group position={[-0.14, deckTop, 0.02]}>
        <mesh position={[0, 0.005, 0]}><cylinderGeometry args={[0.042, 0.042, 0.01, 28]} /><meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.2} /></mesh>
        <mesh position={[0, 0.014, 0]}><cylinderGeometry args={[0.034, 0.035, 0.012, 28]} /><meshStandardMaterial color="#fef3c7" roughness={0.35} /></mesh>
        <mesh position={[0, 0.0206, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.034, 28]} />
          <meshStandardMaterial map={button} roughness={0.35} emissive="#fff7d6" emissiveIntensity={0.25} />
        </mesh>
      </group>
      {/* Joystick: blue dome, chrome shaft, yellow ball top */}
      <group position={[0.02, deckTop, 0.02]}>
        <mesh position={[0, 0.006, 0]}><sphereGeometry args={[0.032, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#3b82f6" roughness={0.3} /></mesh>
        <mesh position={[0, 0.045, 0]}><cylinderGeometry args={[0.005, 0.005, 0.07, 10]} /><meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.2} /></mesh>
        <mesh position={[0, 0.085, 0]} castShadow><sphereGeometry args={[0.024, 20, 16]} /><meshStandardMaterial color="#facc15" roughness={0.25} /></mesh>
      </group>
      {/* Small LCD in a black bezel */}
      <group position={[0.19, deckTop, 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0, 0.002]}><planeGeometry args={[0.13, 0.075]} /><meshStandardMaterial color="#111827" /></mesh>
        <mesh position={[0, 0, 0.003]}>
          <planeGeometry args={[0.11, 0.055]} />
          <meshStandardMaterial map={lcd} emissive="#dfe8d2" emissiveMap={lcd} emissiveIntensity={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/** LED strips down the front posts: green and blue running up them. */
function LedStrips() {
  const tex = useCanvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#22c55e'); g.addColorStop(0.3, '#38bdf8'); g.addColorStop(0.55, '#2563eb');
    g.addColorStop(0.8, '#10b981'); g.addColorStop(1, '#22c55e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }, { repeat: [1, 3] });
  useFrame((_, dt) => { tex.offset.y = (tex.offset.y - dt * 0.25) % 1; });
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (OX - POST / 2), ROOF_Y / 2, OZ + 0.002]}>
          <planeGeometry args={[0.012, ROOF_Y - 0.06]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** The door's yellow aluminium frame: a groove down the middle of each bar catches the light. */
function DoorBar({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const long = Math.max(w, h), thin = Math.min(w, h);
  const along: [number, number, number] = w > h ? [long, thin * 0.18, 0.004] : [thin * 0.18, long, 0.004];
  return (
    <group position={[x, y, 0]}>
      <mesh><boxGeometry args={[w, h, 0.014]} /><Yellow /></mesh>
      <mesh position={[0, 0, 0.0075]}><boxGeometry args={along} /><Yellow dark /></mesh>
    </group>
  );
}

function Frame() {
  const posts: [number, number][] = [[-OX + POST / 2, -OZ + POST / 2], [OX - POST / 2, -OZ + POST / 2], [-OX + POST / 2, OZ - POST / 2], [OX - POST / 2, OZ - POST / 2]];
  const railY = [0.02, ROOF_Y - 0.02];
  const bar = 0.032;
  const doorH = ROOF_Y - 0.06;
  return (
    <group>
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, ROOF_Y / 2, z]} castShadow>
          <boxGeometry args={[POST, ROOF_Y, POST]} />
          <Yellow />
        </mesh>
      ))}
      <LedStrips />
      {/* Horizontal rails top and bottom on front and sides */}
      {railY.map((y) => (
        <group key={y}>
          <mesh position={[0, y, OZ - POST / 2]}><boxGeometry args={[OX * 2, 0.04, POST]} /><Yellow dark /></mesh>
          <mesh position={[-OX + POST / 2, y, 0]}><boxGeometry args={[POST, 0.04, OZ * 2]} /><Yellow dark /></mesh>
          <mesh position={[OX - POST / 2, y, 0]}><boxGeometry args={[POST, 0.04, OZ * 2]} /><Yellow dark /></mesh>
        </group>
      ))}
      {/* Front door: a yellow aluminium frame round the glass, lock on the left, hinges down the right */}
      <group position={[0, ROOF_Y / 2, OZ - POST / 2 + 0.03]}>
        <DoorBar x={-(W / 2) + bar / 2} y={0} w={bar} h={doorH} />
        <DoorBar x={W / 2 - bar / 2} y={0} w={bar} h={doorH} />
        <DoorBar x={0} y={doorH / 2 - bar / 2} w={W} h={bar} />
        <DoorBar x={0} y={-doorH / 2 + bar / 2} w={W} h={bar} />
        {/* Lock: a chrome barrel with its keyway */}
        <group position={[-(W / 2) + bar / 2, 0.02, 0.009]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.009, 0.009, 0.006, 20]} /><meshStandardMaterial color="#e5e7eb" metalness={1} roughness={0.2} /></mesh>
          <mesh position={[0, 0, 0.0032]}><boxGeometry args={[0.0022, 0.009, 0.001]} /><meshStandardMaterial color="#111827" /></mesh>
        </group>
        {/* Latch plate at the bottom corner */}
        <mesh position={[-(W / 2) + bar + 0.012, -doorH / 2 + bar - 0.004, 0.01]}>
          <boxGeometry args={[0.03, 0.014, 0.003]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.95} roughness={0.25} />
        </mesh>
        {/* Hinge screws down the right-hand bar */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[W / 2 - bar * 0.25, -doorH / 2 + 0.08 + (i * (doorH - 0.16)) / 6, 0.0085]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0035, 0.0035, 0.002, 10]} />
            <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <GlassPane width={W} height={ROOF_Y - 0.08} position={[0, ROOF_Y / 2, OZ - POST / 2 + 0.026]} />
      <GlassPane width={D} height={ROOF_Y - 0.08} position={[-OX + POST / 2, ROOF_Y / 2, 0]} rotationY={-Math.PI / 2} streaks={false} />
      <GlassPane width={D} height={ROOF_Y - 0.08} position={[OX - POST / 2, ROOF_Y / 2, 0]} rotationY={Math.PI / 2} streaks={false} />
    </group>
  );
}

/**
 * The lit header, after the reference cabinet: a yellow panel of glossy
 * bubbles, the name in big orange outlined characters, a little mascot, and
 * the machine's number on a plate stuck to the corner.
 */
function SignBox({ plate }: { plate: string }) {
  const sign = useCanvasTexture(1024, 240, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, '#fff6b0'); g.addColorStop(1, '#fcd34d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 240);
    for (const [x, y, r, c] of [
      [150, 30, 46, '#f9a8d4'], [300, 210, 34, '#fdba74'], [470, 18, 26, '#bef264'], [760, 205, 60, '#86efac'],
      [905, 55, 40, '#fdba74'], [990, 200, 30, '#f9a8d4'], [60, 205, 28, '#93c5fd'], [640, 24, 22, '#f0abfc'],
    ] as [number, number, number, string][]) bubble(ctx, x, y, r, c);
    // The name: as big as fits.
    const brand = '二代選物販賣機';
    let size = 150;
    const font = (px: number) => `900 ${px}px ${TC_FONT}`;
    ctx.font = font(size);
    while (ctx.measureText(brand).width > 800 && size > 60) ctx.font = font((size -= 4));
    outlined(ctx, brand, 540, 92, size, '#fdba74', '#ea580c', '#3b1a08');
    ctx.font = `italic 900 44px "Arial Black","Arial",sans-serif`;
    outlined(ctx, 'PRIZE CATCHER', 540, 202, 44, '#fbcfe8', '#ec4899', '#831843');
    mascot(ctx, 70, 72, 42);
    // The machine's number, written on a plate, as operators number their machines.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(26, 150, 92, 56);
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 150, 92, 56);
    ctx.fillStyle = '#1f2937';
    ctx.font = `44px ${TC_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(plate, 72, 180);
  }, { key: plate });
  const y = ROOF_Y + SIGN_H / 2;
  return (
    <group>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[OX * 2, SIGN_H, OZ * 2]} />
        <Yellow />
      </mesh>
      <mesh position={[0, y, OZ + 0.002]}>
        <planeGeometry args={[OX * 2 - 0.07, SIGN_H - 0.05]} />
        <meshStandardMaterial map={sign} emissive="#ffffff" emissiveMap={sign} emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      {/* Stepped caps on the corners of the flat top */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[sx * (OX - 0.03), ROOF_Y + SIGN_H, sz * (OZ - 0.03)]}>
          <mesh position={[0, 0.012, 0]}><boxGeometry args={[0.07, 0.024, 0.07]} /><Yellow dark /></mesh>
          <mesh position={[0, 0.034, 0]}><boxGeometry args={[0.05, 0.02, 0.05]} /><Yellow /></mesh>
          <mesh position={[0, 0.05, 0]}><sphereGeometry args={[0.018, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><Yellow dark /></mesh>
        </group>
      ))}
    </group>
  );
}

/** One tile of trampoline mesh (彈跳網布): fine black weave with a faint sheen. */
function meshWeave() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, 32, 32);
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.2;
    for (let i = 0; i <= 32; i += 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(32, i); ctx.stroke();
    }
  }
  return c;
}

/** Corner block (wood) standing on the base, with a white pulley at each rope height above the bed there. */
function RopeBlock({ x, z, bedY }: { x: number; z: number; bedY: number }) {
  const h = bedY + 0.1;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[0.026, h, 0.026]} />
        <meshStandardMaterial color="#d6b48a" roughness={0.8} />
      </mesh>
      {ROPES.heights.map((y) => (
        <mesh key={y} position={[0, bedY + y, 0]}>
          <cylinderGeometry args={[0.011, 0.011, 0.028, 14]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

type Point = { x: number; y: number; z: number };

/** Placement for a mesh stretched along its y axis from a to b. */
function useSpan(a: Point, b: Point) {
  return useMemo(() => {
    const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z);
    const dir = to.clone().sub(from);
    const length = dir.length();
    return {
      position: from.add(to).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
      length,
    };
  }, [a.x, a.y, a.z, b.x, b.y, b.z]);
}

/** A straight 衝繩 (level, or following the bed up a wall). */
function Rope({ rope }: { rope: FieldRope }) {
  const { position, quaternion, length } = useSpan(rope.from, rope.to);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[rope.r, rope.r, length, 8]} />
      <meshStandardMaterial color="#111114" roughness={0.6} />
    </mesh>
  );
}

/** A square wooden beam from a to b. */
function Beam({ a, b, size = 0.016 }: { a: Point; b: Point; size?: number }) {
  const { position, quaternion, length } = useSpan(a, b);
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <boxGeometry args={[size, length, size]} />
      <meshStandardMaterial color="#d9b98f" roughness={0.8} />
    </mesh>
  );
}

/**
 * The 火山口's woodwork: a slanted strut at the box's corner and at each
 * glass, a pulley on each strut for every cord, and the chute box's wooden
 * rim along its open edges. The cords themselves are drawn with the ropes.
 */
function CraterFrame({ box, crater }: { box: Chute; crater: Crater }) {
  const struts = useMemo(() => craterStruts(box), [box]);
  const rimX = BOX.maxZ - box.minZ + 0.016, rimZ = box.maxX - BOX.minX;
  return (
    <group>
      {struts.map((s, i) => (
        <group key={i}>
          {/* Carried a little past the top cord, as the real struts are */}
          <Beam a={s.foot} b={{ x: s.head.x + (s.head.x - s.foot.x) * 0.1, y: s.head.y * 1.1, z: s.head.z + (s.head.z - s.foot.z) * 0.1 }} />
          {crater.rings.map((y) => {
            const t = y / crater.height;
            return (
              <mesh key={y} position={[s.foot.x + (s.head.x - s.foot.x) * t, y, s.foot.z + (s.head.z - s.foot.z) * t]}>
                <cylinderGeometry args={[0.009, 0.009, 0.009, 14]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.35} />
              </mesh>
            );
          })}
        </group>
      ))}
      {/* The chute box's rim, flush with the bed along the box's two open edges */}
      <mesh position={[box.maxX + 0.008, 0.001, (box.minZ - 0.016 + BOX.maxZ) / 2]} receiveShadow>
        <boxGeometry args={[0.016, 0.012, rimX]} />
        <meshStandardMaterial color="#d9b98f" roughness={0.8} />
      </mesh>
      <mesh position={[(BOX.minX + box.maxX) / 2, 0.001, box.minZ - 0.008]} receiveShadow>
        <boxGeometry args={[rimZ, 0.012, 0.016]} />
        <meshStandardMaterial color="#d9b98f" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** The sprung bed as drawn: the physics' own mesh, its UVs in 1.5 cm weave tiles. */
function useBedGeometry(bed: FieldDesc['bed']) {
  const geo = useMemo(() => {
    if (!bed) return null;
    const n = bed.vertices.length / 3;
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      uv[i * 2] = bed.vertices[i * 3] / 0.015;
      uv[i * 2 + 1] = bed.vertices[i * 3 + 2] / 0.015;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(bed.vertices, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(bed.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [bed]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

/** A raised bed's black fabric sides down the glass, from the base up to its edge (the box's sides stay open). */
function useBedSides(box: Chute, lift: number) {
  const geo = useMemo(() => {
    if (lift <= 0) return null;
    const t = 0.002; // just inside the glass
    const runs: [number, number, number, number][] = [
      [BOX.minX, BOX.minZ + t, BOX.maxX, BOX.minZ + t], // back
      [BOX.maxX - t, BOX.minZ, BOX.maxX - t, BOX.maxZ], // right
      [box.maxX, BOX.maxZ - t, BOX.maxX, BOX.maxZ - t], // front, from the box
      [BOX.minX + t, BOX.minZ, BOX.minX + t, box.minZ], // left, to the box
    ];
    const pos: number[] = [];
    const idx: number[] = [];
    const steps = 16;
    for (const [ax, az, bx, bz] of runs) {
      const base = pos.length / 3;
      for (let k = 0; k <= steps; k++) {
        const x = ax + ((bx - ax) * k) / steps, z = az + ((bz - az) * k) / steps;
        pos.push(x, -0.006, z, x, bedHeight(box, lift, x, z), z);
      }
      for (let k = 0; k < steps; k++) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [box, lift]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

/** One tile of 洞口網: a pale cord square on nothing (tiled at 2 cm). */
function netTile() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 32, 32);
  }
  return c;
}

/**
 * 洞口網: net stretched level with the rim over the part of the box the
 * opening doesn't use, tied off along the opening's edge to an aluminium bar.
 */
function HoleNets({ chute, box, nets }: { chute: Chute; box: Chute; nets: Rect[] }) {
  const textures = useMemo(() => {
    if (typeof document === 'undefined') return [];
    const src = netTile();
    return nets.map((n) => {
      const tex = new THREE.CanvasTexture(src);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set((n.maxX - n.minX) / 0.02, (n.maxZ - n.minZ) / 0.02);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
  }, [nets]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const bar = <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.3} />;
  return (
    <group>
      {nets.map((n, i) => (
        <mesh key={i} position={[(n.minX + n.maxX) / 2, 0.001, (n.minZ + n.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[n.maxX - n.minX, n.maxZ - n.minZ]} />
          <meshStandardMaterial map={textures[i]} transparent alphaTest={0.4} side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ))}
      {box.maxX > chute.maxX + 1e-6 && (
        <mesh position={[chute.maxX, 0.002, (chute.minZ + BOX.maxZ) / 2]}>
          <boxGeometry args={[0.008, 0.008, BOX.maxZ - chute.minZ]} />{bar}
        </mesh>
      )}
      {chute.minZ > box.minZ + 1e-6 && (
        <mesh position={[(BOX.minX + chute.maxX) / 2, 0.002, chute.minZ]}>
          <boxGeometry args={[chute.maxX - BOX.minX, 0.008, 0.008]} />{bar}
        </mesh>
      )}
    </group>
  );
}

/**
 * The 檯面 itself, from the same rectangles, mesh and ropes as the physics:
 * white plush slabs (flat or with stepped tiers), or a bounce table's bed of black
 * trampoline mesh, raised at its far corners, with 衝繩 round its edge and a
 * 洞口網 when the opening is smaller than the box; on a 火山口彈跳台 the
 * box is raised into a crater of cords.
 */
function Field({ chute, field, lift }: { chute: Chute; field: FieldType; lift: number }) {
  const desc = useMemo(() => fieldDesc(field, chute, lift), [field, chute, lift]);
  const corded = isCorded(field);
  const box = useMemo(() => holeBox(field, chute), [field, chute]);
  const crater = useMemo(() => (field === 'volcano' ? craterOf(box) : null), [field, box]);
  const nets = useMemo(() => holeNets(field, chute), [field, chute]);
  const weave = useMemo(() => {
    if (!corded || typeof document === 'undefined') return null;
    const tex = new THREE.CanvasTexture(meshWeave());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [corded]);
  useEffect(() => () => weave?.dispose(), [weave]);
  const bed = useBedGeometry(desc.bed);
  const sides = useBedSides(box, corded ? lift : 0);
  const edgeRopes = useMemo(() => (corded ? bedRopes(box, crater?.lean ?? 0, lift) : []), [corded, box, crater, lift]);
  const craterCords = useMemo(() => (crater ? craterRopes(box) : []), [crater, box]);
  const ropeEnds = useMemo(() => {
    const seen = new Map<string, { x: number; z: number }>();
    for (const r of edgeRopes) for (const e of [r.from, r.to]) seen.set(`${e.x.toFixed(3)},${e.z.toFixed(3)}`, { x: e.x, z: e.z });
    return [...seen.values()].map((e) => ({ ...e, bedY: bedHeight(box, lift, e.x, e.z) }));
  }, [edgeRopes, box, lift]);
  const fur = useCanvasTexture(256, 256, (ctx) => {
    // White plush (長毛絨): short strands every which way, a little shadow between them.
    ctx.fillStyle = '#f3eff3';
    ctx.fillRect(0, 0, 256, 256);
    const rnd = seeded(11);
    ctx.lineCap = 'round';
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * 256, y = rnd() * 256, a = rnd() * Math.PI * 2, l = 2 + rnd() * 5;
      ctx.strokeStyle = rnd() < 0.55 ? 'rgba(255,255,255,0.8)' : 'rgba(196,181,201,0.35)';
      ctx.lineWidth = 1 + rnd();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }, { repeat: [8, 6] });
  const felt = <meshStandardMaterial map={fur} color="#ffffff" roughness={1} />;
  return (
    <group>
      {/* Plush slabs, holes left out, 2 mm proud of the base top so the faces don't z-fight */}
      {!corded && desc.floor.map((r, i) => (
        <mesh key={i} position={[(r.minX + r.maxX) / 2, -0.003, (r.minZ + r.maxZ) / 2]} receiveShadow>
          <boxGeometry args={[r.maxX - r.minX, 0.01, r.maxZ - r.minZ]} />
          {felt}
        </mesh>
      ))}
      {/* A bounce table's bed: black trampoline mesh, its sides down the glass where it's raised */}
      {bed && (
        <mesh geometry={bed} receiveShadow>
          <meshStandardMaterial map={weave} color="#ffffff" roughness={0.55} metalness={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}
      {sides && (
        <mesh geometry={sides}>
          <meshStandardMaterial color="#0b0b0f" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* 衝繩: bungee ropes round the bed's edge on wooden corner blocks with pulleys, and a crater's rings */}
      {edgeRopes.map((r, i) => <Rope key={`e${i}`} rope={r} />)}
      {craterCords.map((r, i) => <Rope key={`c${i}`} rope={r} />)}
      {ropeEnds.map((e, i) => <RopeBlock key={i} x={e.x} z={e.z} bedY={e.bedY} />)}
      {crater && <CraterFrame box={box} crater={crater} />}
      {corded && !crater && (
        // Aluminium edge where the bed meets the box
        <>
          <mesh position={[box.maxX + 0.006, 0.006, (box.minZ + box.maxZ) / 2]}>
            <boxGeometry args={[0.012, 0.014, box.maxZ - box.minZ]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[(box.minX + box.maxX) / 2, 0.006, box.minZ - 0.006]}>
            <boxGeometry args={[box.maxX - box.minX + 0.012, 0.014, 0.012]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.3} />
          </mesh>
        </>
      )}
      {nets.length > 0 && <HoleNets chute={chute} box={box} nets={nets} />}
      {desc.blocks.map((b, i) => (
        <group key={i}>
          <mesh position={[(b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2]} castShadow receiveShadow>
            <boxGeometry args={[b.maxX - b.minX, b.top, b.maxZ - b.minZ]} />
            <meshStandardMaterial map={fur} color={i % 4 < 2 ? '#ffffff' : '#f1e9f2'} roughness={1} />
          </mesh>
          {/* Trim along the step's front edge */}
          <mesh position={[(b.minX + b.maxX) / 2, b.top - 0.004, b.maxZ + 0.001]}>
            <boxGeometry args={[b.maxX - b.minX, 0.008, 0.004]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Interior({ chute, field, bedLift }: { chute: Chute; field: FieldType; bedLift: number }) {
  // 鐳射膜: holographic film in little embossed squares, pastel rainbow with sparkles.
  const holo = useCanvasTexture(512, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 512, 512);
    ['#fbcfe8', '#e9d5ff', '#bae6fd', '#d9f99d', '#fef08a', '#fbcfe8'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const n = 16, cell = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Each little square is embossed: lit on its top-left edge, shaded on the bottom-right.
        const x = i * cell, y = j * cell;
        ctx.fillStyle = `hsla(${(i * 29 + j * 47) % 360}, 85%, 78%, 0.65)`;
        ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x + 3, y + 3, cell - 6, 2);
        ctx.fillRect(x + 3, y + 3, 2, cell - 6);
        ctx.fillStyle = 'rgba(91,70,140,0.35)';
        ctx.fillRect(x + 3, y + cell - 5, cell - 6, 2);
        ctx.fillRect(x + cell - 5, y + 3, 2, cell - 6);
      }
    }
    const rnd = seeded(5);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 160; i++) {
      const x = rnd() * 512, y = rnd() * 512, r = 0.8 + rnd() * 1.8;
      ctx.fillRect(x - r * 2, y - r / 3, r * 4, r / 1.5);
      ctx.fillRect(x - r / 3, y - r * 2, r / 1.5, r * 4);
    }
  }, { repeat: [2, 2.4] });
  const notice = useCanvasTexture(320, 208, (ctx) => {
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(0, 0, 320, 208);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 308, 196);
    ctx.fillStyle = '#b91c1c';
    ctx.font = `900 40px ${TC_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('保證取物！', 160, 42);
    ctx.fillStyle = 'rgba(55,65,81,0.55)';
    for (let i = 0; i < 6; i++) ctx.fillRect(28, 82 + i * 18, i === 5 ? 150 : 264, 7);
  });
  const acrylic = <meshStandardMaterial color="#ffe4f1" transparent opacity={0.28} roughness={0.05} depthWrite={false} />;
  const edge = <meshStandardMaterial color="#ffffff" emissive="#fdf2f8" emissiveIntensity={0.5} transparent opacity={0.85} />;
  // The shaft and its fence go round the box; on a bounce table a 洞口網 may cover part of it.
  const box = useMemo(() => holeBox(field, chute), [field, chute]);
  const boxCx = (box.minX + box.maxX) / 2;
  const boxCz = (box.minZ + box.maxZ) / 2;
  const boxW = box.maxX - box.minX;
  const boxD = box.maxZ - box.minZ;
  const wallH = box.wallH;
  // On a 火山口彈跳台 the crater's cords fence the hole instead of the 擋板.
  const barrier = !(field === 'volcano' && craterOf(box));
  return (
    <group>
      <Field chute={chute} field={field} lift={bedLift} />
      {/* Chute shaft */}
      <mesh position={[boxCx, -0.2, boxCz]}>
        <boxGeometry args={[boxW, 0.4, boxD]} />
        <meshStandardMaterial color="#05060a" side={THREE.BackSide} />
      </mesh>
      {!barrier && (
        // A 火山口's chute is a wooden box: its walls line the top of the shaft (open square tube, sized by the group)
        <group position={[boxCx, -0.045, boxCz]} scale={[boxW - 0.002, 1, boxD - 0.002]}>
          <mesh rotation={[0, Math.PI / 4, 0]}>
            <cylinderGeometry args={[Math.SQRT1_2, Math.SQRT1_2, 0.09, 4, 1, true]} />
            <meshStandardMaterial color="#d9b98f" roughness={0.85} side={THREE.BackSide} />
          </mesh>
        </group>
      )}
      {/* Clear acrylic 擋板 fencing the chute, its cut top edge catching the light (or just a rim with no 擋板) */}
      {barrier && wallH > 0.001 && (
        <>
          <mesh position={[box.maxX, wallH / 2, boxCz]}><boxGeometry args={[0.006, wallH, boxD]} />{acrylic}</mesh>
          <mesh position={[boxCx, wallH / 2, box.minZ]}><boxGeometry args={[boxW, wallH, 0.006]} />{acrylic}</mesh>
        </>
      )}
      {barrier && (
        <>
          <mesh position={[box.maxX, wallH + 0.002, boxCz]}><boxGeometry args={[0.008, 0.005, boxD]} />{edge}</mesh>
          <mesh position={[boxCx, wallH + 0.002, box.minZ]}><boxGeometry args={[boxW, 0.005, 0.008]} />{edge}</mesh>
        </>
      )}
      {/* Back panel: holographic film that shifts colour as the view moves */}
      <mesh position={[0, ROOF_Y / 2, BOX.minZ - 0.004]} receiveShadow>
        <planeGeometry args={[W + 0.02, ROOF_Y]} />
        <meshPhysicalMaterial
          map={holo} emissive="#ffffff" emissiveMap={holo} emissiveIntensity={0.12} roughness={0.3} metalness={0.3}
          iridescence={1} iridescenceIOR={1.7} iridescenceThicknessRange={[180, 720]}
        />
      </mesh>
      {/* The 保證取物 notice lying on the floor, as operators leave it */}
      {field === 'flat' && (
        <mesh position={[0.25, 0.0035, 0.02]} rotation={[-Math.PI / 2, 0, 0.12]} receiveShadow>
          <planeGeometry args={[0.2, 0.13]} />
          <meshStandardMaterial map={notice} roughness={0.9} />
        </mesh>
      )}
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

export default function CabinetShell({ chute = CHUTE, field = 'flat', bedLift = 0, plate = '1' }: {
  chute?: Chute; field?: FieldType; bedLift?: number;
  /** The machine's number, on the plate stuck to the sign. */
  plate?: string;
}) {
  return (
    <group>
      {/* Arcade floor */}
      <mesh position={[0, BASE_BOTTOM, 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#241634" roughness={0.9} />
      </mesh>
      <Base />
      <ControlDeck />
      <Interior chute={chute} field={field} bedLift={bedLift} />
      <Frame />
      <OnLayer layer={ROOF_LAYER}><SignBox plate={plate} /></OnLayer>
    </group>
  );
}
