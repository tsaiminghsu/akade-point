"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import GridContainer from "./GridContainer";
import GridBall3D from "./GridBall3D";
import type { Ball, GamePhase, WinCell } from "./JiuGongGeGame";
import { GRID_COLS, CONTAINER_H } from "./JiuGongGeGame";

interface GridSceneProps {
  balls: Ball[];
  phase: GamePhase;
  winCells: WinCell[];
  holePositions: [number, number, number][];
}

export default function GridScene({ balls, phase, winCells, holePositions }: GridSceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, CONTAINER_H * 1.3, 6.5], fov: 52 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 7, 4]} intensity={0.85} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[0, CONTAINER_H, 0]} color="#fff6e0" intensity={1.0} />
      <pointLight position={[0, 0.3, 0]} color="#ff8c00" intensity={0.4} />

      <GridContainer />

      {balls.map((ball, idx) => {
        const holeIdx = ball.row * GRID_COLS + ball.col;
        const holePos = holePositions[holeIdx] ?? holePositions[0];
        return (
          <GridBall3D
            key={ball.id}
            ball={ball}
            phase={phase}
            holePos={holePos}
            winCells={winCells}
            ballIndex={idx}
          />
        );
      })}

      <OrbitControls
        enablePan={false}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={2.5}
        maxDistance={11}
        target={[0, CONTAINER_H * 0.3, 0]}
      />
    </Canvas>
  );
}
