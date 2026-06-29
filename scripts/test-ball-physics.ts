/**
 * Headless ball physics simulation using @dimforge/rapier3d-compat directly.
 * Validates that the physical model meets quality thresholds before shipping.
 *
 * Run with: npx tsx scripts/test-ball-physics.ts
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsLoss, type Metrics } from "../lib/ball-physics-metrics";

// ── Constants (must mirror BallMachineGame.tsx) ────────────────────────────
const BALL_R       = 0.42;
const FLOOR_T      = 0.18;
const WALL_T       = 0.07;
const CONTAINER_H  = 3.2;
const HOLE_SPACING = 1.1;
const GRID_COLS    = 5;
const GRID_ROWS    = 5;

const FLOOR_Y          = FLOOR_T + BALL_R;
const CONTACT_THRESHOLD = BALL_R * 1.25;
const BASE_JUMP_IMPULSE = 3.5;
const VIB_JUMP_IMPULSE  = 1.5;
const HORIZ_RATIO       = 0.38;
const GROOVE_FORCE      = 1.5;
const CELL_RADIUS       = HOLE_SPACING * 0.52;

// Container dimensions
const SIDE = GRID_COLS * HOLE_SPACING + 1.4;
const W = SIDE;
const D = SIDE;
const H = CONTAINER_H;

function seededRng(seed: number, n: number): number {
  return Math.abs(Math.sin(seed * 9301 + n * 49297 + 233) % 1);
}

function holePositions(): [number, number, number][] {
  const result: [number, number, number][] = [];
  const holeY = FLOOR_T + BALL_R;
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      result.push([
        (c - (GRID_COLS - 1) / 2) * HOLE_SPACING,
        holeY,
        (r - (GRID_ROWS - 1) / 2) * HOLE_SPACING,
      ]);
  return result;
}

interface RunResult {
  metrics: Metrics;
  loss: number;
  holeOccupancy: number[];
}

async function runSimulation(seed: number, numBalls: number, settings: {
  restitution: number;
  bounceStrength: number;
  gravity: number;
  kickStrength: number;
}): Promise<RunResult> {
  const world = new RAPIER.World({ x: 0, y: -9.81 * settings.gravity, z: 0 });

  // ── Static colliders: floor, 4 walls, lid ─────────────────────────────
  const fixedDesc = RAPIER.RigidBodyDesc.fixed();
  const fixed = world.createRigidBody(fixedDesc);

  const addBox = (hx: number, hy: number, hz: number, tx: number, ty: number, tz: number) => {
    const cd = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(tx, ty, tz)
      .setRestitution(0.35)
      .setFriction(0.7);
    world.createCollider(cd, fixed);
  };

  addBox(W / 2, FLOOR_T / 2, D / 2,         0, FLOOR_T / 2, 0);             // floor
  addBox(W / 2, H / 2, WALL_T / 2,           0, H / 2, -D / 2 + WALL_T / 2); // back
  addBox(W / 2, H / 2, WALL_T / 2,           0, H / 2,  D / 2 - WALL_T / 2); // front
  addBox(WALL_T / 2, H / 2, D / 2,  -W / 2 + WALL_T / 2, H / 2, 0);          // left
  addBox(WALL_T / 2, H / 2, D / 2,   W / 2 - WALL_T / 2, H / 2, 0);          // right
  addBox(W / 2, WALL_T / 2, D / 2,           0, H - WALL_T / 2, 0);           // lid

  // ── Dynamic balls ───────────────────────────────────────────────────────
  const holes = holePositions();
  const ballBodies: RAPIER.RigidBody[] = [];
  const ballPositions: [number, number][] = []; // initial (row, col) — just for seeding start

  for (let i = 0; i < numBalls; i++) {
    const row = Math.floor(i / GRID_COLS);
    const col = i % GRID_COLS;
    ballPositions.push([row, col]);

    const [hx, hy, hz] = holes[i] ?? [0, FLOOR_Y, 0];
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(hx, hy, hz)
      .setLinvel(0, 0, 0)
      .setLinearDamping(0.12)
      .setAngularDamping(0.28);

    const body = world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.ball(BALL_R)
      .setRestitution(settings.restitution)
      .setFriction(0.7)
      .setDensity(1 / ((4 / 3) * Math.PI * BALL_R ** 3)); // gives mass ≈ 1
    world.createCollider(cd, body);

    // Start disabled (like ready phase)
    body.setEnabled(false);
    ballBodies.push(body);
  }

  // ── Metrics accumulators ───────────────────────────────────────────────
  const peakHeights: number[] = new Array(numBalls).fill(FLOOR_Y);
  const prevY: number[] = ballBodies.map((b) => b.translation().y);
  const kickCooldowns: number[] = new Array(numBalls).fill(0);
  let totalKicks = 0;
  let airborneKicks = 0;
  let totalDistanceTraveled = 0;
  let totalSpin = 0;
  const prevPos: RAPIER.Vector3[] = ballBodies.map((b) => ({ ...b.translation() }));
  const prevRot: RAPIER.Quaternion[] = ballBodies.map((b) => ({ ...b.rotation() }));

  // Collision event handling
  let totalCollisions = 0;
  const eventQueue = new RAPIER.EventQueue(true);

  const DT = 1 / 60;
  // Phase durations (in steps)
  const VIBRATE_STEPS = Math.round(900 / 1000 / DT);   // 900ms
  const JUMP_STEPS    = Math.round(2400 / 1000 / DT);  // 2400ms
  const SETTLE_STEPS  = Math.round(1600 / 1000 / DT);  // 1600ms
  const TOTAL_STEPS   = VIBRATE_STEPS + JUMP_STEPS + SETTLE_STEPS;

  let settleStartStep = -1;
  let firstSettledStep = -1;

  for (let step = 0; step < TOTAL_STEPS; step++) {
    const t = step * DT;
    const isVibrating = step < VIBRATE_STEPS;
    const isJumping   = step >= VIBRATE_STEPS && step < VIBRATE_STEPS + JUMP_STEPS;
    const isSettling  = step >= VIBRATE_STEPS + JUMP_STEPS;

    if (isVibrating && step === 0) {
      // Enable all balls at start of vibrating
      ballBodies.forEach((b) => b.setEnabled(true));
    }
    if (isSettling && settleStartStep < 0) {
      settleStartStep = step;
    }

    // Apply impulses and forces
    for (let i = 0; i < numBalls; i++) {
      const body = ballBodies[i];
      if (!body.isEnabled()) continue;

      kickCooldowns[i] -= DT;
      const pos = body.translation();

      if ((isVibrating || isJumping) && kickCooldowns[i] <= 0) {
        const onFloor = pos.y <= FLOOR_Y + CONTACT_THRESHOLD;
        const isAirborne = !onFloor;

        const s = seed * 100 + i * 13 + step;
        const gFactor = Math.sqrt(Math.max(0.3, settings.gravity));
        let impulseY: number;
        if (isVibrating) {
          impulseY = VIB_JUMP_IMPULSE * settings.bounceStrength * gFactor
            * (0.7 + seededRng(s, 1) * 0.6);
        } else {
          impulseY = BASE_JUMP_IMPULSE * settings.bounceStrength * settings.kickStrength * gFactor
            * (0.8 + seededRng(s, 2) * 0.4);
        }

        if (onFloor) {
          const horizScale = impulseY * HORIZ_RATIO;
          body.applyImpulse(
            {
              x: (seededRng(s, 3) - 0.5) * 2 * horizScale,
              y: impulseY,
              z: (seededRng(s, 4) - 0.5) * 2 * horizScale,
            },
            true,
          );
          kickCooldowns[i] = 0.16 + seededRng(s, 5) * 0.18;
          totalKicks++;
          if (isAirborne) airborneKicks++;
        }
      }

      // Groove force during settling
      if (isSettling && pos.y <= FLOOR_Y + BALL_R * 2.0) {
        let nearestDist = Infinity;
        let nearestHole = holes[0];
        for (const hp of holes) {
          const dx = pos.x - hp[0];
          const dz = pos.z - hp[2];
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < nearestDist) { nearestDist = d; nearestHole = hp; }
        }
        if (nearestDist < CELL_RADIUS) {
          const strength = GROOVE_FORCE * (1 - nearestDist / CELL_RADIUS);
          const dx = nearestHole[0] - pos.x;
          const dz = nearestHole[2] - pos.z;
          const len = Math.sqrt(dx * dx + dz * dz) + 1e-6;
          body.addForce({ x: (dx / len) * strength, y: 0, z: (dz / len) * strength }, true);
        }
      }

      // Track peak height
      if (pos.y > peakHeights[i]) peakHeights[i] = pos.y;

      // Accumulate travel distance and spin
      const pp = prevPos[i];
      const dx = pos.x - pp.x, dy = pos.y - pp.y, dz = pos.z - pp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      totalDistanceTraveled += dist;

      const rot = body.rotation();
      const pr  = prevRot[i];
      const dqx = rot.x - pr.x, dqy = rot.y - pr.y, dqz = rot.z - pr.z, dqw = rot.w - pr.w;
      const dRot = Math.sqrt(dqx * dqx + dqy * dqy + dqz * dqz + dqw * dqw) * 2;
      totalSpin += dRot;

      prevPos[i] = { ...pos };
      prevRot[i] = { ...rot };
      prevY[i] = pos.y;
    }

    world.step(eventQueue);

    eventQueue.drainContactForceEvents(() => { totalCollisions++; });

    // Check if settled
    if (isSettling && firstSettledStep < 0) {
      let allSlow = true;
      for (const body of ballBodies) {
        const vel = body.linvel();
        const spd = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
        if (spd > 0.08) { allSlow = false; break; }
      }
      if (allSlow) firstSettledStep = step;
    }
  }

  // ── Compute final hole occupancy ────────────────────────────────────────
  const occupancy = new Array<number>(holes.length).fill(0);
  let maxPenetration = 0;

  for (let i = 0; i < numBalls; i++) {
    const pos = ballBodies[i].translation();
    let nearestIdx = 0;
    let minDist = Infinity;
    holes.forEach(([hx, , hz], idx) => {
      const d = Math.sqrt((pos.x - hx) ** 2 + (pos.z - hz) ** 2);
      if (d < minDist) { minDist = d; nearestIdx = idx; }
    });
    occupancy[nearestIdx]++;

    // Check penetration with other balls
    for (let j = i + 1; j < numBalls; j++) {
      const p2 = ballBodies[j].translation();
      const dx = pos.x - p2.x, dy = pos.y - p2.y, dz = pos.z - p2.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const penetration = Math.max(0, 2 * BALL_R - dist);
      if (penetration > maxPenetration) maxPenetration = penetration;
    }
  }

  // ── Compute metrics ────────────────────────────────────────────────────
  const peakAboveFloor = peakHeights.map((h) => h - FLOOR_Y);
  const avgPeakHeight = peakAboveFloor.reduce((a, b) => a + b, 0) / numBalls;
  const variance = peakAboveFloor.reduce((a, h) => a + (h - avgPeakHeight) ** 2, 0) / numBalls;
  const stdDev = Math.sqrt(variance);

  // Chi-square uniformity: expected ~numBalls/holes balls per hole
  const expectedPerHole = numBalls / holes.length;
  const chiSq = occupancy.reduce((sum, n) => sum + (n - expectedPerHole) ** 2 / expectedPerHole, 0);
  const chiSqNorm = chiSq / holes.length;

  const settleTimeSteps = firstSettledStep >= 0
    ? firstSettledStep - (settleStartStep >= 0 ? settleStartStep : 0)
    : SETTLE_STEPS;
  const avgSettleTime = settleTimeSteps * DT;

  const metrics: Metrics = {
    airborneImpulseRatio: totalKicks > 0 ? airborneKicks / totalKicks : 0,
    avgPeakHeightR: avgPeakHeight / BALL_R,
    peakHeightCv: avgPeakHeight > 0 ? stdDev / avgPeakHeight : 0,
    avgCollisionsPerBall: numBalls > 0 ? totalCollisions / numBalls : 0,
    holeChiSquareNorm: chiSqNorm,
    avgSettleTime,
    maxPenetrationR: maxPenetration / BALL_R,
    avgSpinPerMeter: totalDistanceTraveled > 0 ? totalSpin / totalDistanceTraveled : 0,
  };

  // Cleanup
  world.free();

  return { metrics, loss: physicsLoss(metrics), holeOccupancy: occupancy };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  await RAPIER.init();

  const NUM_RUNS  = 5;
  const NUM_BALLS = 15; // 3 colors × 5 per color
  const settings  = { restitution: 0.62, bounceStrength: 1.0, gravity: 1.0, kickStrength: 1.0 };

  console.log("=== Ball Physics Simulation Test ===");
  console.log(`Settings: ${JSON.stringify(settings)}`);
  console.log(`Balls: ${NUM_BALLS}, Runs: ${NUM_RUNS}\n`);

  let allPassed = true;
  const LOSS_THRESHOLD = 5.0;

  for (let run = 0; run < NUM_RUNS; run++) {
    const seed = run * 1337 + 42;
    const { metrics, loss } = await runSimulation(seed, NUM_BALLS, settings);
    const passed = loss <= LOSS_THRESHOLD;
    if (!passed) allPassed = false;

    console.log(`Run ${run + 1} (seed=${seed}):`);
    console.log(`  airborneImpulseRatio : ${metrics.airborneImpulseRatio.toFixed(3)}  [target: 0]`);
    console.log(`  avgPeakHeightR       : ${metrics.avgPeakHeightR.toFixed(3)}  [target: 0.8–2.5]`);
    console.log(`  peakHeightCv         : ${metrics.peakHeightCv.toFixed(3)}  [target: ≥0.25]`);
    console.log(`  avgCollisionsPerBall : ${metrics.avgCollisionsPerBall.toFixed(3)}  [target: ≥1.0]`);
    console.log(`  holeChiSquareNorm    : ${metrics.holeChiSquareNorm.toFixed(3)}  [target: ≤2.0]`);
    console.log(`  avgSettleTime        : ${metrics.avgSettleTime.toFixed(3)}s [target: 1.0–3.5]`);
    console.log(`  maxPenetrationR      : ${metrics.maxPenetrationR.toFixed(3)}  [target: ≤0.05]`);
    console.log(`  avgSpinPerMeter      : ${metrics.avgSpinPerMeter.toFixed(3)}  [target: >0.5]`);
    console.log(`  physicsLoss          : ${loss.toFixed(3)} ${passed ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  if (!allPassed) {
    console.error("One or more runs exceeded physicsLoss threshold of", LOSS_THRESHOLD);
    process.exit(1);
  } else {
    console.log("All runs passed!");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
