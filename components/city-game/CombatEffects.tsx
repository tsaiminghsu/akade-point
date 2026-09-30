'use client';
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TILE_3D, TILE_SIZE, toX3D, toZ3D } from './types';
import { CombatSystem, SHELL_ALT } from './combat';
import type { SpikeStrip } from './roadblocks';

/**
 * Shells, explosions, gunfire tracers and spike strips.
 *
 * Everything here is a fixed pool written imperatively from the frame loop —
 * the combat system can spawn a dozen effects in a second and none of that may
 * reach React state.
 */

const PX_TO_3D = TILE_3D / TILE_SIZE;

const SHELL_SLOTS = 12;
const BLAST_SLOTS = 16;
const TRACER_SLOTS = 24;
const STRIP_SLOTS = 3;

const upAxis = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

export interface CombatEffectsHandle {
  sync(combat: CombatSystem, strips: SpikeStrip[]): void;
}

const CombatEffectsImpl = forwardRef<CombatEffectsHandle>((_, ref) => {
  const shells = useRef<Array<THREE.Mesh | null>>(Array(SHELL_SLOTS).fill(null));
  const fire = useRef<Array<THREE.Mesh | null>>(Array(BLAST_SLOTS).fill(null));
  const smoke = useRef<Array<THREE.Mesh | null>>(Array(BLAST_SLOTS).fill(null));
  const tracers = useRef<Array<THREE.Mesh | null>>(Array(TRACER_SLOTS).fill(null));
  const strips = useRef<Array<THREE.Group | null>>(Array(STRIP_SLOTS).fill(null));

  // Per-slot materials so each blast can fade on its own schedule.
  const fireMats = useMemo(() => Array.from({ length: BLAST_SLOTS }, () => new THREE.MeshBasicMaterial({
    color: '#ffb347', transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
  })), []);
  const smokeMats = useMemo(() => Array.from({ length: BLAST_SLOTS }, () => new THREE.MeshStandardMaterial({
    color: '#2b2b2b', transparent: true, depthWrite: false, roughness: 1,
  })), []);
  const tracerMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#fff1a8', transparent: true, opacity: 0.9, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), []);

  useImperativeHandle(ref, () => ({
    sync(combat, spikeStrips) {
      // Shells
      for (let i = 0; i < SHELL_SLOTS; i++) {
        const m = shells.current[i];
        if (!m) continue;
        const s = combat.shells[i];
        m.visible = !!s;
        if (s) m.position.set(toX3D(s.x), SHELL_ALT * PX_TO_3D, toZ3D(s.y));
      }

      // Explosions: a fireball that swells and fades, and slower smoke. No
      // point light: a permanent extra light costs every lit pixel in the
      // scene every frame, even with no explosion on screen.
      for (let i = 0; i < BLAST_SLOTS; i++) {
        const f = fire.current[i];
        const sm = smoke.current[i];
        const e = combat.explosions[i];
        if (!f || !sm) continue;
        if (!e) {
          f.visible = false;
          sm.visible = false;
          continue;
        }
        const k = e.t / e.life;              // 0 → 1
        const r = e.radius * PX_TO_3D;
        const grow = 0.35 + 0.65 * Math.sqrt(k);
        f.visible = true;
        f.position.set(toX3D(e.x), r * 0.35 * grow, toZ3D(e.y));
        f.scale.setScalar(r * grow);
        fireMats[i].opacity = Math.max(0, 1 - k * 1.3);
        fireMats[i].color.setRGB(1, 0.75 - k * 0.45, 0.35 - k * 0.3);

        sm.visible = e.radius > 20;
        sm.position.set(toX3D(e.x), r * (0.4 + k * 0.9), toZ3D(e.y));
        sm.scale.setScalar(r * (0.5 + k * 0.7));
        smokeMats[i].opacity = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.1));
      }

      // Tracers: thin streaks from the gun to the impact point.
      for (let i = 0; i < TRACER_SLOTS; i++) {
        const m = tracers.current[i];
        if (!m) continue;
        const t = combat.tracers[combat.tracers.length - 1 - i];
        if (!t) { m.visible = false; continue; }
        const x0 = toX3D(t.x0), y0 = t.alt0 * PX_TO_3D, z0 = toZ3D(t.y0);
        const x1 = toX3D(t.x1), z1 = toZ3D(t.y1);
        tmpDir.set(x1 - x0, 0.1 - y0, z1 - z0);
        const len = tmpDir.length();
        tmpDir.normalize();
        m.visible = true;
        m.position.set((x0 + x1) / 2, (y0 + 0.1) / 2, (z0 + z1) / 2);
        m.quaternion.setFromUnitVectors(upAxis, tmpDir);
        m.scale.set(1, len, 1);
      }

      // Spike strips lie across the road.
      for (let i = 0; i < STRIP_SLOTS; i++) {
        const g = strips.current[i];
        if (!g) continue;
        const s = spikeStrips[i];
        g.visible = !!s;
        if (!s) continue;
        g.position.set(toX3D(s.x), 0.04, toZ3D(s.y));
        g.rotation.y = s.axis === 'v' ? 0 : Math.PI / 2;
      }
    },
  }));

  return (
    <>
      {Array.from({ length: SHELL_SLOTS }, (_, i) => (
        <mesh key={`sh${i}`} ref={el => { shells.current[i] = el; }} visible={false}>
          <sphereGeometry args={[0.18, 8, 6]} />
          <meshBasicMaterial color="#ffcf6b" toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: BLAST_SLOTS }, (_, i) => (
        <group key={`bl${i}`}>
          <mesh ref={el => { fire.current[i] = el; }} visible={false} material={fireMats[i]}>
            <sphereGeometry args={[1, 16, 12]} />
          </mesh>
          <mesh ref={el => { smoke.current[i] = el; }} visible={false} material={smokeMats[i]}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: TRACER_SLOTS }, (_, i) => (
        <mesh key={`tr${i}`} ref={el => { tracers.current[i] = el; }} visible={false} material={tracerMat}>
          <cylinderGeometry args={[0.035, 0.035, 1, 4, 1, true]} />
        </mesh>
      ))}
      {Array.from({ length: STRIP_SLOTS }, (_, i) => (
        <group key={`sp${i}`} ref={el => { strips.current[i] = el; }} visible={false}>
          {/* Strip runs along x in local space, i.e. across a north-south road. */}
          <mesh>
            <boxGeometry args={[4, 0.06, 0.35]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.8} metalness={0.4} />
          </mesh>
          {Array.from({ length: 9 }, (_, k) => (
            <mesh key={k} position={[-1.8 + k * 0.45, 0.12, 0]}>
              <coneGeometry args={[0.06, 0.2, 4]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
});
CombatEffectsImpl.displayName = 'CombatEffects';
// No props: memo keeps the HUD's 10Hz re-renders from reconciling every pooled mesh.
export const CombatEffects = memo(CombatEffectsImpl);
