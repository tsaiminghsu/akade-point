'use client'
import { useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import PhysicsDie, { computeTopFaceFromQuat, PhysicsDicePhase, DiePhysicsHandle, DicePhysicsConfig } from './PhysicsDie'
import MachineBox, { BOX_W, BOX_D, BOX_H } from './MachineBox'
import * as THREE from 'three'

const MM_TO_UNIT = 0.9 / 25

function buildRestPositions(dieSizes: number[]): [number, number, number][] {
  const count = dieSizes.length
  const sizes  = dieSizes.map(mm => mm * MM_TO_UNIT)
  const maxSize = Math.max(...sizes)
  if (count === 1) return [[0, sizes[0] / 2, 0]]
  if (count === 2) return [[-0.7, sizes[0] / 2, 0], [0.7, sizes[1] / 2, 0]]

  const cols     = count <= 3 ? count : Math.round(Math.sqrt(count * (BOX_W / BOX_D)))
  const rows     = Math.ceil(count / Math.max(cols, 1))
  const gap      = maxSize * 0.15
  const spacingX = Math.min(maxSize + gap + 0.18, (BOX_W * 0.75) / Math.max(cols - 1, 1))
  const spacingZ = Math.min(maxSize + gap + 0.12, (BOX_D * 0.65) / Math.max(rows - 1, 1))

  const positions: [number, number, number][] = []
  for (let r = 0; r < rows; r++) {
    const rowCount = Math.min(cols, count - r * cols)
    const rowOffX  = -(rowCount - 1) / 2 * spacingX
    for (let c = 0; c < rowCount; c++) {
      const i = positions.length
      positions.push([rowOffX + c * spacingX, sizes[i] / 2, (r - (rows - 1) / 2) * spacingZ])
    }
  }
  return positions
}

interface DiceWorldProps {
  dieSizes: number[]
  restPositions: [number, number, number][]
  phase: PhysicsDicePhase
  rollId: number
  windCount: number
  onSettled: (faces: number[]) => void
  handlesRef?: React.MutableRefObject<Array<{ current: DiePhysicsHandle }>>
  config: DicePhysicsConfig
}

function DiceWorld({ dieSizes, restPositions, phase, rollId, windCount, onSettled, handlesRef, config }: DiceWorldProps) {
  const count = dieSizes.length

  // Pool of physics handles — one per die, stable across renders
  const handlePool = useRef<Array<{ current: DiePhysicsHandle }>>([])
  while (handlePool.current.length < count) {
    handlePool.current.push({
      current: {
        speed: 0, angSpeed: 0, quat: new THREE.Quaternion(),
        px: 0, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0,
        wx: 0, wy: 0, wz: 0,
        half: 0,
        dvx: 0, dvy: 0, dvz: 0,
        groundContact: false,
        diceContact: false,
      }
    })
  }
  const handles = handlePool.current.slice(0, count)

  // Expose handles to parent for DiceDebug
  if (handlesRef) handlesRef.current = handles

  const phaseRef     = useRef(phase)
  const rollIdRef    = useRef(rollId)
  const settledAt    = useRef<number | null>(null)
  const notified     = useRef(false)
  const onSettledRef = useRef(onSettled)
  const configRef    = useRef(config)

  useEffect(() => { phaseRef.current = phase },         [phase])
  useEffect(() => { onSettledRef.current = onSettled }, [onSettled])
  useEffect(() => { configRef.current = config },       [config])

  useEffect(() => {
    if (rollId !== rollIdRef.current) {
      rollIdRef.current = rollId
      settledAt.current = null
      notified.current  = false
    }
  }, [rollId])

  useFrame(() => {
    const p = phaseRef.current
    if (p !== 'shaking' && p !== 'freeroll') return

    // ── Die-to-die sphere collision detection ──────────────────────────────────
    handles.forEach(h => { h.current.diceContact = false })
    for (let i = 0; i < count; i++) {
      const hi = handles[i].current
      for (let j = i + 1; j < count; j++) {
        const hj = handles[j].current
        const dx = hj.px - hi.px
        const dy = hj.py - hi.py
        const dz = hj.pz - hi.pz
        const distSq = dx * dx + dy * dy + dz * dz
        const minDist = hi.half + hj.half
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq)
          const nx = dx / dist, ny = dy / dist, nz = dz / dist
          const rv = (hj.vx - hi.vx) * nx + (hj.vy - hi.vy) * ny + (hj.vz - hi.vz) * nz
          if (rv < 0) {   // only if approaching
            const impulse = -rv * 1.3  // restitution = 0.3
            hi.dvx -= nx * impulse * 0.5
            hi.dvy -= ny * impulse * 0.5
            hi.dvz -= nz * impulse * 0.5
            hj.dvx += nx * impulse * 0.5
            hj.dvy += ny * impulse * 0.5
            hj.dvz += nz * impulse * 0.5
            hi.diceContact = true
            hj.diceContact = true
          }
        }
      }
    }

    // ── Settling detection (freeroll only) ────────────────────────────────────
    if (p === 'freeroll' && !notified.current) {
      const { settleLinVel, settleAngVel, settleDuration } = configRef.current
      const allSlow = handles.every(h => {
        const { speed, angSpeed } = h.current
        return speed < settleLinVel && angSpeed < settleAngVel
      })

      if (allSlow) {
        if (!settledAt.current) settledAt.current = performance.now()
        if (performance.now() - settledAt.current > settleDuration) {
          notified.current = true
          const faces = handles.map(h => computeTopFaceFromQuat(h.current.quat))
          onSettledRef.current(faces)
        }
      } else {
        settledAt.current = null
      }
    }
  })

  return (
    <>
      {restPositions.map((pos, i) => (
        <PhysicsDie
          key={i}
          index={i}
          dieSize={dieSizes[i]}
          isWind={i < windCount}
          restPosition={pos}
          phase={phase}
          rollId={rollId}
          boxHw={BOX_W / 2}
          boxHd={BOX_D / 2}
          boxH={BOX_H}
          physicsHandle={handles[i]}
          config={config}
        />
      ))}
    </>
  )
}

interface DiceSceneProps {
  phase: PhysicsDicePhase
  rollId: number
  diceCount: number
  windCount: number
  numberDieSize: number
  windDieSize: number
  onSettled: (faces: number[]) => void
  handlesRef?: React.MutableRefObject<Array<{ current: DiePhysicsHandle }>>
  config: DicePhysicsConfig
}

export default function DiceScene({
  phase, rollId, diceCount, windCount, numberDieSize, windDieSize, onSettled, handlesRef, config,
}: DiceSceneProps) {
  const dieSizes = useMemo(
    () => Array.from({ length: diceCount }, (_, i) => i < windCount ? windDieSize : numberDieSize),
    [diceCount, windCount, numberDieSize, windDieSize]
  )
  const restPositions = useMemo(() => buildRestPositions(dieSizes), [dieSizes])

  return (
    <Canvas
      camera={{ position: [0, 3.5, 11], fov: 52 }}
      shadows
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 9, 5]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 3, 0]} intensity={1.8} color="#fff6e0" />
      <pointLight position={[0, 0.2, 0]} intensity={0.5} color="#ff8c00" />

      <MachineBox />

      <DiceWorld
        dieSizes={dieSizes}
        restPositions={restPositions}
        phase={phase}
        rollId={rollId}
        windCount={windCount}
        onSettled={onSettled}
        handlesRef={handlesRef}
        config={config}
      />

      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 18}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={8}
        maxDistance={20}
        target={[0, 1.2, 0]}
      />
    </Canvas>
  )
}
