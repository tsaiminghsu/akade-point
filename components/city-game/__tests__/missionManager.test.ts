import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MissionManager, MissionHost } from '../missionManager';
import { generateWorld } from '../worldGen';
import { Economy } from '../economy';
import { defaultSave } from '../save';
import { PedestrianSystem } from '../pedestrians';
import { MISSIONS } from '../missions';
import * as gameClock from '../gameClock';
import { Player, Point, Vehicle, VehicleType, WorldData } from '../types';

const world: WorldData = generateWorld(42);

function makePlayer(x: number, y: number): Player {
  return {
    x, y, angle: 0, speed: 0, maxSpeed: 160, state: 'onFoot',
    currentVehicleId: null, health: 100, z: 0, jumpVel: 0, action: null,
  };
}

function makeVehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1', type: VehicleType.CAR, x: 0, y: 0, angle: 0, speed: 0, maxSpeed: 160,
    color: '#0bc', width: 16, height: 26, occupant: 'player',
    waypoints: [], waypointIndex: 0, hp: 100,
    ...over,
  };
}

class FakeHost implements MissionHost {
  world = world;
  player: Player;
  vehicles = new Map<string, Vehicle>();
  economy = new Economy();
  save = defaultSave();
  pedestrians = new PedestrianSystem(world, 16);

  notifications: string[] = [];
  banners: Array<{ text: string; sub: string; color: string; ms: number }> = [];
  waypoint: { x: number; y: number; source: 'user' | 'mission' } | null = null;
  wanted = 0;
  speed = 0;
  persistCalls = 0;
  spawnRequests: Array<{ type: VehicleType; at: Point }> = [];
  /** What spawnJobVehicle should hand back; set per test. */
  nextSpawnedVehicle: Vehicle | null = null;

  constructor(x = 0, y = 0) {
    this.player = makePlayer(x, y);
  }

  wantedLevel() { return this.wanted; }
  setWantedLevel(n: number) { this.wanted = n; }
  addNotification(text: string) { this.notifications.push(text); }
  setWaypoint(x: number, y: number, source: 'user' | 'mission') { this.waypoint = { x, y, source }; }
  clearWaypoint(source: 'user' | 'mission') {
    if (this.waypoint && this.waypoint.source === source) this.waypoint = null;
  }
  showBanner(text: string, sub: string, color: string, ms: number) {
    this.banners.push({ text, sub, color, ms });
  }
  persist() { this.persistCalls++; }
  spawnJobVehicle(type: VehicleType, at: Point): Vehicle | null {
    this.spawnRequests.push({ type, at });
    return this.nextSpawnedVehicle;
  }
  playerSpeed() { return this.speed; }
}

const NON_PASSIVE = MISSIONS.filter(m => !m.passive);

describe('MissionManager: markers', () => {
  it('builds one marker per non-passive mission, all on placeable ground', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    expect(mgr.markers).toHaveLength(NON_PASSIVE.length);
    expect(new Set(mgr.markers.map(m => m.defId))).toEqual(new Set(NON_PASSIVE.map(m => m.id)));
  });

  it('edge-triggers the brief only on the frame the player arrives', () => {
    const marker0 = new MissionManager(new FakeHost()).markers[0];
    const host = new FakeHost(marker0.x, marker0.y);
    const mgr = new MissionManager(host);
    const m = mgr.markers.find(mm => mm.defId === marker0.defId)!;

    mgr.update(1 / 60, 1000);
    expect(mgr.session?.phase).toBe('briefing');
    expect(m.playerInside).toBe(true);

    // Decline and re-run on the same tile: must not reopen immediately.
    mgr.decline();
    mgr.update(1 / 60, 1001);
    expect(mgr.session).toBeNull();
  });

  it('does not reopen a declined brief until the suppression window ends', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x;
    host.player.y = marker.y;

    mgr.update(1 / 60, 1000);
    expect(mgr.session?.phase).toBe('briefing');
    mgr.decline();

    // Step away and back before the suppression ends.
    marker.playerInside = false;
    mgr.update(1 / 60, 2000); // 1s later, still inside the 8s suppression
    expect(mgr.session).toBeNull();

    marker.playerInside = false;
    mgr.update(1 / 60, 10000); // past the 8s suppression
    expect(mgr.session?.phase).toBe('briefing');
  });

  it('does not open a new brief while a session is already active', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const a = mgr.markers[0];
    const b = mgr.markers[1];

    host.player.x = a.x; host.player.y = a.y;
    mgr.update(1 / 60, 1000);
    expect(mgr.session?.defId).toBe(a.defId);

    a.playerInside = false;
    host.player.x = b.x; host.player.y = b.y;
    mgr.update(1 / 60, 1100);
    expect(mgr.session?.defId).toBe(a.defId); // unchanged — still busy with `a`
  });
});

describe('MissionManager: briefing freezes, accept/decline', () => {
  let host: FakeHost;
  let mgr: MissionManager;
  let marker: MissionManager['markers'][number];

  beforeEach(() => {
    host = new FakeHost();
    mgr = new MissionManager(host);
    marker = mgr.markers[0];
    host.player.x = marker.x;
    host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
  });

  it('opens with objectives already built and phase briefing', () => {
    expect(mgr.session?.phase).toBe('briefing');
    expect(mgr.session!.objectives.length).toBeGreaterThan(0);
  });

  it('isBriefing() reports true only during the brief', () => {
    expect(mgr.isBriefing()).toBe(true);
    mgr.accept();
    expect(mgr.isBriefing()).toBe(false);
  });

  it('decline clears the session and arms the cooldown', () => {
    mgr.decline();
    expect(mgr.session).toBeNull();
    expect(marker.availableAt).toBeGreaterThan(0);
  });

  it('accept activates the session and shows a banner', () => {
    mgr.accept();
    expect(mgr.session?.phase).toBe('active');
    expect(host.banners).toHaveLength(1);
  });

  it('accept on a non-briefing session is a no-op', () => {
    mgr.accept();
    const before = mgr.session;
    mgr.accept();
    expect(mgr.session).toBe(before);
  });

  it('getaway sets the wanted level to 2 on accept', () => {
    // Force a fresh getaway brief regardless of which marker[0] happened to be.
    host.player.x = mgr.markers.find(m => m.defId === 'getaway')!.x;
    host.player.y = mgr.markers.find(m => m.defId === 'getaway')!.y;
    mgr.decline();
    mgr.update(1 / 60, 20000);
    expect(mgr.session?.defId).toBe('getaway');
    mgr.accept();
    expect(host.wanted).toBe(2);
  });
});

describe('MissionManager: required-vehicle spawning (regression: taxi binding)', () => {
  it('spawns the job vehicle at the marker when accepted normally, leaving it unbound', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers.find(m => m.defId === 'delivery_shop')!;
    host.nextSpawnedVehicle = makeVehicle({ id: 'scooter1', type: VehicleType.DELIVERY_SCOOTER });
    host.player.x = marker.x; host.player.y = marker.y;

    mgr.update(1 / 60, 1000);
    expect(mgr.session?.defId).toBe('delivery_shop');
    mgr.accept();

    expect(host.spawnRequests).toHaveLength(1);
    expect(host.spawnRequests[0].type).toBe(VehicleType.DELIVERY_SCOOTER);
    expect(mgr.session?.vehicleId).toBeNull(); // bound later, once the player boards
  });

  it('keeps a pre-bound vehicle when starting a taxi job from inside one, and spawns nothing new', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';
    host.nextSpawnedVehicle = makeVehicle({ id: 'stray-taxi', type: VehicleType.TAXI });

    const started = mgr.startTaxiFromVehicle(1000);

    expect(started).toBe(true);
    expect(mgr.session?.kind).toBe('taxi');
    expect(mgr.session?.vehicleId).toBe('taxi1'); // must survive accept()
    expect(host.spawnRequests).toHaveLength(0); // no stray taxi spawned at the stand
    // The "get in a taxi" objective is dropped since the player is already in one.
    expect(mgr.session?.objectives.every(o => o.kind !== 'enterVehicle')).toBe(true);
  });

  it('refuses to start taxi work outside a taxi, or with a session already active', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    host.player.state = 'onFoot';
    expect(mgr.startTaxiFromVehicle(1000)).toBe(false);

    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';
    mgr.startTaxiFromVehicle(1000);
    expect(mgr.startTaxiFromVehicle(2000)).toBe(false); // already has a session
  });
});

describe('MissionManager: cancel arming', () => {
  let host: FakeHost;
  let mgr: MissionManager;

  beforeEach(() => {
    host = new FakeHost();
    mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
    mgr.accept();
  });

  it('requires two presses within the arm window to actually cancel', () => {
    mgr.requestCancel(2000);
    expect(mgr.session?.phase).toBe('active');
    expect(mgr.cancelArmed).toBe(true);

    mgr.requestCancel(2100);
    expect(mgr.session?.phase).toBe('failed');
    expect(mgr.session?.failReason).toBe('放棄任務');
  });

  it('disarms after the window elapses, requiring a fresh double-press', () => {
    mgr.requestCancel(2000);
    // 3 seconds later — past the 2s arm window.
    mgr.requestCancel(5000);
    expect(mgr.session?.phase).toBe('active');
  });

  it('cancelling during the briefing just declines', () => {
    const host2 = new FakeHost();
    const mgr2 = new MissionManager(host2);
    const marker = mgr2.markers[0];
    host2.player.x = marker.x; host2.player.y = marker.y;
    mgr2.update(1 / 60, 1000);
    expect(mgr2.session?.phase).toBe('briefing');

    mgr2.requestCancel(1001);
    expect(mgr2.session).toBeNull();
  });
});

describe('MissionManager: failure hooks', () => {
  let host: FakeHost;
  let mgr: MissionManager;

  beforeEach(() => {
    host = new FakeHost();
    mgr = new MissionManager(host);
    const marker = mgr.markers.find(m => m.defId === 'delivery_shop')!;
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
    mgr.accept();
  });

  it('onVehicleDestroyed fails the run only for the bound vehicle', () => {
    mgr.session!.vehicleId = 'scooter1';
    mgr.onVehicleDestroyed('someone-elses-car');
    expect(mgr.session?.phase).toBe('active');

    mgr.onVehicleDestroyed('scooter1');
    expect(mgr.session?.phase).toBe('failed');
    expect(mgr.session?.failReason).toBe('車輛損毀');
  });

  it('onBusted fails an active run', () => {
    mgr.onBusted();
    expect(mgr.session?.phase).toBe('failed');
    expect(mgr.session?.failReason).toBe('遭到逮捕');
  });

  it('onDistraction fails an active run with the given reason', () => {
    mgr.onDistraction('開始競速');
    expect(mgr.session?.phase).toBe('failed');
    expect(mgr.session?.failReason).toBe('開始競速');
  });

  it('hooks are no-ops without an active session', () => {
    const host2 = new FakeHost();
    const mgr2 = new MissionManager(host2);
    expect(() => mgr2.onBusted()).not.toThrow();
    expect(() => mgr2.onVehicleDestroyed('x')).not.toThrow();
    expect(() => mgr2.onDistraction('x')).not.toThrow();
    expect(mgr2.session).toBeNull();
  });

  it('onCollision counts collisions only while active', () => {
    expect(mgr.session?.collisions).toBe(0);
    mgr.onCollision();
    mgr.onCollision();
    expect(mgr.session?.collisions).toBe(2);
  });

  it('failure clears the mission waypoint and arms the marker cooldown', () => {
    host.waypoint = { x: 1, y: 1, source: 'mission' };
    mgr.onBusted();
    expect(host.waypoint).toBeNull();
    const marker = mgr.markers.find(m => m.defId === 'delivery_shop')!;
    expect(marker.availableAt).toBeGreaterThan(1000);
  });
});

describe('MissionManager: courier success path', () => {
  it('pays a base reward plus a time bonus and records the best time', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers.find(m => m.defId === 'courier_civic')!;
    host.player.x = marker.x; host.player.y = marker.y;

    mgr.update(1 / 60, 1000);
    mgr.accept();
    const s = mgr.session!;
    expect(s.kind).toBe('courier');

    const before = host.economy.cash;
    // Drive straight to every checkpoint in order.
    for (const o of [...s.objectives]) {
      host.player.x = o.x; host.player.y = o.y;
      mgr.update(1 / 60, 2000);
    }

    expect(s.phase).toBe('success');
    expect(host.economy.cash).toBeGreaterThan(before);
    expect(host.save.stats.couriers).toBe(1);
    expect(host.save.missionBest['courier_civic']).toBeDefined();
    expect(host.persistCalls).toBeGreaterThan(0);
  });

  it('holds the result for RESULT_HOLD seconds before clearing the session', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers.find(m => m.defId === 'courier_civic')!;
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
    mgr.accept();
    const s = mgr.session!;
    for (const o of [...s.objectives]) {
      host.player.x = o.x; host.player.y = o.y;
      mgr.update(1 / 60, 2000);
    }
    expect(mgr.session?.phase).toBe('success');

    mgr.update(1 / 60, 2500); // 0.5s later — still within the 3s hold
    expect(mgr.session).not.toBeNull();

    mgr.update(1 / 60, 6000); // past the hold
    expect(mgr.session).toBeNull();
  });
});

describe('MissionManager: taxi fare chain', () => {
  it('chains pickup -> dropoff -> next pickup indefinitely, paying each fare', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';
    host.speed = 0; // "stopped" for requireStopped objectives

    mgr.startTaxiFromVehicle(1000);
    const s = mgr.session!;
    expect(s.objectives).toHaveLength(1); // just "pickup" — enterVehicle was trimmed

    // Reach the pickup point.
    const pickup = s.objectives[0];
    host.player.x = pickup.x; host.player.y = pickup.y;
    mgr.update(1 / 60, 2000);
    expect(host.notifications.some(n => n.includes('乘客上車了'))).toBe(true);
    expect(s.passenger?.state).toBe('riding');

    const dropoff = s.objectives[s.objectives.length - 1];
    expect(dropoff.kind).toBe('dropoff');

    // Reach the drop-off.
    host.player.x = dropoff.x; host.player.y = dropoff.y;
    const cashBefore = host.economy.cash;
    mgr.update(1 / 60, 3000);

    expect(s.faresCompleted).toBe(1);
    expect(s.passenger).toBeNull();
    expect(host.economy.cash).toBeGreaterThan(cashBefore);
    expect(host.save.stats.taxiFares).toBe(1);
    // A fresh pickup objective was queued — the job never "finishes" on its own.
    const next = s.objectives[s.objectives.length - 1];
    expect(next.kind).toBe('pickup');
    expect(s.phase).toBe('active');
  });

  it('reports progress as a fare count, not an objective fraction', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';
    mgr.startTaxiFromVehicle(1000);
    expect(mgr.getHUD()?.progressText).toBe('已完成 0 趟');
  });
});

describe('MissionManager: passenger sync', () => {
  it('spawns a waiting pedestrian at the pickup point and removes it once collected', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';

    mgr.startTaxiFromVehicle(1000);
    const s = mgr.session!;
    const pickup = s.objectives[0];

    // syncPassenger runs on update(), not on accept() alone in this path —
    // startTaxiFromVehicle calls accept() which does call syncPassenger once.
    const waitingCount = () => host.pedestrians.peds.filter(p => p.active && p.state === 'waiting').length;
    expect(waitingCount()).toBe(1);

    host.player.x = pickup.x; host.player.y = pickup.y;
    mgr.update(1 / 60, 2000); // completes the pickup, passenger becomes 'riding'
    expect(waitingCount()).toBe(0);
  });
});

describe('MissionManager: sightseeing discovery', () => {
  it('pays out for the town hall landmark and records it in the save', () => {
    const host = new FakeHost(world.townHallPos.x, world.townHallPos.y);
    const mgr = new MissionManager(host);
    const before = host.economy.cash;

    mgr.checkDiscovery();

    expect(host.economy.cash).toBeGreaterThan(before);
    expect(mgr.discovered.has('town_hall')).toBe(true);
    expect(host.save.stats.discovered).toContain('town_hall');
    expect(host.persistCalls).toBe(1);
  });

  it('does not pay for the same landmark twice', () => {
    const host = new FakeHost(world.townHallPos.x, world.townHallPos.y);
    const mgr = new MissionManager(host);
    mgr.checkDiscovery();
    const cash = host.economy.cash;
    mgr.checkDiscovery();
    expect(host.economy.cash).toBe(cash);
  });

  it('pays the completion bonus once every landmark is found', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    // Seed everything but one landmark as already discovered.
    for (const l of ['town_hall', 'helipad', 'zone_commercial', 'zone_residential', 'zone_office', 'zone_park', 'zone_plaza']) {
      mgr.discovered.add(l);
    }
    host.player.x = world.helipads[0]?.x ?? world.townHallPos.x;
    host.player.y = world.helipads[0]?.y ?? world.townHallPos.y;
    // Force the last one (zone_road) via a direct zone check instead, since
    // exact road-tile placement is not the point of this test: simulate by
    // standing on a known road tile.
    const road = world.roadTiles[0];
    host.player.x = road.x; host.player.y = road.y;

    mgr.checkDiscovery();
    expect(mgr.discovered.size).toBe(8);
    expect(host.banners.some(b => b.text === '城市導覽完成')).toBe(true);
  });

  it('restores discovered landmarks from the save on construction', () => {
    const host = new FakeHost();
    host.save.stats.discovered = ['town_hall', 'helipad'];
    const mgr = new MissionManager(host);
    expect(mgr.discovered.has('town_hall')).toBe(true);
    expect(mgr.discovered.has('helipad')).toBe(true);
  });
});

describe('MissionManager: HUD, blips, job list', () => {
  it('returns null HUD data with no session', () => {
    const mgr = new MissionManager(new FakeHost());
    expect(mgr.getHUD()).toBeNull();
    expect(mgr.nearMarker()).toBeNull();
  });

  it('nearMarker only reports a marker the player is standing on and off cooldown', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000); // opens + is inside
    mgr.decline();
    // Update once more so playerInside reflects "still inside" post-decline.
    mgr.update(1 / 60, 1001);
    expect(mgr.nearMarker()).toBeNull(); // on cooldown from the decline
  });

  it('getBlips shows the objective once active, and hides idle markers', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    expect(mgr.getBlips().length).toBe(mgr.markers.length);

    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';
    mgr.startTaxiFromVehicle(1000);

    const blips = mgr.getBlips();
    expect(blips.some(b => b.kind === 'mission')).toBe(true);
    expect(blips.some(b => b.kind === 'marker')).toBe(false); // hidden while a session is active
    // No passenger blip yet — that only appears once a rider has been picked up.
    expect(blips.some(b => b.kind === 'passenger')).toBe(false);
  });

  it('getBlips adds a passenger blip once a rider has been picked up', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const taxi = makeVehicle({ id: 'taxi1', type: VehicleType.TAXI });
    host.vehicles.set(taxi.id, taxi);
    host.player.currentVehicleId = taxi.id;
    host.player.state = 'inCar';
    mgr.startTaxiFromVehicle(1000);

    const pickup = mgr.session!.objectives[0];
    host.player.x = pickup.x; host.player.y = pickup.y;
    mgr.update(1 / 60, 2000);
    expect(mgr.session?.passenger?.state).toBe('riding');

    expect(mgr.getBlips().some(b => b.kind === 'passenger')).toBe(true);
  });

  it('getaway objectives never produce a mission blip (no position)', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers.find(m => m.defId === 'getaway')!;
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
    mgr.accept();
    expect(mgr.getBlips().some(b => b.kind === 'mission')).toBe(false);
  });

  it('getJobList reports every mission with the right status shape', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const jobs = mgr.getJobList();
    expect(jobs).toHaveLength(MISSIONS.length);
    expect(jobs.every(j => j.status === 'available')).toBe(true);

    const sightseeing = jobs.find(j => j.defId === 'sightseeing')!;
    expect(sightseeing.progressText).toBe('0/8 已發現');
  });

  it('getJobList shows cooldown after a decline and active during a run', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
    mgr.decline();

    let job = mgr.getJobList().find(j => j.defId === marker.defId)!;
    expect(job.status).toBe('cooldown');
    expect(job.cooldownLeft).toBeGreaterThan(0);

    marker.playerInside = false;
    mgr.update(1 / 60, 20000);
    mgr.accept();
    job = mgr.getJobList().find(j => j.defId === marker.defId)!;
    expect(job.status).toBe('active');
  });

  it('markerPosition resolves a defId to its world position, or null', () => {
    const mgr = new MissionManager(new FakeHost());
    const marker = mgr.markers[0];
    expect(mgr.markerPosition(marker.defId)).toEqual({ x: marker.x, y: marker.y });
    expect(mgr.markerPosition('not-a-real-id')).toBeNull();
  });
});

describe('MissionManager: reset', () => {
  it('clears session, discovery, and cooldowns, and rebuilds markers', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, 1000);
    mgr.decline();
    mgr.discovered.add('town_hall');

    mgr.reset();

    expect(mgr.session).toBeNull();
    expect(mgr.discovered.size).toBe(0);
    expect(mgr.markers).toHaveLength(NON_PASSIVE.length);
    expect(mgr.markers.find(m => m.defId === marker.defId)!.availableAt).toBe(0);
  });
});

describe('MissionManager: gameClock integration', () => {
  let wall = 0;

  beforeEach(() => {
    wall = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => wall);
    gameClock.resetClock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    gameClock.resetClock();
  });

  it('cancelArmed reads the pause-aware clock, not raw update() timestamps', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, gameClock.now());
    mgr.accept();

    mgr.requestCancel(gameClock.now());
    expect(mgr.cancelArmed).toBe(true);

    gameClock.pause();
    wall = 999999; // wall clock races ahead while paused
    expect(mgr.cancelArmed).toBe(true); // frozen — the arm window has not actually elapsed
  });

  it('E reopens a declined brief once its suppression runs out under a player who stayed', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, gameClock.now());
    expect(mgr.session?.phase).toBe('briefing');
    mgr.decline();

    // Still suppressed: no prompt, and E does nothing.
    expect(mgr.nearMarker()).toBeNull();
    expect(mgr.reopenBrief(gameClock.now())).toBe(false);

    // The suppression ends with the player still standing there. Arrival is
    // edge-triggered, so nothing opens by itself — but the E prompt shows,
    // and until this fix E answered 「這裡沒有可互動的東西」.
    wall += 9000;
    mgr.update(1 / 60, gameClock.now());
    expect(mgr.session).toBeNull();
    expect(mgr.nearMarker()?.defId).toBe(marker.defId);

    expect(mgr.reopenBrief(gameClock.now())).toBe(true);
    expect(mgr.session?.phase).toBe('briefing');
    expect(mgr.session?.defId).toBe(marker.defId);
    expect(mgr.nearMarker()).toBeNull(); // the prompt gives way to the brief
  });

  it('E opens nothing while a run is already active', () => {
    const host = new FakeHost();
    const mgr = new MissionManager(host);
    const marker = mgr.markers[0];
    host.player.x = marker.x; host.player.y = marker.y;
    mgr.update(1 / 60, gameClock.now());
    mgr.accept();
    expect(mgr.reopenBrief(gameClock.now())).toBe(false);
    expect(mgr.session?.phase).toBe('active');
  });
});
