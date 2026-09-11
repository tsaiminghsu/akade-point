/**
 * PPI scope renderer.
 *
 * Draws the plan position indicator the way a marine set does: a rotating
 * sweep, echoes that glow and fade rather than blink on and off, range rings,
 * a bearing scale, and IMO-style target symbols with their vectors.
 *
 * Echo persistence is done with a second canvas that is never fully cleared,
 * only faded a little each frame. That is both cheaper than tracking every
 * echo's age in JavaScript and a closer match to how a phosphor screen behaves:
 * a strong return leaves a bright mark that decays over about one revolution.
 *
 * The echo buffer is kept north-up and centred on own ship, with the display
 * rotation applied when it is composited. Painting into an already-rotated
 * buffer would smear every old echo across the screen as own ship turned.
 */

import { normalizeDeg, toRad, vecToPolar } from './geo';
import type {
  ArpaTarget,
  MotionMode,
  Orientation,
  RadarConfig,
  RadarSnapshot,
  Vec2,
} from './types';

const COLORS = {
  background: '#03120c',
  scopeEdge: 'rgba(90, 235, 170, 0.55)',
  ring: 'rgba(72, 220, 160, 0.18)',
  ringLabel: 'rgba(140, 255, 205, 0.5)',
  bearingTick: 'rgba(90, 235, 170, 0.35)',
  bearingLabel: 'rgba(150, 255, 210, 0.65)',
  headingLine: 'rgba(225, 255, 240, 0.85)',
  echo: '61, 255, 158',
  land: '32, 190, 110',
  sweep: '90, 255, 180',
  trail: 'rgba(120, 240, 190, 0.35)',
  safe: '#4ade9a',
  warning: '#f5c451',
  danger: '#ff5f56',
  tentative: 'rgba(150, 230, 200, 0.55)',
  aisOnly: '#5ac8f5',
  selected: '#ffffff',
  guard: 'rgba(245, 196, 81, 0.75)',
  guardFill: 'rgba(245, 196, 81, 0.03)',
  ebl: 'rgba(120, 200, 255, 0.8)',
};

/** Display-only state that lives in React rather than in the engine. */
export interface ScopeOverlay {
  selectedTrackId: number | null;
  /** Cursor position in canvas pixels, or null when the pointer is away. */
  cursor: { x: number; y: number } | null;
  eblEnabled: boolean;
  /** Electronic bearing line, degrees true. */
  eblBearing: number;
  /** Variable range marker, NM. */
  vrmRange: number;
}

export interface ScopeGeometry {
  cx: number;
  cy: number;
  /** Pixels from the centre to the outermost range ring. */
  radius: number;
  /** Pixels per nautical mile. */
  scale: number;
  /** Degrees subtracted from a true bearing to get a screen angle. */
  rotationOffset: number;
}

export class ScopeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private echo: HTMLCanvasElement;
  private echoCtx: CanvasRenderingContext2D;

  private width = 0;
  private height = 0;
  private dpr = 1;

  /** Range the echo buffer was painted at, so a scale change can clear it. */
  private echoRangeNm = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.echo = document.createElement('canvas');
    const echoCtx = this.echo.getContext('2d');
    if (!echoCtx) throw new Error('2D canvas context unavailable');
    this.echoCtx = echoCtx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.echo.width = this.canvas.width;
    this.echo.height = this.canvas.height;
    this.clearEchoes();
  }

  clearEchoes(): void {
    this.echoCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.echoCtx.clearRect(0, 0, this.echo.width, this.echo.height);
  }

  geometry(config: RadarConfig, headingDeg: number, courseDeg: number): ScopeGeometry {
    const radius = Math.max(40, Math.min(this.width, this.height) / 2 - 26);
    return {
      cx: this.width / 2,
      cy: this.height / 2,
      radius,
      scale: radius / config.rangeNm,
      rotationOffset: rotationFor(config.orientation, headingDeg, courseDeg),
    };
  }

  /** Screen position of a point given as a bearing and range from own ship. */
  private place(g: ScopeGeometry, bearing: number, rangeNm: number): [number, number] {
    const th = toRad(bearing - g.rotationOffset);
    return [g.cx + Math.sin(th) * rangeNm * g.scale, g.cy - Math.cos(th) * rangeNm * g.scale];
  }

  /**
   * `applyFade` exists for repaints that are not a new frame of simulation, such
   * as the operator changing a setting. Those must not age the echo layer.
   */
  render(
    snapshot: RadarSnapshot,
    config: RadarConfig,
    overlay: ScopeOverlay,
    applyFade = true
  ): void {
    const { ctx } = this;
    const g = this.geometry(config, snapshot.own.heading, snapshot.own.cog);

    if (this.echoRangeNm !== config.rangeNm) {
      this.echoRangeNm = config.rangeNm;
      this.clearEchoes();
    }

    this.paintEchoes(snapshot, config, g, applyFade ? snapshot.advancedSec * 1000 : 0);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackground(g);
    this.compositeEchoes(g);
    this.drawRangeRings(g, config);
    this.drawGuardZone(g, config, snapshot);
    this.drawSweep(g, snapshot);
    this.drawBearingScale(g, config);
    this.drawHeadingLine(g, snapshot);

    if (config.showTrails) this.drawTrails(g, snapshot, config);
    this.drawTargets(g, snapshot, config, overlay);
    this.drawOwnShip(g, snapshot, config);
    this.drawEbl(g, overlay, config);
    this.drawCursor(g, overlay);
  }

  // ── Echo layer ──────────────────────────────────────────────────

  private paintEchoes(
    snapshot: RadarSnapshot,
    config: RadarConfig,
    g: ScopeGeometry,
    dtMs: number
  ): void {
    const ctx = this.echoCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Fade toward transparent over roughly one antenna revolution, so a target
    // is at its brightest as the beam leaves it and has almost gone by the time
    // the beam comes back.
    const persistenceMs = (60_000 / config.sweepRpm) * 1.15;
    const fade = Math.min(1, dtMs / persistenceMs);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalCompositeOperation = 'lighter';

    for (const plot of snapshot.plots) {
      if (plot.rangeNm > config.rangeNm) continue;

      const r = plot.rangeNm * g.scale;
      // The buffer is north-up, so no rotation offset here.
      const isLand = plot.id.startsWith('l');
      const halfWidth = toRad(plot.widthDeg) / 2;
      const th = toRad(plot.bearing);

      // Depth of the blob along the range axis, from pulse length, and its
      // width across, from beam width and the target's own size. Both are
      // floored at a few pixels: a real echo is a bloom on a phosphor, and a
      // sub-pixel dot would make the scope read as a scatter plot of symbols
      // rather than a radar picture.
      const depth = Math.max(isLand ? 8 : 6, (isLand ? 0.03 : 0.035) * g.scale);
      const arcLen = Math.max(isLand ? 8 : 7, halfWidth * 2 * r);

      ctx.save();
      ctx.translate(g.cx, g.cy);
      ctx.rotate(th);
      // After the rotation the target sits straight up the -y axis.
      const bloom = Math.max(arcLen, depth) * 0.85;
      const grad = ctx.createRadialGradient(0, -r, 0, 0, -r, bloom);
      const rgb = isLand ? COLORS.land : COLORS.echo;
      // Land samples sit closer together than their blobs are wide, so several
      // overlap on every pixel. Under additive compositing that saturates to
      // white unless each one is drawn faintly: the coastline should read as a
      // solid mass, not as the brightest thing on the screen.
      const peak = isLand ? 0.26 : Math.min(1, 0.55 + plot.strength * 0.5);
      grad.addColorStop(0, `rgba(${rgb}, ${0.95 * peak})`);
      grad.addColorStop(0.45, `rgba(${rgb}, ${0.6 * peak})`);
      grad.addColorStop(0.8, `rgba(${rgb}, ${0.18 * peak})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, -r, arcLen / 2, depth / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  private compositeEchoes(g: ScopeGeometry): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(-toRad(g.rotationOffset));
    ctx.translate(-g.cx, -g.cy);
    ctx.drawImage(this.echo, 0, 0, this.width, this.height);
    ctx.restore();
  }

  // ── Static furniture ────────────────────────────────────────────

  private drawBackground(g: ScopeGeometry): void {
    const { ctx } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const glow = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.radius);
    glow.addColorStop(0, 'rgba(20, 90, 60, 0.30)');
    glow.addColorStop(0.75, 'rgba(10, 50, 34, 0.18)');
    glow.addColorStop(1, 'rgba(4, 22, 15, 0.05)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRangeRings(g: ScopeGeometry, config: RadarConfig): void {
    const { ctx } = this;
    const rings = 4;
    ctx.lineWidth = 1;

    for (let i = 1; i <= rings; i += 1) {
      const rNm = (config.rangeNm / rings) * i;
      ctx.strokeStyle = COLORS.ring;
      ctx.setLineDash(i === rings ? [] : [3, 5]);
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, rNm * g.scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.ringLabel;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatRingLabel(rNm), g.cx + 4, g.cy - rNm * g.scale);
    }

    ctx.strokeStyle = COLORS.scopeEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawBearingScale(g: ScopeGeometry, config: RadarConfig): void {
    const { ctx } = this;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let deg = 0; deg < 360; deg += 5) {
      const major = deg % 30 === 0;
      const medium = deg % 10 === 0;
      const len = major ? 10 : medium ? 6 : 3;
      const th = toRad(deg - g.rotationOffset);
      const sin = Math.sin(th);
      const cos = Math.cos(th);

      ctx.strokeStyle = COLORS.bearingTick;
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(g.cx + sin * g.radius, g.cy - cos * g.radius);
      ctx.lineTo(g.cx + sin * (g.radius - len), g.cy - cos * (g.radius - len));
      ctx.stroke();

      if (major) {
        ctx.fillStyle = COLORS.bearingLabel;
        ctx.fillText(
          deg.toString().padStart(3, '0'),
          g.cx + sin * (g.radius + 13),
          g.cy - cos * (g.radius + 13)
        );
      }
    }

    // In head-up or course-up the scale rotates, so say which way is up.
    if (config.orientation !== 'north-up') {
      const th = toRad(-g.rotationOffset);
      ctx.fillStyle = COLORS.bearingLabel;
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('N', g.cx + Math.sin(th) * (g.radius - 22), g.cy - Math.cos(th) * (g.radius - 22));
    }
  }

  private drawSweep(g: ScopeGeometry, snapshot: RadarSnapshot): void {
    const { ctx } = this;
    const angle = toRad(snapshot.sweepAngle - g.rotationOffset);
    const tail = toRad(58);

    ctx.save();
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(g.cx, g.cy);
    // Canvas angles run from +x; the scope's zero is straight up.
    ctx.rotate(angle - Math.PI / 2);

    const grad = ctx.createConicGradient(0, 0, 0);
    grad.addColorStop(0, `rgba(${COLORS.sweep}, 0.20)`);
    grad.addColorStop(0.02, `rgba(${COLORS.sweep}, 0.10)`);
    grad.addColorStop(tail / (Math.PI * 2), `rgba(${COLORS.sweep}, 0)`);
    grad.addColorStop(1, `rgba(${COLORS.sweep}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${COLORS.sweep}, 0.65)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(g.radius, 0);
    ctx.stroke();

    ctx.restore();
  }

  private drawGuardZone(
    g: ScopeGeometry,
    config: RadarConfig,
    snapshot: RadarSnapshot
  ): void {
    const zone = config.guardZone;
    if (!zone.enabled) return;

    const { ctx } = this;
    const breached = snapshot.guardAlarms.length > 0;
    // Guard sectors are set relative to own ship's head, so they turn with her.
    const start = toRad(zone.startRelBearing + snapshot.own.heading - g.rotationOffset - 90);
    const end = toRad(zone.endRelBearing + snapshot.own.heading - g.rotationOffset - 90);

    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.beginPath();
    ctx.arc(0, 0, zone.outerNm * g.scale, start, end);
    ctx.arc(0, 0, zone.innerNm * g.scale, end, start, true);
    ctx.closePath();

    // Outline only. A wash of colour over the sector is the one place on the
    // scope guaranteed to contain something worth seeing, and filling it hides
    // the coastline and the echoes underneath behind a tint.
    ctx.fillStyle = breached ? 'rgba(255, 95, 86, 0.05)' : COLORS.guardFill;
    ctx.fill();
    ctx.strokeStyle = breached ? COLORS.danger : COLORS.guard;
    ctx.lineWidth = breached ? 1.6 : 1.2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawHeadingLine(g: ScopeGeometry, snapshot: RadarSnapshot): void {
    const { ctx } = this;
    const th = toRad(snapshot.own.heading - g.rotationOffset);

    ctx.strokeStyle = COLORS.headingLine;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.lineTo(g.cx + Math.sin(th) * g.radius, g.cy - Math.cos(th) * g.radius);
    ctx.stroke();
  }

  // ── Targets ─────────────────────────────────────────────────────

  private drawTrails(
    g: ScopeGeometry,
    snapshot: RadarSnapshot,
    config: RadarConfig
  ): void {
    if (config.trailMinutes <= 0) return;
    const { ctx } = this;
    const cutoff = snapshot.t - config.trailMinutes * 60_000;

    ctx.fillStyle = COLORS.trail;
    for (const target of snapshot.targets) {
      if (target.aisOnly) continue;
      for (const point of target.trail) {
        if (point.t < cutoff) continue;
        const rel = relativeVec(point, snapshot.ownVec);
        const { bearing, range } = vecToPolar(rel);
        if (range > config.rangeNm) continue;
        const [x, y] = this.place(g, bearing, range);
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
  }

  private drawTargets(
    g: ScopeGeometry,
    snapshot: RadarSnapshot,
    config: RadarConfig,
    overlay: ScopeOverlay
  ): void {
    const { ctx } = this;
    // A one-second flash period for anything alarming.
    const flash = Math.sin(snapshot.t / 160) > -0.2;

    for (const target of snapshot.targets) {
      if (target.rangeNm > config.rangeNm) continue;
      const [x, y] = this.place(g, target.bearing, target.rangeNm);
      const selected = overlay.selectedTrackId === target.trackId;
      const color = targetColor(target);

      if (config.showVectors) {
        this.drawVector(g, target, config, x, y, color);
      }

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = target.danger === 'danger' ? 2 : 1.4;

      if (target.aisOnly) {
        // AIS-only contacts get the pointed symbol, oriented to their heading.
        const th = toRad((target.ais?.heading ?? target.cog) - g.rotationOffset);
        ctx.translate(x, y);
        ctx.rotate(th);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(4.5, 5);
        ctx.lineTo(0, 2.5);
        ctx.lineTo(-4.5, 5);
        ctx.closePath();
        ctx.stroke();
      } else if (target.status === 'tentative') {
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        if (target.danger !== 'safe' && !flash) {
          ctx.restore();
          continue;
        }
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();

        if (target.danger === 'danger') {
          ctx.beginPath();
          ctx.arc(x, y, 9.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (target.status === 'coasting') {
          // A coasting track is dead reckoned, not observed. Say so.
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4);
          ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x + 4, y - 4);
          ctx.lineTo(x - 4, y + 4);
          ctx.stroke();
        }
      }
      ctx.restore();

      if (selected) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - 12, y - 12, 24, 24);
      }

      // Label confirmed contacts once there is room for it.
      if (!config.showTruth && (selected || target.danger !== 'safe')) {
        const label = target.ais?.name?.trim() || `T${Math.abs(target.trackId)}`;
        ctx.fillStyle = selected ? COLORS.selected : color;
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, x + 11, y - 8);
      }
    }
  }

  private drawVector(
    g: ScopeGeometry,
    target: ArpaTarget,
    config: RadarConfig,
    x: number,
    y: number,
    color: string
  ): void {
    const { ctx } = this;
    const useTrue = config.motionMode === 'true';
    const speed = useTrue ? target.sog : target.relSpeed;
    const course = useTrue ? target.cog : target.relCourse;
    if (speed < 0.3) return;

    const lengthNm = (speed * config.vectorMinutes) / 60;
    const th = toRad(course - g.rotationOffset);
    const ex = x + Math.sin(th) * lengthNm * g.scale;
    const ey = y - Math.cos(th) * lengthNm * g.scale;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    // Relative vectors are dashed, true vectors solid. That distinction is the
    // whole point of the control: one shows where a target will be, the other
    // shows whether it will hit you.
    ctx.setLineDash(useTrue ? [] : [4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    if (useTrue) {
      ctx.translate(ex, ey);
      ctx.rotate(th);
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(3, 3);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawOwnShip(
    g: ScopeGeometry,
    snapshot: RadarSnapshot,
    config: RadarConfig
  ): void {
    const { ctx } = this;
    const th = toRad(snapshot.own.heading - g.rotationOffset);

    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(th);
    ctx.strokeStyle = COLORS.headingLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Own ship's own true vector, so relative-motion vectors can be read against it.
    if (config.showVectors && config.motionMode === 'true' && snapshot.own.sog > 0.3) {
      const lengthNm = (snapshot.own.sog * config.vectorMinutes) / 60;
      const ct = toRad(snapshot.own.cog - g.rotationOffset);
      ctx.strokeStyle = 'rgba(225, 255, 240, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(g.cx, g.cy);
      ctx.lineTo(
        g.cx + Math.sin(ct) * lengthNm * g.scale,
        g.cy - Math.cos(ct) * lengthNm * g.scale
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── Cursor tools ────────────────────────────────────────────────

  private drawEbl(g: ScopeGeometry, overlay: ScopeOverlay, config: RadarConfig): void {
    if (!overlay.eblEnabled) return;
    const { ctx } = this;

    ctx.save();
    ctx.strokeStyle = COLORS.ebl;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);

    const th = toRad(overlay.eblBearing - g.rotationOffset);
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.lineTo(g.cx + Math.sin(th) * g.radius, g.cy - Math.cos(th) * g.radius);
    ctx.stroke();

    const vrm = Math.min(overlay.vrmRange, config.rangeNm);
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, vrm * g.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawCursor(g: ScopeGeometry, overlay: ScopeOverlay): void {
    if (!overlay.cursor) return;
    const { ctx } = this;
    const dx = overlay.cursor.x - g.cx;
    const dy = overlay.cursor.y - g.cy;
    if (Math.hypot(dx, dy) > g.radius) return;

    ctx.strokeStyle = 'rgba(200, 255, 230, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(overlay.cursor.x - 7, overlay.cursor.y);
    ctx.lineTo(overlay.cursor.x + 7, overlay.cursor.y);
    ctx.moveTo(overlay.cursor.x, overlay.cursor.y - 7);
    ctx.lineTo(overlay.cursor.x, overlay.cursor.y + 7);
    ctx.stroke();
  }
}

// ── Helpers shared with the React layer ───────────────────────────

export function rotationFor(
  orientation: Orientation,
  heading: number,
  course: number
): number {
  if (orientation === 'head-up') return heading;
  if (orientation === 'course-up') return course;
  return 0;
}

/** Bearing and range of a canvas point, for the cursor readout and picking. */
export function screenToPolar(
  px: number,
  py: number,
  g: ScopeGeometry
): { bearing: number; range: number } {
  const dx = px - g.cx;
  const dy = g.cy - py;
  return {
    bearing: normalizeDeg((Math.atan2(dx, dy) * 180) / Math.PI + g.rotationOffset),
    range: Math.hypot(dx, dy) / g.scale,
  };
}

function relativeVec(point: Vec2, ownVec: Vec2): Vec2 {
  return { x: point.x - ownVec.x, y: point.y - ownVec.y };
}

export function targetColor(target: ArpaTarget): string {
  if (target.danger === 'danger') return COLORS.danger;
  if (target.danger === 'warning' || target.inGuardZone) return COLORS.warning;
  if (target.aisOnly) return COLORS.aisOnly;
  if (target.status === 'tentative') return COLORS.tentative;
  return COLORS.safe;
}

export function motionModeLabel(mode: MotionMode): string {
  return mode === 'true' ? '真運動' : '相對運動';
}

function formatRingLabel(nm: number): string {
  return nm < 1 ? `${nm.toFixed(2)}` : `${nm.toFixed(nm % 1 === 0 ? 0 : 1)}`;
}
