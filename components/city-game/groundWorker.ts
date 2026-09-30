/**
 * Paints ground chunk textures off the main thread.
 *
 * Each 512² chunk is a few hundred canvas calls; on the main thread that was
 * up to two per frame while driving, uncapped by the fps limit. Here they run
 * on another core, and the finished pixels come back as an ImageBitmap,
 * transferred rather than copied.
 *
 * Protocol:
 *   in  { type: 'grid', grid: PackedGroundGrid }       once, before any paint
 *   in  { type: 'paint', key, cx, cy, size }
 *   out { type: 'chunk', key, bitmap }                   bitmap is transferred
 */

import { paintChunk, unpackGroundGrid, type PackedGroundGrid } from './groundTiles';
import type { Tile } from './types';

export type GroundWorkerIn =
  | { type: 'grid'; grid: PackedGroundGrid }
  | { type: 'paint'; key: number; cx: number; cy: number; size: number };

export type GroundWorkerOut = { type: 'chunk'; key: number; bitmap: ImageBitmap };

// The project's TS lib is 'dom', not 'webworker'; this is the slice used.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<GroundWorkerIn>) => void) | null;
  postMessage(message: GroundWorkerOut, transfer: Transferable[]): void;
};

let grid: Tile[][] | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'grid') {
    grid = unpackGroundGrid(msg.grid);
    return;
  }
  if (!grid) return;
  const canvas = new OffscreenCanvas(msg.size, msg.size);
  paintChunk(canvas.getContext('2d')!, grid, msg.cx, msg.cy, msg.size);
  const bitmap = canvas.transferToImageBitmap();
  scope.postMessage({ type: 'chunk', key: msg.key, bitmap }, [bitmap]);
};
