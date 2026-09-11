import { OrbitCamState } from './types';

/**
 * GTA-style third-person orbit camera.
 *
 * Pure state + step function: the engine owns an `OrbitCamState`, calls
 * `stepOrbitCamera` once per tick, and `GameScene` reads the result to place
 * the three.js camera. Nothing here touches the DOM or three.js.
 *
 * Angle convention matches the rest of the sim: yaw 0 = North, clockwise
 * positive, forward = (sin yaw, -cos yaw) in 2D world px. The camera sits at
 * `focus + (-sin yaw * hd, height, cos yaw * hd)` in three.js units, which is
 * directly behind the focus when yaw equals the vehicle's angle.
 */

export type CamMode = 'foot' | 'vehicle' | 'air';

// Look sensitivity, radians per pixel of mouse movement.
export const MOUSE_SENS_X = 0.0022;
export const MOUSE_SENS_Y = 0.0018;

// Pitch is measured above the horizon: 0 = level, positive = looking down at
// the player from above.
export const PITCH_MIN = -0.15;
export const PITCH_MAX = 1.25;
export const PITCH_DEFAULT_FOOT = 0.42;
export const PITCH_DEFAULT_VEH = 0.38;

/** Boom length per zoom step. Index 1 reproduces the old fixed camera feel. */
export const ZOOM_DIST: Record<CamMode, [number, number, number]> = {
  foot:    [5, 8.5, 12],
  vehicle: [9, 14, 20],
  air:     [12, 18, 26],
};

/** Vehicles recentre behind the car after this long without look input. */
export const RECENTER_DELAY_MS = 1500;
export const RECENTER_RATE = 3;

/** Never let building occlusion push the camera closer than this. */
export const MIN_DIST = 1.6;
export const COLLISION_STEPS = 10;
export const COLLISION_MARGIN = 0.5;

/** The camera aims this far above the focus point. */
export const LOOK_TARGET_Y = 1.4;

/** three.js units -> 2D world px. */
const PX_PER_3D = 10;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap an angle into [-PI, PI). Exactly PI normalises to -PI. */
export function wrapPi(a: number): number {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/** Signed shortest angular distance from `a` to `b`, in [-PI, PI). */
export function shortestArc(a: number, b: number): number {
  return wrapPi(b - a);
}

export function createOrbitCam(): OrbitCamState {
  return {
    yaw: 0,
    pitch: PITCH_DEFAULT_VEH,
    zoomIdx: 1,
    dist: ZOOM_DIST.vehicle[1],
    lastLookMs: 0,
    focusAlt: 0,
  };
}

export interface OrbitCamContext {
  mode: CamMode;
  /** Heading the camera recentres to in vehicle/air modes. */
  vehicleAngle: number;
  /** Focus point in 2D world px. */
  player: { x: number; y: number };
  /** Focus altitude in three.js units. */
  focusAlt: number;
  /**
   * True when the given world point is inside solid geometry at that altitude.
   * Out-of-bounds must report false, or the camera collapses at the map edge.
   */
  isBlocked: (wx: number, wy: number, alt: number) => boolean;
}

/**
 * Advance the camera one tick. Mutates `cam` in place (no allocation).
 *
 * `look` is the accumulated mouse/touch delta in pixels since the last call;
 * `wheelSteps` is the accumulated discrete zoom notches.
 */
export function stepOrbitCamera(
  cam: OrbitCamState,
  dt: number,
  nowMs: number,
  look: { dx: number; dy: number },
  wheelSteps: number,
  ctx: OrbitCamContext,
): void {
  // ── Look input ──────────────────────────────────────────────────────────
  if (look.dx !== 0 || look.dy !== 0) {
    cam.yaw += look.dx * MOUSE_SENS_X;
    cam.pitch = clamp(cam.pitch + look.dy * MOUSE_SENS_Y, PITCH_MIN, PITCH_MAX);
    cam.lastLookMs = nowMs;
  }

  if (wheelSteps !== 0) {
    cam.zoomIdx = clamp(cam.zoomIdx + wheelSteps, 0, 2) as 0 | 1 | 2;
  }

  // ── Auto-recentre (vehicles and aircraft only; never on foot) ───────────
  if (ctx.mode !== 'foot' && nowMs - cam.lastLookMs > RECENTER_DELAY_MS) {
    const k = 1 - Math.exp(-RECENTER_RATE * dt);
    cam.yaw += shortestArc(cam.yaw, ctx.vehicleAngle) * k;
    cam.pitch += (PITCH_DEFAULT_VEH - cam.pitch) * k;
  }

  cam.yaw = wrapPi(cam.yaw);
  cam.focusAlt = ctx.focusAlt;

  // ── Occlusion: march from the focus out to the ideal boom position ──────
  const target = ZOOM_DIST[ctx.mode][cam.zoomIdx];
  const hd = target * Math.cos(cam.pitch);
  const vd = target * Math.sin(cam.pitch);

  // Horizontal boom offset converted from three.js units to world px.
  const hx = -Math.sin(cam.yaw) * hd * PX_PER_3D;
  const hy = Math.cos(cam.yaw) * hd * PX_PER_3D;

  const alt0 = (ctx.focusAlt + LOOK_TARGET_Y) * PX_PER_3D;
  const alt1 = alt0 + vd * PX_PER_3D;

  let allowed = target;
  for (let i = 1; i <= COLLISION_STEPS; i++) {
    const t = i / COLLISION_STEPS;
    if (ctx.isBlocked(ctx.player.x + hx * t, ctx.player.y + hy * t, alt0 + (alt1 - alt0) * t)) {
      allowed = Math.max(MIN_DIST, (target * (i - 1)) / COLLISION_STEPS - COLLISION_MARGIN);
      break;
    }
  }

  // Snap in instantly so the camera never clips through a wall, but ease back
  // out so it does not pop when clearing the corner.
  cam.dist = allowed < cam.dist
    ? allowed
    : cam.dist + (allowed - cam.dist) * (1 - Math.exp(-4 * dt));
}
