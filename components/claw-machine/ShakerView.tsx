'use client';

// The 搖骰子盒 as drawn: the wooden frame (fixed, from the same boxes as the
// physics, plus braces across the corners of its base), the four pink bungee
// cords from the post tops to the cube's top corners, and the clear acrylic
// cube with the iron plate screwed to its lid and the dice loose inside, all
// following the sim every frame.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { shakerRotation, type ClawSim } from './clawSim';
import {
  SHAKER, SHAKER_DICE, SHAKER_DIE, cordAnchors, cordTies, frameBoxes, shakerBoxParts,
} from './shaker';
import { useDiceFaces } from './TowerView';

const PINE = '#e3c79a';
const CORD = '#ec4899';
const UP = new THREE.Vector3(0, 1, 0);

/** The frame: posts, base rails, and a brace across each corner of the base as in the photo. */
function Frame() {
  const boxes = useMemo(() => frameBoxes(), []);
  const { hx, hz, post, rail } = SHAKER.frame;
  const brace = 0.09;
  return (
    <group>
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.center.x, b.center.y, b.center.z]} castShadow receiveShadow>
          <boxGeometry args={[b.half.x * 2, b.half.y * 2, b.half.z * 2]} />
          <meshStandardMaterial color={PINE} roughness={0.85} />
        </mesh>
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh
          key={`${sx}${sz}`}
          position={[SHAKER.x + sx * (hx - post / 2 - brace / 2), rail / 2, SHAKER.z + sz * (hz - post / 2 - brace / 2)]}
          rotation={[0, sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4, 0]}
          castShadow
        >
          <boxGeometry args={[brace * Math.SQRT2, rail * 0.9, post * 0.8]} />
          <meshStandardMaterial color="#d8b988" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** The clear cube: panels, bright cut edges, and the iron plate with its four screws. */
function DiceBox() {
  const parts = useMemo(() => shakerBoxParts(), []);
  const B = SHAKER.box;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(B.half * 2, B.h, B.half * 2)), [B.half, B.h]);
  useEffect(() => () => edges.dispose(), [edges]);
  const p = B.plate;
  return (
    <group>
      {parts.map((part, i) => (
        <mesh key={i} position={[part.offset.x, part.offset.y, part.offset.z]} renderOrder={3}>
          <boxGeometry args={[part.half.x * 2, part.half.y * 2, part.half.z * 2]} />
          <meshPhysicalMaterial
            color="#f1f5f9" transparent opacity={0.12} roughness={0.05} clearcoat={1} depthWrite={false}
          />
        </mesh>
      ))}
      <lineSegments geometry={edges} position={[0, B.h / 2, 0]}>
        <lineBasicMaterial color="#e2e8f0" transparent opacity={0.75} />
      </lineSegments>
      {/* The iron plate on the lid, screwed down at its corners */}
      <mesh position={[0, B.h + 0.0015, 0]} castShadow>
        <boxGeometry args={[p * 2, 0.003, p * 2]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.35} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * (p - 0.006), B.h + 0.0035, sz * (p - 0.006)]}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.002, 10]} />
          <meshStandardMaterial color="#e5e7eb" metalness={1} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** The rig: fixed frame, and the box, cords and dice placed from the sim each frame. */
export default function ShakerView({ sim }: { sim: ClawSim }) {
  const box = useRef<THREE.Group>(null);
  const cords = useRef<(THREE.Mesh | null)[]>([]);
  const dice = useRef<(THREE.Mesh | null)[]>([]);
  const faces = useDiceFaces();
  const anchors = useMemo(() => cordAnchors(), []);
  const ties = useMemo(() => cordTies(), []);
  const d = SHAKER_DIE.half * 2;
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), tie: new THREE.Vector3(), a: new THREE.Vector3(), dir: new THREE.Vector3() }), []);

  useFrame(() => {
    const s = sim.shaker;
    if (box.current) {
      box.current.visible = !!s;
      if (s) {
        box.current.position.set(s.x, s.y, s.z);
        const r = shakerRotation(s);
        box.current.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }
    // Each cord from its post top to where it's tied on the lid, as the box is now.
    cords.current.forEach((m, i) => {
      if (!m) return;
      m.visible = !!s;
      if (!s || !box.current) return;
      const r = shakerRotation(s);
      tmp.q.set(r.x, r.y, r.z, r.w);
      tmp.tie.set(ties[i].x, ties[i].y, ties[i].z).applyQuaternion(tmp.q).add(box.current.position);
      tmp.a.set(anchors[i].x, anchors[i].y, anchors[i].z);
      tmp.dir.subVectors(tmp.tie, tmp.a);
      const len = tmp.dir.length();
      m.position.copy(tmp.a).addScaledVector(tmp.dir, 0.5);
      m.scale.set(1, Math.max(1e-4, len), 1);
      m.quaternion.setFromUnitVectors(UP, tmp.dir.normalize());
    });
    dice.current.forEach((m, i) => {
      if (!m) return;
      const die = s?.dice[i];
      m.visible = !!die;
      if (!die) return;
      m.position.set(die.x, die.y, die.z);
      m.quaternion.set(die.qx, die.qy, die.qz, die.qw);
    });
  });

  return (
    <group>
      <Frame />
      <group ref={box}>
        <DiceBox />
      </group>
      {anchors.map((_, i) => (
        <mesh key={i} ref={(m) => { cords.current[i] = m; }} castShadow>
          <cylinderGeometry args={[0.0035, 0.0035, 1, 8]} />
          <meshStandardMaterial color={CORD} roughness={0.6} />
        </mesh>
      ))}
      {/* A knot where each cord is tied round a post top */}
      {anchors.map((a, i) => (
        <mesh key={`k${i}`} position={[a.x, a.y - 0.004, a.z]}>
          <sphereGeometry args={[0.007, 10, 8]} />
          <meshStandardMaterial color={CORD} roughness={0.6} />
        </mesh>
      ))}
      {Array.from({ length: SHAKER_DICE.max }, (_, i) => (
        <mesh key={i} ref={(m) => { dice.current[i] = m; }} castShadow visible={false}>
          <boxGeometry args={[d, d, d]} />
          {faces.map((tex, j) => <meshStandardMaterial key={j} attach={`material-${j}`} map={tex} roughness={0.35} />)}
        </mesh>
      ))}
    </group>
  );
}
