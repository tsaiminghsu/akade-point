import {
  MinimapBlip,
  Player,
  Point,
  Vehicle,
  VehicleType,
  WorldData,
} from './types';
import { Economy } from './economy';
import { CitySave } from './save';
import {
  LANDMARKS,
  MISSIONS,
  MissionDef,
  MissionObjective,
  SIGHTSEEING_COMPLETE_BONUS,
  SIGHTSEEING_PER_LANDMARK,
  estimateDriveTime,
  getMission,
  makeRng,
  positionalLandmarks,
  zoneLandmarkId,
} from './missions';
import {
  MissionSession,
  RESULT_HOLD,
  computeCourierBonus,
  computeDeliveryPay,
  computeTaxiTip,
  createSession,
  currentObjective,
  failMission,
  formatMissionTime,
  succeedMission,
  tickMission,
} from './missionRuntime';
import { nearestRoadTile } from './police';
import type { PedestrianSystem } from './pedestrians';
import * as gameClock from './gameClock';

/**
 * Drives missions inside the engine: marker triggers, objective progression,
 * payouts, and the HUD/minimap data the React layer reads.
 *
 * The host interface is structural so this module never imports the engine,
 * which would be circular.
 */

export interface MissionHost {
  world: WorldData;
  player: Player;
  vehicles: Map<string, Vehicle>;
  economy: Economy;
  save: CitySave;
  pedestrians: PedestrianSystem;
  wantedLevel(): number;
  setWantedLevel(n: number): void;
  addNotification(text: string, color?: string): void;
  setWaypoint(x: number, y: number, source: 'user' | 'mission'): void;
  clearWaypoint(source: 'user' | 'mission'): void;
  showBanner(text: string, sub: string, color: string, ms: number): void;
  persist(): void;
  /** Spawn an unoccupied job vehicle near a point, or reuse a nearby one. */
  spawnJobVehicle(type: VehicleType, at: Point): Vehicle | null;
  /** True px/s speed of the player. */
  playerSpeed(): number;
}

export interface MissionMarker {
  defId: string;
  x: number;
  y: number;
  /** gameClock.now() before which the marker is greyed out. */
  availableAt: number;
  /** Edge-trigger guard so the brief does not reopen every frame. */
  playerInside: boolean;
}

export interface MissionHUDData {
  defId: string;
  title: string;
  icon: string;
  color: string;
  phase: MissionSession['phase'];
  objectiveText: string;
  progressText: string;
  timeLeft: number | null;
  timeText: string | null;
  earned: number;
  resultText: string;
  cancelArmed: boolean;
  description: string;
  reward: number;
}

export interface JobListItem {
  defId: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  reward: number;
  status: 'available' | 'cooldown' | 'active';
  cooldownLeft: number;
  best: number | null;
  progressText: string | null;
}

/** Seconds within which a second cancel press confirms abandoning the run. */
const CANCEL_ARM_TIME = 2;
/** Suppression after declining a brief, so it does not immediately reopen. */
const DECLINE_SUPPRESS = 8;
const TAXI_FARE_GRACE = 15;

export class MissionManager {
  markers: MissionMarker[] = [];
  session: MissionSession | null = null;
  discovered = new Set<string>();

  private host: MissionHost;
  private rng = makeRng(1);
  private cancelArmedUntil = 0;
  private passengerIndex: number | null = null;
  private lastZoneId: string | null = null;

  constructor(host: MissionHost) {
    this.host = host;
    this.buildMarkers();
    for (const id of host.save.stats.discovered) this.discovered.add(id);
  }

  private buildMarkers(): void {
    this.markers = [];
    for (const def of MISSIONS) {
      if (def.passive) continue;
      const at = def.markerAt(this.host.world);
      if (!at) continue;
      this.markers.push({ defId: def.id, x: at.x, y: at.y, availableAt: 0, playerInside: false });
    }
  }

  reset(): void {
    this.session = null;
    this.discovered.clear();
    this.passengerIndex = null;
    this.lastZoneId = null;
    this.cancelArmedUntil = 0;
    this.buildMarkers();
  }

  /** True while a brief is open; the engine freezes player physics then. */
  isBriefing(): boolean {
    return this.session?.phase === 'briefing';
  }

  // ── Frame update ──────────────────────────────────────────────────────────

  update(dt: number, nowMs: number): void {
    const { host } = this;

    this.updateMarkers(nowMs);

    const session = this.session;
    if (!session) return;

    if (session.phase === 'success' || session.phase === 'failed') {
      if (nowMs - session.endedAt > RESULT_HOLD * 1000) this.endSession();
      return;
    }
    if (session.phase === 'briefing') return;

    const def = getMission(session.defId);
    if (!def) { this.endSession(); return; }

    const vehicle = host.player.currentVehicleId
      ? host.vehicles.get(host.player.currentVehicleId)
      : undefined;

    const event = tickMission(session, def, {
      px: host.player.x,
      py: host.player.y,
      speed: host.playerSpeed(),
      playerState: host.player.state,
      vehicleType: vehicle?.type ?? null,
      vehicleId: vehicle?.id ?? null,
      wantedLevel: host.wantedLevel(),
      dt,
      nowMs,
    });

    switch (event) {
      case 'objective': this.onObjectiveComplete(def, nowMs); break;
      case 'fare': this.onFareComplete(def, nowMs); break;
      case 'success': this.onSuccess(def, nowMs); break;
      case 'failed': this.onFailure(nowMs); break;
      default: break;
    }

    this.syncPassenger();
    this.syncWaypoint();
  }

  private updateMarkers(nowMs: number): void {
    const { host } = this;
    const busy = this.session !== null;

    for (const marker of this.markers) {
      const inside = Math.hypot(host.player.x - marker.x, host.player.y - marker.y) < 40;
      // Edge trigger: only fire on the frame the player arrives.
      if (inside && !marker.playerInside && !busy && nowMs >= marker.availableAt) {
        this.openBrief(marker.defId, nowMs);
      }
      marker.playerInside = inside;
    }
  }

  // ── Brief / accept / decline ──────────────────────────────────────────────

  private openBrief(defId: string, nowMs: number): void {
    const def = getMission(defId);
    if (!def) return;

    this.rng = makeRng(Math.floor(nowMs) ^ 0x9e3779b9);
    const objectives = def.build(this.host.world, this.rng, {
      x: this.host.player.x,
      y: this.host.player.y,
    });
    if (objectives.length === 0) return;

    const limit = def.id === 'courier_civic'
      ? estimateDriveTime(objectives.map(o => ({ x: o.x, y: o.y })), this.host.player)
      : def.timeLimit;

    this.session = createSession(def, objectives, limit, nowMs);
  }

  accept(): void {
    const s = this.session;
    if (!s || s.phase !== 'briefing') return;
    const def = getMission(s.defId);
    if (!def) return;

    s.phase = 'active';
    s.startedAt = gameClock.now();

    // Put the required vehicle within reach of the marker.
    if (def.requiredVehicle) {
      const marker = this.markers.find(m => m.defId === def.id);
      if (marker) {
        const v = this.host.spawnJobVehicle(def.requiredVehicle, { x: marker.x, y: marker.y });
        if (v) s.vehicleId = null;   // bound once the player actually boards
      }
    }

    if (def.kind === 'getaway') this.host.setWantedLevel(2);

    this.host.showBanner(def.title, def.description, def.color, 2600);
    this.syncWaypoint();
    this.syncPassenger();
  }

  decline(): void {
    const s = this.session;
    if (!s || s.phase !== 'briefing') return;
    const marker = this.markers.find(m => m.defId === s.defId);
    if (marker) marker.availableAt = gameClock.now() + DECLINE_SUPPRESS * 1000;
    this.session = null;
  }

  /** X once arms, X again within a couple of seconds abandons the run. */
  requestCancel(nowMs: number): void {
    const s = this.session;
    if (!s) return;
    if (s.phase === 'briefing') { this.decline(); return; }
    if (s.phase !== 'active') return;

    if (nowMs <= this.cancelArmedUntil) {
      failMission(s, '放棄任務', nowMs);
      this.onFailure(nowMs);
      return;
    }
    this.cancelArmedUntil = nowMs + CANCEL_ARM_TIME * 1000;
    this.host.addNotification('再按一次 X 放棄任務', '#ffcc00');
  }

  get cancelArmed(): boolean {
    return gameClock.now() <= this.cancelArmedUntil;
  }

  /** Start taxi work from inside any taxi, without visiting the marker. */
  startTaxiFromVehicle(nowMs: number): boolean {
    if (this.session) return false;
    const v = this.host.player.currentVehicleId
      ? this.host.vehicles.get(this.host.player.currentVehicleId)
      : null;
    if (!v || v.type !== VehicleType.TAXI) return false;

    const def = getMission('taxi_job');
    if (!def) return false;

    this.rng = makeRng(Math.floor(nowMs) ^ 0x85ebca6b);
    const objectives = def.build(this.host.world, this.rng, this.host.player);
    // Already in a taxi, so drop the "get in a taxi" step.
    const trimmed = objectives.filter(o => o.kind !== 'enterVehicle');
    this.session = createSession(def, trimmed, def.timeLimit, nowMs);
    this.session.vehicleId = v.id;
    this.accept();
    return true;
  }

  // ── Event handling ────────────────────────────────────────────────────────

  private onObjectiveComplete(def: MissionDef, nowMs: number): void {
    const s = this.session;
    if (!s) return;

    // Taxi: picking a fare up creates the drop-off leg.
    if (s.kind === 'taxi' && s.currentIndex >= s.objectives.length) {
      const dest = nearestRoadTile(
        this.host.world,
        this.host.world.roadTiles[Math.floor(this.rng() * this.host.world.roadTiles.length)]
          ?? this.host.player,
      );
      const fareTime = Math.hypot(dest.x - this.host.player.x, dest.y - this.host.player.y) / 60 + TAXI_FARE_GRACE;
      s.objectives.push({
        id: `taxi_drop_${s.faresCompleted}_${Math.floor(nowMs)}`,
        text: '送客人到目的地',
        kind: 'dropoff',
        x: dest.x, y: dest.y, radius: 45,
        requireStopped: true,
        done: false,
      });
      s.timeLimit = fareTime;
      s.timeLeft = fareTime;
      s.passenger = { x: dest.x, y: dest.y, state: 'riding' };
      this.host.addNotification('🚕 乘客上車了', '#facc15');
    }

    this.host.addNotification('✓ 目標完成', def.color);
    this.syncWaypoint();
  }

  private onFareComplete(def: MissionDef, nowMs: number): void {
    const s = this.session;
    if (!s) return;

    const tip = computeTaxiTip(def.baseReward, s.timeLeft ?? 0, s.timeLimit ?? 1, s.collisions);
    const pay = def.baseReward + tip;
    s.earned += pay;
    s.collisions = 0;
    s.passenger = null;

    this.host.economy.earn(pay, 'taxi_fare');
    this.host.save.stats.taxiFares += 1;
    this.host.persist();
    this.host.showBanner(`車資 +$${pay}`, tip > 0 ? `小費 $${tip}` : '', '#facc15', 1800);

    // Queue the next fare.
    const rider = nearestRoadTile(
      this.host.world,
      this.host.world.roadTiles[Math.floor(this.rng() * this.host.world.roadTiles.length)]
        ?? this.host.player,
    );
    s.objectives.push({
      id: `taxi_pick_${s.faresCompleted}_${Math.floor(nowMs)}`,
      text: '前往接下一位客人',
      kind: 'pickup',
      x: rider.x, y: rider.y, radius: 45,
      requireStopped: true,
      done: false,
    });
    const legTime = Math.hypot(rider.x - this.host.player.x, rider.y - this.host.player.y) / 60 + TAXI_FARE_GRACE;
    s.timeLimit = legTime;
    s.timeLeft = legTime;

    this.syncWaypoint();
    this.syncPassenger();
  }

  private onSuccess(def: MissionDef, nowMs: number): void {
    const s = this.session;
    if (!s) return;

    let pay = def.baseReward;
    if (def.kind === 'courier') {
      pay += computeCourierBonus(s.timeLeft ?? 0, s.timeLimit ?? 1);
      this.host.save.stats.couriers += 1;
      this.recordBest(def.id, s.elapsed, 'lower');
    } else if (def.kind === 'delivery') {
      const drops = s.objectives.filter(o => o.kind === 'dropoff').length;
      pay = computeDeliveryPay(drops, def.baseReward, 80, s.collisions);
      this.host.save.stats.deliveries += drops;
      this.recordBest(def.id, pay, 'higher');
    } else if (def.kind === 'getaway') {
      this.recordBest(def.id, s.elapsed, 'lower');
    }

    s.earned += pay;
    s.resultText = `任務完成 +$${s.earned}`;
    this.host.economy.earn(pay, 'mission');
    this.host.save.stats.missionsCompleted += 1;
    this.host.persist();
    this.host.showBanner('任務完成', `+$${s.earned}`, '#4ade80', 2600);
    succeedMission(s, nowMs);
  }

  private onFailure(nowMs: number): void {
    const s = this.session;
    if (!s) return;
    this.host.showBanner('任務失敗', s.failReason ?? '', '#f87171', 2600);
    this.host.clearWaypoint('mission');
    this.clearPassenger();
    const marker = this.markers.find(m => m.defId === s.defId);
    const def = getMission(s.defId);
    if (marker && def) marker.availableAt = nowMs + def.cooldown * 1000;
  }

  private endSession(): void {
    const s = this.session;
    if (s) {
      const def = getMission(s.defId);
      const marker = this.markers.find(m => m.defId === s.defId);
      if (marker && def && s.phase === 'success') {
        marker.availableAt = gameClock.now() + def.cooldown * 1000;
      }
    }
    this.host.clearWaypoint('mission');
    this.clearPassenger();
    this.session = null;
    this.cancelArmedUntil = 0;
  }

  private recordBest(defId: string, value: number, dir: 'lower' | 'higher'): void {
    const best = this.host.save.missionBest[defId];
    const better = best === undefined
      || (dir === 'lower' ? value < best : value > best);
    if (better) this.host.save.missionBest[defId] = Math.round(value);
  }

  // ── Passenger and waypoint sync ───────────────────────────────────────────

  private syncWaypoint(): void {
    const s = this.session;
    if (!s || s.phase !== 'active') return;
    const objective = currentObjective(s);
    if (!objective || objective.kind === 'loseWanted') {
      this.host.clearWaypoint('mission');
      return;
    }
    this.host.setWaypoint(objective.x, objective.y, 'mission');
  }

  /** Keep a visible pedestrian standing at the current pickup point. */
  private syncPassenger(): void {
    const s = this.session;
    if (!s || s.kind !== 'taxi' || s.phase !== 'active') {
      this.clearPassenger();
      return;
    }
    const objective = currentObjective(s);
    if (!objective || objective.kind !== 'pickup') {
      this.clearPassenger();
      return;
    }
    if (this.passengerIndex !== null) {
      const existing = this.host.pedestrians.peds[this.passengerIndex];
      if (existing?.active && existing.state === 'waiting') return;
    }
    const ped = this.host.pedestrians.spawnPassenger(objective.x, objective.y);
    this.passengerIndex = ped === null ? null : this.host.pedestrians.peds.indexOf(ped);
  }

  private clearPassenger(): void {
    if (this.passengerIndex === null) return;
    const ped = this.host.pedestrians.peds[this.passengerIndex];
    if (ped && ped.state === 'waiting') ped.active = false;
    this.passengerIndex = null;
  }

  // ── Sightseeing ───────────────────────────────────────────────────────────

  /** Called when the player's zone name changes, and periodically for landmarks. */
  checkDiscovery(): void {
    const { host } = this;
    const found: string[] = [];

    const zoneId = zoneLandmarkId(host.world, host.player.x, host.player.y);
    if (zoneId && zoneId !== this.lastZoneId) {
      this.lastZoneId = zoneId;
      if (!this.discovered.has(zoneId)) found.push(zoneId);
    }

    for (const landmark of positionalLandmarks()) {
      if (this.discovered.has(landmark.id)) continue;
      const at = landmark.at!(host.world);
      if (Math.hypot(host.player.x - at.x, host.player.y - at.y) <= landmark.radius) {
        found.push(landmark.id);
      }
    }

    if (found.length === 0) return;

    for (const id of found) {
      this.discovered.add(id);
      const landmark = LANDMARKS.find(l => l.id === id);
      host.economy.earn(SIGHTSEEING_PER_LANDMARK, 'discovery');
      host.addNotification(`🗺️ 發現 ${landmark?.label ?? id} +$${SIGHTSEEING_PER_LANDMARK}`, '#a78bfa');
    }

    host.save.stats.discovered = [...this.discovered];

    if (this.discovered.size >= LANDMARKS.length) {
      host.economy.earn(SIGHTSEEING_COMPLETE_BONUS, 'sightseeing_complete');
      host.showBanner('城市導覽完成', `+$${SIGHTSEEING_COMPLETE_BONUS}`, '#a78bfa', 2600);
    }
    host.persist();
  }

  // ── Hooks the engine calls ────────────────────────────────────────────────

  onCollision(): void {
    if (this.session?.phase === 'active') this.session.collisions += 1;
  }

  onVehicleDestroyed(vehicleId: string): void {
    const s = this.session;
    if (!s || s.phase !== 'active') return;
    if (s.vehicleId === vehicleId) {
      failMission(s, '車輛損毀', gameClock.now());
      this.onFailure(gameClock.now());
    }
  }

  onBusted(): void {
    const s = this.session;
    if (!s || s.phase !== 'active') return;
    failMission(s, '遭到逮捕', gameClock.now());
    this.onFailure(gameClock.now());
  }

  /** Launching a drone or starting a race abandons a vehicle-bound job. */
  onDistraction(reason: string): void {
    const s = this.session;
    if (!s || s.phase !== 'active') return;
    failMission(s, reason, gameClock.now());
    this.onFailure(gameClock.now());
  }

  // ── React-facing data ─────────────────────────────────────────────────────

  nearMarker(): { defId: string; title: string; icon: string } | null {
    if (this.session) return null;
    const now = gameClock.now();
    for (const marker of this.markers) {
      if (!marker.playerInside || now < marker.availableAt) continue;
      const def = getMission(marker.defId);
      if (def) return { defId: def.id, title: def.title, icon: def.icon };
    }
    return null;
  }

  getBlips(): MinimapBlip[] {
    const out: MinimapBlip[] = [];
    const now = gameClock.now();

    for (const marker of this.markers) {
      if (this.session) break;
      const def = getMission(marker.defId);
      if (!def) continue;
      out.push({
        x: marker.x, y: marker.y,
        kind: 'marker',
        color: now < marker.availableAt ? '#555a66' : def.color,
      });
    }

    const s = this.session;
    if (s && s.phase === 'active') {
      const objective = currentObjective(s);
      if (objective && objective.kind !== 'loseWanted') {
        out.push({ x: objective.x, y: objective.y, kind: 'mission', color: '#ffd23f', pulse: true });
      }
      if (s.passenger) {
        out.push({ x: s.passenger.x, y: s.passenger.y, kind: 'passenger', color: '#facc15' });
      }
    }
    return out;
  }

  getHUD(): MissionHUDData | null {
    const s = this.session;
    if (!s) return null;
    const def = getMission(s.defId);
    if (!def) return null;

    const objective = currentObjective(s);
    const total = s.kind === 'taxi'
      ? s.faresCompleted + 1
      : s.objectives.length;
    const doneCount = s.objectives.filter(o => o.done).length;

    return {
      defId: def.id,
      title: def.title,
      icon: def.icon,
      color: def.color,
      phase: s.phase,
      objectiveText: objective?.text ?? '',
      progressText: s.kind === 'taxi'
        ? `已完成 ${s.faresCompleted} 趟`
        : `${Math.min(doneCount + (s.phase === 'success' ? 0 : 1), total)}/${total}`,
      timeLeft: s.timeLeft,
      timeText: s.timeLeft === null ? null : formatMissionTime(s.timeLeft),
      earned: s.earned,
      resultText: s.resultText,
      cancelArmed: this.cancelArmed,
      description: def.description,
      reward: def.baseReward,
    };
  }

  getJobList(): JobListItem[] {
    const now = gameClock.now();
    return MISSIONS.map(def => {
      const marker = this.markers.find(m => m.defId === def.id);
      const cooldownLeft = marker ? Math.max(0, (marker.availableAt - now) / 1000) : 0;
      const active = this.session?.defId === def.id;
      return {
        defId: def.id,
        title: def.title,
        icon: def.icon,
        color: def.color,
        description: def.description,
        reward: def.baseReward,
        status: active ? 'active' : cooldownLeft > 0 ? 'cooldown' : 'available',
        cooldownLeft,
        best: this.host.save.missionBest[def.id] ?? null,
        progressText: def.passive
          ? `${this.discovered.size}/${LANDMARKS.length} 已發現`
          : null,
      };
    });
  }

  /** Marker position for the phone's "set route" button. */
  markerPosition(defId: string): Point | null {
    const marker = this.markers.find(m => m.defId === defId);
    return marker ? { x: marker.x, y: marker.y } : null;
  }

  /** Markers for the 3D renderer. */
  getMarkerRenderData(): Array<MissionMarker & { color: string; available: boolean }> {
    const now = gameClock.now();
    return this.markers.map(m => {
      const def = getMission(m.defId);
      return {
        ...m,
        color: def?.color ?? '#ffffff',
        available: now >= m.availableAt && !this.session,
      };
    });
  }
}

export type { MissionObjective };
