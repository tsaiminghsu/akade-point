import { MinimapBlip, Point, Vehicle, WorldData } from './types';
import { nearestRoadTile } from './police';

/**
 * Pay-n-Spray garages.
 *
 * Drive in slowly with a damaged or wanted car and, for a fee, it comes out
 * repaired and off the police radar. This is the intended counter to a high
 * wanted level, so the trigger is deliberately forgiving on position but strict
 * on speed: you have to actually pull in, not clip the corner at full tilt.
 */

/** How many garages exist in the city. */
const GARAGE_COUNT = 6;
/** Trigger radius, world px. */
export const GARAGE_RADIUS = 55;
/** The player must be at or below this speed (px/s) to pull in. */
export const GARAGE_MAX_SPEED = 40;
/** Seconds before the same garage will serve the player again. */
const GARAGE_COOLDOWN = 20;

export interface Garage {
  id: number;
  x: number;
  y: number;
  /** gameClock.now() before which this garage is closed to the player. */
  readyAt: number;
}

/** Pick garage sites: the parking lots spread furthest apart. */
export function createGarages(world: WorldData): Garage[] {
  const blocks = [...world.parkingBlocks];
  if (blocks.length === 0) return [];

  const chosen: Point[] = [];
  // Start from the lot nearest the centre, then greedily take the farthest
  // remaining one so the garages are not clustered in one district.
  blocks.sort((a, b) =>
    Math.hypot(a.center.x - world.townHallPos.x, a.center.y - world.townHallPos.y)
    - Math.hypot(b.center.x - world.townHallPos.x, b.center.y - world.townHallPos.y));
  chosen.push(blocks[0].center);

  while (chosen.length < GARAGE_COUNT && chosen.length < blocks.length) {
    let best: Point | null = null;
    let bestScore = -1;
    for (const block of blocks) {
      const nearest = Math.min(
        ...chosen.map(c => Math.hypot(block.center.x - c.x, block.center.y - c.y)),
      );
      if (nearest > bestScore) { bestScore = nearest; best = block.center; }
    }
    if (!best) break;
    chosen.push(best);
  }

  return chosen.map((c, i) => {
    const road = nearestRoadTile(world, c);
    return { id: i, x: road.x, y: road.y, readyAt: 0 };
  });
}

export interface GarageContext {
  player: { x: number; y: number; state: string };
  vehicle: Vehicle | null;
  /** True px/s speed. */
  speed: number;
  wantedStars: number;
  nowMs: number;
  /** Take the fee. Returns false when the player cannot pay. */
  charge: () => boolean;
  onServiced: (garage: Garage) => void;
}

/**
 * Check every garage against the player. Returns the garage that served them,
 * or null. Only fires when there is actually something to fix.
 */
export function updateGarages(garages: Garage[], ctx: GarageContext): Garage | null {
  const { vehicle } = ctx;
  if (!vehicle || ctx.player.state !== 'inCar') return null;
  if (Math.abs(ctx.speed) > GARAGE_MAX_SPEED) return null;

  const needsWork = vehicle.hp < 100 || ctx.wantedStars > 0;
  if (!needsWork) return null;

  for (const garage of garages) {
    if (ctx.nowMs < garage.readyAt) continue;
    if (Math.hypot(ctx.player.x - garage.x, ctx.player.y - garage.y) > GARAGE_RADIUS) continue;
    if (!ctx.charge()) return null;

    garage.readyAt = ctx.nowMs + GARAGE_COOLDOWN * 1000;
    vehicle.hp = 100;
    ctx.onServiced(garage);
    return garage;
  }
  return null;
}

export function garageBlips(garages: Garage[], nowMs: number): MinimapBlip[] {
  return garages.map(g => ({
    x: g.x,
    y: g.y,
    kind: 'paynspray' as const,
    color: nowMs < g.readyAt ? '#4a5568' : '#22d3ee',
  }));
}
