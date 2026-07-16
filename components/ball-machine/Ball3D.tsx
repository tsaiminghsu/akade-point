"use client";
import { useRef, useEffect } from "react";
import * as THREE from "three";
import type { Ball, GamePhase, WinCell } from "./BallMachineGame";
import { BALL_R } from "./constants";

export interface Ball3DProps {
  ball: Ball;
  phase: GamePhase;
  holePos: [number, number, number];
  winCells: WinCell[];
  registerMesh: (id: number, mesh: THREE.Mesh | null) => void;
}

const COLOR_HEX: Record<string, string> = {
  pink:   "#f472b6",
  blue:   "#60a5fa",
  green:  "#34d399",
  yellow: "#fbbf24",
};
const EMISSIVE_HEX: Record<string, string> = {
  pink:   "#7c2046",
  blue:   "#1e40af",
  green:  "#065f46",
  yellow: "#92400e",
};
const STRIPE_HEX: Record<string, string> = {
  pink:   "#ffffff",
  blue:   "#ffffff",
  green:  "#ffffff",
  yellow: "#ffffff",
};

export default function Ball3D({ ball, phase, holePos, winCells, registerMesh }: Ball3DProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const isWin = winCells.some((w) => w.row === ball.row && w.col === ball.col);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) registerMesh(ball.id, mesh);
    return () => { registerMesh(ball.id, null); };
  }, [ball.id, registerMesh]);

  return (
    <mesh ref={meshRef} position={holePos} castShadow>
      <sphereGeometry args={[BALL_R, 28, 28]} />
      <meshStandardMaterial
        color={COLOR_HEX[ball.color]}
        emissive={isWin && phase === "checking" ? EMISSIVE_HEX[ball.color] : "#000000"}
        emissiveIntensity={isWin && phase === "checking" ? 1.2 : 0}
        roughness={0.22}
        metalness={0.18}
        envMapIntensity={1.5}
      />
      <mesh rotation={[Math.PI / 2, 0, 0.4]}>
        <torusGeometry args={[BALL_R * 0.72, BALL_R * 0.07, 6, 32]} />
        <meshStandardMaterial color={STRIPE_HEX[ball.color]} roughness={0.3} metalness={0.1} />
      </mesh>
    </mesh>
  );
}
