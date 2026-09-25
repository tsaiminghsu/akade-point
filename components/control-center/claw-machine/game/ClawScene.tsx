'use client';
// Renders the claw machine from ClawSim state. All behaviour lives in
// clawSim.ts; this file only steps it once per frame and copies positions
// onto meshes (imperatively, so React never re-renders at 60 fps).
//
// Several cameras share one canvas: a free-orbit main camera plus fixed side,
// top-down and claw-follow cameras, drawn into scissor rectangles from
// viewLayout.ts. A single front view hides depth, which is what made drops
// miss; the side and top views show the axes the front view can't.

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import CabinetShell, { ROOF_LAYER } from './CabinetShell';
import ClawHead, { clawHeadTop } from './ClawHead';
import {
  BOX, CABLE_ANCHOR_Y, CLAW_TOP, dropLimitHubY, idleOpenness, jogArms, prongGeometry, stepSim, surfaceHeightAt,
  type Chute, type ClawSim, type Joystick,
} from './clawSim';
import { PrizeMesh } from './PrizeMeshes';
import { homeLineLength, midLineLength, type SettingKey } from './settings';
import { layoutViews, type ViewLayout, type ViewSlot } from './viewLayout';

export type CameraView = 'front' | 'side' | 'top' | 'angle';

type Vec3 = [number, number, number];

/** Presets for the free-orbit main camera; the player can drag away from them. */
export const VIEWS: Record<CameraView, { pos: Vec3; target: Vec3 }> = {
  // A player standing at the deck: glass box fills the frame, sign box on top.
  front: { pos: [0, 0.62, 2.5], target: [0, 0.52, 0] },
  side: { pos: [2.5, 0.7, 0.3], target: [0, 0.5, 0] },
  top: { pos: [0, 2.4, 0.05], target: [0, 0.05, 0] },
  angle: { pos: [1.6, 1.1, 2.0], target: [0, 0.45, 0] },
};

/** Main camera above this height looks down through the roof, so hide it. */
const ROOF_CUTAWAY_Y = 1.5;

const RAIL_Y = BOX.height - 0.04;
const UP = new THREE.Vector3(0, 1, 0);
const W = BOX.maxX - BOX.minX;
const D = BOX.maxZ - BOX.minZ;

interface SceneProps {
  sim: ClawSim;
  joyRef: React.RefObject<Joystick>;
  paused: boolean;
  view: CameraView;
  /** Bumped when the same preset is picked again, to re-run the fly-to. */
  viewNonce: number;
  layout: ViewLayout;
  aimAssist: boolean;
  /** Identifies the fitted claw (style, size, 爪位); a change rebuilds the claw head. */
  clawKey: string;
  /** The prize chute as the operator has set it (擋板 height, hole size). */
  chute: Chute;
  /** Setting selected on the board menu; length items show a height guide. */
  guideKey: SettingKey | null;
}

// ── Main camera: orbit controls + animated presets ──────────────────────────

function CameraRig({ view, viewNonce }: { view: CameraView; viewNonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const flying = useRef(true);
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => { flying.current = true; }, [view, viewNonce]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || !flying.current) return;
    const v = VIEWS[view];
    goalPos.set(...v.pos);
    goalTarget.set(...v.target);
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.05));
    camera.position.lerp(goalPos, k);
    c.target.lerp(goalTarget, k);
    c.update();
    if (camera.position.distanceTo(goalPos) < 0.004 && c.target.distanceTo(goalTarget) < 0.004) {
      flying.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.6}
      maxDistance={4.5}
      maxPolarAngle={Math.PI * 0.49}
      // No `target` prop: it would be re-applied on every re-render (each
      // preset change) and yank the camera; the fly-to above moves it instead.
      // Any drag or pinch takes over from a preset fly-to in progress.
      onStart={() => { flying.current = false; }}
    />
  );
}

// ── Multi-view renderer ─────────────────────────────────────────────────────

function fixedCamera(fov: number, pos: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]) {
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.02, 20);
  cam.up.set(...up);
  cam.position.set(...pos);
  cam.lookAt(...target);
  cam.layers.enable(ROOF_LAYER);
  return cam;
}

/**
 * Takes over rendering (priority 1) and draws each view into its scissor
 * rectangle. The shadow map is refreshed once per frame, not once per view.
 */
function MultiViewRenderer({ sim, layout }: { sim: ClawSim; layout: ViewLayout }) {
  const gl = useThree((s) => s.gl);
  const cams = useMemo(() => {
    // Top-down with screen-up = away from the player, matching the joystick.
    const top = fixedCamera(30, [0, 2.0, 0], [0, 0, 0], [0, 0, -1]);
    top.layers.disable(ROOF_LAYER);
    const claw = fixedCamera(60, [0, 1, 0.3], [0, 0, 0]);
    claw.layers.disable(ROOF_LAYER);
    const cameras: Record<Exclude<ViewSlot, 'main'>, THREE.PerspectiveCamera> = {
      side: fixedCamera(46, [1.3, 0.5, 0.03], [0, 0.47, 0.03]),
      top,
      claw,
    };
    return cameras;
  }, []);
  const look = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const prev = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    return () => { gl.shadowMap.autoUpdate = prev; };
  }, [gl]);

  useFrame(({ scene, camera, size }) => {
    const rects = layoutViews(layout, size.width, size.height);

    // Claw cam: rides with the trolley, looking down past the claw at the
    // spot it will land on, from slightly in front so the claw stays in view.
    const c = sim.claw;
    const ground = Math.max(0, surfaceHeightAt(sim, c.hx, c.hz));
    cams.claw.position.set(c.x, Math.min(RAIL_Y - 0.04, c.y + 0.32), c.z + 0.26);
    cams.claw.lookAt(look.set(c.hx, (ground + c.y) / 2 - 0.05, c.hz));

    const main = camera as THREE.PerspectiveCamera;
    if (main.position.y < ROOF_CUTAWAY_Y) main.layers.enable(ROOF_LAYER);
    else main.layers.disable(ROOF_LAYER);

    gl.shadowMap.needsUpdate = true;
    gl.setScissorTest(true);
    for (const r of rects) {
      const cam = r.slot === 'main' ? main : cams[r.slot];
      const aspect = r.w / r.h;
      // Portrait cells need a wider lens to fit the whole cabinet.
      const fov = r.slot === 'main' ? (aspect < 1 ? 62 : 45) : cam.fov;
      if (Math.abs(cam.aspect - aspect) > 1e-3 || cam.fov !== fov) {
        cam.aspect = aspect;
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      const y = size.height - r.y - r.h; // GL origin is bottom-left
      gl.setViewport(r.x, y, r.w, r.h);
      gl.setScissor(r.x, y, r.w, r.h);
      gl.render(scene, cam);
    }
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
  }, 1);

  return null;
}

// ── Aiming marker ────────────────────────────────────────────────────────────

/**
 * Landing-spot marker: a ring on whatever is directly under the claw plus a
 * faint plumb line. Green when a plush is underneath. Drawn over everything
 * (depthTest off) so it shows through plushies and the claw in every view.
 */
function AimMarker({ sim, enabled }: { sim: ClawSim; enabled: boolean }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const line = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const c = sim.claw;
    const show = enabled && (sim.phase === 'moving' || sim.phase === 'dropping');
    g.visible = show;
    if (!show) return;
    const surface = surfaceHeightAt(sim, c.hx, c.hz);
    const overPrize = surface > 0.001;
    const y = Math.max(surface, 0) + 0.004;
    g.position.set(c.hx, y, c.hz);
    ring.current?.color.set(overPrize ? '#4ade80' : '#e2e8f0');
    if (line.current) {
      const tipY = c.y - prongGeometry(c.open, sim.clawSpec).dy;
      const len = Math.max(0.001, tipY - y);
      line.current.position.set(0, len / 2, 0);
      line.current.scale.set(1, len, 1);
    }
  });
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}>
        <ringGeometry args={[0.03, 0.04, 40]} />
        <meshBasicMaterial ref={ring} color="#4ade80" transparent opacity={0.9} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}>
        <circleGeometry args={[0.006, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={line} renderOrder={19}>
        <cylinderGeometry args={[0.0015, 0.0015, 1, 6]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Moving parts + simulation driver ─────────────────────────────────────────

// ── Height guide (like TK08's 查看高度) ─────────────────────────────────────

const GUIDE_COLOR: Partial<Record<SettingKey, string>> = {
  dropLine: '#f43f5e', dropSpeed: '#f43f5e', midPoint: '#0ea5e9', homeDrop: '#10b981',
};

/**
 * While the operator adjusts a length item, a translucent plane across the
 * cabinet marks the claw-tip height it works out to: where the 下線長度 runs
 * out, where the lift turns to 中壓, or where 回停下降 parks the claw.
 */
function HeightGuide({ sim, guideKey }: { sim: ClawSim; guideKey: SettingKey | null }) {
  const plane = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, D)), []);
  const frame = useRef<THREE.LineSegments>(null);
  useFrame(() => {
    const color = guideKey ? GUIDE_COLOR[guideKey] : undefined;
    const show = !!color;
    if (plane.current) plane.current.visible = show;
    if (frame.current) frame.current.visible = show;
    if (!show || !plane.current || !frame.current) return;
    const s = sim.settings;
    const spec = sim.clawSpec;
    let tipY: number;
    if (guideKey === 'midPoint') tipY = CLAW_TOP - midLineLength(s) - prongGeometry(0, spec).dy;
    else if (guideKey === 'homeDrop') tipY = CLAW_TOP - homeLineLength(s) - prongGeometry(idleOpenness(s), spec).dy;
    else tipY = dropLimitHubY(s, spec) - prongGeometry(1, spec).dy;
    const y = Math.max(0.003, tipY);
    plane.current.position.y = y;
    frame.current.position.y = y;
    mat.current?.color.set(color);
    edge.current?.color.set(color);
  });
  return (
    <group position={[(BOX.minX + BOX.maxX) / 2, 0, (BOX.minZ + BOX.maxZ) / 2]}>
      {/* Drawn through the prizes: the level usually sits inside the pile. */}
      <mesh ref={plane} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21} visible={false}>
        <planeGeometry args={[W, D]} />
        <meshBasicMaterial ref={mat} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
      </mesh>
      <lineSegments ref={frame} geometry={edges} rotation={[-Math.PI / 2, 0, 0]} renderOrder={22} visible={false}>
        <lineBasicMaterial ref={edge} depthTest={false} />
      </lineSegments>
    </group>
  );
}

function Machine({ sim, joyRef, paused, clawKey }: Pick<SceneProps, 'sim' | 'joyRef' | 'paused' | 'clawKey'>) {
  const bridge = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  const claw = useRef<THREE.Group>(null);
  const plunger = useRef<THREE.Group>(null);
  const pivots = useRef<(THREE.Group | null)[]>([]);
  const plush = useRef(new Map<number, THREE.Group>());
  const cableTop = useMemo(() => new THREE.Vector3(), []);
  const cableDir = useMemo(() => new THREE.Vector3(), []);
  // Prize set is rebuilt on restock; key the list on the array identity.
  const prizes = sim.prizes;
  const registerPivot = useMemo(
    () => (i: number, g: THREE.Group | null) => { pivots.current[i] = g; },
    [],
  );
  const register = useMemo(
    () => (id: number, g: THREE.Group | null) => {
      if (g) plush.current.set(id, g); else plush.current.delete(id);
    },
    [],
  );

  useFrame((_, dt) => {
    if (!paused) stepSim(sim, dt, joyRef.current ?? { x: 0, z: 0 });
    // Paused in service mode: show a 待機爪子 change on the waiting claw straight away.
    else if (sim.phase === 'idle' || sim.phase === 'moving') jogArms(sim, idleOpenness(sim.settings) === 1, dt);
    const c = sim.claw;
    bridge.current?.position.set(c.x, RAIL_Y, 0);
    trolley.current?.position.set(c.x, RAIL_Y - 0.02, c.z);
    if (cable.current) {
      // Cable runs from the trolley anchor to the swinging claw's top eye.
      cableTop.set(c.x, CABLE_ANCHOR_Y, c.z);
      cableDir.set(c.hx, c.y + clawHeadTop(sim.clawSpec), c.hz).sub(cableTop).negate();
      const len = Math.max(0.01, cableDir.length());
      cable.current.position.copy(cableTop).addScaledVector(cableDir, -0.5);
      cable.current.quaternion.setFromUnitVectors(UP, cableDir.normalize());
      cable.current.scale.set(1, len, 1);
    }
    if (claw.current) {
      claw.current.position.set(c.hx, c.y, c.hz);
      // Hang along the cable: the bottom swings toward +x/+z with the pendulum.
      claw.current.rotation.set(-c.swingZ, 0, c.swingX);
    }
    const { angle } = prongGeometry(c.open, sim.clawSpec);
    for (const p of pivots.current) if (p) p.rotation.z = angle;
    plunger.current?.position.set(0, -(1 - c.open) * 0.014, 0);
    for (const p of sim.prizes) {
      const g = plush.current.get(p.id);
      if (!g) continue;
      g.visible = !p.won;
      g.position.set(p.x, p.y, p.z);
      g.quaternion.set(p.qx, p.qy, p.qz, p.qw);
    }
  });

  return (
    <group>
      {/* Fixed x-rails at the back and front */}
      {[BOX.minZ + 0.02, BOX.maxZ - 0.02].map((z) => (
        <mesh key={z} position={[0, RAIL_Y, z]}>
          <boxGeometry args={[W, 0.018, 0.02]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {/* Bridge riding the x-rails, trolley riding the bridge */}
      <group ref={bridge}>
        <mesh>
          <boxGeometry args={[0.04, 0.025, D]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.22} />
        </mesh>
      </group>
      <group ref={trolley}>
        <mesh>
          <boxGeometry args={[0.08, 0.04, 0.08]} />
          <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.041]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.006, 16]} />
          <meshStandardMaterial color="#b45309" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      <mesh ref={cable}>
        <cylinderGeometry args={[0.0022, 0.0022, 1, 6]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <ClawHead key={clawKey} spec={sim.clawSpec} groupRef={claw} plungerRef={plunger} registerPivot={registerPivot} />
      {prizes.map((p) => <PrizeMesh key={p.id} prize={p} register={register} />)}
    </group>
  );
}

export default function ClawScene({
  sim, joyRef, paused, view, viewNonce, layout, aimAssist, clawKey, chute, guideKey, restockKey,
}: SceneProps & { restockKey: number }) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: VIEWS.front.pos, fov: 45, near: 0.05, far: 20 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <color attach="background" args={['#170d26']} />
      <fog attach="fog" args={['#170d26', 3.5, 8]} />
      {/* Local studio env (no HDR download) so chrome and glass have something to reflect */}
      <Environment resolution={64} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={3} position={[0, 3, 1]} scale={[4, 1, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={2} color="#ffd6ec" position={[-3, 1, 2]} scale={[2, 3, 1]} rotation-y={Math.PI / 3} />
        <Lightformer form="rect" intensity={1.5} color="#bae6fd" position={[3, 1, -1]} scale={[2, 3, 1]} rotation-y={-Math.PI / 3} />
      </Environment>
      <hemisphereLight args={['#f5e1ff', '#1e1b4b', 0.6]} />
      {/* Ceiling light straight overhead, like the machine's own: the claw's
          shadow lands exactly where it will drop, the depth cue players use. */}
      <directionalLight
        position={[0, 3, 0.001]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.6}
        shadow-camera-right={0.6}
        shadow-camera-top={0.6}
        shadow-camera-bottom={-0.6}
        shadow-camera-near={1.5}
        shadow-camera-far={3.5}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, BOX.height - 0.08, 0.15]} intensity={0.8} distance={1.8} color="#fff1f8" />
      <spotLight position={[0.8, 1.6, 1.8]} angle={0.45} penumbra={0.6} intensity={6} color="#ffffff" />
      <CameraRig view={view} viewNonce={viewNonce} />
      <MultiViewRenderer sim={sim} layout={layout} />
      <CabinetShell chute={chute} />
      <Machine key={restockKey} sim={sim} joyRef={joyRef} paused={paused} clawKey={clawKey} />
      <AimMarker sim={sim} enabled={aimAssist} />
      <HeightGuide sim={sim} guideKey={guideKey} />
    </Canvas>
  );
}
