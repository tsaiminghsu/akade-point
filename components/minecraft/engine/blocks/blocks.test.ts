import { describe, it, expect } from 'vitest';
import { BLOCK, BLOCKS, getBlockDef, isOpaque, isSolid, isTransparent } from './index';

describe('block registry', () => {
  it('has unique sequential ids starting at Air = 0', () => {
    const ids = BLOCKS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BLOCKS[0].id).toBe(BLOCK.Air);
  });

  it('Air is non-solid, transparent and non-opaque', () => {
    expect(isSolid(BLOCK.Air)).toBe(false);
    expect(isTransparent(BLOCK.Air)).toBe(true);
    expect(isOpaque(BLOCK.Air)).toBe(false);
  });

  it('Water is transparent and non-solid (walk-through)', () => {
    expect(isTransparent(BLOCK.Water)).toBe(true);
    expect(isSolid(BLOCK.Water)).toBe(false);
  });

  it('Bedrock is not breakable', () => {
    expect(getBlockDef(BLOCK.Bedrock).breakable).toBe(false);
  });

  it('unknown ids fall back to Air', () => {
    expect(getBlockDef(999).id).toBe(BLOCK.Air);
  });

  it('every block defines all six face colors', () => {
    for (const def of BLOCKS) {
      for (const face of ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const) {
        const c = def.faces[face];
        expect(c).toHaveLength(3);
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
