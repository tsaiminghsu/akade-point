/**
 * Minecraft Web Edition — Phase 1
 * Shared utils: deterministic hashing / RNG, math helpers.
 */

/** Clamp `v` into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Chunk map key for integer chunk coords. */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * Deterministic 2D hash → [0, 1).
 * Used by world generation so terrain is stable across chunks and sessions.
 */
export function hash2(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise on the xz plane; `freq` is features per block. */
export function valueNoise2(x: number, z: number, freq: number, seed: number): number {
  const fx = x * freq;
  const fz = z * freq;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const tz = smooth(fz - z0);

  const v00 = hash2(x0, z0, seed);
  const v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);

  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * tz;
}

/** Convert 0xRRGGBB to linear-ish [r, g, b] floats in [0, 1]. */
export function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}
