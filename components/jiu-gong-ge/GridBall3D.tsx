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

// ── Physics constants ─────────────────────────────────────────────────────────
const GRAVITY        = 24;           // units/s²  (matches da-nu-shen)
const BOUNCE         = 0.62;         // wall coefficient of restitution
const FLOOR_BOUNCE   = BOUNCE * 0.7; // floor is less elastic than walls (~0.434)
const FLOOR_FRICTION = 0.80;         // horizontal speed retained on floor contact

// Rolling phase: strong periodic kicks (chaotic motion)
const KICK_UP       = 8.0;
const KICK_HORIZ    = 2.5;
const KICK_INTERVAL = 0.28; // seconds between kicks

// Vibrating phase: gentle shaking
const VIB_KICK_UP    = 2.5;
const VIB_KICK_HORIZ = 1.0;
const VIB_INTERVAL   = 0.28;

// Settling phase: critically-damped spring guides ball toward hole (no overshoot)
// ω₀ = √K, critical C = 2√K → smooth single approach, no oscillation
const SETTLE_K = 50;
const SETTLE_C = 2 * Math.sqrt(SETTLE_K); // ≈ 14.14

// Minimum bounce velocity; below this threshold the vertical motion stops
const STOP_VY = 0.5; // units/s

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

  // Phase transition: initialise velocity / timing for each new phase.
  // We never teleport position here — spring + gravity handle all movement.
  useEffect(() => {
    const p = phys.current;
    if (phase === "vibrating") {
      p.elapsed = 0; p.prevKick = -1;
      p.vx = 0; p.vy = 0; p.vz = 0;
    } else if (phase === "rolling") {
      p.elapsed = -(ballIndex * 0.06); // staggered entry
      p.prevKick = -1;
      p.vx = 0; p.vy = 0; p.vz = 0;
    } else if (phase === "settling") {
      // Carry current momentum — spring will now guide ball to holePos
      p.prevKick = -1;
    } else {
      // inserting / checking / result / ready: stop active forces
      p.vx = 0; p.vy = 0; p.vz = 0;
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const p = phys.current;
    const floorY = bounds.yMin; // = FLOOR_T + BALL_R = resting Y for all balls
    const dt = Math.min(delta, 0.033); // cap at ~30 fps to avoid tunneling

    // Win-highlight scale — set once per frame before any early return
    if (phase === "checking" && isWin) {
      mesh.scale.setScalar(1 + Math.sin(Date.now() / 120) * 0.12);
    } else {
      mesh.scale.setScalar(1);
    }

    // ── Inserting ─────────────────────────────────────────────────────────
    // Balls rest in their previous-game positions (holePos unchanged during
    // inserting). No movement; machine "warms up" visually via other elements.
    if (phase === "inserting" || phase === "ready") {
      // Gently hold at current hole position without snapping
      const dx = holePos[0] - p.px;
      const dy = floorY     - p.py;
      const dz = holePos[2] - p.pz;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.002) {
        const k = 1 - Math.exp(-6 * dt);
        p.px += dx * k; p.py += dy * k; p.pz += dz * k;
      } else {
        p.px = holePos[0]; p.py = floorY; p.pz = holePos[2];
      }
      p.vx = 0; p.vy = 0; p.vz = 0;
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    // ── Vibrating ─────────────────────────────────────────────────────────
    if (phase === "vibrating") {
      p.elapsed += delta;
      const currKick = Math.floor(p.elapsed / VIB_INTERVAL);
      if (currKick > p.prevKick) {
        p.prevKick = currKick;
        const seed = ball.id * 137 + currKick * 17;
        p.vy = VIB_KICK_UP;
        p.vx += (rng(seed, 2) - 0.5) * VIB_KICK_HORIZ * 2;
        p.vz += (rng(seed, 3) - 0.5) * VIB_KICK_HORIZ * 2;
      }
      p.vy -= GRAVITY * dt;
      p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
      if (p.py > bounds.yMax) { p.py = bounds.yMax; p.vy = -Math.abs(p.vy) * BOUNCE; }
      if (p.py < floorY)      { p.py = floorY;      p.vy = Math.abs(p.vy) * FLOOR_BOUNCE; p.vx *= FLOOR_FRICTION; p.vz *= FLOOR_FRICTION; }
      if (p.px < bounds.xMin) { p.px = bounds.xMin; p.vx =  Math.abs(p.vx) * BOUNCE; }
      if (p.px > bounds.xMax) { p.px = bounds.xMax; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.pz < bounds.zMin) { p.pz = bounds.zMin; p.vz =  Math.abs(p.vz) * BOUNCE; }
      if (p.pz > bounds.zMax) { p.pz = bounds.zMax; p.vz = -Math.abs(p.vz) * BOUNCE; }
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    // ── Rolling ───────────────────────────────────────────────────────────
    if (phase === "rolling") {
      p.elapsed += delta;
      if (p.elapsed < 0) return; // stagger delay
      const currKick = Math.floor(p.elapsed / KICK_INTERVAL);
      if (currKick > p.prevKick) {
        p.prevKick = currKick;
        const seed = ball.id * 137 + currKick * 23;
        p.vy = KICK_UP;
        p.vx += (rng(seed, 2) - 0.5) * KICK_HORIZ * 2;
        p.vz += (rng(seed, 3) - 0.5) * KICK_HORIZ * 2;
      }
      p.vy -= GRAVITY * dt;
      p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
      if (p.py > bounds.yMax) { p.py = bounds.yMax; p.vy = -Math.abs(p.vy) * BOUNCE; }
      if (p.py < floorY)      { p.py = floorY;      p.vy = Math.abs(p.vy) * FLOOR_BOUNCE; p.vx *= FLOOR_FRICTION; p.vz *= FLOOR_FRICTION; }
      if (p.px < bounds.xMin) { p.px = bounds.xMin; p.vx =  Math.abs(p.vx) * BOUNCE; }
      if (p.px > bounds.xMax) { p.px = bounds.xMax; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.pz < bounds.zMin) { p.pz = bounds.zMin; p.vz =  Math.abs(p.vz) * BOUNCE; }
      if (p.pz > bounds.zMax) { p.pz = bounds.zMax; p.vz = -Math.abs(p.vz) * BOUNCE; }
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    // ── Settling ──────────────────────────────────────────────────────────
    // Horizontal: critically-damped spring (no snapping, no overshoot).
    // Vertical:   real gravity — ball falls and bounces until it rests.
    // holePos updates here (setBalls fires at rolling→settling transition);
    // the spring smoothly guides each ball from its rolling position to its new hole.
    if (phase === "settling") {
      // Spring: F = K·(target − x) − C·v  (explicit Euler, stable for K≤50 at 60fps)
      const dx = holePos[0] - p.px;
      const dz = holePos[2] - p.pz;
      p.vx += (dx * SETTLE_K - p.vx * SETTLE_C) * dt;
      p.vz += (dz * SETTLE_K - p.vz * SETTLE_C) * dt;
      p.px += p.vx * dt;
      p.pz += p.vz * dt;
      if (p.px < bounds.xMin) { p.px = bounds.xMin; p.vx =  Math.abs(p.vx) * BOUNCE; }
      if (p.px > bounds.xMax) { p.px = bounds.xMax; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.pz < bounds.zMin) { p.pz = bounds.zMin; p.vz =  Math.abs(p.vz) * BOUNCE; }
      if (p.pz > bounds.zMax) { p.pz = bounds.zMax; p.vz = -Math.abs(p.vz) * BOUNCE; }

      // Gravity: ball falls naturally — energy dissipates with each floor bounce
      p.vy -= GRAVITY * dt;
      p.py += p.vy * dt;
      if (p.py < floorY) {
        p.py = floorY;
        p.vy = Math.abs(p.vy) > STOP_VY ? Math.abs(p.vy) * FLOOR_BOUNCE : 0;
        p.vx *= FLOOR_FRICTION;
        p.vz *= FLOOR_FRICTION;
      }
      mesh.position.set(p.px, p.py, p.pz);
      return;
    }

    // ── Checking / Result ─────────────────────────────────────────────────
    // Settling should have placed the ball very close to its hole.
    // Apply a soft exponential correction for any residual sub-millimetre drift.
    {
      const dx = holePos[0] - p.px;
      const dy = floorY     - p.py;
      const dz = holePos[2] - p.pz;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.002) {
        const k = 1 - Math.exp(-8 * dt);
        p.px += dx * k; p.py += dy * k; p.pz += dz * k;
      } else {
        p.px = holePos[0]; p.py = floorY; p.pz = holePos[2];
      }
      p.vx = 0; p.vy = 0; p.vz = 0;
      mesh.position.set(p.px, p.py, p.pz);
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
