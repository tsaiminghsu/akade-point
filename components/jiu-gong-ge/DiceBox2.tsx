"use client";
import { useMemo } from "react";
import * as THREE from "three";

export const DBOX_HW = 1.1;  // half-width X
export const DBOX_HD = 1.0;  // half-depth Z
export const DBOX_H  = 2.6;  // height Y

export default function DiceBox2() {
  const W = DBOX_HW * 2, D = DBOX_HD * 2, H = DBOX_H;
  const T = 0.07;

  const glassFront = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#c8dcff", transparent: true, opacity: 0.06,
    roughness: 0, metalness: 0, transmission: 0.95,
    side: THREE.DoubleSide, depthWrite: false,
  }), []);

  const glassOther = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#b8d0ff", transparent: true, opacity: 0.22,
    roughness: 0, metalness: 0, transmission: 0.85,
    side: THREE.DoubleSide, depthWrite: false,
  }), []);

  const feltMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#111122", roughness: 0.95, metalness: 0,
  }), []);

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#252525", roughness: 0.35, metalness: 0.85,
  }), []);

  const baseMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0c0c1e", roughness: 0.55, metalness: 0.4,
  }), []);

  return (
    <group>
      {/* Floor */}
      <mesh position={[0, 0.03, 0]} receiveShadow material={feltMat}>
        <boxGeometry args={[W, 0.06, D]} />
      </mesh>

      {/* Glass walls */}
      <mesh position={[0, H/2,  D/2]} material={glassFront}><boxGeometry args={[W, H, T]} /></mesh>
      <mesh position={[0, H/2, -D/2]} material={glassOther}><boxGeometry args={[W, H, T]} /></mesh>
      <mesh position={[-W/2, H/2, 0]} material={glassOther}><boxGeometry args={[T, H, D]} /></mesh>
      <mesh position={[ W/2, H/2, 0]} material={glassOther}><boxGeometry args={[T, H, D]} /></mesh>
      <mesh position={[0, H, 0]} material={glassOther}><boxGeometry args={[W, T, D]} /></mesh>

      {/* Corner pillars */}
      {([[-1,1],[-1,-1],[1,1],[1,-1]] as [number,number][]).map(([sx,sz], i) => (
        <mesh key={`v${i}`} position={[sx*W/2, H/2, sz*D/2]} material={frameMat}>
          <boxGeometry args={[0.09, H+0.1, 0.09]} />
        </mesh>
      ))}

      {/* Top bars */}
      {([D/2, -D/2] as number[]).map((z, i) => (
        <mesh key={`tx${i}`} position={[0, H, z]} material={frameMat}><boxGeometry args={[W+0.1, 0.09, 0.09]} /></mesh>
      ))}
      {([-W/2, W/2] as number[]).map((x, i) => (
        <mesh key={`tz${i}`} position={[x, H, 0]} material={frameMat}><boxGeometry args={[0.09, 0.09, D+0.1]} /></mesh>
      ))}

      {/* Base */}
      <mesh position={[0, -0.45, 0]} material={baseMat}>
        <boxGeometry args={[W+0.4, 0.9, D+0.4]} />
      </mesh>

      {/* Amber accent strips */}
      {[
        { pos: [0, -0.04,  D/2+0.04] as [number,number,number], size: [W, 0.06, 0.04] as [number,number,number] },
        { pos: [0, -0.04, -D/2-0.04] as [number,number,number], size: [W, 0.06, 0.04] as [number,number,number] },
        { pos: [-W/2-0.04, -0.04, 0] as [number,number,number], size: [0.04, 0.06, D] as [number,number,number] },
        { pos: [ W/2+0.04, -0.04, 0] as [number,number,number], size: [0.04, 0.06, D] as [number,number,number] },
      ].map(({ pos, size }, i) => (
        <mesh key={`l${i}`} position={pos}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#ff8c00" emissive="#ff8c00" emissiveIntensity={2.5} />
        </mesh>
      ))}
    </group>
  );
}
