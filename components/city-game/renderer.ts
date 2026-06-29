import {
  TILE_SIZE,
  GRID_SIZE,
  TileType,
  BuildingType,
  Tile,
  Vehicle,
  VehicleType,
  GameState,
  WorldData,
  Waypoint,
} from './types';

// Color palettes
const ROAD_COLOR = '#1a1a2e';
const ROAD_MARKING_COLOR = '#ffdd57';
const SIDEWALK_COLOR = '#2d2d3d';
const PARK_COLOR = '#1a3a1a';
const PARK_GRASS_COLOR = '#2d5a2d';
const PARKING_COLOR = '#252535';
const INTERSECTION_COLOR = '#111128';
const EMPTY_COLOR = '#111122';

function buildingColor(floors: number, colorSeed: number, buildingType?: BuildingType): string {
  const hue = (colorSeed * 137) % 360;
  if (buildingType === BuildingType.HOUSE) return `hsl(${(hue + 30) % 360}, 20%, ${28 + (floors * 3)}%)`;
  if (floors >= 15) return `hsl(210, 30%, ${30 + colorSeed % 15}%)`;
  if (floors >= 10) return `hsl(${(hue + 180) % 360}, 15%, ${28 + colorSeed % 12}%)`;
  if (floors >= 5) return `hsl(${hue % 360}, 12%, ${24 + colorSeed % 10}%)`;
  return `hsl(${(hue + 60) % 360}, 18%, ${22 + colorSeed % 8}%)`;
}

function windowColor(floors: number, tick: number, gx: number, gy: number): string {
  const on = ((gx * 7 + gy * 13 + tick * 3) % 17) < 11;
  if (!on) return 'rgba(0,0,0,0.4)';
  if (floors >= 10) return 'rgba(180,220,255,0.6)';
  return 'rgba(255,220,120,0.5)';
}

// Draw a single tile (road, building, park, etc.)
function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  tick: number,
  gx: number,
  gy: number
): void {
  const ts = TILE_SIZE;

  switch (tile.type) {
    case TileType.ROAD_H:
    case TileType.ROAD_V: {
      ctx.fillStyle = ROAD_COLOR;
      ctx.fillRect(px, py, ts, ts);
      // Lane markings
      ctx.strokeStyle = ROAD_MARKING_COLOR;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([ts * 0.3, ts * 0.4]);
      if (tile.type === TileType.ROAD_H) {
        ctx.beginPath();
        ctx.moveTo(px, py + ts / 2);
        ctx.lineTo(px + ts, py + ts / 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(px + ts / 2, py);
        ctx.lineTo(px + ts / 2, py + ts);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      break;
    }
    case TileType.INTERSECTION: {
      ctx.fillStyle = INTERSECTION_COLOR;
      ctx.fillRect(px, py, ts, ts);
      // White corner markers
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + 2, py + 2, 4, 4);
      ctx.fillRect(px + ts - 6, py + 2, 4, 4);
      ctx.fillRect(px + 2, py + ts - 6, 4, 4);
      ctx.fillRect(px + ts - 6, py + ts - 6, 4, 4);
      break;
    }
    case TileType.SIDEWALK: {
      ctx.fillStyle = SIDEWALK_COLOR;
      ctx.fillRect(px, py, ts, ts);
      // Subtle grid pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px + 2, py + 2, ts - 4, ts - 4);
      break;
    }
    case TileType.PARK: {
      ctx.fillStyle = PARK_COLOR;
      ctx.fillRect(px, py, ts, ts);
      // Tree dots
      const treeX = px + ((gx * 23) % (ts - 8)) + 4;
      const treeY = py + ((gy * 17) % (ts - 8)) + 4;
      ctx.fillStyle = PARK_GRASS_COLOR;
      ctx.beginPath();
      ctx.arc(treeX, treeY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a5c1a';
      ctx.beginPath();
      ctx.arc(treeX, treeY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case TileType.PARKING: {
      ctx.fillStyle = PARKING_COLOR;
      ctx.fillRect(px, py, ts, ts);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(px + (ts / 4) * i, py);
        ctx.lineTo(px + (ts / 4) * i, py + ts);
        ctx.stroke();
      }
      break;
    }
    case TileType.BUILDING:
    case TileType.HELIPAD: {
      const floors = tile.floors ?? 1;
      const colorSeed = tile.colorSeed ?? 0;
      const baseColor = buildingColor(floors, colorSeed, tile.buildingType);

      // Shadow (taller = longer shadow)
      const shadowLen = Math.min(floors * 1.5, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px + shadowLen, py + shadowLen, ts, ts);

      // Building face
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, ts, ts);

      // Roof detail (darker top)
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(px, py, ts, 4);

      // Windows (2x3 grid)
      const winCols = tile.buildingType === BuildingType.HOUSE ? 1 : 2;
      const winRows = tile.buildingType === BuildingType.HOUSE ? 1 : 2;
      const winW = Math.max(3, (ts - 8) / (winCols * 2));
      const winH = Math.max(3, (ts - 8) / (winRows * 2));
      for (let wc = 0; wc < winCols; wc++) {
        for (let wr = 0; wr < winRows; wr++) {
          const wx2 = px + 4 + wc * ((ts - 8) / winCols);
          const wy2 = py + 6 + wr * ((ts - 8) / winRows);
          ctx.fillStyle = windowColor(floors, tick, gx + wc, gy + wr);
          ctx.fillRect(wx2, wy2, winW, winH);
        }
      }

      // Shop sign
      if (tile.shopName) {
        ctx.fillStyle = 'rgba(255,180,0,0.85)';
        ctx.fillRect(px + 2, py + ts - 10, ts - 4, 8);
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.min(6, ts / 6)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(tile.shopName.slice(0, 5), px + ts / 2, py + ts - 4);
      }

      // Antenna for tall buildings
      if (floors >= 15 && tile.type !== TileType.HELIPAD) {
        ctx.fillStyle = '#888';
        ctx.fillRect(px + ts / 2 - 0.5, py - 6, 1, 6);
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(px + ts / 2, py - 7, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Water tower for mid buildings
      if (floors >= 8 && floors < 15 && ((gx + gy) % 3 === 0)) {
        ctx.fillStyle = '#5a4a3a';
        ctx.fillRect(px + ts - 10, py + 2, 7, 5);
        ctx.fillStyle = '#3a2a2a';
        ctx.fillRect(px + ts - 9, py - 1, 5, 3);
      }

      // Helipad markings
      if (tile.type === TileType.HELIPAD || tile.isHelipad) {
        ctx.fillStyle = 'rgba(255,255,0,0.4)';
        ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 4, py + 4, ts - 8, ts - 8);
        ctx.fillStyle = '#ffff00';
        ctx.font = `bold ${ts / 3}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('H', px + ts / 2, py + ts / 2 + ts / 8);
      }
      break;
    }
    default:
      ctx.fillStyle = EMPTY_COLOR;
      ctx.fillRect(px, py, ts, ts);
  }
}

// Draw the player character (on foot)
function drawPlayerFoot(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Body
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = '#ffccaa';
  ctx.beginPath();
  ctx.arc(0, -8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw a vehicle
function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle, isPlayer: boolean): void {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);

  const w = v.width;
  const h = v.height;

  if (v.type === VehicleType.HELICOPTER) {
    // Helicopter body (oval)
    ctx.fillStyle = isPlayer ? '#a0d8ef' : '#888';
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.fillStyle = isPlayer ? '#80b8cf' : '#666';
    ctx.fillRect(0, -h / 6, w * 0.6, h / 6);
    // Rotor shadow (rotating)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 2, 0);
    ctx.lineTo(w / 2 + 2, 0);
    ctx.stroke();
    // Altitude shadow
    ctx.restore();
    return;
  }

  if (v.type === VehicleType.RC_DRONE) {
    // Drone: X shape with 4 rotors
    const alt = v.altitude ?? 0;
    const shadowAlpha = Math.max(0, 0.4 - alt / 200);
    if (shadowAlpha > 0) {
      const shadowOffset = alt * 0.2;
      ctx.save();
      ctx.translate(shadowOffset, shadowOffset);
      ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, w / 2 + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const scale = 1 + alt / 300;
    ctx.scale(scale, scale);

    // Arms
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((Math.PI / 4) + (i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -w / 2);
      ctx.stroke();
      // Rotor
      ctx.fillStyle = isPlayer ? '#00e5ff' : '#aaa';
      ctx.beginPath();
      ctx.arc(0, -w / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Center body
    ctx.fillStyle = isPlayer ? '#1a237e' : '#333';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    // LED
    ctx.fillStyle = isPlayer ? '#00e5ff' : '#f44';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (v.type === VehicleType.DELIVERY_SCOOTER) {
    // Scooter
    ctx.fillStyle = v.color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-w / 4, -h / 2, w / 2, 3);
    // Package
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(-3, -h / 2 - 4, 6, 4);
    ctx.restore();
    return;
  }

  // Standard car / taxi / NPC car
  // Body
  ctx.fillStyle = v.color;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Windshield (front)
  ctx.fillStyle = 'rgba(150,220,255,0.6)';
  ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h / 3);

  // Rear window
  ctx.fillStyle = 'rgba(100,180,220,0.4)';
  ctx.fillRect(-w / 2 + 3, h / 6, w - 6, h / 4);

  // Wheels (4 corners)
  ctx.fillStyle = '#111';
  const wheelW = 4;
  const wheelH = 5;
  ctx.fillRect(-w / 2 - 1, -h / 2 + 3, wheelW, wheelH);
  ctx.fillRect(w / 2 - 3, -h / 2 + 3, wheelW, wheelH);
  ctx.fillRect(-w / 2 - 1, h / 2 - 8, wheelW, wheelH);
  ctx.fillRect(w / 2 - 3, h / 2 - 8, wheelW, wheelH);

  // Taxi sign
  if (v.type === VehicleType.TAXI) {
    ctx.fillStyle = '#ffee00';
    ctx.fillRect(-5, -h / 2 - 6, 10, 5);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -h / 2 - 2);
  }

  // Player arrow indicator
  if (isPlayer) {
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 - 8);
    ctx.lineTo(-4, -h / 2 - 2);
    ctx.lineTo(4, -h / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// Draw waypoint marker in world
function drawWaypoint(ctx: CanvasRenderingContext2D, wp: Waypoint, tick: number): void {
  if (!wp.active) return;
  const pulse = 0.7 + 0.3 * Math.sin(tick * 0.1);
  const r = 8 * pulse;
  ctx.strokeStyle = `rgba(255,50,50,${pulse})`;
  ctx.lineWidth = 2;
  // Diamond
  ctx.beginPath();
  ctx.moveTo(wp.x, wp.y - r);
  ctx.lineTo(wp.x + r, wp.y);
  ctx.lineTo(wp.x, wp.y + r);
  ctx.lineTo(wp.x - r, wp.y);
  ctx.closePath();
  ctx.stroke();
  // Center dot
  ctx.fillStyle = '#ff3232';
  ctx.beginPath();
  ctx.arc(wp.x, wp.y, 2, 0, Math.PI * 2);
  ctx.fill();
  // Crosshair lines
  ctx.strokeStyle = 'rgba(255,50,50,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(wp.x - r * 2, wp.y);
  ctx.lineTo(wp.x + r * 2, wp.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(wp.x, wp.y - r * 2);
  ctx.lineTo(wp.x, wp.y + r * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Main render function
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  world: WorldData,
  canvasW: number,
  canvasH: number
): void {
  const { player, vehicles, waypoint, camera, tick } = state;

  // Clear
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  // Camera transform
  ctx.translate(-camera.x + canvasW / 2, -camera.y + canvasH / 2);

  // Viewport culling
  const viewLeft = camera.x - canvasW / 2 - TILE_SIZE;
  const viewTop = camera.y - canvasH / 2 - TILE_SIZE;
  const viewRight = camera.x + canvasW / 2 + TILE_SIZE;
  const viewBottom = camera.y + canvasH / 2 + TILE_SIZE;

  const tileLeft = Math.max(0, Math.floor(viewLeft / TILE_SIZE));
  const tileTop = Math.max(0, Math.floor(viewTop / TILE_SIZE));
  const tileRight = Math.min(GRID_SIZE - 1, Math.ceil(viewRight / TILE_SIZE));
  const tileBottom = Math.min(GRID_SIZE - 1, Math.ceil(viewBottom / TILE_SIZE));

  // Draw tiles
  for (let gy = tileTop; gy <= tileBottom; gy++) {
    for (let gx = tileLeft; gx <= tileRight; gx++) {
      const tile = world.grid[gy]?.[gx];
      if (!tile) continue;
      drawTile(ctx, tile, gx * TILE_SIZE, gy * TILE_SIZE, tick, gx, gy);
    }
  }

  // Draw waypoint
  drawWaypoint(ctx, waypoint, tick);

  // Draw vehicles (below player)
  vehicles.forEach((v) => {
    const inView =
      v.x > viewLeft && v.x < viewRight && v.y > viewTop && v.y < viewBottom;
    if (!inView) return;
    const isPlayerVehicle = v.id === player.currentVehicleId;
    drawVehicle(ctx, v, isPlayerVehicle && player.state !== 'onFoot');
  });

  // Draw player (on foot)
  if (player.state === 'onFoot') {
    drawPlayerFoot(ctx, player.x, player.y, player.angle);
  }

  // Waypoint direction arrow (top of screen if waypoint is far)
  if (waypoint.active) {
    const dx = waypoint.x - player.x;
    const dy = waypoint.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 200) {
      const ang = Math.atan2(dy, dx);
      const arrowX = player.x + Math.cos(ang) * 80;
      const arrowY = player.y + Math.sin(ang) * 80;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,50,50,0.8)';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      // Distance label
      ctx.rotate(-ang);
      ctx.fillStyle = 'rgba(255,50,50,0.9)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(dist)}m`, 0, -10);
      ctx.restore();
    }
  }

  ctx.restore();

  // Vignette overlay
  const grad = ctx.createRadialGradient(
    canvasW / 2, canvasH / 2, canvasH * 0.3,
    canvasW / 2, canvasH / 2, canvasH * 0.8
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);
}

// Draw mini-map to a separate canvas
export function renderMiniMap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  world: WorldData,
  mapSize: number
): void {
  const scale = mapSize / (GRID_SIZE * TILE_SIZE);
  const { player, vehicles, waypoint } = state;

  ctx.clearRect(0, 0, mapSize, mapSize);

  // Background
  ctx.fillStyle = 'rgba(10,10,30,0.9)';
  ctx.fillRect(0, 0, mapSize, mapSize);

  // Draw road tiles (fast pass)
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const tile = world.grid[gy]?.[gx];
      if (!tile) continue;
      const px = gx * TILE_SIZE * scale;
      const py = gy * TILE_SIZE * scale;
      const ts = TILE_SIZE * scale;

      switch (tile.type) {
        case TileType.ROAD_H:
        case TileType.ROAD_V:
        case TileType.INTERSECTION:
          ctx.fillStyle = '#334';
          ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
          break;
        case TileType.PARK:
          ctx.fillStyle = '#1a3a1a';
          ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
          break;
        case TileType.BUILDING:
          const floors = tile.floors ?? 1;
          const lightness = 18 + Math.min(floors * 1.5, 20);
          ctx.fillStyle = `hsl(220,10%,${lightness}%)`;
          ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
          break;
        case TileType.HELIPAD:
          ctx.fillStyle = '#443300';
          ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
          break;
      }
    }
  }

  // Waypoint
  if (waypoint.active) {
    const wx = waypoint.x * scale;
    const wy = waypoint.y * scale;
    ctx.fillStyle = '#ff3232';
    ctx.fillRect(wx - 2, wy - 2, 4, 4);
  }

  // NPC vehicles
  vehicles.forEach((v) => {
    if (v.occupant === 'player') return;
    const vx = v.x * scale;
    const vy = v.y * scale;
    ctx.fillStyle = v.type === VehicleType.TAXI ? '#ffee00' :
      v.type === VehicleType.DELIVERY_SCOOTER ? '#ff8c00' :
      v.type === VehicleType.HELICOPTER ? '#a0d8ef' :
      '#666';
    ctx.fillRect(vx - 1, vy - 1, 2, 2);
  });

  // Player dot (pulsing)
  const px2 = player.x * scale;
  const py2 = player.y * scale;
  const pulse = 0.7 + 0.3 * Math.sin(state.tick * 0.15);

  ctx.fillStyle = `rgba(255,220,0,${pulse})`;
  ctx.beginPath();
  ctx.arc(px2, py2, 3.5 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(px2, py2, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, mapSize, mapSize);
}
