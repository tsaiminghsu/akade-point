'use client'
import { useMemo } from 'react'
import * as THREE from 'three'

// Shared box dimensions — must match bounds in Die.tsx
export const BOX_W = 5.0   // width  (X)
export const BOX_D = 3.5   // depth  (Z)
export const BOX_H = 3.5   // height (Y)

export default function MachineBox() {
  const W = BOX_W, D = BOX_D, H = BOX_H
  const T = 0.07 // wall thickness

  // Front wall (camera-facing, Z+): ultra-transparent so dice are never blocked
  const glassFront = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#c8dcff', transparent: true, opacity: 0.06,
    roughness: 0, metalness: 0, transmission: 0.95,
    side: THREE.DoubleSide, depthWrite: false,
  }), [])

  // Other walls / lid: slightly more visible to hint at the box shape
  const glassOther = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#b8d0ff', transparent: true, opacity: 0.22,
    roughness: 0, metalness: 0, transmission: 0.85,
    side: THREE.DoubleSide, depthWrite: false,
  }), [])

  const feltMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#185c2e', roughness: 0.95, metalness: 0,
  }), [])

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#252525', roughness: 0.35, metalness: 0.85,
  }), [])

  const baseMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#12122a', roughness: 0.55, metalness: 0.4,
  }), [])

  return (
    <group>
      {/* Felt floor */}
      <mesh position={[0, 0, 0]} receiveShadow material={feltMat}>
        <boxGeometry args={[W, 0.06, D]} />
      </mesh>

      {/* Glass walls */}
      <mesh position={[0, H / 2,  D / 2]} material={glassFront}>
        <boxGeometry args={[W, H, T]} />
      </mesh>
      <mesh position={[0, H / 2, -D / 2]} material={glassOther}>
        <boxGeometry args={[W, H, T]} />
      </mesh>
      <mesh position={[-W / 2, H / 2, 0]} material={glassOther}>
        <boxGeometry args={[T, H, D]} />
      </mesh>
      <mesh position={[ W / 2, H / 2, 0]} material={glassOther}>
        <boxGeometry args={[T, H, D]} />
      </mesh>
      {/* Top lid */}
      <mesh position={[0, H, 0]} material={glassOther}>
        <boxGeometry args={[W, T, D]} />
      </mesh>

      {/* Metal frame — 4 vertical corner pillars */}
      {([[-1,1],[-1,-1],[1,1],[1,-1]] as [number,number][]).map(([sx,sz], i) => (
        <mesh key={`v${i}`} position={[sx*W/2, H/2, sz*D/2]} material={frameMat}>
          <boxGeometry args={[0.1, H+0.12, 0.1]} />
        </mesh>
      ))}
      {/* Top & bottom horizontal X-bars */}
      {([D/2, -D/2] as number[]).map((z, i) => (
        <mesh key={`tx${i}`} position={[0, H, z]} material={frameMat}>
          <boxGeometry args={[W+0.12, 0.1, 0.1]} />
        </mesh>
      ))}
      {([D/2, -D/2] as number[]).map((z, i) => (
        <mesh key={`bx${i}`} position={[0, 0, z]} material={frameMat}>
          <boxGeometry args={[W+0.12, 0.1, 0.1]} />
        </mesh>
      ))}
      {/* Top & bottom Z-bars */}
      {([-W/2, W/2] as number[]).map((x, i) => (
        <mesh key={`tz${i}`} position={[x, H, 0]} material={frameMat}>
          <boxGeometry args={[0.1, 0.1, D+0.12]} />
        </mesh>
      ))}
      {([-W/2, W/2] as number[]).map((x, i) => (
        <mesh key={`bz${i}`} position={[x, 0, 0]} material={frameMat}>
          <boxGeometry args={[0.1, 0.1, D+0.12]} />
        </mesh>
      ))}

      {/* Machine base */}
      <mesh position={[0, -0.65, 0]} material={baseMat}>
        <boxGeometry args={[W+0.5, 1.3, D+0.5]} />
      </mesh>

      {/* Amber accent light strips on base */}
      {[
        { pos: [0, -0.04,  D/2+0.04] as [number,number,number], size: [W, 0.07, 0.05] as [number,number,number] },
        { pos: [0, -0.04, -D/2-0.04] as [number,number,number], size: [W, 0.07, 0.05] as [number,number,number] },
        { pos: [-W/2-0.04, -0.04, 0] as [number,number,number], size: [0.05, 0.07, D] as [number,number,number] },
        { pos: [ W/2+0.04, -0.04, 0] as [number,number,number], size: [0.05, 0.07, D] as [number,number,number] },
      ].map(({ pos, size }, i) => (
        <mesh key={`l${i}`} position={pos}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#ff8c00" emissive="#ff8c00" emissiveIntensity={2.5} />
        </mesh>
      ))}
    </group>
  )
}
