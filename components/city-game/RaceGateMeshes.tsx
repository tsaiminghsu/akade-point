'use client';
import React, { useMemo } from 'react';
import * as THREE from 'three';

import type { RaceCourse, RacePhase } from './types';
import { toX3D, toZ3D, TILE_3D, TILE_SIZE } from './types';

interface Props {
  course: RaceCourse | null;
  // Pass only the fields that affect gate appearance — avoids full session re-render every 100ms
  currentGateIndex: number;
  phase: RacePhase;  // RacePhase includes 'idle' — see types.ts
}

function altTo3D(alt: number): number {
  return alt * (TILE_3D / TILE_SIZE);
}

// Pre-built bar descriptor — stable references so React.memo can bail out
type BarDef = { pos: [number, number, number]; size: [number, number, number] };

interface GateFrameProps {
  gateX: number; gateZ: number; gateY: number; gateYaw: number;
  width: number; height: number; thickness: number;
  color: string; emissiveIntensity: number; glowIntensity: number;
  isActive: boolean; isFinish: boolean;
  bars: BarDef[];
}

function GateFrame({
  gateX, gateZ, gateY, gateYaw,
  width, height,
  color, emissiveIntensity, glowIntensity,
  isActive, isFinish, bars,
}: GateFrameProps) {
  const baseColor = isFinish ? '#ffff00' : color;

  return (
    <group position={[gateX, gateY, gateZ]} rotation={[0, -gateYaw, 0]}>
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow={false}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial
            color={baseColor}
            emissive={baseColor}
            emissiveIntensity={emissiveIntensity}
            roughness={0.3}
            metalness={0.6}
            toneMapped={false}
          />
        </mesh>
      ))}

      {glowIntensity > 0 && (
        <pointLight
          color={color}
          intensity={glowIntensity}
          distance={isActive ? 14 : 8}
          decay={2}
        />
      )}

      {/*
        Active gate translucent fill.
        Always rendered (visible toggled) to avoid Three.js PlaneGeometry
        create/destroy on every gate pass — that GPU upload caused the freeze stutter.
      */}
      <mesh visible={isActive}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// Memoized gate — only re-renders when appearance-relevant props change.
// Without this, every gate re-renders every 100ms from the HUD setState cycle.
const GateFrameMemo = React.memo(GateFrame, (prev, next) =>
  prev.isActive          === next.isActive          &&
  prev.emissiveIntensity === next.emissiveIntensity &&
  prev.glowIntensity     === next.glowIntensity     &&
  prev.color             === next.color             &&
  prev.isFinish          === next.isFinish
  // position/size/bars never change for a given gate — safe to skip
);

// ── Main component ────────────────────────────────────────────────────────────

function RaceGateMeshes({ course, currentGateIndex, phase }: Props) {
  // Pre-compute stable bar descriptors — must be before any conditional return (rules of hooks).
  // Recomputed only when course changes (which is once per race).
  const barsByGate: BarDef[][] = useMemo(() => {
    if (!course) return [];
    return course.gates.map(g => {
      const t  = g.thickness;
      const hw = g.width  / 2;
      const hh = g.height / 2;
      return [
        { pos: [0,  hh + t / 2, 0], size: [g.width + t * 2, t, t] },
        { pos: [0, -hh - t / 2, 0], size: [g.width + t * 2, t, t] },
        { pos: [-hw - t / 2, 0, 0], size: [t, g.height, t] },
        { pos: [ hw + t / 2, 0, 0], size: [t, g.height, t] },
      ] as BarDef[];
    });
  }, [course]);

  if (!course || phase === 'idle') return null;

  return (
    <>
      {course.gates.map((g, idx) => {
        const passed   = idx < currentGateIndex || phase === 'finished';
        const isActive = idx === currentGateIndex && phase === 'racing';
        const isNext2  = idx === currentGateIndex + 1;

        const emissive = passed ? 0.2 : isActive ? 3.0 : isNext2 ? 1.2 : 0.7;
        const glowInt  = passed ? 0   : isActive ? 3.0 : 1.0;

        const gX = toX3D(g.x);
        const gZ = toZ3D(g.y);
        const gY = altTo3D(g.altitude);
        const color = g.color ?? course.color;

        return (
          <GateFrameMemo
            key={g.id}
            gateX={gX}
            gateZ={gZ}
            gateY={gY}
            gateYaw={g.yaw}
            width={g.width}
            height={g.height}
            thickness={g.thickness}
            color={color}
            emissiveIntensity={emissive}
            glowIntensity={glowInt}
            isActive={isActive}
            isFinish={!!g.isFinishGate}
            bars={barsByGate[idx]}
          />
        );
      })}
    </>
  );
}

// Outer memo: skip entire re-render when gate index and phase are unchanged.
// GameScene re-renders every 100ms from HUD setState; this prevents cascade.
export default React.memo(RaceGateMeshes, (prev, next) =>
  prev.currentGateIndex === next.currentGateIndex &&
  prev.phase            === next.phase            &&
  prev.course           === next.course,
);
