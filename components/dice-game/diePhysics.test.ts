import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DICE_CONFIG, DicePhysicsConfig, DieBox, DieState, ExternalImpulse, DieStepPhase,
  makeDieBox, createDieState, startShake, stepDie,
  hash01, cubeExtents, nearestFaceUp, computeTopFaceFromQuat, rotMatrix,
  STOP_VY, MAX_DT, KICK_WINDOW,
} from './diePhysics'

// Box matches MachineBox.tsx: BOX_W 5.0, BOX_D 3.5, BOX_H 3.5, WALL_T 0.07, FLOOR_TOP 0.03
const BOX: DieBox = makeDieBox(2.5, 1.75, 3.5, 0.03, 0.07)
const HALF = 22 * (0.9 / 25) / 2   // 22 mm die → 0.396

function noImpulse(): ExternalImpulse {
  return { dvx: 0, dvy: 0, dvz: 0, dpx: 0, dpy: 0, dpz: 0 }
}

function quatAxis(ax: number, ay: number, az: number, angle: number) {
  const len = Math.hypot(ax, ay, az) || 1
  const s = Math.sin(angle / 2) / len
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(angle / 2) }
}

interface SimOpts {
  dt?: number
  seed?: number
  shakeSec?: number
  freerollSec?: number
  cfg?: DicePhysicsConfig
  half?: number
  px?: number
  pz?: number
  index?: number
}

interface SimResult {
  s: DieState
  minFloorGap: number      // min(py - ey - yBot)
  maxTop: number           // max(py + ey)
  maxWallOverX: number     // max(|px| + ex - xIn)
  maxWallOverZ: number     // max(|pz| + ez - zIn)
  lidFrames: number
  shakeFrames: number
  airborneFrames: number
  totalFrames: number
  sawNaN: boolean
  trail: Array<{ speed: number; angSpeed: number }>
}

function simulate(opts: SimOpts = {}): SimResult {
  const dt = opts.dt ?? 1 / 60
  const seed = opts.seed ?? 1
  const cfg = opts.cfg ?? DEFAULT_DICE_CONFIG
  const half = opts.half ?? HALF
  const shakeSec = opts.shakeSec ?? 2.5
  const freerollSec = opts.freerollSec ?? 4
  const s = createDieState(opts.px ?? 0, opts.pz ?? 0, half, BOX)
  startShake(s, opts.index ?? 0)
  const ext = noImpulse()

  const r: SimResult = {
    s, minFloorGap: Infinity, maxTop: -Infinity, maxWallOverX: -Infinity, maxWallOverZ: -Infinity,
    lidFrames: 0, shakeFrames: 0, airborneFrames: 0, totalFrames: 0, sawNaN: false, trail: [],
  }

  const run = (seconds: number, phase: DieStepPhase) => {
    const frames = Math.round(seconds / dt)
    for (let i = 0; i < frames; i++) {
      stepDie(s, cfg, BOX, phase, dt, seed, ext)
      const e = cubeExtents(s.q, s.half)
      const finite = [s.px, s.py, s.pz, s.vx, s.vy, s.vz, s.wx, s.wy, s.wz, s.q.x, s.q.y, s.q.z, s.q.w]
      if (!finite.every(Number.isFinite)) r.sawNaN = true
      r.minFloorGap = Math.min(r.minFloorGap, s.py - e.ey - BOX.yBot)
      r.maxTop = Math.max(r.maxTop, s.py + e.ey)
      r.maxWallOverX = Math.max(r.maxWallOverX, Math.abs(s.px) + e.ex - BOX.xIn)
      r.maxWallOverZ = Math.max(r.maxWallOverZ, Math.abs(s.pz) + e.ez - BOX.zIn)
      if (s.py + e.ey >= BOX.yTop - 0.01) r.lidFrames++
      if (!s.grounded) r.airborneFrames++
      if (phase === 'shaking') r.shakeFrames++
      r.totalFrames++
      r.trail.push({ speed: Math.hypot(s.vx, s.vy, s.vz), angSpeed: Math.hypot(s.wx, s.wy, s.wz) })
    }
  }

  run(shakeSec, 'shaking')
  run(freerollSec, 'freeroll')
  return r
}

// 1. Seeded randomness
describe('hash01', () => {
  it('is uniform over [0,1)', () => {
    const N = 10000
    const buckets = new Array(10).fill(0)
    let sum = 0
    for (let i = 0; i < N; i++) {
      const v = hash01(12345, i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      sum += v
      buckets[Math.floor(v * 10)]++
    }
    expect(sum / N).toBeGreaterThan(0.48)
    expect(sum / N).toBeLessThan(0.52)
    for (const b of buckets) {
      expect(b).toBeGreaterThan(800)
      expect(b).toBeLessThan(1200)
    }
  })

  it('is deterministic and decorrelated across seed and n', () => {
    expect(hash01(7, 3)).toBe(hash01(7, 3))
    expect(hash01(7, 3)).not.toBe(hash01(7, 4))
    expect(hash01(7, 3)).not.toBe(hash01(8, 3))
  })

  it('has no directional bias in centred draws', () => {
    let sum = 0
    for (let seed = 0; seed < 200; seed++) {
      for (let n = 0; n < 50; n++) sum += hash01(seed, n) - 0.5
    }
    expect(Math.abs(sum / (200 * 50))).toBeLessThan(0.01)
  })
})

// 2. Orientation helpers
describe('orientation helpers', () => {
  it('cubeExtents: identity is half on every axis', () => {
    const e = cubeExtents({ x: 0, y: 0, z: 0, w: 1 }, HALF)
    expect(e.ex).toBeCloseTo(HALF, 10)
    expect(e.ey).toBeCloseTo(HALF, 10)
    expect(e.ez).toBeCloseTo(HALF, 10)
  })

  it('cubeExtents: 45 degrees about z widens x and y by sqrt(2)', () => {
    const e = cubeExtents(quatAxis(0, 0, 1, Math.PI / 4), HALF)
    expect(e.ex).toBeCloseTo(HALF * Math.SQRT2, 10)
    expect(e.ey).toBeCloseTo(HALF * Math.SQRT2, 10)
    expect(e.ez).toBeCloseTo(HALF, 10)
  })

  it('cubeExtents: a corner-up die is taller than a flat one', () => {
    const e = cubeExtents(quatAxis(1, 0, -1, Math.acos(1 / Math.SQRT2)), HALF)
    expect(e.ey).toBeGreaterThan(HALF * 1.3)
    expect(e.ey).toBeLessThanOrEqual(HALF * Math.sqrt(3) + 1e-9)
  })

  it('rotMatrix rows are orthonormal', () => {
    const q = quatAxis(0.3, 1, -0.7, 1.1)
    const m = rotMatrix(q, new Array(9).fill(0))
    expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(1, 12)
    expect(Math.hypot(m[3], m[4], m[5])).toBeCloseTo(1, 12)
    expect(m[0] * m[3] + m[1] * m[4] + m[2] * m[5]).toBeCloseTo(0, 12)
  })

  it('computeTopFaceFromQuat matches the geometry face order', () => {
    expect(computeTopFaceFromQuat({ x: 0, y: 0, z: 0, w: 1 })).toBe(1)
    expect(computeTopFaceFromQuat(quatAxis(1, 0, 0, Math.PI))).toBe(6)
    expect(computeTopFaceFromQuat(quatAxis(0, 0, 1, Math.PI / 2))).toBe(4)
    expect(computeTopFaceFromQuat(quatAxis(0, 0, 1, -Math.PI / 2))).toBe(3)
    expect(computeTopFaceFromQuat(quatAxis(1, 0, 0, -Math.PI / 2))).toBe(2)
    expect(computeTopFaceFromQuat(quatAxis(1, 0, 0, Math.PI / 2))).toBe(5)
  })

  it('opposite faces sum to 7', () => {
    const a = computeTopFaceFromQuat({ x: 0, y: 0, z: 0, w: 1 })
    const b = computeTopFaceFromQuat(quatAxis(1, 0, 0, Math.PI))
    expect(a + b).toBe(7)
    const c = computeTopFaceFromQuat(quatAxis(0, 0, 1, Math.PI / 2))
    const d = computeTopFaceFromQuat(quatAxis(0, 0, 1, -Math.PI / 2))
    expect(c + d).toBe(7)
  })

  it('nearestFaceUp returns a unit normal and its tilt cosine', () => {
    const f = nearestFaceUp(quatAxis(0, 0, 1, 0.3))
    expect(Math.hypot(f.nx, f.ny, f.nz)).toBeCloseTo(1, 10)
    expect(f.dot).toBeCloseTo(Math.cos(0.3), 10)
    expect(f.ny).toBeCloseTo(f.dot, 10)
  })
})

// 3. The die never leaves the box
describe('containment', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: stays inside the box and never goes NaN`, () => {
      const r = simulate({ seed })
      expect(r.sawNaN).toBe(false)
      expect(r.minFloorGap).toBeGreaterThan(-1e-6)
      expect(r.maxTop).toBeLessThan(BOX.yTop + 1e-6)
      expect(r.maxWallOverX).toBeLessThan(1e-6)
      expect(r.maxWallOverZ).toBeLessThan(1e-6)
    })
  }

  it('holds containment for a large die at 30 fps', () => {
    const r = simulate({ seed: 9, dt: 1 / 30, half: 25 * (0.9 / 25) / 2 })
    expect(r.sawNaN).toBe(false)
    expect(r.minFloorGap).toBeGreaterThan(-1e-6)
    expect(r.maxTop).toBeLessThan(BOX.yTop + 1e-6)
  })
})

// 4. Energy stays bounded (no self-amplifying kicks)
describe('energy', () => {
  it('does not slam the lid with the default config', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = simulate({ seed })
      expect(r.lidFrames / r.shakeFrames).toBeLessThanOrEqual(0.02)
    }
  })

  it('apex stays within the analytic kick bound', () => {
    const cfg = DEFAULT_DICE_CONFIG
    // Worst case for the top of the die: a kick fires from the very top of the
    // kick window while the die is corner-down (largest vertical extent, so the
    // highest centre), then it reaches apex corner-up. Both extents are half·√3
    // rather than half. A kick SETS vy, so a die can never carry energy over
    // from one arc into the next — exceeding this means kicks are amplifying.
    const maxExtent = HALF * Math.sqrt(3)
    const bound = BOX.yBot + maxExtent + KICK_WINDOW
      + (cfg.kickUp * cfg.kickUp) / (2 * cfg.gravity) + maxExtent
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(simulate({ seed, shakeSec: 20 }).maxTop).toBeLessThan(bound)
    }
  })
})

// 5. Kick semantics
describe('kick', () => {
  it('SETS vy rather than accumulating onto it', () => {
    const cfg = DEFAULT_DICE_CONFIG
    const dt = 1 / 60
    const s = createDieState(0, 0, HALF, BOX)
    startShake(s, 0)
    s.vy = 8            // already flying upward
    s.grounded = true   // but eligible for a kick
    stepDie(s, cfg, BOX, 'shaking', dt, 1, noImpulse())
    expect(s.vy).toBeCloseTo(cfg.kickUp - cfg.gravity * dt, 10)
    expect(s.kickCount).toBe(1)
  })

  it('fires often enough to keep the die airborne during a shake', () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate({ seed, freerollSec: 0 })
      expect(r.s.kickCount).toBeGreaterThanOrEqual(2)
      expect(r.airborneFrames / r.shakeFrames).toBeGreaterThan(0.4)
    }
  })

  it('staggers dice by index so they do not move as one block', () => {
    const a = createDieState(0, 0, HALF, BOX)
    const b = createDieState(0, 0, HALF, BOX)
    startShake(a, 0)
    startShake(b, 5)
    expect(a.elapsed).toBeCloseTo(0, 12)
    expect(b.elapsed).toBeLessThan(0)
    const ea = noImpulse(), eb = noImpulse()
    for (let i = 0; i < 6; i++) {
      stepDie(a, DEFAULT_DICE_CONFIG, BOX, 'shaking', 1 / 60, 1, ea)
      stepDie(b, DEFAULT_DICE_CONFIG, BOX, 'shaking', 1 / 60, 1, eb)
    }
    expect(a.py).not.toBeCloseTo(b.py, 3)
  })

  it('does not teleport the die when a shake starts', () => {
    const s = createDieState(1.3, -0.9, HALF, BOX)
    s.py = 2.1
    startShake(s, 2)
    expect(s.px).toBe(1.3)
    expect(s.py).toBe(2.1)
    expect(s.pz).toBe(-0.9)
    expect(s.vx).toBe(0)
    expect(s.vy).toBe(0)
    expect(s.vz).toBe(0)
  })
})

// 6. Damping is in the right place
describe('damping', () => {
  it('does not damp angular velocity in the air', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.py = 2.0
    s.vy = 0
    s.grounded = false
    s.wx = 1; s.wy = 2; s.wz = 3
    const before = Math.hypot(s.wx, s.wy, s.wz)
    const ext = noImpulse()
    for (let i = 0; i < 10; i++) stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 1, ext)
    expect(s.grounded).toBe(false)
    expect(Math.hypot(s.wx, s.wy, s.wz)).toBeCloseTo(before, 10)
  })

  it('damps angular velocity once grounded', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.grounded = true
    s.wx = 1; s.wy = 2; s.wz = 3
    const before = Math.hypot(s.wx, s.wy, s.wz)
    const ext = noImpulse()
    for (let i = 0; i < 10; i++) stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 1, ext)
    expect(Math.hypot(s.wx, s.wy, s.wz)).toBeLessThan(before)
  })

  it('brings a sliding grounded die to an exact stop', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.grounded = true
    s.vx = 2; s.vz = 0
    const ext = noImpulse()
    for (let i = 0; i < 60; i++) stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 1, ext)
    expect(Math.hypot(s.vx, s.vz)).toBe(0)
  })
})

// 7. Wall contact torque
describe('wall contact', () => {
  it('adds torque perpendicular to the wall normal', () => {
    for (const axis of ['x', 'z']) {
      const s = createDieState(0, 0, HALF, BOX)
      s.py = 1.5
      s.grounded = false
      s.vy = 0
      if (axis === 'x') { s.px = BOX.xIn - HALF - 0.01; s.vx = 4; s.vz = 1 }
      else { s.pz = BOX.zIn - HALF - 0.01; s.vz = 4; s.vx = 1 }
      const w0 = { x: s.wx, y: s.wy, z: s.wz }
      stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 7, noImpulse())
      expect(s.wallHits).toBe(1)
      const d = { x: s.wx - w0.x, y: s.wy - w0.y, z: s.wz - w0.z }
      const dotN = axis === 'x' ? d.x : d.z
      expect(Math.abs(dotN)).toBeLessThan(1e-12)
      expect(Math.hypot(d.x, d.y, d.z)).toBeGreaterThan(0)
    }
  })

  it('reflects with the wall restitution', () => {
    const cfg = DEFAULT_DICE_CONFIG
    const s = createDieState(0, 0, HALF, BOX)
    s.py = 1.5; s.grounded = false; s.vy = 0
    s.px = BOX.xIn - HALF - 0.01; s.vx = 4
    stepDie(s, cfg, BOX, 'freeroll', 1 / 60, 7, noImpulse())
    expect(s.vx).toBeLessThan(0)
    expect(Math.abs(s.vx)).toBeLessThan(4 * cfg.bounceWall + 1e-9)
  })
})

// 8. Settling
describe('settling', () => {
  const rates: Array<[string, number]> = [['30 fps', 1 / 30], ['60 fps', 1 / 60], ['144 fps', 1 / 144]]
  for (const [label, dt] of rates) {
    it(`comes to rest flat on a face at ${label}`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const r = simulate({ seed, dt, freerollSec: 4 })
        const cfg = DEFAULT_DICE_CONFIG
        const tail = r.trail.slice(-Math.round(0.5 / dt))
        for (const t of tail) {
          expect(t.speed).toBeLessThan(cfg.settleLinVel)
          expect(t.angSpeed).toBeLessThan(cfg.settleAngVel)
        }
        expect(r.s.grounded).toBe(true)
        expect(nearestFaceUp(r.s.q).dot).toBeGreaterThan(0.999)
        expect(r.s.py).toBeCloseTo(BOX.yBot + HALF, 3)
      }
    })
  }

  it('flattens a die that is resting on a corner', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.q = quatAxis(1, 0, -1, Math.acos(1 / Math.SQRT2))
    s.py = BOX.yBot + cubeExtents(s.q, HALF).ey
    s.grounded = true
    const ext = noImpulse()
    for (let i = 0; i < 240; i++) stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 4, ext)
    expect(nearestFaceUp(s.q).dot).toBeGreaterThan(0.999)
    expect(Math.hypot(s.wx, s.wy, s.wz)).toBeLessThan(DEFAULT_DICE_CONFIG.settleAngVel)
  })

  it('reports a stable top face once settled', () => {
    const r = simulate({ seed: 2 })
    const face = computeTopFaceFromQuat(r.s.q)
    expect([1, 2, 3, 4, 5, 6]).toContain(face)
    const ext = noImpulse()
    for (let i = 0; i < 120; i++) stepDie(r.s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 2, ext)
    expect(computeTopFaceFromQuat(r.s.q)).toBe(face)
  })
})

// 9. Regression: a resting die must not micro-bounce every other frame
describe('resting die', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    for (const gravity of [24, 40]) {
      it(`stays exactly still at dt=${dt.toFixed(4)} gravity=${gravity}`, () => {
        const cfg: DicePhysicsConfig = { ...DEFAULT_DICE_CONFIG, gravity }
        const s = createDieState(0, 0, HALF, BOX)
        s.grounded = true
        const ext = noImpulse()
        for (let i = 0; i < 120; i++) {
          stepDie(s, cfg, BOX, 'freeroll', dt, 1, ext)
          expect(Math.hypot(s.vx, s.vy, s.vz)).toBe(0)
          expect(s.grounded).toBe(true)
        }
        expect(s.bounceCount).toBe(0)
        expect(s.py).toBeCloseTo(BOX.yBot + HALF, 10)
      })
    }
  }

  it('a slow landing rests instead of bouncing', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.py = BOX.yBot + HALF + 0.001
    // after one frame of gravity the impact is still under STOP_VY
    s.vy = -0.05
    s.grounded = false
    stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 1, noImpulse())
    expect(s.vy).toBe(0)
    expect(s.bounceCount).toBe(0)
  })

  it('a fast landing does bounce', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.py = BOX.yBot + HALF + 0.001
    s.vy = -4
    s.grounded = false
    stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 1, noImpulse())
    expect(s.vy).toBeGreaterThan(STOP_VY)
    expect(s.bounceCount).toBe(1)
  })
})

// 10. Fairness
describe('fairness', () => {
  it('does not drift toward one corner over a shake', () => {
    let sumX = 0, sumZ = 0
    const seeds: number[] = []
    for (let roll = 1; roll <= 8; roll++) for (let i = 0; i < 8; i++) seeds.push(roll * 1000 + i)
    for (const seed of seeds) {
      const r = simulate({ seed, freerollSec: 1 })
      sumX += r.s.px
      sumZ += r.s.pz
    }
    expect(Math.abs(sumX / seeds.length)).toBeLessThan(0.5)
    expect(Math.abs(sumZ / seeds.length)).toBeLessThan(0.4)
  })

  it('produces more than one distinct outcome across seeds', () => {
    const faces = new Set<number>()
    for (let seed = 1; seed <= 24; seed++) faces.add(computeTopFaceFromQuat(simulate({ seed }).s.q))
    expect(faces.size).toBeGreaterThan(2)
  })
})

// 11. Determinism and dt clamping
describe('determinism', () => {
  it('same seed and dt give the same result', () => {
    const a = simulate({ seed: 42 }).s
    const b = simulate({ seed: 42 }).s
    expect([a.px, a.py, a.pz, a.q.x, a.q.y, a.q.z, a.q.w])
      .toEqual([b.px, b.py, b.pz, b.q.x, b.q.y, b.q.z, b.q.w])
  })

  it('clamps a huge delta instead of launching the die', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.grounded = true
    const ext = noImpulse()
    stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 5.0, 1, ext)
    expect(s.py).toBeCloseTo(BOX.yBot + HALF, 10)
    expect(Math.hypot(s.vx, s.vy, s.vz)).toBe(0)
    expect(s.elapsed).toBeCloseTo(MAX_DT, 10)
  })
})

// 12. External impulses from die-to-die collisions
describe('external impulses', () => {
  it('consumes and zeroes the impulse fields', () => {
    const s = createDieState(0, 0, HALF, BOX)
    s.py = 2.0; s.grounded = false; s.vy = 0
    const ext: ExternalImpulse = { dvx: 1, dvy: 0, dvz: -2, dpx: 0.05, dpy: 0, dpz: 0.05 }
    stepDie(s, DEFAULT_DICE_CONFIG, BOX, 'freeroll', 1 / 60, 1, ext)
    expect(ext.dvx).toBe(0)
    expect(ext.dvz).toBe(0)
    expect(ext.dpx).toBe(0)
    expect(ext.dpz).toBe(0)
    expect(s.vx).toBeGreaterThan(0)
    expect(s.vz).toBeLessThan(0)
    expect(s.px).toBeGreaterThan(0.04)
  })
})
