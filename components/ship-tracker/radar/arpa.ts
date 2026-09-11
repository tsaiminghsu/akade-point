/**
 * ARPA computations: the collision-avoidance maths a real radar runs on every
 * confirmed track.
 *
 * All of it is pure so it can be unit-tested without a canvas or a clock.
 */

import {
  bearingDelta,
  knotsToNmPerSec,
  nmPerSecToKnots,
  normalizeDeg,
  polarToVec,
  relativeBearing,
  vecLen,
  vecToPolar,
} from './geo';
import type {
  AisReport,
  ArpaTarget,
  DangerLevel,
  GuardZone,
  OwnShip,
  RadarConfig,
  Track,
  Vec2,
} from './types';

export interface CpaResult {
  /** Closest point of approach in NM. */
  cpaNm: number;
  /** Seconds until the CPA. Negative when the CPA is already astern. */
  tcpaSec: number;
}

/**
 * Closest point of approach for two objects in uniform relative motion.
 *
 * `relPos` is target minus own ship in NM; `relVel` is target minus own ship
 * in NM per second. With zero relative velocity the range never changes, so
 * the CPA is the present range and the TCPA is meaningless (returned as
 * Infinity so callers can filter it out rather than alarm on a fixed echo).
 */
export function computeCpa(relPos: Vec2, relVel: Vec2): CpaResult {
  const vSq = relVel.x * relVel.x + relVel.y * relVel.y;
  const range = vecLen(relPos);

  if (vSq < 1e-14) {
    return { cpaNm: range, tcpaSec: Infinity };
  }

  const tcpaSec = -(relPos.x * relVel.x + relPos.y * relVel.y) / vSq;

  // Past the CPA the pair is opening, and the closest approach already
  // happened. Report the geometric CPA anyway, with a negative TCPA, so the
  // display can grey it out instead of alarming.
  const cx = relPos.x + relVel.x * tcpaSec;
  const cy = relPos.y + relVel.y * tcpaSec;

  return { cpaNm: Math.hypot(cx, cy), tcpaSec };
}

export interface BowCrossing {
  /** Range along own ship's head at which the target crosses, NM. */
  rangeNm: number;
  /** Seconds until that crossing. */
  timeSec: number;
}

/**
 * Where and when the target crosses own ship's heading line.
 *
 * Solves for the moment the target's across-track offset, measured in own
 * ship's head-up frame, reaches zero. A target on a parallel course never
 * crosses, which surfaces as NaN.
 */
export function computeBowCrossing(
  relPos: Vec2,
  targetVel: Vec2,
  ownHeading: number
): BowCrossing {
  const h = (ownHeading * Math.PI) / 180;
  const sin = Math.sin(h);
  const cos = Math.cos(h);

  // Rotate into own ship's frame: `across` is to starboard, `along` is ahead.
  const across = relPos.x * cos - relPos.y * sin;
  const alongVel = targetVel.x * sin + targetVel.y * cos;
  const acrossVel = targetVel.x * cos - targetVel.y * sin;

  if (Math.abs(acrossVel) < 1e-12) {
    return { rangeNm: NaN, timeSec: NaN };
  }

  const timeSec = -across / acrossVel;
  const along = relPos.x * sin + relPos.y * cos;

  return { rangeNm: along + alongVel * timeSec, timeSec };
}

/** Whether a bearing lies inside a guard sector, handling wrap past north. */
export function isInSector(relBearing: number, start: number, end: number): boolean {
  const b = normalizeDeg(relBearing);
  const s = normalizeDeg(start);
  const e = normalizeDeg(end);
  if (Math.abs(s - e) < 1e-9) return true; // A degenerate sector is all round.
  return s <= e ? b >= s && b <= e : b >= s || b <= e;
}

/** Whether a target currently sits inside the guard zone. */
export function isInGuardZone(
  rangeNm: number,
  relBearing: number,
  zone: GuardZone
): boolean {
  if (!zone.enabled) return false;
  if (rangeNm < zone.innerNm || rangeNm > zone.outerNm) return false;
  return isInSector(relBearing, zone.startRelBearing, zone.endRelBearing);
}

/**
 * Classify how dangerous a target is.
 *
 * `danger` needs a CPA inside the limit AND a TCPA that is both positive and
 * inside the limit: a target that will pass close but only in two hours is not
 * yet a threat, and one that already passed close is history. `warning` uses a
 * 1.5x envelope on both so the operator sees a situation developing before it
 * trips the alarm.
 */
export function classifyDanger(
  cpaNm: number,
  tcpaSec: number,
  cpaLimitNm: number,
  tcpaLimitMin: number
): DangerLevel {
  if (!Number.isFinite(tcpaSec) || tcpaSec < 0) return 'safe';
  const tcpaMin = tcpaSec / 60;
  if (cpaNm <= cpaLimitNm && tcpaMin <= tcpaLimitMin) return 'danger';
  if (cpaNm <= cpaLimitNm * 1.5 && tcpaMin <= tcpaLimitMin * 1.5) return 'warning';
  return 'safe';
}

/**
 * The oldest rule at sea: a bearing that does not change while the range
 * closes means a collision course. We read it off the track's own trail rather
 * than from the CPA maths, so it stays a genuine second opinion.
 */
export function hasSteadyBearing(
  trail: Array<Vec2 & { t: number }>,
  ownPos: Vec2,
  toleranceDeg = 1.5
): boolean {
  if (trail.length < 4) return false;
  const recent = trail.slice(-6);
  const first = recent[0];
  const last = recent[recent.length - 1];

  const b1 = vecToPolar({ x: first.x - ownPos.x, y: first.y - ownPos.y });
  const b2 = vecToPolar({ x: last.x - ownPos.x, y: last.y - ownPos.y });

  const closing = b2.range < b1.range - 0.02;
  const steady = Math.abs(bearingDelta(b1.bearing, b2.bearing)) <= toleranceDeg;

  return closing && steady;
}

/**
 * Turn one filtered track into the full ARPA readout for the bridge.
 *
 * `ownVec` and `ownVel` are own ship's position and velocity in the same
 * ground plane the track lives in, which is what makes true-motion vectors
 * and relative-motion vectors both fall out of the same state.
 */
export function buildTarget(
  track: Track,
  ownVec: Vec2,
  own: OwnShip,
  config: RadarConfig,
  ais?: AisReport
): ArpaTarget {
  const relPos: Vec2 = { x: track.x - ownVec.x, y: track.y - ownVec.y };
  const { bearing, range } = vecToPolar(relPos);

  const targetVel: Vec2 = { x: track.vx, y: track.vy };
  const ownVelPolar = polarToVec(own.cog, knotsToNmPerSec(own.sog));
  const relVel: Vec2 = {
    x: targetVel.x - ownVelPolar.x,
    y: targetVel.y - ownVelPolar.y,
  };

  const trueMotion = vecToPolar(targetVel);
  const relMotion = vecToPolar(relVel);
  const { cpaNm, tcpaSec } = computeCpa(relPos, relVel);
  const bow = computeBowCrossing(relPos, targetVel, own.heading);

  const relBearing = relativeBearing(bearing, own.heading);
  const inGuardZone = isInGuardZone(range, relBearing, config.guardZone);

  // A coasting or tentative track has not earned an alarm yet: its velocity
  // estimate is too raw to trust with a collision warning.
  const trusted = track.status === 'confirmed';
  const danger = trusted
    ? classifyDanger(cpaNm, tcpaSec, config.cpaLimitNm, config.tcpaLimitMin)
    : 'safe';

  return {
    trackId: track.id,
    status: track.status,
    x: track.x,
    y: track.y,
    rangeNm: range,
    bearing,
    relativeBearing: relBearing,
    cog: trueMotion.range > 1e-6 ? trueMotion.bearing : 0,
    sog: nmPerSecToKnots(trueMotion.range),
    relCourse: relMotion.range > 1e-6 ? relMotion.bearing : 0,
    relSpeed: nmPerSecToKnots(relMotion.range),
    cpaNm,
    tcpaSec,
    bowCrossRangeNm: bow.rangeNm,
    bowCrossTimeSec: bow.timeSec,
    danger,
    inGuardZone,
    steadyBearing: trusted && hasSteadyBearing(track.trail, ownVec),
    manoeuvring: track.manoeuvreHold > 0,
    ais,
    trail: track.trail,
    aisOnly: false,
  };
}

/**
 * Build the symbol for a vessel that AIS reports but radar has not detected —
 * too small, too fine on the bow, or lost in clutter. It gets the same CPA
 * treatment so the operator is not blind to it, but it is flagged `aisOnly`
 * so the display can draw it differently.
 */
export function buildAisOnlyTarget(
  report: AisReport,
  aisVec: Vec2,
  ownVec: Vec2,
  own: OwnShip,
  config: RadarConfig,
  syntheticId: number
): ArpaTarget {
  const relPos: Vec2 = { x: aisVec.x - ownVec.x, y: aisVec.y - ownVec.y };
  const { bearing, range } = vecToPolar(relPos);

  const targetVel = polarToVec(report.cog, knotsToNmPerSec(report.sog));
  const ownVel = polarToVec(own.cog, knotsToNmPerSec(own.sog));
  const relVel: Vec2 = { x: targetVel.x - ownVel.x, y: targetVel.y - ownVel.y };

  const relMotion = vecToPolar(relVel);
  const { cpaNm, tcpaSec } = computeCpa(relPos, relVel);
  const bow = computeBowCrossing(relPos, targetVel, own.heading);
  const relBearing = relativeBearing(bearing, own.heading);

  return {
    trackId: syntheticId,
    status: 'confirmed',
    x: aisVec.x,
    y: aisVec.y,
    rangeNm: range,
    bearing,
    relativeBearing: relBearing,
    cog: report.cog,
    sog: report.sog,
    relCourse: relMotion.range > 1e-6 ? relMotion.bearing : 0,
    relSpeed: nmPerSecToKnots(relMotion.range),
    cpaNm,
    tcpaSec,
    bowCrossRangeNm: bow.rangeNm,
    bowCrossTimeSec: bow.timeSec,
    danger: classifyDanger(cpaNm, tcpaSec, config.cpaLimitNm, config.tcpaLimitMin),
    inGuardZone: isInGuardZone(range, relBearing, config.guardZone),
    steadyBearing: false,
    manoeuvring: false,
    ais: report,
    trail: [],
    aisOnly: true,
  };
}
