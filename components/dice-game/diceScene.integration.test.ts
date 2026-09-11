// Integration test for the 9-die pipeline: stepDie + resolveDiePairs + the
// settle detection that DiceScene runs. Mirrors DiceGame's phase machine
// (shaking for shakeDuration, then freeroll until every die is slow).
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DICE_CONFIG, DicePhysicsConfig, DieBox, DieState, DieContactBody,
  makeDieBox, createDieState, startShake, stepDie, resolveDiePairs,
  computeTopFaceFromQuat, cubeExtents, R_FACTOR,
} from './diePhysics'

const BOX: DieBox = makeDieBox(2.5, 1.75, 3.5, 0.03, 0.07)
const MM_TO_UNIT = 0.9 / 25

// Same layout rule as DiceScene.buildRestPositions for counts > 2
function buildRestPositions(sizesMm: number[]): Array<[number, number]> {
  const count = sizesMm.length
  const sizes = sizesMm.map(mm => mm * MM_TO_UNIT)
  const maxSize = Math.max(...sizes)
  if (count === 1) return [[0, 0]]
  if (count === 2) return [[-0.7, 0], [0.7, 0]]
  const cols = count <= 3 ? count : Math.round(Math.sqrt(count * (5.0 / 3.5)))
  const rows = Math.ceil(count / Math.max(cols, 1))
  const gap = maxSize * 0.15
  const spacingX = Math.min(maxSize + gap + 0.18, (5.0 * 0.75) / Math.max(cols - 1, 1))
  const spacingZ = Math.min(maxSize + gap + 0.12, (3.5 * 0.65) / Math.max(rows - 1, 1))
  const out: Array<[number, number]> = []
  for (let r = 0; r < rows; r++) {
    const rowCount = Math.min(cols, count - r * cols)
    const rowOffX = (-(rowCount - 1) / 2) * spacingX
    for (let c = 0; c < rowCount; c++) {
      out.push([rowOffX + c * spacingX, (r - (rows - 1) / 2) * spacingZ])
    }
  }
  return out
}

interface Die {
  state: DieState
  handle: { current: DieContactBody }
}

function makeDice(sizesMm: number[]): Die[] {
  const rest = buildRestPositions(sizesMm)
  return sizesMm.map((mm, i) => {
    const half = (mm * MM_TO_UNIT) / 2
    const state = createDieState(rest[i][0], rest[i][1], half, BOX)
    return {
      state,
      handle: {
        current: {
          px: state.px, py: state.py, pz: state.pz,
          vx: 0, vy: 0, vz: 0,
          half,
          dvx: 0, dvy: 0, dvz: 0,
          dpx: 0, dpy: 0, dpz: 0,
          diceContact: false,
        },
      },
    }
  })
}

interface RunResult {
  dice: Die[]
  settledAtMs: number | null
  faces: number[]
  minPairGap: number       // min(dist - (ra + rb)) once at rest; 0 means just touching
  maxLidOverlap: number
  minFloorGap: number
  maxWallOver: number
  sawNaN: boolean
}

function runRoll(opts: {
  sizesMm?: number[]
  dt?: number
  rollId?: number
  cfg?: DicePhysicsConfig
  freerollSec?: number
} = {}): RunResult {
  const sizesMm = opts.sizesMm ?? new Array(9).fill(22)
  const dt = opts.dt ?? 1 / 60
  const rollId = opts.rollId ?? 1
  const cfg = opts.cfg ?? DEFAULT_DICE_CONFIG
  const freerollSec = opts.freerollSec ?? 6
  const dice = makeDice(sizesMm)
  const count = dice.length
  dice.forEach((d, i) => startShake(d.state, i))

  const r: RunResult = {
    dice, settledAtMs: null, faces: [],
    minPairGap: Infinity, maxLidOverlap: -Infinity,
    minFloorGap: Infinity, maxWallOver: -Infinity, sawNaN: false,
  }

  let nowMs = 0
  let slowSinceMs: number | null = null
  let notified = false
  const handles = dice.map(d => d.handle)

  const frame = (phase: 'shaking' | 'freeroll') => {
    // DiceScene's parent pass runs first: it fills dp/dv, stepDie consumes them
    resolveDiePairs(handles, count)
    for (let i = 0; i < count; i++) {
      const d = dice[i]
      stepDie(d.state, cfg, BOX, phase, dt, rollId * 1000 + i, d.handle.current)
      const s = d.state
      const h = d.handle.current
      h.px = s.px; h.py = s.py; h.pz = s.pz
      h.vx = s.vx; h.vy = s.vy; h.vz = s.vz
      h.half = s.half

      const e = cubeExtents(s.q, s.half)
      const vals = [s.px, s.py, s.pz, s.vx, s.vy, s.vz, s.wx, s.wy, s.wz, s.q.x, s.q.y, s.q.z, s.q.w]
      if (!vals.every(Number.isFinite)) r.sawNaN = true
      r.minFloorGap = Math.min(r.minFloorGap, s.py - e.ey - BOX.yBot)
      r.maxLidOverlap = Math.max(r.maxLidOverlap, s.py + e.ey - BOX.yTop)
      r.maxWallOver = Math.max(
        r.maxWallOver,
        Math.abs(s.px) + e.ex - BOX.xIn,
        Math.abs(s.pz) + e.ez - BOX.zIn,
      )
    }
    nowMs += dt * 1000
  }

  const shakeFrames = Math.round((cfg.shakeDuration / 1000) / dt)
  for (let i = 0; i < shakeFrames; i++) frame('shaking')

  const freeFrames = Math.round(freerollSec / dt)
  for (let i = 0; i < freeFrames; i++) {
    frame('freeroll')
    if (notified) continue
    const allSlow = dice.every(d => {
      const speed = Math.hypot(d.state.vx, d.state.vy, d.state.vz)
      const ang = Math.hypot(d.state.wx, d.state.wy, d.state.wz)
      return speed < cfg.settleLinVel && ang < cfg.settleAngVel
    })
    if (allSlow) {
      if (slowSinceMs === null) slowSinceMs = nowMs
      if (nowMs - slowSinceMs > cfg.settleDuration) {
        notified = true
        r.settledAtMs = nowMs
        r.faces = dice.map(d => computeTopFaceFromQuat(d.state.q))
      }
    } else {
      slowSinceMs = null
    }
  }

  // pair separation at the final resting arrangement
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const a = dice[i].state, b = dice[j].state
      const dist = Math.hypot(b.px - a.px, b.py - a.py, b.pz - a.pz)
      r.minPairGap = Math.min(r.minPairGap, dist - (a.half + b.half) * R_FACTOR)
    }
  }
  return r
}

describe('nine dice, default settings', () => {
  for (const rollId of [1, 2, 3]) {
    it(`roll ${rollId}: every die settles and reports a face`, () => {
      const r = runRoll({ rollId })
      expect(r.sawNaN).toBe(false)
      expect(r.settledAtMs).not.toBeNull()
      expect(r.faces).toHaveLength(9)
      for (const f of r.faces) expect([1, 2, 3, 4, 5, 6]).toContain(f)
      // settledAtMs is measured from the start of the roll and includes both the
      // 2.5 s shake and the 500 ms confirmation window
      const freerollMs = r.settledAtMs! - DEFAULT_DICE_CONFIG.shakeDuration
      expect(freerollMs).toBeGreaterThan(0)
      expect(freerollMs).toBeLessThan(4000)
    })
  }

  it('keeps every die inside the box for the whole roll', () => {
    const r = runRoll({ rollId: 4 })
    expect(r.minFloorGap).toBeGreaterThan(-1e-6)
    expect(r.maxLidOverlap).toBeLessThan(1e-6)
    expect(r.maxWallOver).toBeLessThan(1e-6)
  })

  it('separates dice instead of leaving them interpenetrated', () => {
    for (const rollId of [1, 2, 3, 4, 5]) {
      const r = runRoll({ rollId })
      // a small residual overlap is fine; deep interpenetration is not
      expect(r.minPairGap).toBeGreaterThan(-0.06)
    }
  })

  it('produces varied outcomes across rolls', () => {
    const seen = new Set<string>()
    for (let rollId = 1; rollId <= 6; rollId++) {
      seen.add(runRoll({ rollId }).faces.join(','))
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('frame rate independence', () => {
  for (const [label, dt] of [['30 fps', 1 / 30], ['60 fps', 1 / 60], ['144 fps', 1 / 144]] as Array<[string, number]>) {
    it(`settles at ${label}`, () => {
      const r = runRoll({ rollId: 2, dt })
      expect(r.sawNaN).toBe(false)
      expect(r.settledAtMs).not.toBeNull()
      expect(r.minFloorGap).toBeGreaterThan(-1e-6)
      expect(r.maxLidOverlap).toBeLessThan(1e-6)
    })
  }
})

describe('die size and count variations', () => {
  const cases: Array<[string, number[]]> = [
    ['one die', [22]],
    ['two dice', [22, 22]],
    ['nine 25 mm dice', new Array(9).fill(25)],
    ['nine 12 mm dice', new Array(9).fill(12)],
    ['mixed 3 wind + 6 number', [25, 25, 25, 22, 22, 22, 22, 22, 22]],
  ]
  for (const [label, sizes] of cases) {
    it(`${label}: settles and stays contained`, () => {
      const r = runRoll({ sizesMm: sizes, rollId: 3 })
      expect(r.sawNaN).toBe(false)
      expect(r.settledAtMs).not.toBeNull()
      expect(r.faces).toHaveLength(sizes.length)
      expect(r.minFloorGap).toBeGreaterThan(-1e-6)
      expect(r.maxLidOverlap).toBeLessThan(1e-6)
      expect(r.maxWallOver).toBeLessThan(1e-6)
    })
  }
})

describe('slider extremes still settle', () => {
  const extremes: Array<[string, Partial<DicePhysicsConfig>]> = [
    ['max shake, low gravity', { kickUp: 16, gravity: 10 }],
    ['min friction', { floorFriction: 1 }],
    ['min rotation damping', { rotDamp: 1 }],
    ['max friction', { floorFriction: 20 }],
    ['loose settle threshold', { settleLinVel: 0.1, settleAngVel: 0.1 }],
    ['high gravity', { gravity: 40 }],
    ['bouncy floor', { bounceFloor: 0.8 }],
  ]
  for (const [label, patch] of extremes) {
    it(`${label}: reaches a result and stays in the box`, () => {
      const cfg = { ...DEFAULT_DICE_CONFIG, ...patch }
      const r = runRoll({ rollId: 5, cfg, freerollSec: 10 })
      expect(r.sawNaN).toBe(false)
      expect(r.settledAtMs).not.toBeNull()
      expect(r.minFloorGap).toBeGreaterThan(-1e-6)
      expect(r.maxLidOverlap).toBeLessThan(1e-6)
      expect(r.maxWallOver).toBeLessThan(1e-6)
    })
  }
})

describe('consecutive rolls', () => {
  it('re-shakes cleanly from a settled arrangement without exploding', () => {
    const sizes = new Array(9).fill(22)
    const dice = makeDice(sizes)
    const handles = dice.map(d => d.handle)
    const cfg = DEFAULT_DICE_CONFIG
    const dt = 1 / 60
    const count = dice.length

    for (let roll = 1; roll <= 5; roll++) {
      dice.forEach((d, i) => startShake(d.state, i))
      const step = (phase: 'shaking' | 'freeroll') => {
        resolveDiePairs(handles, count)
        for (let i = 0; i < count; i++) {
          const d = dice[i]
          stepDie(d.state, cfg, BOX, phase, dt, roll * 1000 + i, d.handle.current)
          const h = d.handle.current, s = d.state
          h.px = s.px; h.py = s.py; h.pz = s.pz
          h.vx = s.vx; h.vy = s.vy; h.vz = s.vz
        }
      }
      for (let i = 0; i < Math.round(2.5 / dt); i++) step('shaking')
      for (let i = 0; i < Math.round(5 / dt); i++) step('freeroll')

      for (const d of dice) {
        const s = d.state
        const e = cubeExtents(s.q, s.half)
        expect(Number.isFinite(s.px) && Number.isFinite(s.py) && Number.isFinite(s.pz)).toBe(true)
        expect(s.py - e.ey).toBeGreaterThan(BOX.yBot - 1e-6)
        expect(s.py + e.ey).toBeLessThan(BOX.yTop + 1e-6)
        expect(Math.hypot(s.vx, s.vy, s.vz)).toBeLessThan(cfg.settleLinVel)
        expect(Math.hypot(s.wx, s.wy, s.wz)).toBeLessThan(cfg.settleAngVel)
      }
    }
  })
})
