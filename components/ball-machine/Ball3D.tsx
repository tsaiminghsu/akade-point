"use client";
import { useRef, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, BallCollider, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import type { Ball, GamePhase, WinCell } from "./BallMachineGame";
import { BALL_R, CONTAINER_H, FLOOR_T, HOLE_SPACING, WALL_T } from "./constants";

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

type RigidBodyTransformState = Parameters<NonNullable<React.ComponentProps<typeof RigidBody>["transformState"]>>[0];

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

// Base velocity magnitude (unit mass, gravity=1): target jump height ~BALL_R*1.5 ≈ 0.63m
// v0 = sqrt(2*24*0.63) ≈ 5.5 m/s  (recalibrated for base gravity=24, matching da-nu-shen)
const BASE_JUMP_IMPULSE = 5.7;
const VIB_JUMP_IMPULSE  = 3.1;
const VIB_HORIZ_RATIO   = 0;     // vibration phase: vertical motion only
const JUMP_HORIZ_RATIO  = 0;     // jump phase: vertical motion only
const FLOOR_Y           = FLOOR_T + BALL_R;
const CONTACT_THRESHOLD = BALL_R * 0.15; // tight threshold — only kick when truly on floor
// Groove force: applied during settling to funnel balls toward nearest hole.
// It must cover the outer wall-to-hole gap, otherwise edge balls can stop outside the grid.
const GROOVE_FORCE      = 9.5;
const GROOVE_RADIUS     = HOLE_SPACING * 1.08;
const GROOVE_DAMPING    = 2.2;
const SLOT_FORCE        = 18;
const SLOT_DAMPING      = 4.8;
const EDGE_BAND         = HOLE_SPACING * 0.58;
const EDGE_NUDGE_SPEED  = 0.32;
const EDGE_GUARD_MARGIN = BALL_R * 0.2;
const EDGE_GUARD_FORCE  = 32;
const EDGE_GUARD_DAMPING = 6.5;

function seededRng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function steerVelocityAwayFromWalls(
  velocity: { x: number; z: number },
  pos: { x: number; z: number },
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number },
) {
  let { x, z } = velocity;

  if (pos.x < bounds.xMin + EDGE_BAND && x < 0) x = Math.abs(x) * 0.55 + EDGE_NUDGE_SPEED;
  if (pos.x > bounds.xMax - EDGE_BAND && x > 0) x = -Math.abs(x) * 0.55 - EDGE_NUDGE_SPEED;
  if (pos.z < bounds.zMin + EDGE_BAND && z < 0) z = Math.abs(z) * 0.55 + EDGE_NUDGE_SPEED;
  if (pos.z > bounds.zMax - EDGE_BAND && z > 0) z = -Math.abs(z) * 0.55 - EDGE_NUDGE_SPEED;

  return { x, z };
}

function findNearestHole(
  pos: { x: number; z: number },
  holePositions: [number, number, number][],
  fallback: [number, number, number],
) {
  let nearestDist = Infinity;
  let nearestHole = fallback;
  for (const hp of holePositions) {
    const dx = pos.x - hp[0];
    const dz = pos.z - hp[2];
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < nearestDist) {
      nearestDist = d;
      nearestHole = hp;
    }
  }

  return { nearestDist, nearestHole };
}

function getHoleBounds(holePositions: [number, number, number][]) {
  return holePositions.reduce(
    (bounds, [x, , z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

export default function Ball3D({
  ball, phase, holePos, winCells, ballIndex,
  cols, rows, physicsSettings, holePositions, positionsRef,
}: Ball3DProps) {
  const rbRef   = useRef<RapierRigidBody | null>(null);
  const meshRef = useRef<THREE.Mesh>(null!);

  const attachRigidBody = useCallback((state: RigidBodyTransformState) => {
    rbRef.current = state.rigidBody;
    return state;
  }, []);

  const kickCooldown  = useRef(0);
  const staggerOffset = useRef(ballIndex * 0.055); // stagger entry delay
  const phaseRef      = useRef<GamePhase>(phase);  // always-current phase for useFrame

  const isWin = winCells.some((w) => w.row === ball.row && w.col === ball.col);

  // Always keep phaseRef current so useFrame can read it without stale-closure issues
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Phase transitions
  useEffect(() => {
    const rb = rbRef.current;
    if (!rb) return;

    if (phase === "ready") {
      rb.setEnabled(false);
      rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, false);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
      if (meshRef.current) {
        meshRef.current.position.set(0, 0, 0);
        if (meshRef.current.parent) {
          meshRef.current.parent.position.set(holePos[0], holePos[1], holePos[2]);
        }
      }
    } else if (phase === "inserting") {
      rb.setEnabled(false);
      rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, false);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
    } else if (phase === "vibrating") {
      staggerOffset.current = ballIndex * 0.055;
      kickCooldown.current = staggerOffset.current;
      // Ensure ball is at floor level before enabling so onFloor check triggers immediately
      rb.setTranslation({ x: holePos[0], y: FLOOR_Y, z: holePos[2] }, false);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
      rb.setEnabled(true);
      rb.wakeUp();
    } else if (phase === "jumping") {
      kickCooldown.current = ballIndex * 0.04;
      rb.setEnabled(true);
      rb.wakeUp();
    } else if (phase === "settling") {
      rb.setEnabled(true);
      rb.wakeUp();
    } else if (phase === "checking" || phase === "result") {
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
    rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, false);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
    if (meshRef.current) {
      meshRef.current.position.set(0, 0, 0);
      if (meshRef.current.parent) {
        meshRef.current.parent.position.set(holePos[0], holePos[1], holePos[2]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holePos[0], holePos[1], holePos[2]]);

  useFrame((_, delta) => {
    // ── Ready / inserting: always correct visual regardless of rb ──────────
    // Use phaseRef (not prop) to avoid stale closure — phaseRef is updated synchronously
    // before useFrame runs each frame, preventing the inserting guard from re-disabling
    // the rigid body after the vibrating/jumping useEffect has already enabled it.
    const currentPhase = phaseRef.current;
    if (currentPhase === "ready" || currentPhase === "inserting") {
      if (meshRef.current) {
        meshRef.current.position.set(0, 0, 0);
        if (meshRef.current.parent) {
          meshRef.current.parent.position.set(holePos[0], holePos[1], holePos[2]);
        }
      }
      positionsRef.current.set(ball.id, new THREE.Vector3(...holePos));
      // Freeze physics body the first time rb becomes available (and is still enabled)
      const rb = rbRef.current;
      if (rb && rb.isEnabled()) {
        rb.setEnabled(false);
        rb.setTranslation({ x: holePos[0], y: holePos[1], z: holePos[2] }, false);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
      }
      return;
    }

    const rb = rbRef.current;
    if (!rb) return;

    let pos = rb.translation();

    // Failsafe for high-speed tunneling through thin container walls.
    const containerW = cols * HOLE_SPACING + 1.4;
    const containerD = rows * HOLE_SPACING + 1.4;
    const xMin = -containerW / 2 + WALL_T + BALL_R;
    const xMax =  containerW / 2 - WALL_T - BALL_R;
    const yMin = FLOOR_Y;
    const yMax = CONTAINER_H - WALL_T - BALL_R;
    const zMin = -containerD / 2 + WALL_T + BALL_R;
    const zMax =  containerD / 2 - WALL_T - BALL_R;
    const nextPos = {
      x: clamp(pos.x, xMin, xMax),
      y: clamp(pos.y, yMin, yMax),
      z: clamp(pos.z, zMin, zMax),
    };

    if (nextPos.x !== pos.x || nextPos.y !== pos.y || nextPos.z !== pos.z) {
      const vel = rb.linvel();
      rb.setTranslation(nextPos, true);
      rb.setLinvel({
        x: nextPos.x !== pos.x
          ? (nextPos.x <= xMin ? 1 : -1) * Math.max(Math.abs(vel.x) * 0.35, EDGE_NUDGE_SPEED)
          : vel.x,
        y: nextPos.y !== pos.y ? (nextPos.y === yMin ? Math.abs(vel.y) * physicsSettings.restitution : -Math.abs(vel.y) * 0.45) : vel.y,
        z: nextPos.z !== pos.z
          ? (nextPos.z <= zMin ? 1 : -1) * Math.max(Math.abs(vel.z) * 0.35, EDGE_NUDGE_SPEED)
          : vel.z,
      }, true);
      pos = rb.translation();
      // Immediately sync the THREE.js group to avoid a one-frame visual pop
      // (rapier already synced the group to the pre-clamp position this frame)
      if (meshRef.current?.parent) {
        meshRef.current.parent.position.set(pos.x, pos.y, pos.z);
      }
    }

    positionsRef.current.set(ball.id, new THREE.Vector3(pos.x, pos.y, pos.z));

    if (
      currentPhase === "vibrating" ||
      currentPhase === "jumping" ||
      currentPhase === "settling" ||
      currentPhase === "checking" ||
      currentPhase === "result"
    ) {
      const holeBounds = getHoleBounds(holePositions);
      const outsideHoleGrid =
        pos.x < holeBounds.minX - EDGE_GUARD_MARGIN ||
        pos.x > holeBounds.maxX + EDGE_GUARD_MARGIN ||
        pos.z < holeBounds.minZ - EDGE_GUARD_MARGIN ||
        pos.z > holeBounds.maxZ + EDGE_GUARD_MARGIN;

      if (outsideHoleGrid && pos.y <= FLOOR_Y + BALL_R * 1.4) {
        const { nearestHole } = findNearestHole(pos, holePositions, holePos);
        const dx = nearestHole[0] - pos.x;
        const dz = nearestHole[2] - pos.z;
        const len = Math.sqrt(dx * dx + dz * dz) + 1e-6;
        const vel = rb.linvel();

        rb.addForce({
          x: (dx / len) * EDGE_GUARD_FORCE - vel.x * EDGE_GUARD_DAMPING,
          y: 0,
          z: (dz / len) * EDGE_GUARD_FORCE - vel.z * EDGE_GUARD_DAMPING,
        }, true);

        if (currentPhase === "settling" && Math.hypot(vel.x, vel.z) < 0.12) {
          rb.setLinvel({
            x: (dx / len) * EDGE_NUDGE_SPEED,
            y: vel.y,
            z: (dz / len) * EDGE_NUDGE_SPEED,
          }, true);
        }
      }
    }

    kickCooldown.current -= delta;

    if (currentPhase === "vibrating" || currentPhase === "jumping") {
      const onFloor = pos.y <= FLOOR_Y + CONTACT_THRESHOLD;

      if (currentPhase === "vibrating" && pos.y <= FLOOR_Y + BALL_R * 0.7) {
        const vel = rb.linvel();
        rb.setLinvel({ x: vel.x * 0.68, y: vel.y, z: vel.z * 0.68 }, true);
      }

      if (onFloor && kickCooldown.current <= 0) {
        const { bounceStrength, kickStrength, gravity } = physicsSettings;
        const gFactor = Math.sqrt(Math.max(0.3, gravity));
        const seed = ball.id * 137 + Math.round(Date.now() / 50);

        let velY: number;
        if (currentPhase === "vibrating") {
          velY = VIB_JUMP_IMPULSE * bounceStrength * gFactor
            * (0.7 + seededRng(seed, 1) * 0.6);
        } else {
          velY = BASE_JUMP_IMPULSE * bounceStrength * kickStrength * gFactor
            * (0.8 + seededRng(seed, 2) * 0.4);
        }

        // SET velocity (not additive impulse) so kicks never stack — ball always rises to consistent height
        const horizRatio = currentPhase === "vibrating" ? VIB_HORIZ_RATIO : JUMP_HORIZ_RATIO;
        const horizScale = velY * horizRatio;
        const horizontal = steerVelocityAwayFromWalls(
          {
            x: (seededRng(seed, 3) - 0.5) * 2 * horizScale,
            z: (seededRng(seed, 4) - 0.5) * 2 * horizScale,
          },
          pos,
          { xMin, xMax, zMin, zMax },
        );

        rb.setLinvel(
          {
            x: horizontal.x,
            y: velY,
            z: horizontal.z,
          },
          true,
        );

        kickCooldown.current = 0.16 + seededRng(seed, 5) * 0.18;
      }
    }

    // Groove force field: during settling use the nearest slot; during checking/result
    // use the computed slot so balls visibly coast into their final grooves.
    if (currentPhase === "settling" || currentPhase === "checking" || currentPhase === "result") {
      if (pos.y <= FLOOR_Y + BALL_R * 2.0) {
        const targetHole = currentPhase === "settling"
          ? findNearestHole(pos, holePositions, holePos).nearestHole
          : holePos;
        const dx = targetHole[0] - pos.x;
        const dz = targetHole[2] - pos.z;
        const nearestDist = Math.sqrt(dx * dx + dz * dz);

        if (nearestDist < GROOVE_RADIUS) {
          const len = Math.sqrt(dx * dx + dz * dz) + 1e-6;
          const vel = rb.linvel();
          const baseForce = currentPhase === "settling" ? GROOVE_FORCE : SLOT_FORCE;
          const damping = currentPhase === "settling" ? GROOVE_DAMPING : SLOT_DAMPING;
          const pull = baseForce * (0.35 + 0.65 * Math.min(1, nearestDist / GROOVE_RADIUS));

          rb.addForce({
            x: (dx / len) * pull - vel.x * damping,
            y: 0,
            z: (dz / len) * pull - vel.z * damping,
          }, true);
        }
      }
    }

    positionsRef.current.set(ball.id, new THREE.Vector3(pos.x, pos.y, pos.z));

    if (currentPhase === "checking" && isWin && meshRef.current) {
      meshRef.current.scale.setScalar(1 + Math.sin(Date.now() / 120) * 0.12);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
  });

  return (
    <RigidBody
      position={holePos}
      colliders={false}
      restitution={physicsSettings.restitution}
      friction={0.7}
      linearDamping={0.28}
      angularDamping={0.35}
      mass={1}
      ccd
      softCcdPrediction={BALL_R * 0.5}
      transformState={attachRigidBody}
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
