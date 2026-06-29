"use client";
import {
  calcContainerSize, HOLE_SPACING, BALL_R,
  CONTAINER_H, FLOOR_T, WALL_T, GRID_COLS, GRID_ROWS,
} from "./JiuGongGeGame";

const GLASS_COLOR = "#a8d8ff";
const FRAME_W = 0.1;
const BASE_H = 0.45;

export function getGridBounds() {
  const { containerW, containerD } = calcContainerSize();
  return {
    xMin: -containerW / 2 + BALL_R + WALL_T,
    xMax:  containerW / 2 - BALL_R - WALL_T,
    yMin:  FLOOR_T + BALL_R,
    yMax:  CONTAINER_H - WALL_T - BALL_R,
    zMin: -containerD / 2 + BALL_R + WALL_T,
    zMax:  containerD / 2 - BALL_R - WALL_T,
  };
}

export default function GridContainer() {
  const { containerW: W, containerD: D } = calcContainerSize();
  const H = CONTAINER_H;
  const wallCenterY = H / 2;

  const holeGrid: [number, number][] = [];
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      holeGrid.push([
        (c - (GRID_COLS - 1) / 2) * HOLE_SPACING,
        (r - (GRID_ROWS - 1) / 2) * HOLE_SPACING,
      ]);

  const glassProps = {
    color: GLASS_COLOR,
    transparent: true,
    roughness: 0.05,
    metalness: 0.1,
    envMapIntensity: 1.5,
  };

  return (
    <group>
      {/* Floor tray */}
      <mesh position={[0, FLOOR_T / 2, 0]} receiveShadow>
        <boxGeometry args={[W, FLOOR_T, D]} />
        <meshStandardMaterial color="#111122" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Hole cylinders */}
      {holeGrid.map(([x, z], i) => (
        <mesh key={i} position={[x, FLOOR_T - 0.01, z]}>
          <cylinderGeometry args={[BALL_R - 0.01, BALL_R - 0.01, FLOOR_T * 1.1, 24]} />
          <meshStandardMaterial color="#06060f" roughness={1} metalness={0} />
        </mesh>
      ))}

      {/* Grid dividers (+ cross lines on the floor) */}
      {/* Horizontal dividers */}
      {[-HOLE_SPACING / 2, HOLE_SPACING / 2].map((z, i) => (
        <mesh key={`hdiv${i}`} position={[0, FLOOR_T + 0.01, z]}>
          <boxGeometry args={[W - WALL_T * 4, 0.04, 0.04]} />
          <meshStandardMaterial color="#2a2a3a" roughness={0.8} metalness={0.2} />
        </mesh>
      ))}
      {/* Vertical dividers */}
      {[-HOLE_SPACING / 2, HOLE_SPACING / 2].map((x, i) => (
        <mesh key={`vdiv${i}`} position={[x, FLOOR_T + 0.01, 0]}>
          <boxGeometry args={[0.04, 0.04, D - WALL_T * 4]} />
          <meshStandardMaterial color="#2a2a3a" roughness={0.8} metalness={0.2} />
        </mesh>
      ))}

      {/* Walls */}
      <mesh position={[0, wallCenterY, -D / 2 + WALL_T / 2]}>
        <boxGeometry args={[W, H, WALL_T]} />
        <meshStandardMaterial {...glassProps} opacity={0.20} />
      </mesh>
      <mesh position={[-W / 2 + WALL_T / 2, wallCenterY, 0]}>
        <boxGeometry args={[WALL_T, H, D]} />
        <meshStandardMaterial {...glassProps} opacity={0.14} />
      </mesh>
      <mesh position={[W / 2 - WALL_T / 2, wallCenterY, 0]}>
        <boxGeometry args={[WALL_T, H, D]} />
        <meshStandardMaterial {...glassProps} opacity={0.14} />
      </mesh>
      <mesh position={[0, wallCenterY, D / 2 - WALL_T / 2]}>
        <boxGeometry args={[W, H, WALL_T]} />
        <meshStandardMaterial {...glassProps} opacity={0.05} />
      </mesh>
      <mesh position={[0, H - WALL_T / 2, 0]}>
        <boxGeometry args={[W, WALL_T, D]} />
        <meshStandardMaterial {...glassProps} opacity={0.18} />
      </mesh>

      {/* Corner pillars */}
      {([[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]).map(([sx, sz], i) => (
        <mesh key={`p${i}`} position={[sx * (W/2 - FRAME_W/2), wallCenterY, sz * (D/2 - FRAME_W/2)]}>
          <boxGeometry args={[FRAME_W, H, FRAME_W]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Top frame bars */}
      {([-1,1] as number[]).map((sz, i) => (
        <mesh key={`tf${i}`} position={[0, H - FRAME_W/2, sz * (D/2 - FRAME_W/2)]}>
          <boxGeometry args={[W, FRAME_W, FRAME_W]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
      {([-1,1] as number[]).map((sx, i) => (
        <mesh key={`ts${i}`} position={[sx * (W/2 - FRAME_W/2), H - FRAME_W/2, 0]}>
          <boxGeometry args={[FRAME_W, FRAME_W, D]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}

      {/* Amber accent strips */}
      {([-1,1] as number[]).map((sx, i) => (
        <mesh key={`a${i}`} position={[sx * (W/2 - FRAME_W/2), 0.04, 0]}>
          <boxGeometry args={[FRAME_W * 0.4, 0.04, D]} />
          <meshStandardMaterial color="#ff8c00" emissive="#ff8c00" emissiveIntensity={2.5} />
        </mesh>
      ))}

      {/* Base */}
      <mesh position={[0, -BASE_H / 2, 0]}>
        <boxGeometry args={[W + 0.3, BASE_H, D + 0.3]} />
        <meshStandardMaterial color="#0c0c1e" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}
