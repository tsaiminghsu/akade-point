import { describe, it, expect } from 'vitest';
import {
  createOrbitCam,
  stepOrbitCamera,
  shortestArc,
  wrapPi,
  PITCH_MAX,
  PITCH_MIN,
  ZOOM_DIST,
  MIN_DIST,
  RECENTER_DELAY_MS,
  OrbitCamContext,
  CamMode,
} from '../orbitCamera';

const NO_LOOK = { dx: 0, dy: 0 };
const never = () => false;

function ctx(mode: CamMode, vehicleAngle = 0, isBlocked = never): OrbitCamContext {
  return {
    mode,
    vehicleAngle,
    player: { x: 1600, y: 1600 },
    focusAlt: 0,
    isBlocked,
  };
}

/** Run enough frames to cover `seconds` of simulated time. */
function advance(cam: ReturnType<typeof createOrbitCam>, seconds: number, c: OrbitCamContext, startMs: number) {
  const dt = 1 / 60;
  let now = startMs;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    now += dt * 1000;
    stepOrbitCamera(cam, dt, now, NO_LOOK, 0, c);
  }
  return now;
}

describe('angle helpers', () => {
  it('wraps into [-PI, PI)', () => {
    expect(wrapPi(0)).toBeCloseTo(0);
    expect(wrapPi(Math.PI * 2)).toBeCloseTo(0);
    // The range is half-open, so exactly PI normalises to -PI. Both name the
    // same heading; what matters is that it is deterministic.
    expect(Math.abs(wrapPi(Math.PI * 3))).toBeCloseTo(Math.PI);
    expect(Math.abs(wrapPi(-Math.PI * 3))).toBeCloseTo(Math.PI);
    expect(wrapPi(Math.PI * 0.75)).toBeCloseTo(Math.PI * 0.75);
    expect(wrapPi(Math.PI * 1.5)).toBeCloseTo(-Math.PI * 0.5);
  });

  it('takes the short way round', () => {
    // 350deg -> 10deg is +20deg, not -340deg.
    const a = (350 * Math.PI) / 180;
    const b = (10 * Math.PI) / 180;
    expect(shortestArc(a, b)).toBeCloseTo((20 * Math.PI) / 180, 5);
    expect(shortestArc(b, a)).toBeCloseTo((-20 * Math.PI) / 180, 5);
  });
});

describe('look input', () => {
  it('turns yaw with horizontal movement and clamps pitch', () => {
    const cam = createOrbitCam();
    const before = cam.yaw;
    stepOrbitCamera(cam, 1 / 60, 1000, { dx: 100, dy: 0 }, 0, ctx('foot'));
    expect(cam.yaw).toBeGreaterThan(before);

    // Slam pitch past both limits.
    stepOrbitCamera(cam, 1 / 60, 1016, { dx: 0, dy: 100000 }, 0, ctx('foot'));
    expect(cam.pitch).toBeCloseTo(PITCH_MAX, 5);
    stepOrbitCamera(cam, 1 / 60, 1032, { dx: 0, dy: -100000 }, 0, ctx('foot'));
    expect(cam.pitch).toBeCloseTo(PITCH_MIN, 5);
  });

  it('clamps zoom to the three configured steps', () => {
    const cam = createOrbitCam();
    stepOrbitCamera(cam, 1 / 60, 1000, NO_LOOK, -10, ctx('vehicle'));
    expect(cam.zoomIdx).toBe(0);
    stepOrbitCamera(cam, 1 / 60, 1016, NO_LOOK, 10, ctx('vehicle'));
    expect(cam.zoomIdx).toBe(2);
  });
});

describe('auto-recentre', () => {
  it('swings back behind the vehicle after the idle delay', () => {
    const cam = createOrbitCam();
    const target = 0;
    // Look well away from the car's heading.
    stepOrbitCamera(cam, 1 / 60, 1000, { dx: 400, dy: 0 }, 0, ctx('vehicle', target));
    const strayed = Math.abs(shortestArc(cam.yaw, target));
    expect(strayed).toBeGreaterThan(0.5);

    // Nothing happens until the delay elapses.
    let now = 1000 + RECENTER_DELAY_MS - 200;
    stepOrbitCamera(cam, 1 / 60, now, NO_LOOK, 0, ctx('vehicle', target));
    expect(Math.abs(shortestArc(cam.yaw, target))).toBeCloseTo(strayed, 3);

    now = advance(cam, 3, ctx('vehicle', target), now);
    expect(Math.abs(shortestArc(cam.yaw, target))).toBeLessThan(0.05);
  });

  it('never recentres on foot', () => {
    const cam = createOrbitCam();
    stepOrbitCamera(cam, 1 / 60, 1000, { dx: 400, dy: 0 }, 0, ctx('foot', 0));
    const strayed = cam.yaw;
    advance(cam, 5, ctx('foot', 0), 1000);
    expect(cam.yaw).toBeCloseTo(strayed, 5);
  });
});

describe('occlusion', () => {
  it('pulls the boom in when a wall is behind the player', () => {
    const cam = createOrbitCam();
    const open = ctx('vehicle');
    advance(cam, 1, open, 1000);
    expect(cam.dist).toBeCloseTo(ZOOM_DIST.vehicle[1], 1);

    // Everything behind the focus is solid.
    const walled = ctx('vehicle', 0, () => true);
    stepOrbitCamera(cam, 1 / 60, 5000, NO_LOOK, 0, walled);
    expect(cam.dist).toBeCloseTo(MIN_DIST, 5);
  });

  it('snaps in immediately but eases back out', () => {
    const cam = createOrbitCam();
    advance(cam, 1, ctx('vehicle'), 1000);
    const wide = cam.dist;

    stepOrbitCamera(cam, 1 / 60, 5000, NO_LOOK, 0, ctx('vehicle', 0, () => true));
    expect(cam.dist).toBeLessThan(wide);

    // One clear frame must not restore the full distance.
    stepOrbitCamera(cam, 1 / 60, 5016, NO_LOOK, 0, ctx('vehicle'));
    expect(cam.dist).toBeLessThan(wide);
    expect(cam.dist).toBeGreaterThan(MIN_DIST);
  });

  it('treats out-of-bounds as open sky, not as a wall', () => {
    // isBlocked is the engine's cameraBlocked, which reports false off-grid;
    // this test documents that stepOrbitCamera does not add its own clamping.
    const cam = createOrbitCam();
    const edge: OrbitCamContext = { ...ctx('vehicle'), player: { x: 5, y: 5 } };
    advance(cam, 1, edge, 1000);
    expect(cam.dist).toBeCloseTo(ZOOM_DIST.vehicle[1], 1);
  });
});
