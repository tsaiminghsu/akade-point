'use client';
// The overhead gantry (天車), drawn after a real claw machine's: two rails
// front and back, a bridge riding them on wheeled end carriages with its drive
// motor, and the square trolley box that carries the up/down motor (上下馬達)
// with its rope spool, the top-stop microswitch (上停微動開關) and, bolted
// underneath, the 防甩片: the plate the claw's housing is pulled up against.
// The rope drops through the plate's hole, so that hole is where the claw
// swings from (PLATE_Y in clawSim.ts).
//
// Moving parts are positioned imperatively by ClawScene's frame loop through
// the refs passed in; this file only builds the meshes.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BOX, GANTRY_RANGE, PLATE_Y, type GantryConfig } from './clawSim';

/** Height of the rails' running surface. */
export const RAIL_Y = BOX.height - 0.04;
/** Trolley box: hangs under the bridge beam. */
const TROLLEY = { w: 0.12, h: 0.05, d: 0.12, bottom: 1.0 } as const;
const PLATE = { size: 0.1, thick: 0.003, hole: 0.012 } as const;

const W = BOX.maxX - BOX.minX;
const D = BOX.maxZ - BOX.minZ;
const RAIL_Z = [BOX.minZ + 0.02, BOX.maxZ - 0.02] as const;

function Alu() { return <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.32} />; }
function Steel() { return <meshStandardMaterial color="#4b5563" metalness={0.75} roughness={0.38} />; }
function Black() { return <meshStandardMaterial color="#111827" metalness={0.4} roughness={0.5} />; }
function Brass() { return <meshStandardMaterial color="#b8860b" metalness={0.85} roughness={0.35} />; }

/** A small microswitch: black body with a steel lever. */
function MicroSwitch({ leverRef, flip = false }: { leverRef?: React.Ref<THREE.Group>; flip?: boolean }) {
  return (
    <group>
      <mesh><boxGeometry args={[0.02, 0.012, 0.01]} /><Black /></mesh>
      <group ref={leverRef} position={[flip ? -0.01 : 0.01, -0.006, 0]}>
        <mesh position={[flip ? -0.009 : 0.009, -0.001, 0]} rotation={[0, 0, flip ? 0.25 : -0.25]}>
          <boxGeometry args={[0.02, 0.0015, 0.006]} />
          <meshStandardMaterial color="#e5e7eb" metalness={1} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

/** Motor + gearbox block (the 前後/左右/上下 motors all look like this). */
function Motor({ axis = 'x', length = 0.05 }: { axis?: 'x' | 'z'; length?: number }) {
  const rot: [number, number, number] = axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  const off = (v: number): [number, number, number] => (axis === 'x' ? [v, 0, 0] : [0, 0, v]);
  return (
    <group>
      <mesh rotation={rot} position={off(length / 2 + 0.012)}>
        <cylinderGeometry args={[0.016, 0.016, length, 18]} /><Black />
      </mesh>
      <mesh rotation={rot} position={off(length + 0.014)}>
        <cylinderGeometry args={[0.011, 0.016, 0.006, 18]} /><Steel />
      </mesh>
      <mesh><boxGeometry args={[0.028, 0.03, 0.028]} /><Brass /></mesh>
    </group>
  );
}

type Limits = Pick<GantryConfig, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;

/** Half-widths of what strikes a limit switch: the bridge's end carriage (x), the trolley box (z). */
const STRIKE = { x: 0.035 + 0.011, z: TROLLEY.d / 2 + 0.011 } as const;

/** A 限位器: a clamp block (red, as it's the one the operator slides along) with its microswitch. */
function LimitStop({ flip, axis }: { flip: boolean; axis: 'x' | 'z' }) {
  return (
    <group rotation={axis === 'z' ? [0, Math.PI / 2, 0] : [0, 0, 0]}>
      <mesh><boxGeometry args={[0.018, 0.02, 0.026]} /><Steel /></mesh>
      <mesh position={[0, 0.0105, 0]}><boxGeometry args={[0.018, 0.002, 0.026]} /><meshStandardMaterial color="#dc2626" /></mesh>
      <group position={[flip ? -0.02 : 0.02, 0.004, 0]}><MicroSwitch flip={flip} /></group>
    </group>
  );
}

/**
 * Fixed rails along x, front and back, with the left/right limit switches
 * (限位器) clamped on where the operator set them: the bridge's carriage
 * trips one as the gantry reaches a limit.
 */
export function GantryRails({ limits = GANTRY_RANGE }: { limits?: Limits }) {
  const xs = [limits.minX - STRIKE.x, limits.maxX + STRIKE.x];
  return (
    <group>
      {RAIL_Z.map((z) => (
        <group key={z} position={[0, RAIL_Y, z]}>
          {/* Extruded aluminium rail with a running slot on top */}
          <mesh position={[0, -0.0125, 0]}><boxGeometry args={[W, 0.025, 0.022]} /><Alu /></mesh>
          <mesh position={[0, 0.0005, 0]}><boxGeometry args={[W, 0.002, 0.006]} /><Black /></mesh>
          {xs.map((x, i) => (
            <group key={i} position={[x, 0.004, 0]}><LimitStop axis="x" flip={i === 1} /></group>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * The bridge beam spanning front to back, riding the rails; moves along x.
 * Its front/back limit switches sit on the beam where the operator set them.
 */
export function GantryBridge({ bridgeRef, limits = GANTRY_RANGE }: { bridgeRef: React.Ref<THREE.Group>; limits?: Limits }) {
  const span = RAIL_Z[1] - RAIL_Z[0];
  const edge = span / 2 - 0.01;
  const zs = [Math.max(-edge, limits.minZ - STRIKE.z), Math.min(edge, limits.maxZ + STRIKE.z)];
  return (
    <group ref={bridgeRef}>
      {zs.map((z, i) => (
        <group key={i} position={[0, 0.032, z]}><LimitStop axis="z" flip={i === 1} /></group>
      ))}
      {/* C-channel beam: web on top, flanges down */}
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.05, 0.004, span]} /><Alu /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.023, 0.008, 0]}><boxGeometry args={[0.004, 0.026, span]} /><Alu /></mesh>
      ))}
      {/* End carriages with wheels on each rail */}
      {RAIL_Z.map((z, i) => (
        <group key={z} position={[0, 0.012, z]}>
          <mesh><boxGeometry args={[0.07, 0.022, 0.034]} /><Steel /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.024, -0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.009, 0.009, 0.012, 14]} /><Black />
            </mesh>
          ))}
          {/* 左右馬達 driving the bridge, on the back carriage */}
          {i === 0 && <group position={[0, 0.028, -0.004]}><Motor axis="z" length={0.04} /></group>}
        </group>
      ))}
      {/* Wiring loom along the beam */}
      <mesh position={[0.018, 0.028, 0]}><boxGeometry args={[0.008, 0.006, span - 0.06]} /><Black /></mesh>
    </group>
  );
}

/** Plate outline with the rope hole, as an extrusion. */
function usePlateGeometry() {
  return useMemo(() => {
    const s = PLATE.size / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-s, -s); shape.lineTo(s, -s); shape.lineTo(s, s); shape.lineTo(-s, s); shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, PLATE.hole, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    // Two slotted bolt holes, as on the real bracket.
    for (const x of [-0.034, 0.034]) {
      const h = new THREE.Path();
      h.absarc(x, 0.034, 0.004, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PLATE.thick, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); // lie flat, extruded downward from y = 0
    return geo;
  }, []);
}

/**
 * The trolley box (天車本體) that the claw hangs from; moves in x and z.
 * `tilt` bends the 防甩片 (degrees) about the axis across `tiltDir`.
 */
/** The sticker on the trolley's yellow cover: a little cartoon bee. */
function useBeeSticker() {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 110;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff7d6';
      ctx.fillRect(0, 0, 160, 110);
      // Wings, body in stripes, head.
      ctx.fillStyle = 'rgba(191,219,254,0.95)';
      ctx.beginPath(); ctx.ellipse(70, 30, 22, 14, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(96, 30, 22, 14, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.ellipse(84, 66, 34, 26, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#facc15'; ctx.fillRect(40, 30, 90, 70);
      ctx.fillStyle = '#1f2937';
      for (const x of [66, 86, 106]) ctx.fillRect(x, 30, 9, 70);
      ctx.restore();
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.arc(46, 58, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.arc(40, 54, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(52, 54, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(46, 62, 6, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40, 40); ctx.lineTo(34, 26); ctx.moveTo(52, 40); ctx.lineTo(58, 26); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

export function GantryTrolley({ trolleyRef, spoolRef, switchRef, tilt, tiltDir }: {
  trolleyRef: React.Ref<THREE.Group>;
  spoolRef: React.Ref<THREE.Group>;
  switchRef: React.Ref<THREE.Group>;
  tilt: number;
  /** Direction (x, z) the bent plate throws toward: away from the hole. */
  tiltDir: { x: number; z: number };
}) {
  const plate = usePlateGeometry();
  const bee = useBeeSticker();
  const cy = TROLLEY.bottom + TROLLEY.h / 2;
  const rad = (tilt * Math.PI) / 180;
  // Bent down on the side facing the hole, so the housing is shoved the other way.
  const axis = new THREE.Vector3(tiltDir.z, 0, -tiltDir.x).normalize();
  const plateRot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, -rad));
  return (
    <group ref={trolleyRef}>
      {/* Yellow sheet-metal cover with folded lips and bolt heads, and a sticker on the front */}
      <mesh position={[0, cy, 0]}>
        <boxGeometry args={[TROLLEY.w, TROLLEY.h, TROLLEY.d]} />
        <meshStandardMaterial color="#f5c518" metalness={0.25} roughness={0.42} />
      </mesh>
      {bee && (
        <mesh position={[0, cy, TROLLEY.d / 2 + 0.0008]}>
          <planeGeometry args={[0.064, 0.044]} />
          <meshStandardMaterial map={bee} roughness={0.6} />
        </mesh>
      )}
      <mesh position={[0, TROLLEY.bottom + TROLLEY.h + 0.002, 0]}>
        <boxGeometry args={[TROLLEY.w + 0.012, 0.004, TROLLEY.d + 0.012]} /><Steel />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * (TROLLEY.w / 2 - 0.01), cy, sz * (TROLLEY.d / 2 + 0.001)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.003, 8]} />
          <meshStandardMaterial color="#e5e7eb" metalness={1} roughness={0.2} />
        </mesh>
      ))}
      {/* Rollers riding the bridge beam */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, TROLLEY.bottom + TROLLEY.h + 0.008, s * 0.035]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.07, 12]} /><Black />
        </mesh>
      ))}
      {/* 前後馬達 driving the trolley along the beam */}
      <group position={[-TROLLEY.w / 2 - 0.004, cy + 0.005, -0.03]} rotation={[0, Math.PI, 0]}>
        <Motor axis="x" length={0.035} />
      </group>
      {/* 上下馬達 (planetary gearbox) turning the rope spool */}
      <group position={[TROLLEY.w / 2 + 0.004, cy, 0.025]}>
        <Motor axis="x" length={0.04} />
      </group>
      <group position={[TROLLEY.w / 2 + 0.01, cy - 0.004, -0.025]}>
        <group ref={spoolRef}>
          <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.013, 0.013, 0.026, 18]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.9} />
          </mesh>
          {/* A dark mark so the spool is seen turning */}
          <mesh position={[0, 0.0125, 0]}><boxGeometry args={[0.027, 0.002, 0.004]} /><Black /></mesh>
        </group>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.015, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.018, 0.018, 0.003, 18]} /><Steel />
          </mesh>
        ))}
      </group>
      {/* 上停微動開關: its lever hangs just above the plate; the rising housing trips it */}
      <group position={[0.028, TROLLEY.bottom - 0.006, 0.03]}>
        <MicroSwitch leverRef={switchRef} />
      </group>
      {/* 防甩片: bolted under the box on two studs, with the rope hole in the middle */}
      {[-0.034, 0.034].map((x) => (
        <mesh key={x} position={[x, (TROLLEY.bottom + PLATE_Y) / 2, 0.034]}>
          <cylinderGeometry args={[0.003, 0.003, TROLLEY.bottom - PLATE_Y, 8]} /><Steel />
        </mesh>
      ))}
      <group position={[0, PLATE_Y + PLATE.thick, 0]} rotation={plateRot}>
        <mesh geometry={plate}>
          <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Coiled-cord socket under the box */}
      <mesh position={[0.038, TROLLEY.bottom - 0.006, -0.02]}>
        <cylinderGeometry args={[0.006, 0.006, 0.012, 10]} /><Black />
      </mesh>
    </group>
  );
}

/** Where the coiled cord leaves the trolley, relative to the trolley's (x, z). */
export const CORD_SOCKET = { x: 0.038, y: TROLLEY.bottom - 0.012, z: -0.02 } as const;

/** A unit coil (length 1 along -y) for the claw's power cord; scaled to the gap every frame. */
export function useCoilGeometry(turns = 36, radius = 0.006, wire = 0.0014) {
  return useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const n = turns * 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, -t, Math.sin(a) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 5, false);
  }, [turns, radius, wire]);
}

export const GANTRY_SPAN = { W, D };
