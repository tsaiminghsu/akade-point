"use client";
import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { DBOX_HW, DBOX_HD, DBOX_H } from "./DiceBox2";
import type { GamePhase } from "./JiuGongGeGame";

const FACE_ROTATIONS: [number, number, number][] = [
  [0, 0, 0],
  [-Math.PI / 2, 0, 0],
  [0, 0, -Math.PI / 2],
  [0, 0, Math.PI / 2],
  [Math.PI / 2, 0, 0],
  [Math.PI, 0, 0],
];
const FACE_ORDER = [4, 3, 1, 6, 2, 5];

const DIE_SIZE = 0.60; // scene units
const HALF = DIE_SIZE / 2;

const GRAVITY     = 24;
const KICK_INTERVAL = 0.28;
const KICK_UP     = 8;
const KICK_HORIZ  = 2.5;
const BOUNCE      = 0.62;
const ROT_DAMP    = 0.88;

const WIND_CHARS = ["東", "西", "南", "北", "中", "發"];
const WIND_FG    = ["#1a1a1a","#1a1a1a","#1a1a1a","#1a1a1a","#c0392b","#1e8449"];

function canvasRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function makeWindTexture(face: number): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#f7f5f0"; c.fillRect(0, 0, S, S);
  c.strokeStyle = "#d0ccc4"; c.lineWidth = 7;
  c.beginPath(); canvasRoundRect(c, 5, 5, S - 10, S - 10, 20); c.stroke();
  c.fillStyle = WIND_FG[face - 1];
  c.font = `bold ${Math.round(S * 0.58)}px "PingFang SC","Noto Serif CJK SC","Microsoft YaHei",serif`;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(WIND_CHARS[face - 1], S / 2, S / 2 + S * 0.02);
  return new THREE.CanvasTexture(cv);
}

function rng(seed: number, n: number) {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1);
}

interface WindDie3DProps {
  targetValue: number;
  phase: GamePhase;
  restPosition: [number, number, number];
  finalPos: [number, number, number];
  rollId: number;
  rollSeed: number;
  isWinner: boolean;
}

export default function WindDie3D({ targetValue, phase, restPosition, finalPos, rollId, rollSeed, isWinner }: WindDie3DProps) {
  const meshRef = useRef<THREE.Group>(null);

  const cornerRadius = DIE_SIZE * 0.12;
  const floorY = HALF;
  const bx = DBOX_HW - HALF - 0.06;
  const bz = DBOX_HD - HALF - 0.06;
  const ceilY = DBOX_H - HALF;

  const materials = useMemo(() => {
    return FACE_ORDER.map((f) =>
      new THREE.MeshBasicMaterial({
        map: makeWindTexture(f),
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    );
  }, []);

  const bodyMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f7f5f0", roughness: 0.28, metalness: 0.05 }),
    []
  );

  const faceInset = cornerRadius * 0.55;
  const faceSize = DIE_SIZE - faceInset * 2;
  const faceOffset = HALF + 0.003;
  const faceTransforms = [
    { position: [ faceOffset, 0, 0] as [number,number,number], rotation: [0,  Math.PI/2, 0] as [number,number,number] },
    { position: [-faceOffset, 0, 0] as [number,number,number], rotation: [0, -Math.PI/2, 0] as [number,number,number] },
    { position: [0,  faceOffset, 0] as [number,number,number], rotation: [-Math.PI/2, 0, 0] as [number,number,number] },
    { position: [0, -faceOffset, 0] as [number,number,number], rotation: [ Math.PI/2, 0, 0] as [number,number,number] },
    { position: [0, 0,  faceOffset] as [number,number,number], rotation: [0, 0, 0] as [number,number,number] },
    { position: [0, 0, -faceOffset] as [number,number,number], rotation: [0, Math.PI, 0] as [number,number,number] },
  ];

  const phys = useRef({
    px: restPosition[0], py: floorY, pz: restPosition[2],
    vx: 0, vy: 0, vz: 0,
    rx: 0, ry: 0, rz: 0,
    vrx: 0, vry: 0, vrz: 0,
    elapsed: 0, prevKick: -1,
  });

  useEffect(() => {
    if (phase !== "rolling") return;
    const p = phys.current;
    p.elapsed = 0; p.prevKick = -1;
    p.py = floorY + 0.05;
    p.vx = (rng(rollSeed, 1) - 0.5) * 2;
    p.vy = rng(rollSeed, 2) * 2 + 1;
    p.vz = (rng(rollSeed, 3) - 0.5) * 2;
    p.vrx = (rng(rollSeed, 4) - 0.5) * 18;
    p.vry = (rng(rollSeed, 5) - 0.5) * 18;
    p.vrz = (rng(rollSeed, 6) - 0.5) * 18;
  }, [phase, rollSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetEuler = useMemo(() => {
    const [rx, ry, rz] = FACE_ROTATIONS[targetValue - 1];
    return new THREE.Euler(
      rx + (Math.round(rng(rollSeed, 7) * 3) + 3) * Math.PI * 2,
      ry + (Math.round(rng(rollSeed, 8) * 3) + 3) * Math.PI * 2,
      rz + (Math.round(rng(rollSeed, 9) * 3) + 3) * Math.PI * 2,
    );
  }, [targetValue, rollSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = phys.current;
    p.elapsed += delta;

    if (phase === "rolling" || phase === "vibrating") {
      const currKick = Math.floor(p.elapsed / KICK_INTERVAL);
      if (currKick > p.prevKick) {
        p.prevKick = currKick;
        p.vy = phase === "vibrating" ? KICK_UP * 0.35 : KICK_UP;
        p.vx += (rng(rollSeed, currKick * 7 + 1) - 0.5) * KICK_HORIZ * 2;
        p.vz += (rng(rollSeed, currKick * 7 + 2) - 0.5) * KICK_HORIZ * 2;
        p.vrx += (rng(rollSeed, currKick * 7 + 3) - 0.5) * (phase === "vibrating" ? 6 : 14);
        p.vry += (rng(rollSeed, currKick * 7 + 4) - 0.5) * (phase === "vibrating" ? 6 : 14);
        p.vrz += (rng(rollSeed, currKick * 7 + 5) - 0.5) * (phase === "vibrating" ? 6 : 14);
      }
      p.vy -= GRAVITY * delta;
      p.px += p.vx * delta; p.py += p.vy * delta; p.pz += p.vz * delta;
      p.rx += p.vrx * delta; p.ry += p.vry * delta; p.rz += p.vrz * delta;
      if (p.px >  bx) { p.px =  bx; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.px < -bx) { p.px = -bx; p.vx =  Math.abs(p.vx) * BOUNCE; }
      if (p.pz >  bz) { p.pz =  bz; p.vz = -Math.abs(p.vz) * BOUNCE; }
      if (p.pz < -bz) { p.pz = -bz; p.vz =  Math.abs(p.vz) * BOUNCE; }
      if (p.py > ceilY) { p.py = ceilY; p.vy = -Math.abs(p.vy) * BOUNCE; }
      if (p.py < floorY) {
        p.py = floorY; p.vy = Math.abs(p.vy) * BOUNCE * 0.7;
        p.vx *= 0.80; p.vz *= 0.80;
        p.vrx *= ROT_DAMP; p.vry *= ROT_DAMP; p.vrz *= ROT_DAMP;
      }
      mesh.position.set(p.px, p.py, p.pz);
      mesh.rotation.set(p.rx, p.ry, p.rz);

    } else if (phase === "settling") {
      const k = Math.min(delta * 5, 1);
      p.rx += (targetEuler.x - p.rx) * k; p.ry += (targetEuler.y - p.ry) * k; p.rz += (targetEuler.z - p.rz) * k;
      p.px += (finalPos[0] - p.px) * k; p.py += (floorY - p.py) * k; p.pz += (finalPos[2] - p.pz) * k;
      mesh.position.set(p.px, p.py, p.pz); mesh.rotation.set(p.rx, p.ry, p.rz);

    } else if (phase === "result" || phase === "checking") {
      const [fx, fy, fz] = FACE_ROTATIONS[targetValue - 1];
      p.rx += (fx - p.rx) * delta * 10; p.ry += (fy - p.ry) * delta * 10; p.rz += (fz - p.rz) * delta * 10;
      p.px += (finalPos[0] - p.px) * delta * 10; p.py += (floorY - p.py) * delta * 10; p.pz += (finalPos[2] - p.pz) * delta * 10;
      mesh.position.set(p.px, p.py, p.pz); mesh.rotation.set(p.rx, p.ry, p.rz);

    } else {
      if (rollId === 0) {
        const bob = Math.sin(p.elapsed * 1.4 + rollSeed * 0.01) * 0.02;
        p.px = restPosition[0]; p.py = floorY + bob; p.pz = restPosition[2];
        mesh.position.set(p.px, p.py, p.pz);
      }
    }

    // Winner glow scale
    if ((phase === "checking" || phase === "result") && isWinner) {
      const s = 1 + Math.sin(Date.now() / 130) * 0.08;
      mesh.scale.setScalar(s);
    } else {
      mesh.scale.setScalar(1);
    }
  });

  return (
    <group ref={meshRef} position={[restPosition[0], floorY, restPosition[2]]} castShadow>
      <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={cornerRadius} smoothness={5} material={bodyMaterial} castShadow receiveShadow />
      {faceTransforms.map((face, i) => (
        <mesh key={i} position={face.position} rotation={face.rotation} material={materials[i]}>
          <planeGeometry args={[faceSize, faceSize]} />
        </mesh>
      ))}
    </group>
  );
}
