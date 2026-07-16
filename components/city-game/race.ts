import type { RaceGate, RaceCourse, RaceSession, RacePhase } from './types';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── Gate crossing detection ────────────────────────────────────────────────────
// Uses signed-distance plane test. Gate normal = direction drone should fly through.
// Only counts crossing from back-face to front-face (correct direction).

export function checkGateCrossing(
  prevX: number, prevY: number, prevAlt: number,
  currX: number, currY: number, currAlt: number,
  gate: RaceGate,
): boolean {
  // Gate normal in 2D world space (the "forward through gate" direction)
  const nx = Math.sin(gate.yaw);
  const nz = -Math.cos(gate.yaw);  // z in world coords = -cos(yaw) for North=0

  // Signed distances to gate plane
  const dPrev = (prevX - gate.x) * nx + (prevY - gate.y) * nz;
  const dCurr = (currX - gate.x) * nx + (currY - gate.y) * nz;

  // Must cross from negative (behind gate) to positive (in front): correct direction
  if (!(dPrev < 0 && dCurr >= 0)) return false;

  // Interpolate crossing point
  const t = dPrev / (dPrev - dCurr);
  const ix = lerp(prevX, currX, t);
  const iy = lerp(prevY, currY, t);
  const iAlt = lerp(prevAlt, currAlt, t);

  // Gate-local horizontal axis (perpendicular to normal in 2D)
  const ax = Math.cos(gate.yaw);
  const az = Math.sin(gate.yaw);

  // Offset from gate center in world pixels, then convert to 3D units (×0.1)
  const localH = ((ix - gate.x) * ax + (iy - gate.y) * az) * 0.1;
  const localV = (iAlt - gate.altitude) * 0.1;

  return Math.abs(localH) <= gate.width / 2 && Math.abs(localV) <= gate.height / 2;
}

// Returns true if drone is inside the gate bounding volume but NOT in the opening.
// Used for frame-hit crash detection.
export function checkGateFrameHit(
  x: number, y: number, alt: number,
  gate: RaceGate,
): boolean {
  const nx = Math.sin(gate.yaw);
  const nz = -Math.cos(gate.yaw);
  const ax = Math.cos(gate.yaw);
  const az = Math.sin(gate.yaw);

  // Distance along gate normal (depth into gate zone)
  const depth = Math.abs((x - gate.x) * nx + (y - gate.y) * nz) * 0.1;
  if (depth > gate.thickness / 2 + 0.3) return false;  // not near gate plane

  const localH = ((x - gate.x) * ax + (y - gate.y) * az) * 0.1;
  const localV = (alt - gate.altitude) * 0.1;

  const halfW = gate.width / 2;
  const halfH = gate.height / 2;
  const frameHalfW = halfW + gate.thickness;
  const frameHalfH = halfH + gate.thickness;

  // Inside outer frame bounds
  const inOuter = Math.abs(localH) <= frameHalfW && Math.abs(localV) <= frameHalfH;
  // Inside inner opening
  const inOpening = Math.abs(localH) <= halfW && Math.abs(localV) <= halfH;

  return inOuter && !inOpening;
}

// ── Respawn ────────────────────────────────────────────────────────────────────

// Returns a safe position in front of a gate (i.e. drone is positioned to fly
// toward the gate in the correct direction).
export function getGateRespawnPos(gate: RaceGate): { x: number; y: number; altitude: number; angle: number } {
  // Place drone 80 world pixels behind gate (approaching from the correct direction)
  const APPROACH_DIST = 80;
  const nx = Math.sin(gate.yaw);
  const nz = -Math.cos(gate.yaw);
  return {
    x: gate.x - nx * APPROACH_DIST,
    y: gate.y - nz * APPROACH_DIST,
    altitude: gate.altitude,
    angle: gate.yaw,
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────────

export function formatRaceTime(seconds: number): string {
  if (seconds <= 0) return '0:00.000';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${m}:${String(Math.floor(s)).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${formatRaceTime(Math.abs(delta))}`;
}

// ── Session factory ────────────────────────────────────────────────────────────

export function createRaceSession(course: RaceCourse): RaceSession {
  return {
    courseId: course.id,
    phase: 'countdown',
    currentGateIndex: 0,
    currentLap: 1,
    totalLaps: course.totalLaps,
    startTime: 0,
    lapStartTime: 0,
    elapsedTime: 0,
    bestLap: 0,
    lapTimes: [],
    splitTimes: [],
    lastGateTime: 0,
    crashCount: 0,
    lastPassedGateIndex: -1,
    fpvMode: true,
    countdownValue: 3,
    countdownTimer: 1.0,
    boostActive: false,
    boostTimer: 0,
    boostCooldown: 0,
    cameraShake: 0,
    autoRespawnTimer: 0,
    respawnInvincTimer: 0,
    crashesAtCurrentGate: 0,
  };
}

// ── Main tick ──────────────────────────────────────────────────────────────────
// Mutates session in place — avoids per-frame object allocation / GC pressure.

export type RaceEvent = 'none' | 'gate' | 'lap' | 'finish' | 'crash' | 'respawn';

export function tickRace(
  session: RaceSession,
  prevX: number, prevY: number, prevAlt: number,
  currX: number, currY: number, currAlt: number,
  course: RaceCourse,
  dt: number,
  nowMs: number,
  boostInput: boolean,
  collisionDetected: boolean,
): RaceEvent {
  // ── Countdown phase ──────────────────────────────────────────────────────────
  if (session.phase === 'countdown') {
    session.countdownTimer -= dt;
    if (session.countdownTimer <= 0) {
      session.countdownValue -= 1;
      session.countdownTimer = 1.0;
      if (session.countdownValue <= 0) {
        session.phase = 'racing';
        session.startTime = nowMs;
        session.lapStartTime = nowMs;
        session.lastGateTime = nowMs;
      }
    }
    return 'none';
  }

  // ── Crash / auto-respawn ─────────────────────────────────────────────────────
  if (session.phase === 'crashed') {
    session.autoRespawnTimer -= dt;
    session.cameraShake = Math.max(0, session.cameraShake - dt);
    if (session.autoRespawnTimer <= 0) {
      // Crash loop protection: 3+ crashes at the same gate → step back to previous gate
      if (session.crashesAtCurrentGate >= 3 && session.currentGateIndex > 0) {
        session.currentGateIndex = Math.max(0, session.currentGateIndex - 1);
        session.lastPassedGateIndex = session.currentGateIndex - 1;
        session.crashesAtCurrentGate = 0;
      }
      session.phase = 'racing';
      return 'respawn';
    }
    return 'none';
  }

  // ── Finished phase ───────────────────────────────────────────────────────────
  if (session.phase === 'finished') {
    return 'none';
  }

  // ── Racing phase ─────────────────────────────────────────────────────────────
  session.elapsedTime = (nowMs - session.startTime) / 1000;
  session.cameraShake = Math.max(0, session.cameraShake - dt);
  session.respawnInvincTimer = Math.max(0, session.respawnInvincTimer - dt);

  // Boost timers
  if (session.boostActive) {
    session.boostTimer -= dt;
    if (session.boostTimer <= 0) {
      session.boostActive = false;
      session.boostTimer = 0;
      session.boostCooldown = 3.0;
    }
  }
  if (session.boostCooldown > 0) {
    session.boostCooldown -= dt;
    if (session.boostCooldown < 0) session.boostCooldown = 0;
  }
  if (boostInput && !session.boostActive && session.boostCooldown <= 0) {
    session.boostActive = true;
    session.boostTimer = 0.5;
  }

  // Collision and frame-hit detection — skipped during respawn invincibility window
  if (session.respawnInvincTimer <= 0) {
    if (collisionDetected) {
      session.phase = 'crashed';
      session.crashCount += 1;
      session.crashesAtCurrentGate += 1;
      session.cameraShake = 0.5;
      session.autoRespawnTimer = 2.0;
      return 'crash';
    }

    const frameCheckGate = course.gates[session.currentGateIndex];
    if (frameCheckGate && checkGateFrameHit(currX, currY, currAlt, frameCheckGate)) {
      session.phase = 'crashed';
      session.crashCount += 1;
      session.crashesAtCurrentGate += 1;
      session.cameraShake = 0.35;
      session.autoRespawnTimer = 2.0;
      return 'crash';
    }
  }

  // Gate crossing check — only tests current gate (no full-course scan)
  const currentGate = course.gates[session.currentGateIndex];
  if (currentGate && checkGateCrossing(prevX, prevY, prevAlt, currX, currY, currAlt, currentGate)) {
    session.splitTimes.push((nowMs - session.lapStartTime) / 1000);
    session.lastGateTime = nowMs;
    session.lastPassedGateIndex = session.currentGateIndex;
    session.currentGateIndex += 1;
    session.crashesAtCurrentGate = 0;

    if (session.currentGateIndex >= course.gates.length) {
      // Completed a lap
      const lapTime = (nowMs - session.lapStartTime) / 1000;
      session.lapTimes.push(lapTime);
      if (session.bestLap === 0 || lapTime < session.bestLap) session.bestLap = lapTime;

      if (session.currentLap >= session.totalLaps) {
        session.phase = 'finished';
        return 'finish';
      } else {
        session.currentLap += 1;
        session.currentGateIndex = 0;
        session.splitTimes.length = 0;  // truncate in place, no new array
        session.lapStartTime = nowMs;
        return 'lap';
      }
    }
    return 'gate';
  }

  return 'none';
}

// ── Star rating ────────────────────────────────────────────────────────────────

export function getRaceStars(session: RaceSession, course: RaceCourse): number {
  if (session.phase !== 'finished') return 0;
  const totalTime = session.lapTimes.reduce((a, b) => a + b, 0);
  if (session.crashCount === 0 && totalTime <= course.parTime) return 3;
  if (session.crashCount <= 2 && totalTime <= course.parTime * 1.5) return 2;
  return 1;
}
