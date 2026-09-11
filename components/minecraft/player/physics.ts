/**
 * Minecraft Web Edition — Phase 1 · Step 7
 * Axis-separated AABB vs. voxel collision. Pure — no three.js.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SolidSource {
  isSolid(x: number, y: number, z: number): boolean;
}

export interface PlayerBody {
  /** Feet-center position. */
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
}

export interface BodyOptions {
  halfWidth: number;
  height: number;
}

/** Small gap kept between the body and voxel faces after resolving. */
const EPS = 0.001;

type Axis = 'x' | 'y' | 'z';

/**
 * Move `pos` along one axis by `delta`, then push the AABB out of any solid
 * voxels it entered. Returns true when a collision was resolved.
 */
function sweepAxis(
  world: SolidSource,
  pos: Vec3,
  opts: BodyOptions,
  axis: Axis,
  delta: number,
): boolean {
  if (delta === 0) return false;
  pos[axis] += delta;

  const { halfWidth, height } = opts;
  const minX = pos.x - halfWidth;
  const maxX = pos.x + halfWidth;
  const minY = pos.y;
  const maxY = pos.y + height;
  const minZ = pos.z - halfWidth;
  const maxZ = pos.z + halfWidth;

  // Shrink by EPS so a box resting exactly on a boundary doesn't touch the
  // next voxel over.
  const x0 = Math.floor(minX + EPS);
  const x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY + EPS);
  const y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ + EPS);
  const z1 = Math.floor(maxZ - EPS);

  let minSolid = Infinity;
  let maxSolid = -Infinity;
  let collided = false;

  for (let vx = x0; vx <= x1; vx++) {
    for (let vy = y0; vy <= y1; vy++) {
      for (let vz = z0; vz <= z1; vz++) {
        if (!world.isSolid(vx, vy, vz)) continue;
        collided = true;
        const c = axis === 'x' ? vx : axis === 'y' ? vy : vz;
        if (c < minSolid) minSolid = c;
        if (c > maxSolid) maxSolid = c;
      }
    }
  }

  if (!collided) return false;

  if (axis === 'x') {
    pos.x = delta > 0 ? minSolid - halfWidth - EPS : maxSolid + 1 + halfWidth + EPS;
  } else if (axis === 'z') {
    pos.z = delta > 0 ? minSolid - halfWidth - EPS : maxSolid + 1 + halfWidth + EPS;
  } else {
    pos.y = delta > 0 ? minSolid - height - EPS : maxSolid + 1 + EPS;
  }
  return true;
}

/**
 * Integrate one physics step: move by velocity × dt with per-axis collision.
 * Velocities on collided axes are zeroed; landing sets `onGround`.
 *
 * Note: expects |vel · dt| < 1 block per axis (caller clamps dt).
 */
export function stepBody(world: SolidSource, body: PlayerBody, dt: number, opts: BodyOptions): void {
  body.onGround = false;

  if (sweepAxis(world, body.pos, opts, 'x', body.vel.x * dt)) body.vel.x = 0;
  if (sweepAxis(world, body.pos, opts, 'z', body.vel.z * dt)) body.vel.z = 0;
  if (sweepAxis(world, body.pos, opts, 'y', body.vel.y * dt)) {
    if (body.vel.y < 0) body.onGround = true;
    body.vel.y = 0;
  }
}

/** Does the unit block at (bx, by, bz) overlap the player AABB? */
export function blockIntersectsBody(
  bx: number,
  by: number,
  bz: number,
  pos: Vec3,
  opts: BodyOptions,
): boolean {
  return (
    bx + 1 > pos.x - opts.halfWidth &&
    bx < pos.x + opts.halfWidth &&
    by + 1 > pos.y &&
    by < pos.y + opts.height &&
    bz + 1 > pos.z - opts.halfWidth &&
    bz < pos.z + opts.halfWidth
  );
}
