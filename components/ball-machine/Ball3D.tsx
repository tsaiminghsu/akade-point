"use client";
import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, BallCollider, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import type { Ball, GamePhase, WinCell } from "./BallMachineGame";
import { BALL_R, FLOOR_T, HOLE_SPACING } from "./constants";

interface PhysicsSettings {
  restitution: number;
  bounceStrength: number;
  gravity: number;
  kickStrength: number;
}

export interface Ball3DProps {
  ball: Ball;
  phase: GamePhase;
  holePos: [number, number, number];
  winCells: WinCell[];
  cols: number;
  rows: number;
  ballIndex: number;
  physicsSettings: PhysicsSettings;
  holePositions: [number, number, number][];
  positionsRef: React.MutableRefObject<Map<number, THREE.Vector3>>;
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

// Base impulse magnitude (unit mass, gravity=1): target jump height ~BALL_R*1.5 ≈ 0.63m
// v0 = sqrt(2*9.81*0.63) ≈ 3.5 m/s
const BASE_JUMP_IMPULSE = 3.5;
const VIB_JUMP_IMPULSE  = 1.5;
const HORIZ_RATIO       = 0.38; // horizontal / vertical impulse ratio
const FLOOR_Y           = FLOOR_T + BALL_R;
const CONTACT_THRESHOLD = BALL_R * 1.25; // how close to floor counts as "contact"
// Groove force: applied during settling to funnel balls toward nearest hole
const GROOVE_FORCE      = 1.5;
const CELL_RADIUS       = HOLE_SPACING * 0.52; // force active within this radius of hole

function seededRng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1);
}

export default function Ball3D({
  ball, phase, holePos, winCells, ballIndex,
  physicsSettings, holePositions, positionsRef,
}: Ball3DProps) {
  const rbRef   = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null!);

  const kickCooldown  = useRef(0);
  const staggerOffset = useRef(ballIndex * 0.055); // stagger entry delay

  const isWin = winCells.some((w) => w.row === ball.row && w.col === ball.col);

  // Phase transitions
  useEffect(() => {
    const rb = rbRef.current;
    if (!rb) return;

    if (phase === "ready") {
      rb.setEnabled(false);
      rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (meshRef.current) meshRef.current.position.set(...holePos);
    } else if (phase === "inserting") {
      rb.setEnabled(false);
      rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else if (phase === "vibrating") {
      staggerOffset.current = ballIndex * 0.055;
      kickCooldown.current = staggerOffset.current;
      rb.setEnabled(true);
      rb.wakeUp();
    } else if (phase === "jumping") {
      kickCooldown.current = ballIndex * 0.04;
      rb.setEnabled(true);
      rb.wakeUp();
    } else if (phase === "settling" || phase === "checking" || phase === "result") {
      rb.setEnabled(true);
      rb.wakeUp();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Snap to hole on ready reset (when holePos changes while ready)
  useEffect(() => {
    if (phase !== "ready") return;
    const rb = rbRef.current;
    if (!rb) return;
    rb.setEnabled(false);
    rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (meshRef.current) meshRef.current.position.set(...holePos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holePos[0], holePos[1], holePos[2]]);

  useFrame((_, delta) => {
    const rb = rbRef.current;
    if (!rb) return;

    // Ready: hold position exactly, no physics
    if (phase === "ready" || phase === "inserting") {
      if (meshRef.current) meshRef.current.position.set(...holePos);
      positionsRef.current.set(ball.id, new THREE.Vector3(...holePos));
      return;
    }

    const pos = rb.translation();
    positionsRef.current.set(ball.id, new THREE.Vector3(pos.x, pos.y, pos.z));

    kickCooldown.current -= delta;

    if (phase === "vibrating" || phase === "jumping") {
      const onFloor = pos.y <= FLOOR_Y + CONTACT_THRESHOLD;

      if (onFloor && kickCooldown.current <= 0) {
        const { bounceStrength, kickStrength, gravity } = physicsSettings;
        const gFactor = Math.sqrt(Math.max(0.3, gravity)); // compensate for higher gravity
        const seed = ball.id * 137 + Math.round(Date.now() / 50);

        let impulseY: number;
        if (phase === "vibrating") {
          impulseY = VIB_JUMP_IMPULSE * bounceStrength * gFactor
            * (0.7 + seededRng(seed, 1) * 0.6);
        } else {
          impulseY = BASE_JUMP_IMPULSE * bounceStrength * kickStrength * gFactor
            * (0.8 + seededRng(seed, 2) * 0.4);
        }

        const horizScale = impulseY * HORIZ_RATIO;
        rb.applyImpulse(
          {
            x: (seededRng(seed, 3) - 0.5) * 2 * horizScale,
            y: impulseY,
            z: (seededRng(seed, 4) - 0.5) * 2 * horizScale,
          },
          true,
        );

        // Jitter cooldown so kicks are not periodic
        kickCooldown.current = 0.16 + seededRng(seed, 5) * 0.18;
      }
    }

    // Groove force field: gentle horizontal pull toward nearest hole center when near floor
    if (phase === "settling" || phase === "checking") {
      if (pos.y <= FLOOR_Y + BALL_R * 2.0) {
        let nearestDist = Infinity;
        let nearestHole: [number, number, number] = holePos;
        for (const hp of holePositions) {
          const dx = pos.x - hp[0];
          const dz = pos.z - hp[2];
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < nearestDist) { nearestDist = d; nearestHole = hp; }
        }

        if (nearestDist < CELL_RADIUS) {
          const strength = GROOVE_FORCE * (1 - nearestDist / CELL_RADIUS);
          const dx = nearestHole[0] - pos.x;
          const dz = nearestHole[2] - pos.z;
          const len = Math.sqrt(dx * dx + dz * dz) + 1e-6;
          rb.addForce({ x: (dx / len) * strength, y: 0, z: (dz / len) * strength }, true);
        }
      }
    }

    // Win pulse animation
    if (phase === "checking" && isWin && meshRef.current) {
      meshRef.current.scale.setScalar(1 + Math.sin(Date.now() / 120) * 0.12);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
  });

  return (
    <RigidBody
      ref={rbRef}
      position={holePos}
      colliders={false}
      restitution={physicsSettings.restitution}
      friction={0.7}
      linearDamping={0.12}
      angularDamping={0.28}
      mass={1}
    >
      <BallCollider args={[BALL_R]} restitution={physicsSettings.restitution} friction={0.7} />
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[BALL_R, 28, 28]} />
        <meshStandardMaterial
          color={COLOR_HEX[ball.color]}
          emissive={isWin && phase === "checking" ? EMISSIVE_HEX[ball.color] : "#000000"}
          emissiveIntensity={isWin && phase === "checking" ? 1.2 : 0}
          roughness={0.22}
          metalness={0.18}
          envMapIntensity={1.5}
        />
        {/* Visible stripe so rotation is apparent */}
        <mesh rotation={[Math.PI / 2, 0, 0.4]}>
          <torusGeometry args={[BALL_R * 0.72, BALL_R * 0.07, 6, 32]} />
          <meshStandardMaterial color={STRIPE_HEX[ball.color]} roughness={0.3} metalness={0.1} />
        </mesh>
      </mesh>
    </RigidBody>
  );
}
