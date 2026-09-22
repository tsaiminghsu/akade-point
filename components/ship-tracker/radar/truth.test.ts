import { describe, expect, it } from 'vitest';

import { fromLocalPlane } from './geo';
import { DEFAULT_SENSOR } from './radar';
import { TRUTH_MATCH_NM, buildTruthOverlay } from './truth';
import { DEFAULT_OWN_SHIP, SCENE_ORIGIN } from './world';
import type { Track, TrackStatus, Vessel } from './types';

// Own ship sits on the scene origin, so plane coordinates read directly as
// offsets from her.
const own = { ...DEFAULT_OWN_SHIP, pos: { ...SCENE_ORIGIN } };
const neverBlocked = () => false;

function vessel(mmsi: string, x: number, y: number, overrides: Partial<Vessel> = {}): Vessel {
  return {
    mmsi,
    name: `SHIP ${mmsi}`,
    kind: 'cargo',
    lengthM: 120,
    pos: fromLocalPlane(SCENE_ORIGIN, { x, y }),
    cog: 90,
    sog: 10,
    heading: 90,
    rot: 0,
    navStatus: 'underway',
    destination: '',
    rcs: 0.7,
    aisEnabled: true,
    route: [],
    legIndex: 0,
    cruiseSog: 10,
    swingPhase: 0,
    lastAisTx: 0,
    ...overrides,
  };
}

function track(id: number, x: number, y: number, status: TrackStatus = 'confirmed'): Track {
  return {
    id,
    status,
    x,
    y,
    vx: 0,
    vy: 0,
    lastUpdate: 0,
    firstSeen: 0,
    hits: 10,
    misses: 0,
    trail: [],
    initSamples: [],
    residual: 0,
    residualAvg: 0,
    gainAge: 10,
    manoeuvreHold: 0,
    driftX: 0,
    driftY: 0,
    lastMeasured: 0,
    aisLock: 0,
  };
}

function overlay(vessels: Vessel[], tracks: Track[], isBlocked = neverBlocked) {
  return buildTruthOverlay(vessels, tracks, own, DEFAULT_SENSOR, isBlocked);
}

describe('buildTruthOverlay', () => {
  it('pairs a vessel with the track sitting on it and reports the error', () => {
    const { contacts } = overlay([vessel('1', 2, 3)], [track(7, 2.03, 3.04)]);
    expect(contacts[0].status).toBe('tracked');
    expect(contacts[0].trackId).toBe(7);
    expect(contacts[0].trackErrorNm).toBeCloseTo(0.05, 6);
  });

  it('places each contact by bearing and range from own ship', () => {
    const { contacts } = overlay([vessel('1', 3, 0)], []);
    expect(contacts[0].bearing).toBeCloseTo(90, 4);
    expect(contacts[0].rangeNm).toBeCloseTo(3, 4);
  });

  it('calls a vessel with only a tentative track on it acquiring', () => {
    const { contacts } = overlay([vessel('1', 2, 3)], [track(7, 2, 3, 'tentative')]);
    expect(contacts[0].status).toBe('acquiring');
  });

  it('counts a coasting track as still following its vessel', () => {
    const { contacts, phantomTrackIds, strayTrackIds } = overlay(
      [vessel('1', 2, 3)],
      [track(7, 2, 3, 'coasting')]
    );
    expect(contacts[0].status).toBe('tracked');
    expect(phantomTrackIds).toEqual([]);
    expect(strayTrackIds).toEqual([]);
  });

  it('ignores a track too far away to be following the vessel', () => {
    const { contacts } = overlay([vessel('1', 2, 3)], [track(7, 2 + TRUTH_MATCH_NM * 1.2, 3)]);
    expect(contacts[0].status).toBe('missed');
    expect(contacts[0].trackId).toBeNull();
    expect(Number.isNaN(contacts[0].trackErrorNm)).toBe(true);
  });

  it('explains an untracked vessel behind land as masked, not missed', () => {
    const { contacts } = overlay([vessel('1', 2, 3)], [], () => true);
    expect(contacts[0].status).toBe('masked');
  });

  it('explains an untracked vessel beyond instrumented range as out of range', () => {
    const { contacts } = overlay([vessel('1', 0, DEFAULT_SENSOR.maxRangeNm + 2)], []);
    expect(contacts[0].status).toBe('out-of-range');
  });

  it('calls a visible, in-range vessel with no track missed', () => {
    const { contacts } = overlay([vessel('1', 2, 3)], []);
    expect(contacts[0].status).toBe('missed');
  });

  it('prefers the track over the land check, so a ship coasting behind a headland stays tracked', () => {
    const { contacts } = overlay([vessel('1', 2, 3)], [track(7, 2, 3, 'coasting')], () => true);
    expect(contacts[0].status).toBe('tracked');
  });

  it('never lets two vessels claim one track', () => {
    // Two ships lying close together, one track between them nearer the first.
    const { contacts } = overlay(
      [vessel('1', 2, 3), vessel('2', 2.12, 3)],
      [track(7, 2.03, 3)]
    );
    expect(contacts.find((c) => c.mmsi === '1')!.status).toBe('tracked');
    expect(contacts.find((c) => c.mmsi === '2')!.status).toBe('missed');
  });

  it('flags a confirmed track with no vessel under it as a phantom', () => {
    const { phantomTrackIds, strayTrackIds } = overlay(
      [vessel('1', 2, 3)],
      [track(7, 2, 3), track(8, -1, -1)]
    );
    expect(phantomTrackIds).toEqual([8]);
    expect(strayTrackIds).toEqual([]);
  });

  it('flags a coasting track that drifted off its ship as a stray, not a phantom', () => {
    const { phantomTrackIds, strayTrackIds } = overlay([], [track(8, -1, -1, 'coasting')]);
    expect(strayTrackIds).toEqual([8]);
    expect(phantomTrackIds).toEqual([]);
  });

  it('calls the older of two tracks on one ship a stray once it is coasting', () => {
    // The shape of an association fault: the ship picked up a fresh track and
    // the old one is dead reckoning beside it.
    const { contacts, strayTrackIds } = overlay(
      [vessel('1', 2, 3)],
      [track(7, 2.17, 3, 'coasting'), track(9, 2.01, 3)]
    );
    expect(contacts[0].trackId).toBe(9);
    expect(strayTrackIds).toEqual([7]);
  });

  it('does not flag an unmatched tentative track, which is clutter being weighed up', () => {
    const { phantomTrackIds, strayTrackIds } = overlay([], [track(9, 0.6, 0.4, 'tentative')]);
    expect(phantomTrackIds).toEqual([]);
    expect(strayTrackIds).toEqual([]);
  });

  it('carries the details the display needs, including whether the ship is dark', () => {
    const { contacts } = overlay([vessel('1', 2, 3, { aisEnabled: false, heading: 215, sog: 6 })], []);
    expect(contacts[0]).toMatchObject({
      mmsi: '1',
      name: 'SHIP 1',
      aisEnabled: false,
      heading: 215,
      sog: 6,
    });
  });
});
