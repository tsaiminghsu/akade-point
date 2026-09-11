'use client'
import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { FACE_ORDER as DIE_FACE_ORDER } from './diePhysics'
import type { DicePhysicsConfig } from './diePhysics'
import { makeDieBox, createDieState, startShake, stepDie } from './diePhysics'
import { FLOOR_TOP, WALL_T } from './MachineBox'

// ── Canvas helpers ────────────────────────────────────────────────────────────
function canvasRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

// ── Number die textures ───────────────────────────────────────────────────────
const PIP_COLOR: Record<number, string> = { 1: '#d32f2f', 2: '#1a1a1a', 3: '#1a1a1a', 4: '#d32f2f', 5: '#1a1a1a', 6: '#1a1a1a' }
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

// ── Wind die textures ─────────────────────────────────────────────────────────
const WIND_CHARS = ['東', '西', '南', '北', '中', '發']
const WIND_FG    = ['#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a', '#c0392b', '#1e8449']
function makeWindTexture(face: number): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!
  c.fillStyle = '#f7f5f0'; c.fillRect(0, 0, S, S)
  c.strokeStyle = '#d0ccc4'; c.lineWidth = 7
  c.beginPath(); canvasRoundRect(c, 5, 5, S - 10, S - 10, 20); c.stroke()
  c.fillStyle = WIND_FG[face - 1]
  c.font = `bold ${Math.round(S * 0.6)}px "PingFang SC","Noto Serif CJK SC","Microsoft YaHei",serif`
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText(WIND_CHARS[face - 1], S / 2, S / 2 + S * 0.02)
  return new THREE.CanvasTexture(cv)
}

// ── Face constants ───────────────────────────────────────────────────────────
const IDENTITY_Q = new THREE.Quaternion()
const MM_TO_UNIT = 0.9 / 25

// Physics lives in ./diePhysics (pure, unit-tested). Re-exported so existing
// importers (DiceScene, DiceGame, GameHUD, DiceDebug) keep their import paths.
export type { DicePhysicsConfig } from './diePhysics'
export { DEFAULT_DICE_CONFIG, computeTopFaceFromQuat, FACE_ORDER } from './diePhysics'

// ── Types ─────────────────────────────────────────────────────────────────────
export type PhysicsDicePhase = 'idle' | 'shaking' | 'freeroll' | 'result'

/** Written by PhysicsDie every frame; read by parent for settling detection and die-to-die collision */
export interface DiePhysicsHandle {
  speed: number
  angSpeed: number
  quat: THREE.Quaternion
  px: number; py: number; pz: number
  vx: number; vy: number; vz: number
  wx: number; wy: number; wz: number
  half: number
  dvx: number; dvy: number; dvz: number
  dpx: number; dpy: number; dpz: number
  groundContact: boolean
  diceContact: boolean
}

export interface PhysicsDieProps {
  dieSize: number
  isWind: boolean
  restPosition: [number, number, number]
  phase: PhysicsDicePhase
  rollId: number
  index: number
  boxHw: number
  boxHd: number
  boxH: number
  physicsHandle: React.MutableRefObject<DiePhysicsHandle>
  config: DicePhysicsConfig
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PhysicsDie({
  dieSize, isWind, restPosition, phase, rollId, index, boxHw, boxHd, boxH, physicsHandle, config,
}: PhysicsDieProps) {
  const meshRef   = useRef<THREE.Group>(null)
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  const s3d  = dieSize * MM_TO_UNIT
  const half = s3d / 2

  const cornerRadius = s3d * 0.12
  const faceInset    = cornerRadius * 0.55
  const faceSize     = s3d - faceInset * 2
  const faceOffset   = half + 0.003

  const box = useMemo(
    () => makeDieBox(boxHw, boxHd, boxH, FLOOR_TOP, WALL_T),
    [boxHw, boxHd, boxH],
  )
  const floorY = box.yBot + half

  const state = useRef(createDieState(restPosition[0], restPosition[2], half, box))
  useEffect(() => { state.current.half = half }, [half])

  const idle = useRef({ x: restPosition[0], y: floorY, z: restPosition[2], elapsed: 0 })
  const prevPhaseRef = useRef<PhysicsDicePhase>('idle')

  useEffect(() => {
    if (phase === prevPhaseRef.current) return
    const s = state.current
    if (phase === 'shaking') {
      startShake(s, index)
    } else if (phase === 'idle') {
      idle.current = { x: s.px, y: s.py, z: s.pz, elapsed: 0 }
      s.vx = s.vy = s.vz = 0
      s.wx = s.wy = s.wz = 0
    }
    prevPhaseRef.current = phase
  }, [phase, rollId]) // eslint-disable-line react-hooks/exhaustive-deps

  const materials = useMemo(() => {
    const factory = isWind ? makeWindTexture : makeNumberTexture
    return DIE_FACE_ORDER.map(f => new THREE.MeshBasicMaterial({
      map: factory(f), transparent: true, polygonOffset: true, polygonOffsetFactor: -1,
    }))
  }, [isWind, dieSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f7f5f0', roughness: 0.28, metalness: 0.05,
  }), [])

  const faceTransforms = useMemo(() => [
    { position: [ faceOffset, 0, 0] as [number,number,number], rotation: [0,  Math.PI / 2, 0] as [number,number,number] },
    { position: [-faceOffset, 0, 0] as [number,number,number], rotation: [0, -Math.PI / 2, 0] as [number,number,number] },
    { position: [0,  faceOffset, 0] as [number,number,number], rotation: [-Math.PI / 2, 0, 0] as [number,number,number] },
    { position: [0, -faceOffset, 0] as [number,number,number], rotation: [ Math.PI / 2, 0, 0] as [number,number,number] },
    { position: [0, 0,  faceOffset] as [number,number,number], rotation: [0, 0, 0] as [number,number,number] },
    { position: [0, 0, -faceOffset] as [number,number,number], rotation: [0, Math.PI, 0] as [number,number,number] },
  ], [faceOffset])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const s = state.current
    const cfg = configRef.current
    const h = physicsHandle.current

    if (phase === 'shaking' || phase === 'freeroll') {
      stepDie(s, cfg, box, phase, delta, rollId * 1000 + index, h)

      h.speed    = Math.hypot(s.vx, s.vy, s.vz)
      h.angSpeed = Math.hypot(s.wx, s.wy, s.wz)
      h.quat.set(s.q.x, s.q.y, s.q.z, s.q.w)
      h.px = s.px; h.py = s.py; h.pz = s.pz
      h.vx = s.vx; h.vy = s.vy; h.vz = s.vz
      h.wx = s.wx; h.wy = s.wy; h.wz = s.wz
      h.half = s.half
      h.groundContact = s.grounded

      mesh.position.set(s.px, s.py, s.pz)
      mesh.quaternion.set(s.q.x, s.q.y, s.q.z, s.q.w)

    } else if (phase === 'idle') {
      // Smooth lerp back to rest position over 0.6 s
      const i = idle.current
      i.elapsed += Math.min(delta, 0.033)
      const progress = Math.min(i.elapsed * 1.67, 1)
      const ease     = 1 - Math.pow(1 - progress, 3)
      const bob      = Math.sin(i.elapsed * 1.4 + index * 0.7) * 0.025 * progress

      const cx = i.x + (restPosition[0] - i.x) * ease
      const cy = i.y + (floorY - i.y) * ease + bob
      const cz = i.z + (restPosition[2] - i.z) * ease

      mesh.quaternion.slerp(IDENTITY_Q, Math.min(delta * 2.5 * ease + 0.001, 0.12))
      s.q.x = mesh.quaternion.x; s.q.y = mesh.quaternion.y
      s.q.z = mesh.quaternion.z; s.q.w = mesh.quaternion.w

      s.px = cx; s.py = cy; s.pz = cz
      s.vx = s.vy = s.vz = 0
      s.wx = s.wy = s.wz = 0
      mesh.position.set(cx, cy, cz)
    }
    // phase === 'result': hold last position
  })

  return (
    <group ref={meshRef} position={[restPosition[0], floorY, restPosition[2]]}>
      <RoundedBox
        args={[s3d, s3d, s3d]}
        radius={cornerRadius}
        smoothness={4}
        material={bodyMaterial}
        castShadow
        receiveShadow
      />
      {faceTransforms.map((face, i) => (
        <mesh key={i} position={face.position} rotation={face.rotation} material={materials[i]}>
          <planeGeometry args={[faceSize, faceSize]} />
        </mesh>
      ))}
    </group>
  )
}
