"use client";
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Ball, GamePhase, WinCell } from "./JiuGongGeGame";
import { BALL_R } from "./JiuGongGeGame";
import { getGridBounds } from "./GridContainer";

const COLOR_HEX: Record<string, string> = {
  red:   "#f87171",
  blue:  "#60a5fa",
  green: "#34d399",
};
const EMISSIVE_HEX: Record<string, string> = {
  red:   "#7f1d1d",
  blue:  "#1e40af",
  green: "#065f46",
};

const GRAVITY        = 22.0;
const KICK_UP        = 3.0;
const KICK_HORIZ     = 1.8;
const KICK_INTERVAL  = 0.28;
const BOUNCE         = 0.58;
const FLOOR_BOUNCE   = 0.50;
const FLOOR_FRICTION = 0.82;
const VIB_KICK_UP    = 0.9;
const VIB_KICK_HORIZ = 0.6;
const VIB_INTERVAL   = 0.22;

function rng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1);
}

interface GridBall3DProps {
  ball: Ball;
  phase: GamePhase;
  holePos: [number, number, number];
  winCells: WinCell[];
  ballIndex: number;
}

export default function GridBall3D({ ball, phase, holePos, winCells, ballIndex }: GridBall3DProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const phys = useRef({
    px: holePos[0], py: holePos[1], pz: holePos[2],
    vx: 0, vy: 0, vz: 0,
    elapsed: 0, prevKick: -1,
  });

  const bounds = useMemo(() => getGridBounds(), []);
  const isWin = winCells.some((w) => w.row === ball.row && w.col === ball.col);

  useEffect(() => {
    const p = phys.current;
    [p.px, p.py, p.pz] = holePos;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.elapsed = 0; p.prevKick = -1;
    if (meshRef.current) meshRef.current.position.set(...holePos);
  }, [holePos[0], holePos[1], holePos[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = phys.current;
    if (phase === "rolling") {
      p.elapsed = -(ballIndex * 0.06);
      p.prevKick = -1;
      p.vx = 0; p.vy = 0; p.vz = 0;
    } else if (phase === "vibrating") {
      p.elapsed = 0; p.prevKick = -1;
      p.vx = 0; p.vy = 0; p.vz = 0;
    } else {
      p.vx = 0; p.vy = 0; p.vz = 0;
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const p = phys.current;
    const floorY = bounds.yMin;

    if (phase === "vibrating") {
      p.elapsed += delta;
      const dt = Math.min(delta, 0.033);
      const currKick = Math.floor(p.elapsed / VIB_INTERVAL);
      if (currKick > p.prevKick) {
        p.prevKick = currKick;
        const seed = ball.id * 137 + currKick * 17;
        p.vy = VIB_KICK_UP * (0.7 + rng(seed, 1) * 0.6);
        p.vx += (rng(seed, 2) - 0.5) * VIB_KICK_HORIZ * 2;
        p.vz += (rng(seed, 3) - 0.5) * VIB_KICK_HORIZ * 2;
      }
      p.vy -= GRAVITY * dt;
      p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
      if (p.py < floorY) { p.py = floorY; p.vy = Math.abs(p.vy) * 0.55; p.vx *= FLOOR_FRICTION; p.vz *= FLOOR_FRICTION; }
      if (p.px < bounds.xMin) { p.px = bounds.xMin; p.vx =  Math.abs(p.vx) * BOUNCE; }
      if (p.px > bounds.xMax) { p.px = bounds.xMax; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.pz < bounds.zMin) { p.pz = bounds.zMin; p.vz =  Math.abs(p.vz) * BOUNCE; }
      if (p.pz > bounds.zMax) { p.pz = bounds.zMax; p.vz = -Math.abs(p.vz) * BOUNCE; }
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    if (phase === "rolling") {
      p.elapsed += delta;
      if (p.elapsed < 0) return;
      const dt = Math.min(delta, 0.033);
      const currKick = Math.floor(p.elapsed / KICK_INTERVAL);
      if (currKick > p.prevKick) {
        p.prevKick = currKick;
        const seed = ball.id * 137 + currKick * 23;
        p.vy = KICK_UP * (0.8 + rng(seed, 1) * 0.4);
        p.vx += (rng(seed, 2) - 0.5) * KICK_HORIZ * 2;
        p.vz += (rng(seed, 3) - 0.5) * KICK_HORIZ * 2;
      }
      p.vy -= GRAVITY * dt;
      p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
      if (p.py > bounds.yMax) { p.py = bounds.yMax; p.vy = -Math.abs(p.vy) * BOUNCE; }
      if (p.py < floorY) { p.py = floorY; p.vy = Math.abs(p.vy) * FLOOR_BOUNCE; p.vx *= FLOOR_FRICTION; p.vz *= FLOOR_FRICTION; }
      if (p.px < bounds.xMin) { p.px = bounds.xMin; p.vx =  Math.abs(p.vx) * BOUNCE; }
      if (p.px > bounds.xMax) { p.px = bounds.xMax; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.pz < bounds.zMin) { p.pz = bounds.zMin; p.vz =  Math.abs(p.vz) * BOUNCE; }
      if (p.pz > bounds.zMax) { p.pz = bounds.zMax; p.vz = -Math.abs(p.vz) * BOUNCE; }
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    if (phase === "settling") {
      const k = Math.min(delta * 7, 1);
      p.px += (holePos[0] - p.px) * k;
      p.py += (holePos[1] - p.py) * k;
      p.pz += (holePos[2] - p.pz) * k;
      p.vx = 0; p.vy = 0; p.vz = 0;
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    if (phase === "checking" || phase === "result" || phase === "ready") {
      p.px = holePos[0]; p.py = holePos[1]; p.pz = holePos[2];
      p.vx = 0; p.vy = 0; p.vz = 0;
      mesh.position.set(p.px, p.py, p.pz);
    }

    if (phase === "checking" && isWin) {
      mesh.scale.setScalar(1 + Math.sin(Date.now() / 120) * 0.12);
    } else {
      mesh.scale.setScalar(1);
    }
  });

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
    </mesh>
  );
}
