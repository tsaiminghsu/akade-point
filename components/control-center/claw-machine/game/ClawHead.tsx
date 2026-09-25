'use client';
// Claw head drawn from a ClawSpec (claws.ts): a solenoid in a tube housing
// (砲管) on a claw base (爪座), a plunger underneath, and 2–4 curved steel arms
// with rubber claw sleeves (爪套). The two-prong box claw gets flat grip pads.
//
// Geometry is anchored to clawSim.ts: the group origin is the sim's hub
// (claw.y), each arm pivots at spec.pivotR, and its hinge angle comes from
// prongGeometry(open, spec).angle, so the drawn tips sit where the sim's are.

import { useMemo } from 'react';
import * as THREE from 'three';
import { armProfile, type ClawSpec } from './claws';

/** Height of the housing top above the hub, where the cable attaches. */
export function clawHeadTop(spec: ClawSpec) {
  return 0.125 * spec.headScale;
}

/** Arm through the shared profile (the physics collider uses the same points): hangs along -y, bows out, then hooks in (彎爪) or runs nearly straight (直爪). */
function armCurve(spec: ClawSpec) {
  return new THREE.CatmullRomCurve3(armProfile(spec).map(([x, y]) => new THREE.Vector3(x, y, 0)));
}

interface Props {
  spec: ClawSpec;
  groupRef: React.Ref<THREE.Group>;
  plungerRef: React.Ref<THREE.Group>;
  registerPivot: (i: number, g: THREE.Group | null) => void;
}

export default function ClawHead({ spec, groupRef, plungerRef, registerPivot }: Props) {
  const { arm, sleeve, knuckle } = useMemo(() => {
    const curve = armCurve(spec);
    const lower = new THREE.CatmullRomCurve3(curve.getPoints(40).slice(22));
    return {
      arm: new THREE.TubeGeometry(curve, 36, spec.armRadius, 10, false),
      sleeve: new THREE.TubeGeometry(lower, 20, spec.sleeveRadius, 12, false),
      knuckle: curve.getPoint(0.42),
    };
  }, [spec]);

  const s = spec.headScale;
  const metal = <meshStandardMaterial color={spec.metal} metalness={1} roughness={0.18} />;
  const dark = <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />;

  return (
    <group ref={groupRef}>
      {/* Tube housing with the solenoid coil band */}
      <mesh castShadow position={[0, 0.064 * s, 0]}>
        <cylinderGeometry args={[0.03 * s, 0.032 * s, 0.09 * s, 24]} />{metal}
      </mesh>
      <mesh position={[0, 0.07 * s, 0]}>
        <cylinderGeometry args={[0.0335 * s, 0.0335 * s, 0.032 * s, 24]} />
        <meshStandardMaterial color={spec.coil} metalness={0.8} roughness={0.35} />
      </mesh>
      {/* Reinforcing rings top and bottom of the coil */}
      {[0.05, 0.09].map((y) => (
        <mesh key={y} position={[0, y * s, 0]}>
          <torusGeometry args={[0.0335 * s, 0.0025 * s, 8, 24]} />{dark}
        </mesh>
      ))}
      {/* Top cap + cable eye */}
      <mesh castShadow position={[0, 0.113 * s, 0]}>
        <cylinderGeometry args={[0.018 * s, 0.028 * s, 0.014 * s, 20]} />{dark}
      </mesh>
      <mesh position={[0, clawHeadTop(spec) - 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.006 * s, 0.0022 * s, 6, 12]} />{metal}
      </mesh>
      {/* Claw base (爪座) */}
      <mesh castShadow position={[0, 0.012 * s, 0]}>
        <cylinderGeometry args={[spec.hubR * 1.4, spec.hubR * 1.3, 0.018 * s, 28]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.95} roughness={0.25} />
      </mesh>
      {/* Plunger: drops a little as the solenoid pulls the arms shut */}
      <group ref={plungerRef}>
        <mesh position={[0, -0.012, 0]}>
          <cylinderGeometry args={[0.009 * s, 0.009 * s, 0.03, 12]} />{metal}
        </mesh>
        <mesh position={[0, -0.028, 0]}>
          <cylinderGeometry args={[0.018 * s, 0.013 * s, 0.009, 16]} />{dark}
        </mesh>
      </group>
      {Array.from({ length: spec.prongs }, (_, i) => {
        // Same angles as prongTips() in clawSim.ts: world direction (cos a, sin a) in xz.
        const a = (i * Math.PI * 2) / spec.prongs + Math.PI / 2;
        return (
          <group key={i} rotation={[0, -a, 0]}>
            {/* Hinge bracket bolted under the base */}
            <mesh position={[spec.pivotR + 0.004, 0.002, 0]} castShadow>
              <boxGeometry args={[0.02, 0.016, spec.armRadius * 2.6]} />
              <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.3} />
            </mesh>
            <group position={[spec.pivotR, 0, 0]} ref={(g) => registerPivot(i, g)}>
              <mesh geometry={arm} castShadow>{metal}</mesh>
              {/* Knuckle collar halfway down the arm */}
              <mesh position={knuckle} castShadow>
                <sphereGeometry args={[spec.armRadius * 1.45, 12, 10]} />{dark}
              </mesh>
              <mesh geometry={sleeve} castShadow>
                <meshStandardMaterial color={spec.sleeve} roughness={0.75} />
              </mesh>
              {spec.prongs === 2 && (
                // Box claw: wide rubber pad facing inward at the tip.
                <mesh position={[-0.012 * (spec.prongLen / 0.13), -spec.prongLen * 0.91, 0]} castShadow>
                  <boxGeometry args={[0.008, 0.045 * (spec.prongLen / 0.13), 0.06 * Math.sqrt(spec.prongLen / 0.13)]} />
                  <meshStandardMaterial color={spec.sleeve} roughness={0.8} />
                </mesh>
              )}
              {/* Hinge pin */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[spec.armRadius * 0.6, spec.armRadius * 0.6, spec.armRadius * 3, 8]} />{metal}
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}
