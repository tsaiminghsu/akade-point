/**
 * Dev-only performance benchmark: open /games/city-game?bench=1.
 *
 * Tours six fixed street corners around the city centre on foot, five seconds
 * each, panning the camera, so every run streams the same chunks and draws the
 * same views. It measures in the player's own browser on their own GPU — the
 * numbers that matter — rather than in headless Chromium, whose software
 * renderer manages about 1 fps and pins every core.
 *
 * Results go to console.table and window.__bench. Auto-adjust is held off
 * while it runs, so the preset being measured is the one on screen.
 */

import type { GameEngine3D } from './engine3d';
import { frameGate } from './frameGate';
import { isDrivable, nearestRoadTile } from './worldGen';
import { TILE_SIZE, WORLD_CENTER_TILE } from './types';

export interface BenchLabels {
  gpu: string;
  preset: string;
  render: string;
  fpsCap: number;
}

export interface BenchResult extends BenchLabels {
  seconds: number;
  /** Frames the game actually simulated and drew. */
  frames: number;
  avgFps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** Mean main-thread time inside engine.update per simulated frame. */
  simMs: number;
  drawCalls: number;
  triangles: number;
  heapMB: number | null;
}

let running = false;

/** Auto-adjust checks this so it does not change settings mid-run. */
export function isBenchRunning(): boolean {
  return running;
}

const STOP_SECONDS = 5;
/** Intersections, in tiles from the city centre (multiples of the block size). */
const ROUTE: [number, number][] = [[0, 0], [24, 0], [24, 24], [0, 24], [-24, 24], [-24, -24]];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function runBenchmark(engine: GameEngine3D, labels: () => BenchLabels): Promise<BenchResult> | null {
  if (running) return null;
  const three = (engine as unknown as { three?: { gl: import('three').WebGLRenderer } }).three;
  if (!three) return null;
  running = true;

  const world = engine.world;
  const stops = ROUTE.map(([dx, dy]) => {
    const x = (WORLD_CENTER_TILE + dx) * TILE_SIZE + TILE_SIZE / 2;
    const y = (WORLD_CENTER_TILE + dy) * TILE_SIZE + TILE_SIZE / 2;
    return isDrivable(world.grid, x, y) ? { x, y } : nearestRoadTile(world, { x, y });
  });

  // Time engine.update without touching its code.
  const originalUpdate = engine.update;
  let simTime = 0;
  let simFrames = 0;
  engine.update = function timed(dt: number, now: number) {
    const t0 = performance.now();
    originalUpdate.call(engine, dt, now);
    simTime += performance.now() - t0;
    simFrames++;
  };

  const info = three.gl.info;
  const autoReset = info.autoReset;
  info.autoReset = false;
  info.reset();

  engine.addNotification(`⏱️ 效能測試中（${ROUTE.length * STOP_SECONDS} 秒）…`, '#38bdf8');

  return new Promise<BenchResult>((resolveResult) => {
    const intervals: number[] = [];
    let start = -1;
    let lastDue = -1;
    let stop = -1;

    const tick = (ts: number) => {
      if (start < 0) start = ts;
      const t = (ts - start) / 1000;
      const s = Math.floor(t / STOP_SECONDS);

      if (s >= stops.length) {
        engine.update = originalUpdate;
        const calls = info.render.calls;
        const triangles = info.render.triangles;
        info.autoReset = autoReset;
        info.reset();
        running = false;

        const sorted = [...intervals].sort((a, b) => a - b);
        const frames = intervals.length;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const result: BenchResult = {
          ...labels(),
          seconds: Math.round(t * 10) / 10,
          frames,
          avgFps: Math.round((frames / t) * 10) / 10,
          p50Ms: Math.round(percentile(sorted, 0.5) * 10) / 10,
          p95Ms: Math.round(percentile(sorted, 0.95) * 10) / 10,
          p99Ms: Math.round(percentile(sorted, 0.99) * 10) / 10,
          simMs: simFrames ? Math.round((simTime / simFrames) * 100) / 100 : 0,
          drawCalls: frames ? Math.round(calls / frames) : 0,
          triangles: frames ? Math.round(triangles / frames) : 0,
          heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        };
        (window as unknown as { __bench?: BenchResult }).__bench = result;
        console.table(result);
        engine.addNotification(`⏱️ 效能測試完成：平均 ${result.avgFps} FPS，p95 ${result.p95Ms} ms`, '#38bdf8');
        resolveResult(result);
        return;
      }

      if (s !== stop) {
        stop = s;
        const p = engine.player;
        p.x = stops[s].x;
        p.y = stops[s].y;
      }
      engine.orbitCam.yaw = t * 0.5;

      if (frameGate.due) {
        if (lastDue >= 0) intervals.push(ts - lastDue);
        lastDue = ts;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
