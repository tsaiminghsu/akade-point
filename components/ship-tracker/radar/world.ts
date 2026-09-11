/**
 * The simulated world: Kaohsiung harbour approaches.
 *
 * Vessel names and MMSIs are the genuine ones captured in backend/ais_data.json
 * on 2025-10-14. That snapshot is a frozen picture — every record in it has a
 * speed of zero — so this module keeps the identities and the port geography
 * and replaces the static positions with a traffic model: ships steering routes
 * through the two harbour entrances, tugs working the fairway, a fishing fleet
 * milling about, and vessels swinging at anchor.
 *
 * The coastline matters as much as the traffic. Radar cannot see through land,
 * so the Cijin sandbar masks the inner harbour, and the ships behind it show up
 * only on AIS. That split is the reason a real bridge watches both.
 */

import { destinationPoint, haversineNm, initialBearing, normalizeDeg, turnToward } from './geo';
import type { AisReport, LatLon, NavStatus, OwnShip, Vessel, VesselKind } from './types';

/** Scene anchor for the local plane. Chosen near own ship's start position. */
export const SCENE_ORIGIN: LatLon = { lat: 22.595, lon: 120.23 };

export const DEFAULT_OWN_SHIP: OwnShip = {
  pos: { lat: 22.595, lon: 120.23 },
  heading: 70,
  cog: 70,
  sog: 8,
  rot: 0,
  orderedCourse: 70,
  orderedSpeed: 8,
};

// ── Navigation waypoints ──────────────────────────────────────────

const WP = {
  offshoreNW: { lat: 22.678, lon: 120.198 },
  offshoreW: { lat: 22.596, lon: 120.168 },
  offshoreSW: { lat: 22.492, lon: 120.212 },
  entrance1Approach: { lat: 22.6265, lon: 120.2475 },
  entrance1: { lat: 22.6155, lon: 120.2665 },
  innerNorth: { lat: 22.609, lon: 120.279 },
  innerMid: { lat: 22.596, lon: 120.29 },
  innerSouth: { lat: 22.57, lon: 120.305 },
  entrance2: { lat: 22.546, lon: 120.313 },
  entrance2Approach: { lat: 22.528, lon: 120.294 },
  anchorageA: { lat: 22.5545, lon: 120.2385 },
  anchorageB: { lat: 22.5665, lon: 120.2255 },
  fishingGroundN: { lat: 22.632, lon: 120.222 },
  fishingGroundS: { lat: 22.556, lon: 120.2625 },
} satisfies Record<string, LatLon>;

/**
 * Coastline, as polylines in the order a chart would draw them.
 *
 * These approximate the Cijin sandbar, the Gushan shore north of harbour
 * entrance No.1, the Linyuan shore south of entrance No.2, and the wharf line
 * inside the harbour. They serve two purposes: they block radar line of sight,
 * and they paint as land echo on the scope.
 */
export const COASTLINE: LatLon[][] = [
  // Cijin sandbar, seaward side, running NW to SE.
  [
    { lat: 22.6205, lon: 120.2635 },
    { lat: 22.6155, lon: 120.266 },
    { lat: 22.605, lon: 120.2705 },
    { lat: 22.59, lon: 120.279 },
    { lat: 22.575, lon: 120.289 },
    { lat: 22.562, lon: 120.299 },
    { lat: 22.55, lon: 120.309 },
    { lat: 22.544, lon: 120.314 },
  ],
  // Gushan and Xiziwan shore, north of entrance No.1.
  [
    { lat: 22.622, lon: 120.2605 },
    { lat: 22.628, lon: 120.264 },
    { lat: 22.64, lon: 120.267 },
    { lat: 22.655, lon: 120.27 },
    { lat: 22.672, lon: 120.272 },
    { lat: 22.69, lon: 120.276 },
  ],
  // Linyuan shore, south of entrance No.2.
  [
    { lat: 22.5405, lon: 120.318 },
    { lat: 22.525, lon: 120.326 },
    { lat: 22.51, lon: 120.335 },
    { lat: 22.495, lon: 120.3455 },
  ],
  // Inner harbour wharf line, on the mainland side.
  [
    { lat: 22.619, lon: 120.276 },
    { lat: 22.61, lon: 120.283 },
    { lat: 22.598, lon: 120.293 },
    { lat: 22.585, lon: 120.302 },
    { lat: 22.57, lon: 120.311 },
    { lat: 22.556, lon: 120.319 },
    { lat: 22.545, lon: 120.321 },
  ],
];

// ── Line-of-sight masking ─────────────────────────────────────────

function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Whether land blocks the radar's view from `from` to `to`.
 *
 * Works in raw degrees rather than the projected plane: at these latitudes the
 * shear is a constant factor on one axis, which cannot change whether two
 * segments cross.
 */
export function isLineOfSightBlocked(from: LatLon, to: LatLon, coast = COASTLINE): boolean {
  for (const line of coast) {
    for (let i = 0; i < line.length - 1; i += 1) {
      if (
        segmentsIntersect(
          from.lon, from.lat, to.lon, to.lat,
          line[i].lon, line[i].lat, line[i + 1].lon, line[i + 1].lat
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

// ── Vessel classes ────────────────────────────────────────────────

interface KindProfile {
  /** Maximum rate of turn, degrees per minute. */
  maxRot: number;
  /** Radar cross-section factor. */
  rcs: number;
  /** How hard the vessel accelerates back to cruise speed, knots per minute. */
  accel: number;
}

const KIND_PROFILE: Record<VesselKind, KindProfile> = {
  container: { maxRot: 12, rcs: 1, accel: 0.4 },
  tanker: { maxRot: 9, rcs: 0.95, accel: 0.3 },
  bulker: { maxRot: 10, rcs: 0.9, accel: 0.35 },
  cargo: { maxRot: 16, rcs: 0.7, accel: 0.6 },
  tug: { maxRot: 45, rcs: 0.3, accel: 2.5 },
  pilot: { maxRot: 60, rcs: 0.18, accel: 4 },
  patrol: { maxRot: 50, rcs: 0.35, accel: 3 },
  fishing: { maxRot: 40, rcs: 0.16, accel: 2 },
};

interface VesselSeed {
  mmsi: string;
  name: string;
  kind: VesselKind;
  lengthM: number;
  start: LatLon;
  cog: number;
  sog: number;
  navStatus: NavStatus;
  destination: string;
  route: LatLon[];
  aisEnabled?: boolean;
}

/**
 * The scene.
 *
 * Identities come from the real capture; roles, routes and speeds are assigned
 * here to produce a harbour approach worth watching. One vessel is set on a
 * genuine crossing course with own ship's default track so the collision
 * warning has something real to find, and two fishing boats run dark to show
 * what a radar-only contact looks like next to an AIS-identified one.
 */
const SEEDS: VesselSeed[] = [
  // Deep-sea traffic in the approaches.
  {
    mmsi: '563113200', name: 'WAN HAI 322', kind: 'container', lengthM: 172,
    start: { lat: 22.5905, lon: 120.1745 }, cog: 72, sog: 13, navStatus: 'underway',
    destination: 'KAOHSIUNG', route: [WP.offshoreW, WP.entrance1Approach, WP.entrance1, WP.innerNorth],
  },
  {
    // Crossing own ship from the starboard bow. This is the target the ARPA
    // alarm is meant to catch.
    mmsi: '354810000', name: 'CHINA STEEL VISION', kind: 'bulker', lengthM: 225,
    start: { lat: 22.5672, lon: 120.2793 }, cog: 340, sog: 10, navStatus: 'underway',
    destination: 'TAICHUNG', route: [{ lat: 22.648, lon: 120.2385 }, WP.offshoreNW],
  },
  {
    mmsi: '636017164', name: 'ARKADIA', kind: 'tanker', lengthM: 183,
    start: { lat: 22.663, lon: 120.2085 }, cog: 200, sog: 11.5, navStatus: 'underway',
    destination: 'SINGAPORE', route: [WP.offshoreSW, { lat: 22.47, lon: 120.19 }],
  },
  {
    mmsi: '413161000', name: 'XIN YA ZHOU', kind: 'cargo', lengthM: 138,
    start: { lat: 22.5075, lon: 120.2705 }, cog: 40, sog: 9, navStatus: 'underway',
    destination: 'KAOHSIUNG', route: [WP.entrance2Approach, WP.entrance2, WP.innerSouth],
  },
  {
    mmsi: '352898799', name: 'FUJI HARMONY', kind: 'container', lengthM: 165,
    start: { lat: 22.6115, lon: 120.2745 }, cog: 250, sog: 7, navStatus: 'underway',
    destination: 'HONG KONG', route: [WP.entrance1, WP.entrance1Approach, WP.offshoreW],
  },
  {
    mmsi: '352978214', name: 'HOUEI EMBRACE', kind: 'cargo', lengthM: 119,
    start: { lat: 22.5385, lon: 120.2065 }, cog: 15, sog: 10, navStatus: 'underway',
    destination: 'KEELUNG', route: [WP.offshoreNW, { lat: 22.72, lon: 120.19 }],
  },
  {
    mmsi: '373280000', name: 'PACIFIC MARU', kind: 'tanker', lengthM: 176,
    start: { lat: 22.6395, lon: 120.1795 }, cog: 130, sog: 8.5, navStatus: 'underway',
    destination: 'KAOHSIUNG', route: [WP.entrance1Approach, WP.entrance1, WP.innerNorth],
  },
  {
    mmsi: '312030000', name: 'UNITED EARNING', kind: 'cargo', lengthM: 152,
    start: { lat: 22.5205, lon: 120.2455 }, cog: 355, sog: 6, navStatus: 'underway',
    destination: 'ANCHORAGE', route: [WP.anchorageA, WP.anchorageB],
  },

  // Waiting at anchor off the port.
  {
    mmsi: '312234000', name: 'GREAT GLORY', kind: 'bulker', lengthM: 158,
    start: { lat: 22.5555, lon: 120.2375 }, cog: 35, sog: 0.2, navStatus: 'anchored',
    destination: 'KAOHSIUNG', route: [],
  },
  {
    mmsi: '636020685', name: 'GEMINI HONOR', kind: 'bulker', lengthM: 190,
    start: { lat: 22.5665, lon: 120.2245 }, cog: 55, sog: 0.2, navStatus: 'anchored',
    destination: 'KAOHSIUNG', route: [],
  },
  {
    mmsi: '477124700', name: 'LIANGDA', kind: 'cargo', lengthM: 128,
    start: { lat: 22.5475, lon: 120.2255 }, cog: 20, sog: 0.15, navStatus: 'anchored',
    destination: 'KAOHSIUNG', route: [],
  },
  {
    mmsi: '677011100', name: 'HAI FA', kind: 'cargo', lengthM: 112,
    start: { lat: 22.5765, lon: 120.2105 }, cog: 70, sog: 0.2, navStatus: 'anchored',
    destination: 'KAOHSIUNG', route: [],
  },

  // Harbour service craft working the fairway.
  {
    mmsi: '416004824', name: 'TA CHUNG', kind: 'tug', lengthM: 34,
    start: { lat: 22.6185, lon: 120.2585 }, cog: 300, sog: 7, navStatus: 'underway',
    destination: 'TOWAGE', route: [WP.entrance1Approach, WP.entrance1, { lat: 22.6215, lon: 120.2585 }],
  },
  {
    mmsi: '416006752', name: 'TA YU', kind: 'tug', lengthM: 31,
    start: { lat: 22.6095, lon: 120.2585 }, cog: 60, sog: 6.5, navStatus: 'underway',
    destination: 'TOWAGE', route: [WP.entrance1, WP.entrance1Approach, { lat: 22.6045, lon: 120.2515 }],
  },
  {
    mmsi: '416004697', name: 'KAO 505', kind: 'pilot', lengthM: 19,
    start: { lat: 22.6225, lon: 120.2425 }, cog: 240, sog: 14, navStatus: 'underway',
    destination: 'PILOT STATION', route: [{ lat: 22.6045, lon: 120.2265 }, WP.entrance1Approach],
  },
  {
    mmsi: '416005000', name: 'CG-131 MIAOLI', kind: 'patrol', lengthM: 61,
    start: { lat: 22.5825, lon: 120.2515 }, cog: 165, sog: 12, navStatus: 'underway',
    destination: 'PATROL', route: [
      { lat: 22.545, lon: 120.265 }, { lat: 22.535, lon: 120.225 },
      { lat: 22.6, lon: 120.2, }, { lat: 22.645, lon: 120.235 },
    ],
  },

  // The fishing fleet. Two of them transmit nothing.
  {
    mmsi: '416005452', name: 'CHUNG YU NO.22', kind: 'fishing', lengthM: 26,
    start: { lat: 22.6125, lon: 120.2265 }, cog: 190, sog: 5.5, navStatus: 'fishing',
    destination: 'FISHING', route: [WP.fishingGroundS, { lat: 22.578, lon: 120.2355 }, WP.fishingGroundN],
  },
  {
    mmsi: '416007984', name: 'SEAGREEN NO.5', kind: 'fishing', lengthM: 22,
    start: { lat: 22.5845, lon: 120.2445 }, cog: 285, sog: 6, navStatus: 'fishing',
    destination: '', aisEnabled: false,
    route: [{ lat: 22.5925, lon: 120.2145 }, { lat: 22.616, lon: 120.2355 }, { lat: 22.5745, lon: 120.2565 }],
  },
  {
    mmsi: '416008865', name: 'TRITON 8', kind: 'fishing', lengthM: 20,
    start: { lat: 22.5525, lon: 120.2585 }, cog: 20, sog: 5, navStatus: 'fishing',
    destination: 'FISHING', route: [WP.fishingGroundN, WP.fishingGroundS],
  },
  {
    mmsi: '416241500', name: 'AN FONG NO.116', kind: 'fishing', lengthM: 24,
    start: { lat: 22.6055, lon: 120.2045 }, cog: 110, sog: 6.5, navStatus: 'fishing',
    destination: '', aisEnabled: false,
    route: [{ lat: 22.5885, lon: 120.2455 }, { lat: 22.5645, lon: 120.2145 }, { lat: 22.622, lon: 120.198 }],
  },
  {
    mmsi: '416005507', name: 'YUNG AN NO.16', kind: 'fishing', lengthM: 27,
    start: { lat: 22.5335, lon: 120.2455 }, cog: 300, sog: 5.8, navStatus: 'fishing',
    destination: 'FISHING', route: [{ lat: 22.5555, lon: 120.2005 }, { lat: 22.512, lon: 120.226 }],
  },
  {
    mmsi: '416002224', name: 'CHI GU NO.1', kind: 'fishing', lengthM: 18,
    start: { lat: 22.6425, lon: 120.2545 }, cog: 235, sog: 4.5, navStatus: 'fishing',
    destination: 'FISHING', route: [{ lat: 22.6215, lon: 120.2145 }, { lat: 22.658, lon: 120.2385 }],
  },

  // Alongside inside the harbour. Cijin masks these from the radar, so they
  // reach the display on AIS alone.
  ...([
    ['510067000', 'MICRONESIA 101', 148, 22.612965, 120.272543],
    ['553111992', 'VIVA LION 707', 96, 22.613455, 120.271898],
    ['553111740', 'WINBEST707', 92, 22.613502, 120.271997],
    ['677079500', 'HE DA', 134, 22.609103, 120.28228],
    ['416005438', 'SOLARIS', 88, 22.609403, 120.273358],
    ['416435000', 'POLARIS', 84, 22.609242, 120.273352],
    ['416460000', 'DER YUN', 106, 22.613937, 120.286862],
    ['416088000', 'GEO POWER', 118, 22.615628, 120.27811],
    ['636024994', 'SALVAGE VANGUARD', 76, 22.61187, 120.272178],
    ['416004998', 'WU ZHOU CHUANG YUAN', 122, 22.609563, 120.295273],
    ['416015466', 'KMSC NO.903', 64, 22.606817, 120.28372],
    ['354683000', 'EITA MARU', 142, 22.574117, 120.301633],
  ] as const).map(
    ([mmsi, name, lengthM, lat, lon]): VesselSeed => ({
      mmsi,
      name,
      kind: 'cargo',
      lengthM,
      start: { lat, lon },
      cog: 0,
      sog: 0,
      navStatus: 'moored',
      destination: 'KAOHSIUNG',
      route: [],
    })
  ),
];

/**
 * Build the initial fleet. Call it again to reset the scenario.
 *
 * `rand` is injected so a given engine seed always reproduces the same scene,
 * which is what makes the simulation testable.
 */
export function createFleet(now: number, rand: () => number = Math.random): Vessel[] {
  return SEEDS.map((s) => {
    const vessel: Vessel = {
      mmsi: s.mmsi,
      name: s.name,
      kind: s.kind,
      lengthM: s.lengthM,
      pos: { ...s.start },
      cog: s.cog,
      sog: s.sog,
      heading: s.cog,
      rot: 0,
      navStatus: s.navStatus,
      destination: s.destination,
      rcs: KIND_PROFILE[s.kind].rcs * (0.6 + Math.min(1, s.lengthM / 200) * 0.6),
      aisEnabled: s.aisEnabled ?? true,
      route: s.route.map((p) => ({ ...p })),
      legIndex: 0,
      cruiseSog: s.sog,
      swingPhase: rand() * Math.PI * 2,
      lastAisTx: now,
    };

    // Back-date the last transmission so every vessel reports inside the first
    // few seconds, staggered. Without this the moored and anchored ships, which
    // broadcast only every three minutes, are missing from the picture for the
    // first three minutes after the receiver is switched on.
    vessel.lastAisTx = now - aisIntervalMs(vessel) + rand() * 2500;
    return vessel;
  });
}

// ── Motion model ──────────────────────────────────────────────────

const WAYPOINT_ARRIVAL_NM = 0.09;

/**
 * Advance one vessel by `dtSec`.
 *
 * Mutates in place, because this runs on the whole fleet every animation frame
 * and allocating a fresh object per vessel per frame is waste the tracker loop
 * cannot afford.
 */
export function stepVessel(v: Vessel, dtSec: number, rand: () => number): void {
  if (v.navStatus === 'moored') {
    v.sog = 0;
    v.rot = 0;
    return;
  }

  if (v.navStatus === 'anchored') {
    // A ship at anchor swings around its cable with the tide rather than
    // holding a heading, and creeps at a few tenths of a knot doing it.
    v.swingPhase += dtSec * 0.0055;
    v.heading = normalizeDeg(v.cog + Math.sin(v.swingPhase) * 38);
    v.sog = 0.12 + Math.abs(Math.cos(v.swingPhase)) * 0.18;
    const drift = normalizeDeg(v.heading + 90);
    v.pos = destinationPoint(v.pos, drift, (v.sog * dtSec) / 3600);
    return;
  }

  const profile = KIND_PROFILE[v.kind];

  // Steer for the active waypoint, advancing the leg on arrival.
  if (v.route.length > 0) {
    const target = v.route[v.legIndex % v.route.length];
    if (haversineNm(v.pos, target) < WAYPOINT_ARRIVAL_NM) {
      v.legIndex = (v.legIndex + 1) % v.route.length;
    }
    const desired = initialBearing(v.pos, v.route[v.legIndex % v.route.length]);

    // Fishing boats wander while working; everyone else steers a clean course.
    //
    // The wander has to be a slow drift, not per-frame noise. Resampling it
    // every frame produced a course demand that jumped further each tick than
    // the vessel could physically turn, so the boats sat pinned at their
    // maximum rate of turn permanently, zigzagging, and the tracker could never
    // settle on a velocity for them. A smooth sinusoid over roughly two minutes
    // reads as a boat working a ground, and it is frame-rate independent.
    let wander = 0;
    if (v.navStatus === 'fishing') {
      v.swingPhase += dtSec * 0.05;
      wander = Math.sin(v.swingPhase) * 12 + Math.sin(v.swingPhase * 2.7) * 5;
    }
    const maxTurn = (profile.maxRot * dtSec) / 60;
    const next = turnToward(v.cog, normalizeDeg(desired + wander), maxTurn);
    v.rot = ((next - v.cog + 540) % 360) - 180;
    v.rot = (v.rot / dtSec) * 60;
    v.cog = next;
  }

  // Ease back toward service speed, with a little sea-state jitter.
  const speedDelta = (profile.accel * dtSec) / 60;
  if (v.sog < v.cruiseSog) v.sog = Math.min(v.cruiseSog, v.sog + speedDelta);
  else if (v.sog > v.cruiseSog) v.sog = Math.max(v.cruiseSog, v.sog - speedDelta);
  // Scaled by dt so the jitter is a fixed drift per second rather than per
  // frame, which would make the whole fleet behave differently at 30 fps.
  v.sog = Math.max(0, v.sog + (rand() - 0.5) * 0.6 * dtSec);

  // Heading leads the course through a turn, and leeway offsets it slightly.
  v.heading = normalizeDeg(v.cog - v.rot * 0.05 + (rand() - 0.5) * 1.2);

  v.pos = destinationPoint(v.pos, v.cog, (v.sog * dtSec) / 3600);
}

export function stepFleet(vessels: Vessel[], dtSec: number, rand: () => number): void {
  for (const v of vessels) stepVessel(v, dtSec, rand);
}

// ── AIS transmission ──────────────────────────────────────────────

/**
 * Reporting interval in milliseconds, following the Class A schedule: three
 * minutes at anchor or alongside, ten seconds under way, two seconds at speed.
 * Small craft are treated as Class B at thirty seconds.
 */
export function aisIntervalMs(v: Vessel): number {
  if (v.navStatus === 'moored' || v.navStatus === 'anchored') return 180_000;
  if (v.kind === 'fishing') return 30_000;
  if (v.sog > 14) return 2_000;
  return 10_000;
}

/**
 * Collect the AIS reports due at time `now`, and stamp the vessels that sent
 * them. Dark vessels never appear here no matter how visible they are on radar.
 */
export function collectAisReports(vessels: Vessel[], now: number): AisReport[] {
  const out: AisReport[] = [];
  for (const v of vessels) {
    if (!v.aisEnabled) continue;
    if (now - v.lastAisTx < aisIntervalMs(v)) continue;
    v.lastAisTx = now;
    out.push({
      mmsi: v.mmsi,
      name: v.name,
      kind: v.kind,
      lengthM: v.lengthM,
      lat: v.pos.lat,
      lon: v.pos.lon,
      cog: v.cog,
      sog: v.sog,
      heading: v.heading,
      navStatus: v.navStatus,
      destination: v.destination,
      t: now,
    });
  }
  return out;
}

/** Advance own ship under autopilot toward its ordered course and speed. */
export function stepOwnShip(own: OwnShip, dtSec: number): void {
  const maxTurn = (18 * dtSec) / 60;
  const next = turnToward(own.heading, own.orderedCourse, maxTurn);
  own.rot = (((next - own.heading + 540) % 360) - 180) / dtSec * 60;
  own.heading = next;
  own.cog = next;

  const accel = (1.2 * dtSec) / 60;
  if (own.sog < own.orderedSpeed) own.sog = Math.min(own.orderedSpeed, own.sog + accel);
  else if (own.sog > own.orderedSpeed) own.sog = Math.max(own.orderedSpeed, own.sog - accel);

  own.pos = destinationPoint(own.pos, own.cog, (own.sog * dtSec) / 3600);
}
