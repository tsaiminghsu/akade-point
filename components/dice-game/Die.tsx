'use client'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

// Euler that puts face N on top (+Y). Standard Western die layout.
// FACE_ORDER = [4,3,1,6,2,5] → geometry faces [+X,-X,+Y,-Y,+Z,-Z]
// Verified: Rz(+π/2) → +X up → face 4; Rz(-π/2) → -X up → face 3
const FACE_ROTATIONS: [number, number, number][] = [
  [0, 0, 0],             // 1 → +Y face
  [-Math.PI / 2, 0, 0],  // 2 → +Z face
  [0, 0, -Math.PI / 2],  // 3 → -X face
  [0, 0, Math.PI / 2],   // 4 → +X face
  [Math.PI / 2, 0, 0],   // 5 → -Z face
  [Math.PI, 0, 0],       // 6 → -Y face
]

const FACE_ORDER = [4, 3, 1, 6, 2, 5]

// Physical size: 25mm maps to 0.9 scene units
const MM_TO_UNIT = 0.9 / 25

// MachineBox interior: W=5, D=3.5, H=3.5
const BOX_HW = 2.5   // half-width X
const BOX_HD = 1.75  // half-depth Z
const BOX_H  = 3.5   // height

// Physics constants
const GRAVITY      = 24
const KICK_INTERVAL = 0.28
const KICK_UP      = 12
const KICK_HORIZ   = 3.0
const BOUNCE       = 0.62
const ROT_DAMP     = 0.88

// Polyfill for ctx.roundRect (added in Chrome 99 / Firefox 112)
function canvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Number die textures ─────────────────────────────────────────────────────
const PIP_COLOR: Record<number, string> = {
  1: '#d32f2f', 2: '#1a1a1a', 3: '#1a1a1a',
  4: '#d32f2f', 5: '#1a1a1a', 6: '#1a1a1a',
}
const PIP_POSITIONS: Array<Array<[number, number]>> = [
  [[0.5, 0.5]],
  [[0.28, 0.28], [0.72, 0.72]],
  [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
]

function makeNumberTexture(face: number): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!
  c.fillStyle = '#f7f5f0'; c.fillRect(0, 0, S, S)
  c.strokeStyle = '#d0ccc4'; c.lineWidth = 4
  c.beginPath(); canvasRoundRect(c, 4, 4, S - 8, S - 8, 14); c.stroke()
  c.fillStyle = PIP_COLOR[face]
  PIP_POSITIONS[face - 1].forEach(([x, y]) => {
    c.beginPath(); c.arc(x * S, y * S, S * 0.085, 0, Math.PI * 2); c.fill()
  })
  return new THREE.CanvasTexture(cv)
}

// ─── Wind die textures ───────────────────────────────────────────────────────
// Face value → wind character / style
// 1=東 2=西 3=南 4=北 5=中(red) 6=發(green)
const WIND_CHARS = ['東', '西', '南', '北', '中', '發']
const WIND_BG    = ['#f7f5f0', '#f7f5f0', '#f7f5f0', '#f7f5f0', '#f7f5f0', '#f7f5f0']
const WIND_FG    = ['#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a', '#c0392b', '#1e8449']

function makeWindTexture(face: number): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!
  c.fillStyle = WIND_BG[face - 1]; c.fillRect(0, 0, S, S)
  // Border
  c.strokeStyle = '#d0ccc4'
  c.lineWidth = 7
  c.beginPath(); canvasRoundRect(c, 5, 5, S - 10, S - 10, 20); c.stroke()
  // Character
  c.fillStyle = WIND_FG[face - 1]
  c.font = `bold ${Math.round(S * 0.6)}px "PingFang SC","Noto Serif CJK SC","Microsoft YaHei",serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(WIND_CHARS[face - 1], S / 2, S / 2 + S * 0.02)
  return new THREE.CanvasTexture(cv)
}

// ─── Types ───────────────────────────────────────────────────────────────────
export type DicePhase = 'idle' | 'rolling' | 'settling' | 'result'

export interface DieProps {
  targetValue: number
  phase: DicePhase
  restPosition: [number, number, number]
  finalPos: [number, number, number]
  rollId: number
  rollSeed: number
  isWind: boolean
  dieSize: number   // mm: 12 | 16 | 20 | 22 | 25
}

function rng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1)
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Die({ targetValue, phase, restPosition, finalPos, rollId, rollSeed, isWind, dieSize }: DieProps) {
  const meshRef = useRef<THREE.Group>(null)

  // Convert mm to scene units
  const s3d   = dieSize * MM_TO_UNIT          // die side length
  const half  = s3d / 2
  const cornerRadius = s3d * 0.12
  const floorY = half
  const bx    = BOX_HW - half - 0.04
  const bz    = BOX_HD - half - 0.04
  const ceilY = BOX_H  - half

  const materials = useMemo(() => {
    const factory = isWind ? makeWindTexture : makeNumberTexture
    return FACE_ORDER.map(f => new THREE.MeshBasicMaterial({
      map: factory(f),
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWind, dieSize])

  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f7f5f0',
    roughness: 0.28,
    metalness: 0.05,
  }), [])

  const faceInset = cornerRadius * 0.55
  const faceSize = s3d - faceInset * 2
  const faceOffset = half + 0.003
  const faceTransforms: Array<{
    position: [number, number, number]
    rotation: [number, number, number]
  }> = [
    { position: [ faceOffset, 0, 0], rotation: [0,  Math.PI / 2, 0] },
    { position: [-faceOffset, 0, 0], rotation: [0, -Math.PI / 2, 0] },
    { position: [0,  faceOffset, 0], rotation: [-Math.PI / 2, 0, 0] },
    { position: [0, -faceOffset, 0], rotation: [ Math.PI / 2, 0, 0] },
    { position: [0, 0,  faceOffset], rotation: [0, 0, 0] },
    { position: [0, 0, -faceOffset], rotation: [0, Math.PI, 0] },
  ]

  const phys = useRef({
    px: restPosition[0], py: floorY, pz: restPosition[2],
    vx: 0, vy: 0, vz: 0,
    rx: 0, ry: 0, rz: 0,
    vrx: 0, vry: 0, vrz: 0,
    elapsed: 0, prevKick: -1,
  })

  useEffect(() => {
    if (phase !== 'rolling') return
    const p = phys.current
    p.elapsed = 0; p.prevKick = -1
    p.px = restPosition[0]
    p.py = floorY + 0.05
    p.pz = restPosition[2]
    p.vx = (rng(rollSeed, 1) - 0.5) * 2
    p.vy = rng(rollSeed, 2) * 3 + 1
    p.vz = (rng(rollSeed, 3) - 0.5) * 2
    p.vrx = (rng(rollSeed, 4) - 0.5) * 20
    p.vry = (rng(rollSeed, 5) - 0.5) * 20
    p.vrz = (rng(rollSeed, 6) - 0.5) * 20
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, rollSeed])

  const targetEuler = useMemo(() => {
    const [rx, ry, rz] = FACE_ROTATIONS[targetValue - 1]
    return new THREE.Euler(
      rx + (Math.round(rng(rollSeed, 7) * 3) + 3) * Math.PI * 2,
      ry + (Math.round(rng(rollSeed, 8) * 3) + 3) * Math.PI * 2,
      rz + (Math.round(rng(rollSeed, 9) * 3) + 3) * Math.PI * 2,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, rollSeed])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const p = phys.current
    p.elapsed += delta

    if (phase === 'rolling') {
      const currKick = Math.floor(p.elapsed / KICK_INTERVAL)
      if (currKick > p.prevKick) {
        p.prevKick = currKick
        p.vy = KICK_UP
        p.vx += (rng(rollSeed, currKick * 7 + 1) - 0.5) * KICK_HORIZ * 2
        p.vz += (rng(rollSeed, currKick * 7 + 2) - 0.5) * KICK_HORIZ * 2
        p.vrx += (rng(rollSeed, currKick * 7 + 3) - 0.5) * 15
        p.vry += (rng(rollSeed, currKick * 7 + 4) - 0.5) * 15
        p.vrz += (rng(rollSeed, currKick * 7 + 5) - 0.5) * 15
      }

      p.vy -= GRAVITY * delta
      p.px += p.vx * delta; p.py += p.vy * delta; p.pz += p.vz * delta
      p.rx += p.vrx * delta; p.ry += p.vry * delta; p.rz += p.vrz * delta

      if (p.px >  bx) { p.px =  bx; p.vx = -Math.abs(p.vx) * BOUNCE }
      if (p.px < -bx) { p.px = -bx; p.vx =  Math.abs(p.vx) * BOUNCE }
      if (p.pz >  bz) { p.pz =  bz; p.vz = -Math.abs(p.vz) * BOUNCE }
      if (p.pz < -bz) { p.pz = -bz; p.vz =  Math.abs(p.vz) * BOUNCE }
      if (p.py > ceilY)  { p.py = ceilY;  p.vy = -Math.abs(p.vy) * BOUNCE }
      if (p.py < floorY) {
        p.py = floorY
        p.vy = Math.abs(p.vy) * BOUNCE * 0.7
        p.vx *= 0.80; p.vz *= 0.80
        p.vrx *= ROT_DAMP; p.vry *= ROT_DAMP; p.vrz *= ROT_DAMP
      }

      mesh.position.set(p.px, p.py, p.pz)
      mesh.rotation.set(p.rx, p.ry, p.rz)

    } else if (phase === 'settling') {
      const k = Math.min(delta * 5, 1)
      p.rx += (targetEuler.x - p.rx) * k; p.ry += (targetEuler.y - p.ry) * k; p.rz += (targetEuler.z - p.rz) * k
      p.px += (restPosition[0] - p.px) * k; p.py += (floorY - p.py) * k; p.pz += (restPosition[2] - p.pz) * k
      mesh.position.set(p.px, p.py, p.pz); mesh.rotation.set(p.rx, p.ry, p.rz)

    } else if (phase === 'result') {
      const [fx, fy, fz] = FACE_ROTATIONS[targetValue - 1]
      p.rx += (fx - p.rx) * delta * 10; p.ry += (fy - p.ry) * delta * 10; p.rz += (fz - p.rz) * delta * 10
      p.px += (finalPos[0] - p.px) * delta * 10; p.py += (floorY - p.py) * delta * 10; p.pz += (finalPos[2] - p.pz) * delta * 10
      mesh.position.set(p.px, p.py, p.pz); mesh.rotation.set(p.rx, p.ry, p.rz)

    } else {
      p.px = restPosition[0]
      p.pz = restPosition[2]
      const bob = Math.sin(p.elapsed * 1.4 + rollSeed * 0.01) * 0.025
      p.py = floorY + bob
      mesh.position.set(p.px, p.py, p.pz)
    }
  })

  return (
    <group
      ref={meshRef}
      position={[restPosition[0], floorY, restPosition[2]]}
      castShadow receiveShadow
    >
      <RoundedBox
        args={[s3d, s3d, s3d]}
        radius={cornerRadius}
        smoothness={5}
        material={bodyMaterial}
        castShadow receiveShadow
      />
      {faceTransforms.map((face, i) => (
        <mesh
          key={i}
          position={face.position}
          rotation={face.rotation}
          material={materials[i]}
        >
          <planeGeometry args={[faceSize, faceSize]} />
        </mesh>
      ))}
    </group>
  )
}
