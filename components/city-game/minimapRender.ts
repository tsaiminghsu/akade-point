import {
  GameState,
  MinimapBlip,
  Point,
  TileType,
  VehicleType,
  WorldData,
  GRID_SIZE,
  WORLD_SIZE,
} from './types';

/**
 * Minimap rendering.
 *
 * The static city is drawn once into an offscreen canvas and then blitted, so
 * the per-frame cost is a single drawImage plus a handful of entities. The
 * previous implementation walked all 6400 tiles on every draw, which is far too
 * expensive now that the map rotates and updates at ~20Hz.
 */

/** Resolution of the cached base map: 6px per tile. */
const BASE_PX_PER_TILE = 6;
const BASE_SIZE = GRID_SIZE * BASE_PX_PER_TILE;

/** How much world the GTA view shows, in world px from the centre. */
export const VIEW_RADIUS_FOOT = 420;
export const VIEW_RADIUS_VEHICLE = 640;

/** The player sits below centre so more of the map ahead is visible. */
const PLAYER_CY_FRACTION = 0.58;

const COLORS = {
  backdrop: '#0a0a1e',
  road: '#3a3a4d',
  sidewalk: '#4a4a5c',
  parking: '#2f3340',
  park: '#1a3a1a',
  helipad: '#443300',
  townHall: '#5a4a2a',
  plaza: '#6a5a3a',
  droneField: '#1f5a63',
  route: '#c084fc',
  player: '#ffdc00',
} as const;

const baseCache = new WeakMap<WorldData, HTMLCanvasElement>();

/** Render (and memoise) the static city map for a world. */
export function getMiniMapBase(world: WorldData): HTMLCanvasElement | null {
  const cached = baseCache.get(world);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = BASE_SIZE;
  canvas.height = BASE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = COLORS.backdrop;
  ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE);

  const t = BASE_PX_PER_TILE;
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const tile = world.grid[gy]?.[gx];
      if (!tile) continue;

      let fill: string | null = null;
      switch (tile.type) {
        case TileType.ROAD_H:
        case TileType.ROAD_V:
        case TileType.INTERSECTION:
          fill = COLORS.road; break;
        case TileType.SIDEWALK:
          fill = COLORS.sidewalk; break;
        case TileType.PARKING:
          fill = COLORS.parking; break;
        case TileType.PARK:
          fill = COLORS.park; break;
        case TileType.HELIPAD:
          fill = COLORS.helipad; break;
        case TileType.TOWN_HALL:
        case TileType.TOWN_HALL_INTERIOR:
          fill = COLORS.townHall; break;
        case TileType.TOWN_HALL_PLAZA:
          fill = COLORS.plaza; break;
        case TileType.DRONE_FIELD:
          fill = COLORS.droneField; break;
        case TileType.BUILDING: {
          // Taller buildings read lighter, which gives the map some relief.
          const floors = tile.floors ?? 1;
          fill = `hsl(220,10%,${18 + Math.min(floors * 1.5, 20)}%)`;
          break;
        }
        default:
          fill = null;
      }
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(gx * t, gy * t, t + 0.5, t + 0.5);
    }
  }

  baseCache.set(world, canvas);
  return canvas;
}

/** The transform used by the last draw, needed to invert canvas clicks. */
export interface MiniMapTransform {
  cx: number;
  cy: number;
  /** Canvas px per world px. */
  scale: number;
  /** Map rotation in radians (0 for the full map). */
  yaw: number;
  /** World point at the centre of the view. */
  originX: number;
  originY: number;
}

/** Convert a click on the minimap canvas back into world coordinates. */
export function minimapToWorld(t: MiniMapTransform, canvasX: number, canvasY: number): Point {
  const dx = (canvasX - t.cx) / t.scale;
  const dy = (canvasY - t.cy) / t.scale;
  const cos = Math.cos(t.yaw);
  const sin = Math.sin(t.yaw);
  return {
    x: Math.max(0, Math.min(WORLD_SIZE, t.originX + dx * cos - dy * sin)),
    y: Math.max(0, Math.min(WORLD_SIZE, t.originY + dx * sin + dy * cos)),
  };
}

function drawRoute(ctx: CanvasRenderingContext2D, route: Point[], from: Point, dashed: boolean) {
  if (route.length === 0) return;
  ctx.save();
  ctx.strokeStyle = COLORS.route;
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.85;
  if (dashed) ctx.setLineDash([26, 20]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  for (const p of route) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function blipColor(b: MinimapBlip): string {
  return b.color;
}

/**
 * Draw everything that lives in world space. The caller has already applied the
 * world-to-canvas transform, so `invScale` is used to keep icons a constant
 * size on screen regardless of zoom.
 */
function drawWorldLayers(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  world: WorldData,
  invScale: number,
  tick: number,
) {
  const base = getMiniMapBase(world);
  if (base) {
    ctx.drawImage(base, 0, 0, BASE_SIZE, BASE_SIZE, 0, 0, WORLD_SIZE, WORLD_SIZE);
  }

  if (state.route && state.route.length > 0) {
    drawRoute(ctx, state.route, state.player, false);
  }

  // Vehicles
  state.vehicles.forEach(v => {
    if (v.occupant === 'player') return;
    if (v.type === VehicleType.RC_DRONE) return;
    const color = v.type === VehicleType.TAXI ? '#ffee00'
      : v.type === VehicleType.DELIVERY_SCOOTER ? '#ff8c00'
      : v.type === VehicleType.HELICOPTER ? '#a0d8ef'
      : v.type === VehicleType.POLICE ? '#4488ff'
      : v.hp <= 0 ? '#552222'
      : '#8a8a99';
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = color;
    const w = 9 * invScale;
    const h = 15 * invScale;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  });

  // Waypoint
  if (state.waypoint.active) {
    const r = 7 * invScale;
    ctx.fillStyle = '#ff3232';
    ctx.beginPath();
    ctx.arc(state.waypoint.x, state.waypoint.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * invScale;
    ctx.stroke();
  }

  // Blips (missions, police, pay-n-spray, …)
  const pulse = 0.7 + 0.3 * Math.sin(tick * 0.15);
  for (const b of state.blips) {
    const r = (b.pulse ? 6 * pulse : 6) * invScale;
    ctx.fillStyle = blipColor(b);
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw the player arrow at a fixed canvas position, rotated by heading - yaw. */
function drawPlayerArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, heading: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.fillStyle = COLORS.player;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * GTA-style minimap: circular, centred on the player, rotating with the camera.
 * Returns the transform so clicks can be inverted.
 */
export function renderMiniMapGTA(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  world: WorldData,
  size: number,
  viewRadius: number,
): MiniMapTransform {
  const cx = size / 2;
  const cy = size * PLAYER_CY_FRACTION;
  const scale = (size / 2) / viewRadius;
  const yaw = state.camYaw;

  ctx.clearRect(0, 0, size, size);
  ctx.save();

  // Circular mask
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = COLORS.backdrop;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-yaw);
  ctx.scale(scale, scale);
  ctx.translate(-state.player.x, -state.player.y);
  drawWorldLayers(ctx, state, world, 1 / scale, state.tick);
  ctx.restore();

  drawPlayerArrow(ctx, cx, cy, state.player.angle - yaw);

  // North marker on the rim
  const rimR = size / 2 - 9;
  const nx = size / 2 + Math.sin(-yaw) * rimR;
  const ny = size / 2 - Math.cos(-yaw) * rimR;
  ctx.fillStyle = 'rgba(255,80,80,0.9)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', nx, ny);

  ctx.restore();

  // Rim
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();

  return { cx, cy, scale, yaw, originX: state.player.x, originY: state.player.y };
}

/** Whole-city view: no rotation, used for setting distant waypoints. */
export function renderMiniMapFull(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  world: WorldData,
  width: number,
  height: number,
): MiniMapTransform {
  const size = Math.min(width, height);
  const scale = size / WORLD_SIZE;
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.backdrop;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  drawWorldLayers(ctx, state, world, 1 / scale, state.tick);
  ctx.restore();

  drawPlayerArrow(
    ctx,
    offsetX + state.player.x * scale,
    offsetY + state.player.y * scale,
    state.player.angle,
  );

  return {
    cx: offsetX + (WORLD_SIZE / 2) * scale,
    cy: offsetY + (WORLD_SIZE / 2) * scale,
    scale,
    yaw: 0,
    originX: WORLD_SIZE / 2,
    originY: WORLD_SIZE / 2,
  };
}
