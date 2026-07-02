"use client";
import { useMemo, useRef, useImperativeHandle, forwardRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import * as THREE from "three";
import BallContainer from "./BallContainer";
import Ball3D from "./Ball3D";
import type { Ball, GamePhase, WinCell } from "./BallMachineGame";
import { calcContainerSize } from "./BallMachineGame";
import { CONTAINER_H } from "./constants";

interface PhysicsSettings {
  restitution: number;
  bounceStrength: number;
  gravity: number;
  kickStrength: number;
}

export interface BallSceneHandle {
  /** Read final physical positions and map each ball to its nearest hole. */
  computeResult: (balls: Ball[], holePositions: [number, number, number][], cols: number) => Ball[];
}

interface BallSceneProps {
  balls: Ball[];
  phase: GamePhase;
  winCells: WinCell[];
  holePositions: [number, number, number][];
  cols: number;
  rows: number;
  physicsSettings: PhysicsSettings;
}

const BallScene = forwardRef<BallSceneHandle, BallSceneProps>(function BallScene(
  { balls, phase, winCells, holePositions, cols, rows, physicsSettings },
  ref,
) {
  const { containerW, containerD } = useMemo(() => calcContainerSize(cols, rows), [cols, rows]);

  // Shared map: ballId → last known physical position (written by each Ball3D every frame)
  const positionsRef = useRef<Map<number, THREE.Vector3>>(new Map());

  useImperativeHandle(ref, () => ({
    computeResult(
      currentBalls: Ball[],
      currentHolePositions: [number, number, number][],
      currentCols: number,
    ): Ball[] {
      return currentBalls.map((ball) => {
        const pos = positionsRef.current.get(ball.id);
        if (!pos) return ball;

        // Find nearest hole by XZ distance
        let nearestIdx = 0;
        let minDist = Infinity;
        currentHolePositions.forEach(([hx, , hz], idx) => {
          const d = Math.sqrt((pos.x - hx) ** 2 + (pos.z - hz) ** 2);
          if (d < minDist) { minDist = d; nearestIdx = idx; }
        });

        return {
          ...ball,
          row: Math.floor(nearestIdx / currentCols),
          col: nearestIdx % currentCols,
        };
      });
    },
  }));

  const camX = 0;
  const camY = CONTAINER_H * 1.4 + containerD * 0.3;
  const camZ = containerD * 1.0 + containerW * 0.25 + 3.5;
  const targetY = CONTAINER_H * 0.25;

  // key forces Physics to remount (reset world) when gravity changes
  const physicsKey = `g${physicsSettings.gravity.toFixed(1)}`;

  return (
    <Canvas
      shadows
      camera={{ position: [camX, camY, camZ], fov: 52 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ background: "transparent", width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[4, 8, 5]}
        intensity={0.55}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[0, CONTAINER_H, 0]} color="#fff6e0" intensity={0.7} />
      <pointLight position={[0, 0.3, 0]} color="#ff8c00" intensity={0.3} />

      <Physics
        key={physicsKey}
        gravity={[0, -24 * physicsSettings.gravity, 0]}
        timeStep="vary"
      >
        <BallContainer cols={cols} rows={rows} />

        {balls.map((ball, idx) => {
          const holeIdx = ball.row * cols + ball.col;
          const holePos = holePositions[holeIdx] ?? holePositions[0];

          return (
            <Ball3D
              key={ball.id}
              ball={ball}
              phase={phase}
              holePos={holePos}
              winCells={winCells}
              cols={cols}
              rows={rows}
              ballIndex={idx}
              physicsSettings={physicsSettings}
              holePositions={holePositions}
              positionsRef={positionsRef}
            />
          );
        })}
      </Physics>

      <OrbitControls
        enablePan={false}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={4}
        maxDistance={22}
        target={[0, targetY, 0]}
      />
    </Canvas>
  );
});

export default BallScene;
