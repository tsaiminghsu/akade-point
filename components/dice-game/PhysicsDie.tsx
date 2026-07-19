'use client'
import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

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

// ── Face constants ────────────────────────────────────────────────────────────
const FACE_ORDER        = [4, 3, 1, 6, 2, 5]  // geometry faces: +X -X +Y -Y +Z -Z
const FACE_NORMALS_LOCAL = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
]
const WORLD_UP   = new THREE.Vector3(0, 1, 0)
const IDENTITY_Q = new THREE.Quaternion()
const MM_TO_UNIT = 0.9 / 25

// ── Physics config ─────────────────────────────────────────────────────────────
export interface DicePhysicsConfig {
  shakeDuration:  number   // ms — how long shaking phase lasts
  kickInterval:   number   // s between floor kicks during shaking
  kickUp:         number   // upward impulse per kick
  kickHoriz:      number   // horizontal kick strength
  kickRot:        number   // angular kick strength rad/s
  gravity:        number   // scene units / s²
  bounceWall:     number   // energy retention on wall bounce
  bounceFloor:    number   // energy retention on floor bounce
  linDampH:       number   // horizontal air resistance per second
  rotDamp:        number   // angular damping per second
  floorFriction:  number   // friction when resting on floor per second
  settleLinVel:   number   // linear speed threshold for settling
  settleAngVel:   number   // angular speed threshold for settling
  settleDuration: number   // ms sustained below thresholds before settled
}

export const DEFAULT_DICE_CONFIG: DicePhysicsConfig = {
  shakeDuration:  2500,
  kickInterval:   0.20,
  kickUp:         13,
  kickHoriz:      2.8,
  kickRot:        10,
  gravity:        20,
  bounceWall:     0.55,
  bounceFloor:    0.35,
  linDampH:       0.35,
  rotDamp:        4.5,
  floorFriction:  10.0,
  settleLinVel:   0.025,
  settleAngVel:   0.025,
  settleDuration: 500,
}

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

// ── Utility ───────────────────────────────────────────────────────────────────
function rng(seed: number, n: number): number {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1)
}

export function computeTopFaceFromQuat(q: THREE.Quaternion): number {
  let maxDot = -Infinity, bestIdx = 2
  FACE_NORMALS_LOCAL.forEach((n, i) => {
    const dot = n.clone().applyQuaternion(q).dot(WORLD_UP)
    if (dot > maxDot) { maxDot = dot; bestIdx = i }
  })
  return FACE_ORDER[bestIdx]
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PhysicsDie({
  dieSize, isWind, restPosition, phase, rollId, index, boxHw, boxHd, boxH, physicsHandle, config,
}: PhysicsDieProps) {
  const meshRef   = useRef<THREE.Group>(null)
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  const s3d    = dieSize * MM_TO_UNIT
  const half   = s3d / 2
  const floorY = half + 0.005
  const bx     = boxHw - half - 0.04
  const bz     = boxHd - half - 0.04
  const ceilY  = boxH - half - 0.02

  const cornerRadius = s3d * 0.12
  const faceInset    = cornerRadius * 0.55
  const faceSize     = s3d - faceInset * 2
  const faceOffset   = half + 0.003

  const phys = useRef({
    px: restPosition[0], py: floorY, pz: restPosition[2],
    vx: 0, vy: 0, vz: 0,
    wx: 0, wy: 0, wz: 0,
    quat: new THREE.Quaternion(),
    elapsed: 0, prevKick: -1,
    idleStartX: restPosition[0], idleStartY: floorY, idleStartZ: restPosition[2],
    idleElapsed: 0,
  })

  const prevPhaseRef = useRef<PhysicsDicePhase>('idle')

  useEffect(() => {
    if (phase === prevPhaseRef.current) return
    const p = phys.current
    const s = rollId * 100 + index

    if (phase === 'shaking') {
      p.px = restPosition[0] + (rng(s, 20) - 0.5) * 0.3
      p.py = floorY
      p.pz = restPosition[2] + (rng(s, 21) - 0.5) * 0.3
      p.vx = (rng(s, 1) - 0.5) * 1.0
      p.vy = rng(s, 2) * 4 + 3
      p.vz = (rng(s, 3) - 0.5) * 1.0
      p.wx = (rng(s, 4) - 0.5) * 24
      p.wy = (rng(s, 5) - 0.5) * 24
      p.wz = (rng(s, 6) - 0.5) * 24
      const qx = rng(s, 7) - 0.5
      const qy = rng(s, 8) - 0.5
      const qz = rng(s, 9) - 0.5
      const qw = rng(s, 10) + 0.1
      p.quat.set(qx, qy, qz, qw).normalize()
      p.elapsed = 0
      p.prevKick = -1

    } else if (phase === 'idle') {
      p.idleStartX = p.px
      p.idleStartY = p.py
      p.idleStartZ = p.pz
      p.idleElapsed = 0
      p.vx = p.vy = p.vz = p.wx = p.wy = p.wz = 0
    }

    prevPhaseRef.current = phase
  }, [phase, rollId]) // eslint-disable-line react-hooks/exhaustive-deps

  const materials = useMemo(() => {
    const factory = isWind ? makeWindTexture : makeNumberTexture
    return FACE_ORDER.map(f => new THREE.MeshBasicMaterial({
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
    const p   = phys.current
    const cfg = configRef.current

    if (phase === 'shaking' || phase === 'freeroll') {
      p.elapsed += delta

      // Consume die-to-die collision impulses from parent
      p.vx += physicsHandle.current.dvx
      p.vy += physicsHandle.current.dvy
      p.vz += physicsHandle.current.dvz
      physicsHandle.current.dvx = physicsHandle.current.dvy = physicsHandle.current.dvz = 0

      // Periodic floor kicks during shaking (floor-gated)
      if (phase === 'shaking') {
        const currKick = Math.floor(p.elapsed / cfg.kickInterval)
        if (currKick > p.prevKick) {
          p.prevKick = currKick
          const isOnFloor = p.py <= floorY + 0.05
          if (isOnFloor) {
            const s = rollId * 100 + index * 10 + currKick
            p.vy += cfg.kickUp
            p.vx += (rng(s, 1) - 0.5) * cfg.kickHoriz * 2
            p.vz += (rng(s, 2) - 0.5) * cfg.kickHoriz * 2
            p.wx += (rng(s, 3) - 0.5) * cfg.kickRot
            p.wy += (rng(s, 4) - 0.5) * cfg.kickRot
            p.wz += (rng(s, 5) - 0.5) * cfg.kickRot
          }
        }
      }

      // Freeroll tilt correction — nudge toward nearest flat face when grounded + slow
      if (phase === 'freeroll') {
        const onFloor = p.py <= floorY + 0.02
        const linSlow = Math.sqrt(p.vx * p.vx + p.vz * p.vz) < 0.8
        if (onFloor && linSlow) {
          let maxDot = -Infinity
          let bestWorldN = FACE_NORMALS_LOCAL[2].clone()
          FACE_NORMALS_LOCAL.forEach(n => {
            const wn = n.clone().applyQuaternion(p.quat)
            const dot = wn.dot(WORLD_UP)
            if (dot > maxDot) { maxDot = dot; bestWorldN = wn.clone() }
          })
          if (maxDot < 0.95) {
            const cross = bestWorldN.clone().cross(WORLD_UP)
            const strength = (0.95 - maxDot) * 8
            p.wx += cross.x * strength * delta
            p.wy += cross.y * strength * delta
            p.wz += cross.z * strength * delta
          }
        }
      }

      // Gravity
      p.vy -= cfg.gravity * delta

      // Horizontal air resistance
      const hd = Math.max(0, 1 - cfg.linDampH * delta)
      p.vx *= hd; p.vz *= hd

      // Angular damping
      const rd = Math.max(0, 1 - cfg.rotDamp * delta)
      p.wx *= rd; p.wy *= rd; p.wz *= rd

      // Integrate position
      p.px += p.vx * delta
      p.py += p.vy * delta
      p.pz += p.vz * delta

      // Integrate quaternion (axis-angle)
      const wMag = Math.sqrt(p.wx * p.wx + p.wy * p.wy + p.wz * p.wz)
      if (wMag > 0.001) {
        const angle = wMag * delta
        const sinH  = Math.sin(angle / 2) / wMag
        const dq = new THREE.Quaternion(p.wx * sinH, p.wy * sinH, p.wz * sinH, Math.cos(angle / 2))
        p.quat.premultiply(dq).normalize()
      }

      // Wall collisions
      if (p.px > bx)  { p.px =  bx; p.vx = -Math.abs(p.vx) * cfg.bounceWall; p.wx += (Math.random() - 0.5) * 4 }
      if (p.px < -bx) { p.px = -bx; p.vx =  Math.abs(p.vx) * cfg.bounceWall; p.wx += (Math.random() - 0.5) * 4 }
      if (p.pz > bz)  { p.pz =  bz; p.vz = -Math.abs(p.vz) * cfg.bounceWall; p.wz += (Math.random() - 0.5) * 4 }
      if (p.pz < -bz) { p.pz = -bz; p.vz =  Math.abs(p.vz) * cfg.bounceWall; p.wz += (Math.random() - 0.5) * 4 }
      if (p.py > ceilY) { p.py = ceilY; p.vy = -Math.abs(p.vy) * cfg.bounceWall }

      // Floor collision
      if (p.py < floorY) {
        p.py = floorY
        if (Math.abs(p.vy) > 0.3) {
          p.vy = Math.abs(p.vy) * cfg.bounceFloor
          p.vx *= 0.80; p.vz *= 0.80
          p.wx *= 0.85; p.wy *= 0.85; p.wz *= 0.85
          if (phase === 'shaking') {
            const floorSeed = rollId * 1000 + index * 100 + Math.floor(p.elapsed * 20)
            p.vy += rng(floorSeed, 7) * 4 + 2
            p.vx += (rng(floorSeed, 8) - 0.5) * 2.0
            p.vz += (rng(floorSeed, 9) - 0.5) * 2.0
          }
        } else {
          // Nearly stopped — tilt correction toward nearest flat face
          p.vy = 0
          const vSpd2D = Math.sqrt(p.vx * p.vx + p.vz * p.vz)
          if (vSpd2D < 0.8) {
            let maxDot = -Infinity
            let bestWorldN = FACE_NORMALS_LOCAL[2].clone().applyQuaternion(p.quat)
            FACE_NORMALS_LOCAL.forEach(n => {
              const wn = n.clone().applyQuaternion(p.quat)
              const dot = wn.dot(WORLD_UP)
              if (dot > maxDot) { maxDot = dot; bestWorldN = wn.clone() }
            })
            if (maxDot < 0.97) {
              const cross = bestWorldN.cross(WORLD_UP)
              p.wx += cross.x * 2.5
              p.wy += cross.y * 2.5
              p.wz += cross.z * 2.5
            }
          }
        }
      }

      // Floor friction — strong resistance when resting on floor
      const restingOnFloor = p.py <= floorY + 0.008 && Math.abs(p.vy) < 0.5
      if (restingOnFloor) {
        const ff = Math.max(0, 1 - cfg.floorFriction * delta)
        p.vx *= ff
        p.vz *= ff
      }

      // Write to handle for parent settling detection + collision
      physicsHandle.current.speed    = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz)
      physicsHandle.current.angSpeed = Math.sqrt(p.wx * p.wx + p.wy * p.wy + p.wz * p.wz)
      physicsHandle.current.quat.copy(p.quat)
      physicsHandle.current.px = p.px; physicsHandle.current.py = p.py; physicsHandle.current.pz = p.pz
      physicsHandle.current.vx = p.vx; physicsHandle.current.vy = p.vy; physicsHandle.current.vz = p.vz
      physicsHandle.current.wx = p.wx; physicsHandle.current.wy = p.wy; physicsHandle.current.wz = p.wz
      physicsHandle.current.half = half
      physicsHandle.current.groundContact = p.py <= floorY + 0.01

      mesh.position.set(p.px, p.py, p.pz)
      mesh.quaternion.copy(p.quat)

    } else if (phase === 'idle') {
      // Smooth lerp back to rest position over 0.6 s
      p.idleElapsed += delta
      const progress = Math.min(p.idleElapsed * 1.67, 1)
      const ease     = 1 - Math.pow(1 - progress, 3)
      const rollSeed = rollId * 100 + index
      const bob      = Math.sin(p.idleElapsed * 1.4 + rollSeed * 0.01) * 0.025 * progress

      const cx = p.idleStartX + (restPosition[0] - p.idleStartX) * ease
      const cy = p.idleStartY + (floorY - p.idleStartY) * ease + bob
      const cz = p.idleStartZ + (restPosition[2] - p.idleStartZ) * ease

      p.quat.slerp(IDENTITY_Q, Math.min(delta * 2.5 * ease + 0.001, 0.12))

      p.px = cx; p.py = cy; p.pz = cz
      mesh.position.set(cx, cy, cz)
      mesh.quaternion.copy(p.quat)
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
