/**
 * Ground-truth debug overlay.
 *
 * Everything else in this module is careful never to let the tracker see where
 * the simulated vessels really are. This file is the one deliberate exception,
 * and it only feeds the display: it lines the truth up against the tracker's
 * output so a developer can see what the radar missed, how far each track sits
 * from the ship it follows, and which tracks follow nothing at all. Nothing
 * here flows back into tracking, AIS fusion or ARPA.
 *
 * In live-AIS mode the "truth" is the AIS-reported position, because that is
 * what the sensor model is bouncing its echoes off.
 */

import { toLocalPlane, vecToPolar } from './geo';
import type { RadarSensor } from './radar';
import { SCENE_ORIGIN, isLineOfSightBlocked } from './world';
import type {
  LatLon,
  OwnShip,
  Track,
  TruthContact,
  TruthOverlay,
  TruthStatus,
  Vessel,
} from './types';

/**
 * How close a track has to sit to a vessel to count as following it, NM.
 * Settled tracks sit within a few hundredths of a mile of their ship, so this
 * leaves room for a track lagging a turn without pairing it to a neighbour.
 */
export const TRUTH_MATCH_NM = 0.25;

export function buildTruthOverlay(
  vessels: Vessel[],
  tracks: Track[],
  own: OwnShip,
  sensor: Pick<RadarSensor, 'minRangeNm' | 'maxRangeNm'>,
  isBlocked: (from: LatLon, to: LatLon) => boolean = isLineOfSightBlocked,
  matchRadiusNm = TRUTH_MATCH_NM
): TruthOverlay {
  const ownVec = toLocalPlane(SCENE_ORIGIN, own.pos);
  const positions = vessels.map((v) => toLocalPlane(SCENE_ORIGIN, v.pos));
  const live = tracks.filter((t) => t.status !== 'lost');

  // Pair vessels and tracks one to one, closest pairs first: the same greedy
  // rule the tracker and the AIS fusion use. A per-vessel nearest search would
  // let two ships lying close together both claim one track, and hide the
  // fact that one of them is untracked.
  const candidates: Array<{ vi: number; ti: number; d: number }> = [];
  positions.forEach((p, vi) => {
    live.forEach((t, ti) => {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d <= matchRadiusNm) candidates.push({ vi, ti, d });
    });
  });
  candidates.sort((a, b) => a.d - b.d);

  const vesselMatch = new Map<number, { ti: number; d: number }>();
  const matchedTracks = new Set<number>();
  for (const c of candidates) {
    if (vesselMatch.has(c.vi) || matchedTracks.has(c.ti)) continue;
    vesselMatch.set(c.vi, { ti: c.ti, d: c.d });
    matchedTracks.add(c.ti);
  }

  const contacts = vessels.map((v, vi): TruthContact => {
    const p = positions[vi];
    const { bearing, range } = vecToPolar({ x: p.x - ownVec.x, y: p.y - ownVec.y });
    const match = vesselMatch.get(vi);
    const track = match ? live[match.ti] : undefined;

    let status: TruthStatus;
    if (track) {
      status = track.status === 'tentative' ? 'acquiring' : 'tracked';
    } else if (range < sensor.minRangeNm || range > sensor.maxRangeNm) {
      status = 'out-of-range';
    } else if (isBlocked(own.pos, v.pos)) {
      status = 'masked';
    } else {
      status = 'missed';
    }

    return {
      mmsi: v.mmsi,
      name: v.name,
      x: p.x,
      y: p.y,
      bearing,
      rangeNm: range,
      heading: v.heading,
      sog: v.sog,
      aisEnabled: v.aisEnabled,
      status,
      trackId: track ? track.id : null,
      trackErrorNm: match ? match.d : NaN,
    };
  });

  // Unmatched tracks, split by what they say about the tracker. An unmatched
  // tentative track is not counted at all: that is clutter being weighed up
  // and rejected, which is the tracker doing its job.
  const unmatched = live.filter((_, ti) => !matchedTracks.has(ti));
  const phantomTrackIds = unmatched.filter((t) => t.status === 'confirmed').map((t) => t.id);
  const strayTrackIds = unmatched.filter((t) => t.status === 'coasting').map((t) => t.id);

  return { contacts, phantomTrackIds, strayTrackIds };
}
