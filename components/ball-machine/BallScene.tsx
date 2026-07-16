"use client";
import { useMemo, useRef, useImperativeHandle, forwardRef, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import BallContainer, { getBounds } from "./BallContainer";
import Ball3D from "./Ball3D";
import type { Ball, GamePhase, WinCell } from "./BallMachineGame";
import { calcContainerSize } from "./BallMachineGame";
import { CONTAINER_H, BALL_R } from "./constants";

// ── Physics constants ──────────────────────────────────────────────────────────
const BASE_GRAVITY   = 24;
const FLOOR_FRICTION = 0.78;
const KICK_UP        = 8.5;
const KICK_HORIZ     = 2.2;
const KICK_INTERVAL  = 0.28;
const VIB_KICK_UP    = 3.5;
const VIB_KICK_HORIZ = 1.2;
const VIB_INTERVAL   = 0.28;
const SETTLE_K = 45;
const SETTLE_C = 2 * Math.sqrt(SETTLE_K); // ≈ 13.4
const SNAP_K   = 120;
const SNAP_C   = 2 * Math.sqrt(SNAP_K);   // ≈ 21.9
const STOP_VY  = 0.5;

interface PhysicsSettings {
  restitution: number;
  bounceStrength: number;
  gravity: number;
  kickStrength: number;
}

interface PhysState {
  id: number;
  ballIndex: number;
  holeIdx: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  elapsed: number;
  prevKick: number;
}

function rng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1);
}

// Greedy min-distance assignment: each hole is assigned to at most one ball.
// Guarantees no two balls share the same target hole during settling.
function greedyAssignHoles(
  states: PhysState[],
  holePositions: [number, number, number][]
): void {
  // Build all (ballIndex, holeIndex, dist²) pairs and sort by distance
  const pairs: { si: number; hi: number; dist2: number }[] = [];
  for (let si = 0; si < states.length; si++) {
    const s = states[si];
    for (let hi = 0; hi < holePositions.length; hi++) {
      const hp = holePositions[hi];
      const dx = s.px - hp[0], dz = s.pz - hp[2];
      pairs.push({ si, hi, dist2: dx * dx + dz * dz });
    }
  }
  pairs.sort((a, b) => a.dist2 - b.dist2);

  const holeUsed = new Set<number>();
  const ballAssigned = new Set<number>();
  for (const { si, hi } of pairs) {
    if (!ballAssigned.has(si) && !holeUsed.has(hi)) {
      states[si].holeIdx = hi;
      ballAssigned.add(si);
      holeUsed.add(hi);
    }
  }
  // Fallback: balls that couldn't get a unique hole keep their current holeIdx
}

export interface BallSceneHandle {
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

// ── Inner physics manager: runs single useFrame inside Canvas context ──────────
interface BallPhysicsProps {
  allPhysRef: React.MutableRefObject<PhysState[]>;
  meshRefsMap: React.MutableRefObject<Map<number, THREE.Mesh>>;
  positionsRef: React.MutableRefObject<Map<number, THREE.Vector3>>;
  phase: GamePhase;
  holePositions: [number, number, number][];
  physicsSettings: PhysicsSettings;
  winCells: WinCell[];
  balls: Ball[];
  cols: number;
  rows: number;
}

function BallPhysics({
  allPhysRef, meshRefsMap, positionsRef,
  phase, holePositions, physicsSettings, winCells, balls, cols, rows,
}: BallPhysicsProps) {
  // Refs to avoid stale closures in useFrame
  const phaseRef = useRef<GamePhase>(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const settingsRef = useRef(physicsSettings);
  useEffect(() => { settingsRef.current = physicsSettings; }, [physicsSettings]);

  const winCellsRef = useRef(winCells);
  useEffect(() => { winCellsRef.current = winCells; }, [winCells]);

  const ballsRef = useRef(balls);
  useEffect(() => { ballsRef.current = balls; }, [balls]);

  useFrame((_, delta) => {
    const currentPhase = phaseRef.current;
    const states = allPhysRef.current;
    const meshes = meshRefsMap.current;
    const { restitution, bounceStrength, gravity, kickStrength } = settingsRef.current;
    const wallBounce  = restitution;
    const floorBounce = restitution * 0.65;
    const effGravity  = BASE_GRAVITY * gravity;
    const gFactor     = Math.sqrt(Math.max(0.3, gravity));
    const dt          = Math.min(delta, 0.033);
    const bounds      = getBounds(cols, rows);
    const floorY      = bounds.yMin;

    // ── Ready / inserting: freeze all balls at assigned holes ─────────────
    if (currentPhase === "ready" || currentPhase === "inserting") {
      for (const s of states) {
        const hp = holePositions[s.holeIdx] ?? holePositions[0];
        s.px = hp[0]; s.py = hp[1]; s.pz = hp[2];
        s.vx = 0; s.vy = 0; s.vz = 0;
        const mesh = meshes.get(s.id);
        if (mesh) { mesh.position.set(s.px, s.py, s.pz); mesh.scale.setScalar(1); }
        positionsRef.current.set(s.id, new THREE.Vector3(s.px, s.py, s.pz));
      }
      return;
    }

    // ── Step 1: Integrate forces per ball ─────────────────────────────────
    for (const s of states) {
      if (currentPhase === "vibrating") {
        s.elapsed += dt;
        const currKick = Math.floor(s.elapsed / VIB_INTERVAL);
        if (currKick > s.prevKick) {
          s.prevKick = currKick;
          const seed = s.id * 137 + currKick * 17;
          s.vy = VIB_KICK_UP * bounceStrength * gFactor * (0.7 + rng(seed, 1) * 0.6);
          s.vx += (rng(seed, 2) - 0.5) * VIB_KICK_HORIZ * 2;
          s.vz += (rng(seed, 3) - 0.5) * VIB_KICK_HORIZ * 2;
        }
        s.vy -= effGravity * dt;
        s.px += s.vx * dt; s.py += s.vy * dt; s.pz += s.vz * dt;

      } else if (currentPhase === "jumping") {
        s.elapsed += dt;
        const currKick = Math.floor(s.elapsed / KICK_INTERVAL);
        if (currKick > s.prevKick) {
          s.prevKick = currKick;
          const seed = s.id * 137 + currKick * 23;
          s.vy = KICK_UP * bounceStrength * kickStrength * gFactor * (0.8 + rng(seed, 1) * 0.4);
          s.vx += (rng(seed, 2) - 0.5) * KICK_HORIZ * 2;
          s.vz += (rng(seed, 3) - 0.5) * KICK_HORIZ * 2;
        }
        s.vy -= effGravity * dt;
        s.px += s.vx * dt; s.py += s.vy * dt; s.pz += s.vz * dt;

      } else if (currentPhase === "settling") {
        // Critically-damped spring toward each ball's uniquely-assigned hole (XZ)
        // holeIdx was set by greedyAssignHoles at phase transition — no two balls share the same target
        const target = holePositions[s.holeIdx] ?? holePositions[0];
        s.vx += ((target[0] - s.px) * SETTLE_K - s.vx * SETTLE_C) * dt;
        s.vz += ((target[2] - s.pz) * SETTLE_K - s.vz * SETTLE_C) * dt;
        s.px += s.vx * dt; s.pz += s.vz * dt;
        s.vy -= effGravity * dt;
        s.py += s.vy * dt;

      } else if (currentPhase === "checking" || currentPhase === "result") {
        // Strong snap spring toward assigned hole (XZ)
        const hp = holePositions[s.holeIdx] ?? holePositions[0];
        s.vx += ((hp[0] - s.px) * SNAP_K - s.vx * SNAP_C) * dt;
        s.vz += ((hp[2] - s.pz) * SNAP_K - s.vz * SNAP_C) * dt;
        s.px += s.vx * dt; s.pz += s.vz * dt;
        s.vy -= effGravity * dt;
        s.py += s.vy * dt;
      }
    }

    // ── Step 2: Ball-ball collision (5 passes, both balls updated simultaneously)
    // vibrating/jumping: energetic — 5 passes keeps balls separated
    // settling: spring attraction is strong, extra passes resist convergence
    if (currentPhase === "vibrating" || currentPhase === "jumping" || currentPhase === "settling") {
      const minDist  = BALL_R * 2;
      const minDist2 = minDist * minDist;
      const iters = currentPhase === "settling" ? 6 : 5;
      for (let iter = 0; iter < iters; iter++) {
        for (let i = 0; i < states.length; i++) {
          for (let j = i + 1; j < states.length; j++) {
            const a = states[i], b = states[j];
            const dx = a.px - b.px, dy = a.py - b.py, dz = a.pz - b.pz;
            const dist2 = dx * dx + dy * dy + dz * dz;
            if (dist2 >= minDist2 || dist2 < 1e-8) continue;
            const dist = Math.sqrt(dist2);
            const overlap = minDist - dist;
            const nx = dx / dist, ny = dy / dist, nz = dz / dist;
            // Push both balls apart by half each
            const half = overlap * 0.5;
            a.px += nx * half; a.py += ny * half; a.pz += nz * half;
            b.px -= nx * half; b.py -= ny * half; b.pz -= nz * half;
            // Velocity exchange along normal (elastic, equal mass)
            const relVn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
            if (relVn < 0) {
              const imp = relVn * (1 + wallBounce) * 0.5;
              a.vx -= imp * nx; a.vy -= imp * ny; a.vz -= imp * nz;
              b.vx += imp * nx; b.vy += imp * ny; b.vz += imp * nz;
            }
          }
        }
      }
    }

    // ── Step 3: AABB boundary clamp (all phases) ──────────────────────────
    for (const s of states) {
      // Lid
      if (s.py > bounds.yMax) { s.py = bounds.yMax; s.vy = -Math.abs(s.vy) * wallBounce; }
      // Floor
      if (s.py < floorY) {
        s.py = floorY;
        const absVy = Math.abs(s.vy);
        if (currentPhase === "settling" || currentPhase === "checking" || currentPhase === "result") {
          s.vy = absVy > STOP_VY ? absVy * floorBounce : 0;
        } else {
          s.vy = absVy * floorBounce;
        }
        s.vx *= FLOOR_FRICTION;
        s.vz *= FLOOR_FRICTION;
      }
      // XZ walls
      if (s.px < bounds.xMin) { s.px = bounds.xMin; s.vx =  Math.abs(s.vx) * wallBounce; }
      if (s.px > bounds.xMax) { s.px = bounds.xMax; s.vx = -Math.abs(s.vx) * wallBounce; }
      if (s.pz < bounds.zMin) { s.pz = bounds.zMin; s.vz =  Math.abs(s.vz) * wallBounce; }
      if (s.pz > bounds.zMax) { s.pz = bounds.zMax; s.vz = -Math.abs(s.vz) * wallBounce; }
    }

    // ── Step 4: Update mesh positions + win animation + positionsRef ──────
    const currentBalls = ballsRef.current;
    const currentWinCells = winCellsRef.current;
    for (const s of states) {
      const mesh = meshes.get(s.id);
      if (mesh) {
        mesh.position.set(s.px, s.py, s.pz);
        if (currentPhase === "checking") {
          const b = currentBalls.find(b => b.id === s.id);
          const isWin = b ? currentWinCells.some(w => w.row === b.row && w.col === b.col) : false;
          mesh.scale.setScalar(isWin ? 1 + Math.sin(Date.now() / 120) * 0.12 : 1);
        } else {
          mesh.scale.setScalar(1);
        }
      }
      positionsRef.current.set(s.id, new THREE.Vector3(s.px, s.py, s.pz));
    }
  });

  return null;
}

// ── Main BallScene component ───────────────────────────────────────────────────
const BallScene = forwardRef<BallSceneHandle, BallSceneProps>(function BallScene(
  { balls, phase, winCells, holePositions, cols, rows, physicsSettings },
  ref,
) {
  const { containerW, containerD } = useMemo(() => calcContainerSize(cols, rows), [cols, rows]);
  const positionsRef = useRef<Map<number, THREE.Vector3>>(new Map());

  // All ball physics states — initialized once from initial balls prop
  const allPhysRef = useRef<PhysState[]>(
    balls.map((ball, idx) => {
      const holeIdx = ball.row * cols + ball.col;
      const hp = holePositions[holeIdx] ?? holePositions[0];
      return {
        id: ball.id, ballIndex: idx, holeIdx,
        px: hp[0], py: hp[1], pz: hp[2],
        vx: 0, vy: 0, vz: 0, elapsed: 0, prevKick: -1,
      };
    })
  );

  // Registry: Ball3D components register their THREE.Mesh refs here
  const meshRefsMap = useRef<Map<number, THREE.Mesh>>(new Map());
  const registerMesh = useCallback((id: number, mesh: THREE.Mesh | null) => {
    if (mesh) meshRefsMap.current.set(id, mesh);
    else meshRefsMap.current.delete(id);
  }, []);

  // Phase transition: reset / configure physics states
  useEffect(() => {
    const states = allPhysRef.current;
    const bounds = getBounds(cols, rows);
    if (phase === "ready" || phase === "inserting") {
      states.forEach(s => {
        const hp = holePositions[s.holeIdx] ?? holePositions[0];
        s.px = hp[0]; s.py = hp[1]; s.pz = hp[2];
        s.vx = 0; s.vy = 0; s.vz = 0;
      });
    } else if (phase === "vibrating") {
      states.forEach(s => {
        const hp = holePositions[s.holeIdx] ?? holePositions[0];
        s.px = hp[0]; s.py = bounds.yMin; s.pz = hp[2];
        s.vx = 0; s.vy = 0; s.vz = 0;
        s.elapsed = s.ballIndex * 0.055;
        s.prevKick = -1;
      });
    } else if (phase === "jumping") {
      states.forEach(s => {
        s.elapsed = s.ballIndex * 0.04;
        s.prevKick = -1;
        s.vx = 0; s.vy = 0; s.vz = 0;
      });
    } else if (phase === "settling") {
      // Assign each ball a unique hole before spring physics starts
      greedyAssignHoles(states, holePositions);
      states.forEach(s => { s.prevKick = -1; });
    } else if (phase === "checking" || phase === "result") {
      states.forEach(s => { s.vx = 0; s.vz = 0; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Update holeIdx after computeResult (balls' row/col change for checking phase target)
  useEffect(() => {
    const states = allPhysRef.current;
    balls.forEach((ball, idx) => {
      if (states[idx]) {
        states[idx].id = ball.id;
        states[idx].holeIdx = ball.row * cols + ball.col;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balls]);

  useImperativeHandle(ref, () => ({
    computeResult(currentBalls, currentHolePositions, currentCols) {
      // Build all (ballIndex, holeIndex, dist²) pairs
      const pairs: { bi: number; hi: number; dist2: number }[] = [];
      for (let bi = 0; bi < currentBalls.length; bi++) {
        const ball = currentBalls[bi];
        const pos = positionsRef.current.get(ball.id);
        if (!pos) continue;
        for (let hi = 0; hi < currentHolePositions.length; hi++) {
          const [hx, , hz] = currentHolePositions[hi];
          const dx = pos.x - hx, dz = pos.z - hz;
          pairs.push({ bi, hi, dist2: dx * dx + dz * dz });
        }
      }
      pairs.sort((a, b) => a.dist2 - b.dist2);

      // Greedy assignment: each hole gets at most one ball
      const result = [...currentBalls];
      const holeUsed = new Set<number>();
      const ballMapped = new Set<number>();
      for (const { bi, hi } of pairs) {
        if (!ballMapped.has(bi) && !holeUsed.has(hi)) {
          holeUsed.add(hi);
          ballMapped.add(bi);
          result[bi] = {
            ...currentBalls[bi],
            row: Math.floor(hi / currentCols),
            col: hi % currentCols,
          };
        }
      }
      // Fallback: unmapped balls (if balls > holes) keep original row/col
      return result;
    },
  }));

  const camX = 0;
  const camY = CONTAINER_H * 1.4 + containerD * 0.3;
  const camZ = containerD * 1.0 + containerW * 0.25 + 3.5;
  const targetY = CONTAINER_H * 0.25;

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

      <BallPhysics
        allPhysRef={allPhysRef}
        meshRefsMap={meshRefsMap}
        positionsRef={positionsRef}
        phase={phase}
        holePositions={holePositions}
        physicsSettings={physicsSettings}
        winCells={winCells}
        balls={balls}
        cols={cols}
        rows={rows}
      />

      <BallContainer cols={cols} rows={rows} />

      {balls.map(ball => {
        const holeIdx = ball.row * cols + ball.col;
        const holePos = holePositions[holeIdx] ?? holePositions[0];
        return (
          <Ball3D
            key={ball.id}
            ball={ball}
            phase={phase}
            holePos={holePos}
            winCells={winCells}
            registerMesh={registerMesh}
          />
        );
      })}

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
