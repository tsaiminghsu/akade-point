"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { calcContainerSize, CONTAINER_H } from "./BallMachineGame";
import { HOLE_SPACING, BALL_R, FLOOR_T, WALL_T } from "./constants";

interface BallContainerProps {
  cols: number;
  rows: number;
}

// Y=0 is world floor. All geometry built up from there.
export function getBounds(cols: number, rows: number) {
  const { containerW, containerD } = calcContainerSize(cols, rows);
  return {
    xMin: -containerW / 2 + BALL_R + WALL_T,
    xMax:  containerW / 2 - BALL_R - WALL_T,
    yMin:  FLOOR_T + BALL_R,
    yMax:  CONTAINER_H - WALL_T - BALL_R,
    zMin: -containerD / 2 + BALL_R + WALL_T,
    zMax:  containerD / 2 - BALL_R - WALL_T,
  };
}

const FRAME_W = 0.1;
const GLASS_COLOR = "#a8d8ff";
const BASE_H = 0.55;
const GRID_LINE_W = 0.025;

export default function BallContainer({ cols, rows }: BallContainerProps) {
  const { containerW: W, containerD: D } = useMemo(
    () => calcContainerSize(cols, rows),
    [cols, rows]
  );
  const H = CONTAINER_H;

  const holeGrid = useMemo(() => {
    const holes: [number, number][] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        holes.push([
          (c - (cols - 1) / 2) * HOLE_SPACING,
          (r - (rows - 1) / 2) * HOLE_SPACING,
        ]);
    return holes;
  }, [cols, rows]);

  const glassProps = {
    color: GLASS_COLOR,
    transparent: true,
    roughness: 0.05,
    metalness: 0.1,
    envMapIntensity: 1.5,
  };

  const wallCenterY = H / 2;

  return (
    <group>
      {/* ── Static physics colliders ─────────────────────────────────────── */}
      <RigidBody type="fixed" colliders={false}>
        {/* Floor */}
        <CuboidCollider args={[W / 2, FLOOR_T / 2, D / 2]} position={[0, FLOOR_T / 2, 0]} restitution={0.35} friction={0.8} />
        {/* Back wall */}
        <CuboidCollider args={[W / 2, H / 2, WALL_T / 2]} position={[0, H / 2, -D / 2 + WALL_T / 2]} restitution={0.4} friction={0.5} />
        {/* Front wall */}
        <CuboidCollider args={[W / 2, H / 2, WALL_T / 2]} position={[0, H / 2, D / 2 - WALL_T / 2]} restitution={0.4} friction={0.5} />
        {/* Left wall */}
        <CuboidCollider args={[WALL_T / 2, H / 2, D / 2]} position={[-W / 2 + WALL_T / 2, H / 2, 0]} restitution={0.4} friction={0.5} />
        {/* Right wall */}
        <CuboidCollider args={[WALL_T / 2, H / 2, D / 2]} position={[W / 2 - WALL_T / 2, H / 2, 0]} restitution={0.4} friction={0.5} />
        {/* Lid */}
        <CuboidCollider args={[W / 2, WALL_T / 2, D / 2]} position={[0, H - WALL_T / 2, 0]} restitution={0.3} friction={0.5} />
      </RigidBody>

      {/* ── Visual meshes (unchanged) ─────────────────────────────────────── */}
      {/* Floor tray */}
      <mesh position={[0, FLOOR_T / 2, 0]} receiveShadow>
        <boxGeometry args={[W, FLOOR_T, D]} />
        <meshStandardMaterial color="#1b2435" roughness={0.72} metalness={0.08} />
      </mesh>

      {/* Cell grid lines */}
      {Array.from({ length: cols + 1 }).map((_, i) => {
        const x = (i - cols / 2) * HOLE_SPACING;
        return (
          <mesh key={`grid-x-${i}`} position={[x, FLOOR_T + 0.012, 0]}>
            <boxGeometry args={[GRID_LINE_W, 0.012, rows * HOLE_SPACING]} />
            <meshStandardMaterial color="#486174" emissive="#1b4050" emissiveIntensity={0.4} roughness={0.6} />
          </mesh>
        );
      })}
      {Array.from({ length: rows + 1 }).map((_, i) => {
        const z = (i - rows / 2) * HOLE_SPACING;
        return (
          <mesh key={`grid-z-${i}`} position={[0, FLOOR_T + 0.014, z]}>
            <boxGeometry args={[cols * HOLE_SPACING, 0.012, GRID_LINE_W]} />
            <meshStandardMaterial color="#486174" emissive="#1b4050" emissiveIntensity={0.4} roughness={0.6} />
          </mesh>
        );
      })}

      {/* Recessed holes in every cell */}
      {holeGrid.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, FLOOR_T + 0.008, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[BALL_R * 0.82, 0.035, 8, 36]} />
            <meshStandardMaterial color="#8fb6c8" emissive="#25495a" emissiveIntensity={0.65} roughness={0.4} metalness={0.1} />
          </mesh>
          <mesh position={[0, FLOOR_T - 0.035, 0]}>
            <cylinderGeometry args={[BALL_R * 0.72, BALL_R * 0.56, FLOOR_T * 0.72, 36]} />
            <meshStandardMaterial color="#070b14" roughness={1} metalness={0} />
          </mesh>
          <mesh position={[0, FLOOR_T + 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[BALL_R * 0.36, BALL_R * 0.72, 36]} />
            <meshStandardMaterial color="#101827" transparent opacity={0.86} roughness={1} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* Back wall */}
      <mesh position={[0, wallCenterY, -D / 2 + WALL_T / 2]}>
        <boxGeometry args={[W, H, WALL_T]} />
        <meshStandardMaterial {...glassProps} opacity={0.20} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-W / 2 + WALL_T / 2, wallCenterY, 0]}>
        <boxGeometry args={[WALL_T, H, D]} />
        <meshStandardMaterial {...glassProps} opacity={0.14} />
      </mesh>

      {/* Right wall */}
      <mesh position={[W / 2 - WALL_T / 2, wallCenterY, 0]}>
        <boxGeometry args={[WALL_T, H, D]} />
        <meshStandardMaterial {...glassProps} opacity={0.14} />
      </mesh>

      {/* Front glass */}
      <mesh position={[0, wallCenterY, D / 2 - WALL_T / 2]}>
        <boxGeometry args={[W, H, WALL_T]} />
        <meshStandardMaterial {...glassProps} opacity={0.05} />
      </mesh>

      {/* Lid */}
      <mesh position={[0, H - WALL_T / 2, 0]}>
        <boxGeometry args={[W, WALL_T, D]} />
        <meshStandardMaterial {...glassProps} opacity={0.18} />
      </mesh>

      {/* Corner pillars */}
      {([[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]).map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (W / 2 - FRAME_W / 2), wallCenterY, sz * (D / 2 - FRAME_W / 2)]}>
          <boxGeometry args={[FRAME_W, H, FRAME_W]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Top horizontal frame bars (X direction) */}
      {([-1, 1] as number[]).map((sz, i) => (
        <mesh key={i} position={[0, H - FRAME_W / 2, sz * (D / 2 - FRAME_W / 2)]}>
          <boxGeometry args={[W, FRAME_W, FRAME_W]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Top frame bars (Z direction) */}
      {([-1, 1] as number[]).map((sx, i) => (
        <mesh key={i} position={[sx * (W / 2 - FRAME_W / 2), H - FRAME_W / 2, 0]}>
          <boxGeometry args={[FRAME_W, FRAME_W, D]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Bottom frame bars */}
      {([-1, 1] as number[]).map((sz, i) => (
        <mesh key={i} position={[0, FRAME_W / 2, sz * (D / 2 - FRAME_W / 2)]}>
          <boxGeometry args={[W, FRAME_W, FRAME_W]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Amber accent strips */}
      {([-1, 1] as number[]).map((sx, i) => (
        <mesh key={i} position={[sx * (W / 2 - FRAME_W / 2), 0.04, 0]}>
          <boxGeometry args={[FRAME_W * 0.4, 0.04, D]} />
          <meshStandardMaterial color="#ff8c00" emissive="#ff8c00" emissiveIntensity={2.5} />
        </mesh>
      ))}

      {/* Machine base */}
      <mesh position={[0, -BASE_H / 2, 0]}>
        <boxGeometry args={[W + 0.3, BASE_H, D + 0.3]} />
        <meshStandardMaterial color="#0c0c1e" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}
