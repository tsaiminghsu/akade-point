// Pure die physics for /games/da-nu-shen.
// No three.js import so the integrator can run headless under vitest.
//
// Model (after the jiu-gong-ge reference, GridBall3D / WindDie3D):
//   - semi-implicit Euler, dt clamped to 30 fps
//   - floor-gated periodic kicks that SET vy (never accumulate)
//   - no angular damping in the air; damping + Coulomb friction only while grounded
//   - separate wall / floor restitution, tangential loss on every contact
//   - critically damped orientation spring flattens a grounded die onto its nearest face
//   - orientation-aware AABB extents so corners never sink into felt or glass
//   - every random draw is a seeded integer hash (uniform, reproducible)

export interface QuatLike { x: number; y: number; z: number; w: number }

// ── Config ────────────────────────────────────────────────────────────────────
export interface DicePhysicsConfig {
  shakeDuration:  number   // ms — how long the shaking phase lasts
  kickInterval:   number   // s between kick ticks during shaking
  kickUp:         number   // vertical velocity SET on a kick (units/s)
  kickHoriz:      number   // ± horizontal velocity added per kick (units/s)
  kickRot:        number   // ± angular velocity range added per kick (rad/s)
  gravity:        number   // scene units / s²
  bounceWall:     number   // restitution on wall and lid contact
  bounceFloor:    number   // restitution on a floor landing
  linDampH:       number   // horizontal air drag, exponential rate per second
  rotDamp:        number   // angular damping while GROUNDED, exponential rate per second
  floorFriction:  number   // Coulomb deceleration while grounded, units/s²
  settleLinVel:   number   // linear speed threshold for settling
  settleAngVel:   number   // angular speed threshold for settling
  settleDuration: number   // ms sustained below thresholds before settled
}

export const DEFAULT_DICE_CONFIG: DicePhysicsConfig = {
  shakeDuration:  2500,
  kickInterval:   0.28,
  kickUp:         10,      // apex = kickUp² / (2·gravity) ≈ 0.9 u — stays under the 3.5 u lid
  kickHoriz:      2.5,
  kickRot:        12,
  // Ballistic flight (2·kickUp/gravity ≈ 0.36 s) has to stay close to kickInterval:
  // a die can only be kicked while it is on or near the plate, so a longer arc
  // just parks it in mid-air. At the old 24 the arc ran 0.83 s and dice spent
  // half the shake floating, which read as a stutter.
  gravity:        56,
  bounceWall:     0.62,
  bounceFloor:    0.45,
  linDampH:       0.30,
  rotDamp:        4.5,
  floorFriction:  8,
  settleLinVel:   0.025,
  settleAngVel:   0.025,
  settleDuration: 500,
}

// ── Module constants ──────────────────────────────────────────────────────────
export const MAX_DT             = 0.033  // clamp frame delta (tab switch, hitches)
export const STOP_VY            = 0.5    // floor for restSpeed(); see below
export const GROUND_EPS         = 0.02   // height band above the floor that still counts as grounded
export const KICK_WINDOW        = 0.25   // a die this close to the floor is still within reach of the plate
export const KICK_STAGGER       = 0.04   // s of start delay per die index (wave effect)
const FLOOR_TANGENT_KEEP = 0.80
const FLOOR_ANG_KEEP     = 0.85
const CEIL_TANGENT_KEEP  = 0.90
const CEIL_ANG_KEEP      = 0.90
const LAND_SPIN          = 1.2    // ω += (up × v_h) · LAND_SPIN on landing (tumble coupling)
const LAND_JITTER        = 0.25   // seeded angular jitter on landing, × kickRot × impact ratio
const WALL_SPIN          = 0.3    // ω += (n × v_t) · WALL_SPIN on wall contact
const WALL_JITTER        = 0.6    // seeded angular jitter on wall contact (rad/s range)
const WALL_MIN_IMPACT    = 0.2    // no torque for gentle wall grazes
export const SETTLE_K    = 50     // orientation spring stiffness (critically damped)
export const SETTLE_C    = 2 * Math.sqrt(SETTLE_K)
const SETTLE_VH_MAX      = 0.8    // spring only engages once the die has mostly stopped sliding
const SNAP_DOT           = 0.9995
const SNAP_ANG           = 0.02
const SNAP_VH            = 0.01

/**
 * Landing speed below which a die rests instead of bouncing, and the |vy| band
 * that still counts as grounded.
 *
 * Gravity injects `gravity·dt` of downward speed every frame, so a fixed
 * threshold quietly stops working once gravity rises or the frame rate drops:
 * every landing then reads as fast, the die bounces forever, never registers as
 * grounded, and so never reaches the friction / damping / orientation-spring
 * branch that settles it. Scaling with `gravity·dt` keeps the rule frame-rate
 * independent.
 */
export function restSpeed(gravity: number, dt: number): number {
  return Math.max(STOP_VY, gravity * dt * 1.8)
}

// ── Geometry ──────────────────────────────────────────────────────────────────
export interface DieBox {
  xIn: number   // inner face of the ±X walls
  zIn: number   // inner face of the ±Z walls
  yTop: number  // inner face of the lid
  yBot: number  // top of the felt
}

export function makeDieBox(boxHw: number, boxHd: number, boxH: number, floorTop: number, wallT: number): DieBox {
  return {
    xIn:  boxHw - wallT / 2,
    zIn:  boxHd - wallT / 2,
    yTop: boxH  - wallT / 2,
    yBot: floorTop,
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
export interface DieState {
  px: number; py: number; pz: number
  vx: number; vy: number; vz: number
  wx: number; wy: number; wz: number   // world-frame angular velocity, rad/s
  q: QuatLike
  half: number
  elapsed: number
  lastKickAt: number   // s (in `elapsed` time) of the last kick that actually fired
  kickCount: number
  bounceCount: number
  wallHits: number
  lidHits: number
  grounded: boolean
}

/** Impulses accumulated by the parent (die-to-die collisions); consumed and zeroed each step. */
export interface ExternalImpulse {
  dvx: number; dvy: number; dvz: number
  dpx: number; dpy: number; dpz: number
}

export type DieStepPhase = 'shaking' | 'freeroll'

export function createDieState(px: number, pz: number, half: number, box: DieBox): DieState {
  return {
    px, py: box.yBot + half, pz,
    vx: 0, vy: 0, vz: 0,
    wx: 0, wy: 0, wz: 0,
    q: { x: 0, y: 0, z: 0, w: 1 },
    half,
    elapsed: 0, lastKickAt: -Infinity,
    kickCount: 0, bounceCount: 0, wallHits: 0, lidHits: 0,
    grounded: true,
  }
}

/** Reset timing/velocity for a new shake. Position and orientation are kept — no teleport. */
export function startShake(s: DieState, index: number): void {
  s.vx = s.vy = s.vz = 0
  s.wx = s.wy = s.wz = 0
  s.elapsed = -index * KICK_STAGGER
  s.lastKickAt = -Infinity
  s.kickCount = 0
  s.bounceCount = 0
  s.wallHits = 0
  s.lidHits = 0
  s.grounded = true
}

// ── Random ────────────────────────────────────────────────────────────────────
/** Uniform [0, 1) integer hash. Same (seed, n) → same value. */
export function hash01(seed: number, n: number): number {
  let h = (Math.imul(seed | 0, 374761393) + Math.imul(n | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// ── Orientation helpers ───────────────────────────────────────────────────────
/** Row-major 3×3 rotation matrix of q. Column j is the world direction of local axis j. */
export function rotMatrix(q: QuatLike, out: number[]): number[] {
  const { x, y, z, w } = q
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const wx = w * x, wy = w * y, wz = w * z
  out[0] = 1 - 2 * (yy + zz); out[1] = 2 * (xy - wz);     out[2] = 2 * (xz + wy)
  out[3] = 2 * (xy + wz);     out[4] = 1 - 2 * (xx + zz); out[5] = 2 * (yz - wx)
  out[6] = 2 * (xz - wy);     out[7] = 2 * (yz + wx);     out[8] = 1 - 2 * (xx + yy)
  return out
}

const R = [0, 0, 0, 0, 0, 0, 0, 0, 0]

/** Half-extents of the rotated cube's world AABB. */
export function cubeExtents(q: QuatLike, half: number): { ex: number; ey: number; ez: number } {
  rotMatrix(q, R)
  return {
    ex: half * (Math.abs(R[0]) + Math.abs(R[1]) + Math.abs(R[2])),
    ey: half * (Math.abs(R[3]) + Math.abs(R[4]) + Math.abs(R[5])),
    ez: half * (Math.abs(R[6]) + Math.abs(R[7]) + Math.abs(R[8])),
  }
}

export interface FaceUp {
  idx: number                       // 0..5 = +X -X +Y -Y +Z -Z
  nx: number; ny: number; nz: number // world normal of that face
  dot: number                       // cos of the tilt away from straight up
}

/** The cube face whose outward normal points closest to world +Y. */
export function nearestFaceUp(q: QuatLike): FaceUp {
  rotMatrix(q, R)
  // world normal of local axis j = column j = (R[j], R[3+j], R[6+j]); its Y component is R[3+j]
  let best = 0, bestAbs = -1
  for (let j = 0; j < 3; j++) {
    const a = Math.abs(R[3 + j])
    if (a > bestAbs) { bestAbs = a; best = j }
  }
  const sign = R[3 + best] >= 0 ? 1 : -1
  return {
    idx: 2 * best + (sign < 0 ? 1 : 0),
    nx: sign * R[best],
    ny: sign * R[3 + best],
    nz: sign * R[6 + best],
    dot: bestAbs,
  }
}

/** Pip / wind value shown on geometry faces +X -X +Y -Y +Z -Z. Opposite faces sum to 7. */
export const FACE_ORDER = [4, 3, 1, 6, 2, 5]

export function computeTopFaceFromQuat(q: QuatLike): number {
  return FACE_ORDER[nearestFaceUp(q).idx]
}

/** q ← rotation(axis·angle) ⊗ q  (world-frame rotation applied after q). */
function rotateWorld(q: QuatLike, ax: number, ay: number, az: number, angle: number): void {
  const len = Math.hypot(ax, ay, az)
  if (len < 1e-12 || angle === 0) return
  const sh = Math.sin(angle / 2) / len
  const bx = ax * sh, by = ay * sh, bz = az * sh, bw = Math.cos(angle / 2)
  const { x, y, z, w } = q
  const nw = bw * w - bx * x - by * y - bz * z
  const nx = bw * x + bx * w + by * z - bz * y
  const ny = bw * y - bx * z + by * w + bz * x
  const nz = bw * z + bx * y - by * x + bz * w
  const inv = 1 / Math.hypot(nx, ny, nz, nw)
  q.x = nx * inv; q.y = ny * inv; q.z = nz * inv; q.w = nw * inv
}

function integrateOrientation(s: DieState, dt: number): void {
  const wMag = Math.hypot(s.wx, s.wy, s.wz)
  if (wMag < 1e-9) return
  rotateWorld(s.q, s.wx, s.wy, s.wz, wMag * dt)
}

// ── Contacts ──────────────────────────────────────────────────────────────────
function wallContact(s: DieState, cfg: DicePhysicsConfig, nx: number, nz: number, seed: number): void {
  const vn = s.vx * nx + s.vz * nz            // < 0: moving into the wall
  const impact = -vn
  // tangential velocity (component in the wall plane)
  const tx = s.vx - vn * nx, ty = s.vy, tz = s.vz - vn * nz
  // reflect the normal component
  s.vx -= (1 + cfg.bounceWall) * vn * nx
  s.vz -= (1 + cfg.bounceWall) * vn * nz
  if (impact > WALL_MIN_IMPACT) {
    // friction at the contact point spins the die about an axis in the wall plane: ω += (n × v_t)·k
    s.wx += (-nz * ty) * WALL_SPIN
    s.wy += (nz * tx - nx * tz) * WALL_SPIN
    s.wz += (nx * ty) * WALL_SPIN
    const m = 9000 + s.wallHits * 4
    s.wallHits++
    const j = WALL_JITTER * Math.min(1, impact / cfg.kickUp)
    // jitter stays perpendicular to the wall normal so tests can assert Δω·n = 0
    const jx = (hash01(seed, m + 1) - 0.5) * j
    const jy = (hash01(seed, m + 2) - 0.5) * j
    const jz = (hash01(seed, m + 3) - 0.5) * j
    s.wx += jx * (1 - Math.abs(nx))
    s.wy += jy
    s.wz += jz * (1 - Math.abs(nz))
  }
}

// ── Step ──────────────────────────────────────────────────────────────────────
/**
 * Advance one die by one frame. Mutates `s` and consumes/zeroes `ext`.
 * `seed` must be stable for the whole roll (e.g. rollId·1000 + index).
 */
export function stepDie(
  s: DieState,
  cfg: DicePhysicsConfig,
  box: DieBox,
  phase: DieStepPhase,
  delta: number,
  seed: number,
  ext: ExternalImpulse,
): void {
  const dt = Math.min(delta, MAX_DT)
  const vRest = restSpeed(cfg.gravity, dt)
  s.elapsed += dt
  const wasGrounded = s.grounded

  // 1. External impulses from die-to-die collisions
  s.px += ext.dpx; s.py += ext.dpy; s.pz += ext.dpz
  s.vx += ext.dvx; s.vy += ext.dvy; s.vz += ext.dvz
  ext.dpx = ext.dpy = ext.dpz = 0
  ext.dvx = ext.dvy = ext.dvz = 0

  // 2. Current extents
  let e = cubeExtents(s.q, s.half)
  let floorLevel = box.yBot + e.ey

  // 3. Kick (shaking only). Once kickInterval has elapsed the die stays ARMED
  //    and fires the moment it is back within reach of the plate. Arming rather
  //    than sampling a global tick grid matters because ballistic flight time
  //    (2·kickUp/gravity) is longer than kickInterval at most settings: on a
  //    tick grid an airborne die forfeits every tick it misses and then idles on
  //    the floor until the next one, which reads as a random stutter.
  if (phase === 'shaking' && s.elapsed >= 0 && s.elapsed - s.lastKickAt >= cfg.kickInterval) {
    const eligible = wasGrounded || (s.vy <= 0 && s.py - floorLevel <= KICK_WINDOW)
    if (eligible) {
      s.lastKickAt = s.elapsed
      const n = s.kickCount * 8
      s.kickCount++
      s.vy = cfg.kickUp
      s.vx += (hash01(seed, n + 1) - 0.5) * cfg.kickHoriz * 2
      s.vz += (hash01(seed, n + 2) - 0.5) * cfg.kickHoriz * 2
      s.wx += (hash01(seed, n + 3) - 0.5) * cfg.kickRot
      s.wy += (hash01(seed, n + 4) - 0.5) * cfg.kickRot
      s.wz += (hash01(seed, n + 5) - 0.5) * cfg.kickRot
      s.grounded = false
    }
  }

  // 4. Gravity + horizontal air drag. Angular velocity is untouched in the air.
  s.vy -= cfg.gravity * dt
  const hd = Math.exp(-cfg.linDampH * dt)
  s.vx *= hd; s.vz *= hd

  // 5. Grounded: Coulomb friction, angular damping, orientation spring
  if (wasGrounded) {
    const vh = Math.hypot(s.vx, s.vz)
    if (vh > 0) {
      const k = Math.max(0, vh - cfg.floorFriction * dt) / vh
      s.vx *= k; s.vz *= k
    }
    const rd = Math.exp(-cfg.rotDamp * dt)
    s.wx *= rd; s.wy *= rd; s.wz *= rd
    if (vh < SETTLE_VH_MAX) {
      // Critically damped spring toward the nearest face-up orientation.
      // axis = n × up = (-nz, 0, nx), |axis| = sin(tilt); rotating about it lifts n toward up.
      const f = nearestFaceUp(s.q)
      s.wx += (-f.nz * SETTLE_K - s.wx * SETTLE_C) * dt
      s.wy += (               - s.wy * SETTLE_C) * dt
      s.wz += ( f.nx * SETTLE_K - s.wz * SETTLE_C) * dt
    }
  }

  // 6. Integrate
  s.px += s.vx * dt; s.py += s.vy * dt; s.pz += s.vz * dt
  integrateOrientation(s, dt)
  e = cubeExtents(s.q, s.half)
  floorLevel = box.yBot + e.ey

  // 7. Walls
  const xLim = box.xIn - e.ex
  if (s.px > xLim)       { s.px =  xLim; if (s.vx > 0) wallContact(s, cfg, -1, 0, seed) }
  else if (s.px < -xLim) { s.px = -xLim; if (s.vx < 0) wallContact(s, cfg,  1, 0, seed) }
  const zLim = box.zIn - e.ez
  if (s.pz > zLim)       { s.pz =  zLim; if (s.vz > 0) wallContact(s, cfg, 0, -1, seed) }
  else if (s.pz < -zLim) { s.pz = -zLim; if (s.vz < 0) wallContact(s, cfg, 0,  1, seed) }

  // 8. Lid
  const yLim = box.yTop - e.ey
  if (s.py > yLim) {
    s.py = yLim
    if (s.vy > 0) {
      s.vy = -s.vy * cfg.bounceWall
      s.vx *= CEIL_TANGENT_KEEP; s.vz *= CEIL_TANGENT_KEEP
      s.wx *= CEIL_ANG_KEEP; s.wy *= CEIL_ANG_KEEP; s.wz *= CEIL_ANG_KEEP
      s.lidHits++
    }
  }

  // 9. Floor
  if (s.py < floorLevel) {
    s.py = floorLevel
    const impact = -s.vy
    if (!wasGrounded && impact > vRest) {
      // A real landing: restitution, tumble coupling, seeded jitter, tangential loss
      s.vy = impact * cfg.bounceFloor
      s.wx += -s.vz * LAND_SPIN
      s.wz +=  s.vx * LAND_SPIN
      const j = LAND_JITTER * cfg.kickRot * Math.min(1, impact / cfg.kickUp)
      const m = 5000 + s.bounceCount * 4
      s.bounceCount++
      s.wx += (hash01(seed, m + 1) - 0.5) * j
      s.wy += (hash01(seed, m + 2) - 0.5) * j
      s.wz += (hash01(seed, m + 3) - 0.5) * j
      s.vx *= FLOOR_TANGENT_KEEP; s.vz *= FLOOR_TANGENT_KEEP
      s.wx *= FLOOR_ANG_KEEP; s.wy *= FLOOR_ANG_KEEP; s.wz *= FLOOR_ANG_KEEP
    } else if (s.vy < 0) {
      // Resting (or too slow to bounce): absorb the vertical velocity, no impulse
      s.vy = 0
    }
  }
  s.grounded = s.py <= floorLevel + GROUND_EPS && Math.abs(s.vy) < vRest

  // 10. Snap: a grounded die that is flat and still comes to an exact rest
  if (phase === 'freeroll' && s.grounded) {
    const wMag = Math.hypot(s.wx, s.wy, s.wz)
    const vh = Math.hypot(s.vx, s.vz)
    if (wMag < SNAP_ANG && vh < SNAP_VH) {
      const f = nearestFaceUp(s.q)
      if (f.dot > SNAP_DOT) {
        // rotate the last fraction of a degree so the face is exactly up
        const tilt = Math.acos(Math.min(1, f.dot))
        rotateWorld(s.q, -f.nz, 0, f.nx, tilt)
        s.wx = s.wy = s.wz = 0
        s.vx = s.vz = 0
        s.vy = 0
        const ee = cubeExtents(s.q, s.half)
        s.py = box.yBot + ee.ey
      }
    }
  }
}

// ── Die-to-die collisions ─────────────────────────────────────────────────────
// Collision radius sits between the cube's inscribed (half) and circumscribed
// (half·√3) spheres, so dice neither visibly interpenetrate nor float apart.
export const R_FACTOR       = 1.1
export const DD_RESTITUTION = 0.3   // dice are not bouncy against each other
export const POS_CORRECT    = 0.5   // fraction of the overlap resolved per frame

/** The subset of a die handle the pair solver reads and writes. */
export interface DieContactBody extends ExternalImpulse {
  px: number; py: number; pz: number
  vx: number; vy: number; vz: number
  half: number
  diceContact: boolean
}

/**
 * Resolve every overlapping pair: split the penetration and apply a
 * mass-weighted normal impulse. Results accumulate into each body's
 * dp/dv fields, which stepDie consumes on its next call.
 */
export function resolveDiePairs(bodies: Array<{ current: DieContactBody }>, count: number): void {
  for (let i = 0; i < count; i++) bodies[i].current.diceContact = false
  for (let i = 0; i < count; i++) {
    const a = bodies[i].current
    const ra = a.half * R_FACTOR
    for (let j = i + 1; j < count; j++) {
      const b = bodies[j].current
      const rb = b.half * R_FACTOR
      const dx = b.px - a.px, dy = b.py - a.py, dz = b.pz - a.pz
      const distSq = dx * dx + dy * dy + dz * dz
      const minDist = ra + rb
      if (distSq >= minDist * minDist || distSq <= 1e-6) continue

      const dist = Math.sqrt(distSq)
      const nx = dx / dist, ny = dy / dist, nz = dz / dist

      // Mass ∝ volume, so a large die shrugs off a small one
      const ma = a.half * a.half * a.half
      const mb = b.half * b.half * b.half
      const wa = mb / (ma + mb)
      const wb = ma / (ma + mb)

      // Positional correction so the pair actually separates
      const corr = (minDist - dist) * POS_CORRECT
      a.dpx -= nx * corr * wa; a.dpy -= ny * corr * wa; a.dpz -= nz * corr * wa
      b.dpx += nx * corr * wb; b.dpy += ny * corr * wb; b.dpz += nz * corr * wb

      // Normal impulse, only for an approaching pair
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz
      if (rv < 0) {
        const J = -(1 + DD_RESTITUTION) * rv
        a.dvx -= nx * J * wa; a.dvy -= ny * J * wa; a.dvz -= nz * J * wa
        b.dvx += nx * J * wb; b.dvy += ny * J * wb; b.dvz += nz * J * wb
      }
      a.diceContact = true
      b.diceContact = true
    }
  }
}
