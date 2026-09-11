import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine3D } from '../engine3d';
import { isWalkable } from '../worldGen';

/**
 * On-foot movement is camera-relative: the stick direction is interpreted in
 * camera space and the character turns to face it. These tests pin the axis
 * conventions (angle 0 = North, forward = (sin a, -cos a)) because getting them
 * subtly wrong produces movement that only looks wrong when the camera turns.
 */

function stepOnFoot(engine: GameEngine3D, frames: number, startMs = 1000) {
  const dt = 1 / 60;
  let now = startMs;
  for (let i = 0; i < frames; i++) {
    now += dt * 1000;
    engine.update(dt, now);
  }
  return now;
}

/** Drop the player somewhere walkable so building collision cannot interfere. */
function placeOnOpenGround(engine: GameEngine3D) {
  const grid = engine.world.grid;
  for (const t of engine.world.sidewalkTiles) {
    const clear = isWalkable(grid, t.x, t.y)
      && isWalkable(grid, t.x + 30, t.y)
      && isWalkable(grid, t.x - 30, t.y)
      && isWalkable(grid, t.x, t.y + 30)
      && isWalkable(grid, t.x, t.y - 30);
    if (clear) {
      engine.player.x = t.x;
      engine.player.y = t.y;
      return;
    }
  }
  throw new Error('no open sidewalk found in the generated world');
}

let engine: GameEngine3D;

beforeEach(() => {
  engine = new GameEngine3D();
  engine.player.state = 'onFoot';
  engine.player.currentVehicleId = null;
  engine.player.z = 0;
  engine.player.jumpVel = 0;
  engine.player.action = null;
  // Keep the crowd out of the way — pedestrians push the player around.
  engine.pedestrians.clear();
  engine.perf.maxPeds = 0;
  placeOnOpenGround(engine);
});

describe('camera-relative movement', () => {
  it('walks north when the camera faces north and the stick goes forward', () => {
    engine.orbitCam.yaw = 0;
    const y0 = engine.player.y;
    const x0 = engine.player.x;
    engine.input.setVirtualMove(0, -1);   // joystick up = forward
    stepOnFoot(engine, 30);

    // North is -y in world space.
    expect(engine.player.y).toBeLessThan(y0 - 5);
    expect(Math.abs(engine.player.x - x0)).toBeLessThan(2);
  });

  it('strafes east when the stick goes right', () => {
    engine.orbitCam.yaw = 0;
    const x0 = engine.player.x;
    engine.input.setVirtualMove(1, 0);
    stepOnFoot(engine, 30);
    expect(engine.player.x).toBeGreaterThan(x0 + 5);
  });

  it('follows the camera: forward means east once the camera faces east', () => {
    engine.orbitCam.yaw = Math.PI / 2;    // looking east
    const x0 = engine.player.x;
    const y0 = engine.player.y;
    engine.input.setVirtualMove(0, -1);
    stepOnFoot(engine, 30);

    expect(engine.player.x).toBeGreaterThan(x0 + 5);
    expect(Math.abs(engine.player.y - y0)).toBeLessThan(2);
  });

  it('turns the character to face the direction of travel', () => {
    engine.orbitCam.yaw = 0;
    engine.player.angle = Math.PI;        // facing south
    engine.input.setVirtualMove(0, -1);   // asked to go north
    stepOnFoot(engine, 60);

    // angle 0 is north; allow a little turn-rate slack.
    const wrapped = Math.atan2(Math.sin(engine.player.angle), Math.cos(engine.player.angle));
    expect(Math.abs(wrapped)).toBeLessThan(0.2);
  });

  it('runs faster with sprint held than without', () => {
    engine.orbitCam.yaw = 0;
    engine.input.setVirtualMove(0, -1);
    const startY = engine.player.y;
    stepOnFoot(engine, 30);
    const walked = startY - engine.player.y;

    const engine2 = new GameEngine3D();
    engine2.player.state = 'onFoot';
    engine2.player.currentVehicleId = null;
    engine2.player.action = null;
    engine2.pedestrians.clear();
    engine2.perf.maxPeds = 0;
    placeOnOpenGround(engine2);
    engine2.orbitCam.yaw = 0;
    engine2.input.setVirtualMove(0, -1);
    engine2.input.setTouchButton('sprint', true);
    const startY2 = engine2.player.y;
    stepOnFoot(engine2, 30);
    const ran = startY2 - engine2.player.y;

    expect(ran).toBeGreaterThan(walked * 1.4);
  });
});

describe('jumping', () => {
  it('leaves the ground and lands again', () => {
    engine.orbitCam.yaw = 0;
    expect(engine.player.z).toBe(0);

    engine.input.triggerTouchAction('jump');
    engine.update(1 / 60, 1016);
    expect(engine.player.z).toBeGreaterThan(0);

    // Track the arc: it must rise, peak, then come back to exactly zero.
    let peak = engine.player.z;
    let now = 1016;
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      engine.update(1 / 60, now);
      peak = Math.max(peak, engine.player.z);
      if (engine.player.z === 0) break;
    }

    expect(peak).toBeGreaterThan(5);
    expect(engine.player.z).toBe(0);
    expect(engine.player.jumpVel).toBe(0);
  });

  it('cannot double jump while airborne', () => {
    engine.input.triggerTouchAction('jump');
    engine.update(1 / 60, 1016);
    const vAfterFirst = engine.player.jumpVel;

    engine.input.triggerTouchAction('jump');
    engine.update(1 / 60, 1032);
    // Still falling under gravity, not re-launched.
    expect(engine.player.jumpVel).toBeLessThan(vAfterFirst);
  });
});
