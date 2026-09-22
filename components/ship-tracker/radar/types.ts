/**
 * Marine radar / ARPA domain types.
 *
 * Unit conventions used everywhere in this module. Deviating from them is the
 * easiest way to break the simulation, so they are stated once, here:
 *
 *   distance  nautical miles (NM)
 *   speed     knots (NM per hour)
 *   bearing   degrees TRUE, clockwise from north, normalised to [0, 360)
 *   turn rate degrees per minute, signed (positive = to starboard)
 *   time      milliseconds for wall-clock stamps, seconds for durations
 *
 * The local tangent plane is east/north in NM, with its origin pinned to a
 * fixed scene anchor rather than to own ship. Track states therefore live in
 * ground coordinates, which is what a ground-stabilised ARPA does. Relative
 * motion is derived at display time by subtracting own ship's own vector.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** East/north offset in nautical miles from the scene origin. */
export interface Vec2 {
  x: number;
  y: number;
}

export type VesselKind =
  | 'container'
  | 'tanker'
  | 'bulker'
  | 'fishing'
  | 'tug'
  | 'pilot'
  | 'patrol'
  | 'cargo';

export type NavStatus = 'underway' | 'anchored' | 'moored' | 'fishing' | 'restricted';

/** Ground truth for one simulated vessel. The tracker never sees this. */
export interface Vessel {
  mmsi: string;
  name: string;
  kind: VesselKind;
  /** Length overall in metres. Drives echo size and the AIS payload. */
  lengthM: number;
  pos: LatLon;
  /** Course over ground, degrees true. */
  cog: number;
  /** Speed over ground, knots. */
  sog: number;
  /** Heading, degrees true. Differs from course by leeway and set. */
  heading: number;
  /** Current rate of turn, degrees per minute, signed. */
  rot: number;
  navStatus: NavStatus;
  destination: string;
  /** Radar cross-section factor, about 0.15 for a skiff up to 1 for a VLCC. */
  rcs: number;
  /** When false the vessel is dark: it paints on radar but sends no AIS. */
  aisEnabled: boolean;
  /** Waypoints the vessel steers through. Empty when anchored or moored. */
  route: LatLon[];
  legIndex: number;
  /** Service speed the vessel accelerates back toward, knots. */
  cruiseSog: number;
  /** Anchor swing phase in radians. Only used when the status is anchored. */
  swingPhase: number;
  /** Wall-clock ms of this vessel's last AIS broadcast. */
  lastAisTx: number;
}

/** Own ship: the radar platform. */
export interface OwnShip {
  pos: LatLon;
  heading: number;
  cog: number;
  sog: number;
  rot: number;
  /** Helm demand the autopilot steers toward. */
  orderedCourse: number;
  orderedSpeed: number;
}

/** A raw radar return from one beam crossing. Noisy, unlabelled, transient. */
export interface RadarPlot {
  id: string;
  /** Wall-clock ms at which the beam illuminated this target. */
  t: number;
  /** Measured slant range in NM, including noise. */
  rangeNm: number;
  /** Measured bearing in degrees true, including beam-width noise. */
  bearing: number;
  /** Normalised echo amplitude 0..1. Drives paint brightness. */
  strength: number;
  /** Angular extent of the blob in degrees, from beam width plus target length. */
  widthDeg: number;
  /** Ground-truth link for the debug overlay only. The tracker never reads it. */
  truthMmsi?: string;
}

export type TrackStatus = 'tentative' | 'confirmed' | 'coasting' | 'lost';

/** An alpha-beta filtered track in ground coordinates. */
export interface Track {
  id: number;
  status: TrackStatus;
  /** Filtered position in NM, east and north of the scene origin. */
  x: number;
  y: number;
  /** Filtered velocity in NM per second. */
  vx: number;
  vy: number;
  /** Wall-clock ms of the last measurement update. */
  lastUpdate: number;
  firstSeen: number;
  /** Successful associations since birth. Drives filter gain and confirmation. */
  hits: number;
  /** Consecutive scans with no association. */
  misses: number;
  /** Filtered position history for the trail, newest last. */
  trail: Array<Vec2 & { t: number }>;
  /**
   * Raw, unfiltered measurement positions kept while the track is tentative.
   * The initiation check has to run on these: the filter itself pulls the
   * filtered trail toward a straight line, so testing that would be asking the
   * tracker to mark its own homework. Cleared once the track is decided.
   */
  initSamples: Array<Vec2 & { t: number }>;
  /** Last association residual in NM. */
  residual: number;
  /** Smoothed residual magnitude in NM, the noise level the filter expects. */
  residualAvg: number;
  /**
   * Update count driving the filter gains. Normally equal to `hits`, but the
   * manoeuvre detector winds it back so the gains reopen and the filter can
   * follow a turn.
   */
  gainAge: number;
  /** Scans remaining on the manoeuvre flag. */
  manoeuvreHold: number;
  /**
   * Fading sum of recent residual vectors, each divided by the measurement
   * noise expected at its range. Noise points every which way and cancels;
   * a turn the filter is lagging pushes the same way scan after scan and
   * builds up. Its length is the manoeuvre test statistic.
   */
  driftX: number;
  driftY: number;
  /**
   * Wall-clock ms of the last real measurement. Unlike `lastUpdate`, coasting
   * does not advance it, so it says how long the track has gone unobserved.
   */
  lastMeasured: number;
  /** MMSI of the AIS report fused onto this track, when one holds. */
  aisMmsi?: string;
  /** Consecutive scans the AIS association has held. */
  aisLock: number;
}

/** What an AIS receiver hears. Independent of the radar. */
export interface AisReport {
  mmsi: string;
  name: string;
  kind: VesselKind;
  lengthM: number;
  lat: number;
  lon: number;
  cog: number;
  sog: number;
  heading: number;
  navStatus: NavStatus;
  destination: string;
  /** Wall-clock ms the report was received. */
  t: number;
}

export type DangerLevel = 'safe' | 'warning' | 'danger';

/** A track after ARPA processing: what the bridge team actually reads. */
export interface ArpaTarget {
  trackId: number;
  status: TrackStatus;
  /** Ground position, for plotting. */
  x: number;
  y: number;
  /** Range from own ship, NM. */
  rangeNm: number;
  /** True bearing from own ship, degrees. */
  bearing: number;
  /** Bearing relative to own ship's head, degrees in [0, 360). */
  relativeBearing: number;
  /** The target's own course and speed over ground. */
  cog: number;
  sog: number;
  /** Motion relative to own ship. */
  relCourse: number;
  relSpeed: number;
  /** Closest point of approach, NM. */
  cpaNm: number;
  /** Time to CPA in seconds. Negative means the CPA is already astern. */
  tcpaSec: number;
  /** Range at which the target crosses own ship's bow, NM. NaN if it never does. */
  bowCrossRangeNm: number;
  bowCrossTimeSec: number;
  danger: DangerLevel;
  inGuardZone: boolean;
  /** True when the bearing holds steady while the range closes. */
  steadyBearing: boolean;
  /**
   * True when the track has just broken away from its predicted path. The
   * course and speed shown are unreliable until the filter resettles, which is
   * exactly when an operator most needs telling.
   */
  manoeuvring: boolean;
  ais?: AisReport;
  trail: Array<Vec2 & { t: number }>;
  /** True when only AIS sees it and no radar track backs the symbol. */
  aisOnly: boolean;
}

export type Orientation = 'north-up' | 'head-up' | 'course-up';
export type MotionMode = 'relative' | 'true';

export interface GuardZone {
  enabled: boolean;
  /** Inner radius, NM. */
  innerNm: number;
  /** Outer radius, NM. */
  outerNm: number;
  /** Sector limits in degrees relative to own ship's head. Equal means all round. */
  startRelBearing: number;
  endRelBearing: number;
}

export interface RadarConfig {
  /** Display range scale: NM to the outer ring. */
  rangeNm: number;
  /** Antenna rotation rate, revolutions per minute. */
  sweepRpm: number;
  orientation: Orientation;
  motionMode: MotionMode;
  /** Vector prediction length, minutes. */
  vectorMinutes: number;
  /** Trail length in minutes. Zero disables trails. */
  trailMinutes: number;
  /** Receiver gain 0..1. Raises detection probability and noise together. */
  gain: number;
  /** Sea clutter suppression 0..1, the sensitivity time control. */
  seaClutter: number;
  /** Rain clutter suppression 0..1, the fast time constant. */
  rainClutter: number;
  guardZone: GuardZone;
  /** CPA alarm limit, NM. */
  cpaLimitNm: number;
  /** TCPA alarm limit, minutes. */
  tcpaLimitMin: number;
  showAisOverlay: boolean;
  showTrails: boolean;
  showVectors: boolean;
  /**
   * Paint the simulation's real vessel positions over the radar picture, with
   * each track's error and any phantom tracks marked. A debugging aid for the
   * sensor model and tracker; it never feeds back into either.
   */
  showTruth: boolean;
}

export type DataSource = 'simulation' | 'live-ais';

/**
 * Why a real vessel does or does not have a radar track.
 *
 * - `tracked`: a confirmed or coasting track is following it.
 * - `acquiring`: only a tentative track is on it so far.
 * - `masked`: land stands between it and the antenna.
 * - `out-of-range`: inside the blind zone or beyond instrumented range.
 * - `missed`: the radar can see it and still has no track on it.
 */
export type TruthStatus = 'tracked' | 'acquiring' | 'masked' | 'out-of-range' | 'missed';

/** One real vessel, as the ground-truth debug overlay shows it. */
export interface TruthContact {
  mmsi: string;
  name: string;
  /** Ground position, NM east and north of the scene origin. */
  x: number;
  y: number;
  /** Bearing and range from own ship, in the same plane the tracks use. */
  bearing: number;
  rangeNm: number;
  heading: number;
  sog: number;
  aisEnabled: boolean;
  status: TruthStatus;
  /** The radar track following this vessel, if one is. */
  trackId: number | null;
  /** Distance from the vessel to that track, NM. NaN when untracked. */
  trackErrorNm: number;
}

/** The simulation's ground truth lined up against the tracker's output. */
export interface TruthOverlay {
  contacts: TruthContact[];
  /**
   * Confirmed tracks with no real vessel under them. A confirmed track is still
   * being fed measurements, so one that follows no ship is being fed clutter:
   * the tracker promoted noise into a target.
   */
  phantomTrackIds: number[];
  /**
   * Coasting tracks with no real vessel under them. These lost their ship and
   * dead-reckoned away from it, or the ship already has a newer track. The
   * usual cause is an association fault where two targets pass close, which
   * needs a different fix from a phantom, so the two are kept apart.
   */
  strayTrackIds: number[];
}

/** Everything the renderer and the panels need for one frame. */
export interface RadarSnapshot {
  t: number;
  /**
   * Simulated seconds advanced by the step that produced this snapshot.
   *
   * Not the same as the wall-clock frame time: catch-up after a stall is
   * bounded, so a frame arriving four seconds late still only turns the antenna
   * through a second and a half. Anything that decays with the sweep — echo
   * persistence above all — has to use this, or a stalled tab comes back to a
   * blank screen because the phosphor was faded for time the beam never swept.
   */
  advancedSec: number;
  own: OwnShip;
  ownVec: Vec2;
  targets: ArpaTarget[];
  plots: RadarPlot[];
  sweepAngle: number;
  scanCount: number;
  /** Targets currently breaching the CPA and TCPA limits. */
  alarms: ArpaTarget[];
  guardAlarms: ArpaTarget[];
  /**
   * Ground truth for the debug overlay. Null unless `showTruth` is on, so the
   * matching costs nothing in normal use. Display only: nothing in tracking,
   * fusion or ARPA ever reads it.
   */
  truth: TruthOverlay | null;
}
