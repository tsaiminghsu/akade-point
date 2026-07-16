"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import DiceBox2, { DBOX_H } from "./DiceBox2";
import WindDie3D from "./WindDie3D";
import type { GamePhase } from "./JiuGongGeGame";

const REST_POSITIONS: [number, number, number][] = [
  [-0.53, 0, 0],
  [ 0.53, 0, 0],
];

interface DiceScene2Props {
  diceValues: [number, number];
  phase: GamePhase;
  rollId: number;
  diceFinalPos: [[number,number,number],[number,number,number]];
  diceWon: boolean;
}

export default function DiceScene2({ diceValues, phase, rollId, diceFinalPos, diceWon }: DiceScene2Props) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 4.21, 6.58], fov: 50 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 8, 4]} intensity={1.0} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, DBOX_H, 0]} color="#fff6e0" intensity={1.5} />
      <pointLight position={[0, 0.2, 0]} color="#ff8c00" intensity={0.4} />

      <DiceBox2 />

      {([0, 1] as const).map((i) => (
        <WindDie3D
          key={i}
          targetValue={diceValues[i]}
          phase={phase}
          restPosition={REST_POSITIONS[i]}
          finalPos={diceFinalPos[i]}
          rollId={rollId}
          rollSeed={rollId * 100 + i}
          isWinner={diceWon}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 18}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6.5}
        maxDistance={20}
        target={[0, 1.82, 0]}
      />
    </Canvas>
  );
}
