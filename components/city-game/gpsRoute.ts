import { Point, Tile, Waypoint, TILE_SIZE } from './types';
import { findRoadPath } from './worldGen';

/**
 * GPS route to the active waypoint.
 *
 * `findRoadPath` is a BFS over the whole 80x80 grid, so it must not run per
 * frame. The route is recomputed only when the destination changes or the
 * player leaves the corridor of tiles the current route covers; otherwise the
 * already-visited leading points are simply trimmed.
 */

function tileKey(p: { x: number; y: number }): number {
  return Math.floor(p.x / TILE_SIZE) * 1000 + Math.floor(p.y / TILE_SIZE);
}

export class RouteCache {
  points: Point[] | null = null;
  /** True when the BFS could not reach the destination (straight-line fallback). */
  isFallback = false;

  private tileKeys = new Set<number>();
  private destKey = -1;

  clear(): void {
    this.points = null;
    this.tileKeys.clear();
    this.destKey = -1;
    this.isFallback = false;
  }

  update(grid: Tile[][], player: Point, wp: Waypoint): Point[] | null {
    if (!wp.active) {
      if (this.points) this.clear();
      return null;
    }

    const destKey = tileKey(wp);
    const playerKey = tileKey(player);
    const offRoute = !this.tileKeys.has(playerKey);

    if (destKey !== this.destKey || offRoute || !this.points) {
      const path = findRoadPath(grid, player.x, player.y, wp.x, wp.y);
      // A single point that is not a tile centre means BFS failed and fell back
      // to a straight line; the renderer dashes it so the player knows.
      this.isFallback = path.length === 1
        && Math.abs((path[0].x % TILE_SIZE) - TILE_SIZE / 2) > 0.001;
      this.points = path;
      this.tileKeys = new Set<number>([playerKey, ...path.map(tileKey)]);
      this.destKey = destKey;
      return this.points;
    }

    // Still on the route: drop the points already passed.
    const idx = this.points.findIndex(p => tileKey(p) === playerKey);
    if (idx > 0) this.points = this.points.slice(idx);
    return this.points;
  }
}
