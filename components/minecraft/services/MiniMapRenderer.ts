/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Canvas2D renderer for the minimap overlay.
 *
 * Rendering model — "heading-up" rotating map:
 *   - The canvas is rotated so the player's forward direction always points UP.
 *   - The player marker is a static white arrow at canvas center.
 *   - The world (chunks) and compass labels orbit around the player.
 *
 * Coordinate conventions (PlayerController look.yaw):
 *   yaw = 0      → facing world -Z (north), canvas needs no rotation
 *   yaw = +π/2   → facing world -X (west),  canvas rotated –90° (CCW)
 *   yaw = –π/2   → facing world +X (east),  canvas rotated +90° (CW)
 *
 * Canvas rotation formula: ctx.rotate(-yaw)
 *   After translation to canvas center, a world-space point (dx, dz) relative
 *   to the player lands at screen offset (dx·cos(yaw) – dz·sin(yaw), ...).
 *   This maps the forward direction to canvas-up for every yaw value.
 *
 * Compass label positions (drawn after ctx.restore, in screen space):
 *   For a direction at angle α from world-north (CW), the screen offset is:
 *     screenX = R · sin(α + yaw)
 *     screenY = –R · cos(α + yaw)
 */

import type { World } from '../engine/chunks';
import type { PlayerTransform, MiniMapDebugInfo, MiniMapState } from '../types/minimap.types';
import type { MiniMapTextureCache } from './MiniMapTextureCache';
import { CHUNK_SIZE } from '../config';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 256;

/**
 * Number of world blocks visible across the full canvas width at zoom = 1.
 * Changing this scales the entire map view.
 */
const BASE_VIEW_BLOCKS = 80;

const CENTER = CANVAS_SIZE / 2;

/** Distance from canvas center to compass label, in pixels. */
const COMPASS_RADIUS = CENTER - 14;

// ─── Compass Directions ───────────────────────────────────────────────────────

interface CompassLabel {
  label: string;
  /** Angle from world-north, clockwise (radians). */
  alpha: number;
}

const COMPASS_LABELS: readonly CompassLabel[] = [
  { label: 'N', alpha: 0 },
  { label: 'E', alpha: Math.PI / 2 },
  { label: 'S', alpha: Math.PI },
  { label: 'W', alpha: (3 * Math.PI) / 2 },
];

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class MiniMapRenderer {
  private readonly ctx: CanvasRenderingContext2D;

  // FPS tracking
  private lastFrameTime = 0;
  private frameCount    = 0;
  private fpsAccum      = 0;
  private currentFps    = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MiniMapRenderer: Canvas2D context unavailable');
    this.ctx = ctx;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  render(
    world: World,
    transform: PlayerTransform,
    cache: MiniMapTextureCache,
    state: MiniMapState,
    visibleChunks: number,
    renderedChunks: number,
  ): MiniMapDebugInfo {
    const t0 = performance.now();

    const viewBlocks      = BASE_VIEW_BLOCKS / state.zoom;
    const scale           = CANVAS_SIZE / viewBlocks; // pixels per world block
    const chunkPixelSize  = CHUNK_SIZE * scale;

    this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // ── 1. Rotated world pass ────────────────────────────────────────────────
    this.ctx.save();
    this.ctx.translate(CENTER, CENTER);
    // Rotate world so player's forward direction appears at the top of the map
    this.ctx.rotate(-transform.yaw);

    for (const chunk of world.chunks.values()) {
      const entry = cache.get(chunk.cx, chunk.cz);
      if (!entry) continue;

      // Offset of this chunk's origin relative to the player, in canvas pixels
      const dx = (chunk.cx * CHUNK_SIZE - transform.x) * scale;
      const dz = (chunk.cz * CHUNK_SIZE - transform.z) * scale;

      this.ctx.drawImage(entry.canvas, dx, dz, chunkPixelSize, chunkPixelSize);

      if (state.showChunkBorder) {
        this.ctx.strokeStyle = 'rgba(180,180,180,0.22)';
        this.ctx.lineWidth   = 0.5;
        this.ctx.strokeRect(dx, dz, chunkPixelSize, chunkPixelSize);
      }
    }

    this.ctx.restore();
    // ── End rotated pass ─────────────────────────────────────────────────────

    // ── 2. Player marker (static, at canvas center, pointing up) ─────────────
    if (state.showPlayer) {
      this.drawPlayerMarker();
    }

    // ── 3. Compass labels (screen-space, orbit with yaw) ─────────────────────
    if (state.showCompass) {
      this.drawCompass(transform.yaw);
    }

    // ── FPS throttle (1-second window) ───────────────────────────────────────
    const now    = performance.now();
    const delta  = now - (this.lastFrameTime || now);
    this.lastFrameTime = now;
    this.frameCount++;
    this.fpsAccum += delta;

    if (this.fpsAccum >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / this.fpsAccum);
      this.frameCount = 0;
      this.fpsAccum   = 0;
    }

    return {
      fps:           this.currentFps,
      visibleChunks,
      renderedChunks,
      updateTimeMs:  performance.now() - t0,
      cacheHits:     cache.hits,
      cacheMisses:   cache.misses,
    };
  }

  // ── Private Drawing ─────────────────────────────────────────────────────────

  /**
   * White filled arrow at canvas center, pointing straight up.
   * Because the world is already rotated by –yaw, "up" equals the player's
   * forward direction — no additional rotation needed here.
   */
  private drawPlayerMarker(): void {
    const { ctx } = this;

    ctx.save();
    ctx.translate(CENTER, CENTER);

    ctx.beginPath();
    ctx.moveTo(0, -8);   // tip (forward / up)
    ctx.lineTo(5, 6);    // right wing
    ctx.lineTo(0, 3);    // centre notch
    ctx.lineTo(-5, 6);   // left wing
    ctx.closePath();

    ctx.fillStyle   = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw N/E/S/W labels around the minimap edge in screen space.
   *
   * Each label occupies a fixed world-compass angle α.  Its screen position
   * is derived by applying the same –yaw rotation that the world pass used:
   *
   *   screenX = CENTER + R · sin(α + yaw)
   *   screenY = CENTER – R · cos(α + yaw)
   *
   * This keeps the labels co-rotating with the terrain, so N always points
   * toward world north on the minimap.
   */
  private drawCompass(yaw: number): void {
    const { ctx } = this;

    ctx.font         = 'bold 9px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (const { label, alpha } of COMPASS_LABELS) {
      const angle  = alpha + yaw;
      const screenX = CENTER + COMPASS_RADIUS * Math.sin(angle);
      const screenY = CENTER - COMPASS_RADIUS * Math.cos(angle);

      ctx.fillStyle = label === 'N'
        ? 'rgba(255,80,80,0.95)'
        : 'rgba(220,220,220,0.85)';

      ctx.fillText(label, screenX, screenY);
    }
  }
}
