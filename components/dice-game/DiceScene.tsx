'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Die, { DicePhase } from './Die'
import MachineBox, { BOX_W, BOX_D } from './MachineBox'

const MM_TO_UNIT = 0.9 / 25

function buildRestPositions(dieSizes: number[]): [number, number, number][] {
  const count = dieSizes.length
  const sizes = dieSizes.map(mm => mm * MM_TO_UNIT)
  const maxSize = Math.max(...sizes)
  if (count === 1) return [[0, sizes[0] / 2, 0]]
  if (count === 2) return [[-0.7, sizes[0] / 2, 0], [0.7, sizes[1] / 2, 0]]

  const cols = count <= 3 ? count : Math.round(Math.sqrt(count * (BOX_W / BOX_D)))
  const rows = Math.ceil(count / Math.max(cols, 1))
  const gap = maxSize * 0.15
  const spacingX = Math.min(maxSize + gap + 0.18, (BOX_W * 0.75) / Math.max(cols - 1, 1))
  const spacingZ = Math.min(maxSize + gap + 0.12, (BOX_D * 0.65) / Math.max(rows - 1, 1))

  const positions: [number, number, number][] = []
  for (let r = 0; r < rows; r++) {
    const rowCount = Math.min(cols, count - r * cols)
    const rowOffX = -(rowCount - 1) / 2 * spacingX
    for (let c = 0; c < rowCount; c++) {
      const i = positions.length
      positions.push([rowOffX + c * spacingX, sizes[i] / 2, (r - (rows - 1) / 2) * spacingZ])
    }
  }
  return positions
}

interface DiceSceneProps {
  diceValues: number[]
  phase: DicePhase
  rollId: number
  diceCount: number
  windCount: number
  numberDieSize: number
  windDieSize: number
  finalPositions: [number, number, number][]
}

export default function DiceScene({ diceValues, phase, rollId, diceCount, windCount, numberDieSize, windDieSize, finalPositions }: DiceSceneProps) {
  const dieSizes = Array.from({ length: diceCount }, (_, i) => i < windCount ? windDieSize : numberDieSize)
  const restPositions = buildRestPositions(dieSizes)

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

      {restPositions.map((pos, i) => (
        <Die
          key={i}
          targetValue={diceValues[i] ?? 1}
          phase={phase}
          restPosition={pos}
          finalPos={finalPositions[i] ?? pos}
          rollId={rollId}
          rollSeed={rollId * 100 + i}
          isWind={i < windCount}
          dieSize={dieSizes[i]}
        />
      ))}

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
