/**
 * Minecraft Web Edition — Phase 9 · MiniMap
 * Per-chunk canvas cache with version-based staleness detection.
 *
 * Key invariant:
 *   We never call world.consumeDirty() — that belongs to WorldRenderer.
 *   Instead we compare against Chunk.version, which is incremented by
 *   Chunk.set() on every block write.  If our cached version differs
 *   from the live version, the entry is stale and must be rebuilt.
 */

import type { ChunkSurfaceCache } from '../types/minimap.types';

// ─── Cache ────────────────────────────────────────────────────────────────────

export class MiniMapTextureCache {
  private readonly cache = new Map<string, ChunkSurfaceCache>();

  private _hits = 0;
  private _misses = 0;

  // ── Key helpers ─────────────────────────────────────────────────────────────

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  get(cx: number, cz: number): ChunkSurfaceCache | undefined {
    return this.cache.get(this.key(cx, cz));
  }

  /**
   * Returns true when no entry exists OR the cached version differs from
   * currentVersion.  Increments the hit/miss counters as a side-effect so
   * callers do not need a separate "has" check.
   */
  isStale(cx: number, cz: number, currentVersion: number): boolean {
    const entry = this.cache.get(this.key(cx, cz));
    const stale = !entry || entry.version !== currentVersion;
    if (stale) {
      this._misses++;
    } else {
      this._hits++;
    }
    return stale;
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  set(cx: number, cz: number, entry: ChunkSurfaceCache): void {
    this.cache.set(this.key(cx, cz), entry);
  }

  invalidate(cx: number, cz: number): void {
    this.cache.delete(this.key(cx, cz));
  }

  clear(): void {
    this.cache.clear();
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  get size(): number {
    return this.cache.size;
  }

  /** Reset hit/miss counters.  Call once per minimap render cycle. */
  resetCounters(): void {
    this._hits = 0;
    this._misses = 0;
  }
}
