import { describe, expect, it } from 'vitest';
import { layoutViews, type ViewLayout, type ViewRect } from '../viewLayout';
import { describeMiss, describeSlip } from '../feedback';

const inside = (r: ViewRect, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h && r.w > 0 && r.h > 0;
const overlaps = (a: ViewRect, b: ViewRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layoutViews', () => {
  const sizes: [number, number][] = [[1280, 555], [390, 560], [768, 900], [320, 300]];

  it('single is just the main view filling the canvas', () => {
    expect(layoutViews('single', 800, 600)).toEqual([{ slot: 'main', x: 0, y: 0, w: 800, h: 600 }]);
  });

  for (const layout of ['pip', 'quad'] as ViewLayout[]) {
    for (const [w, h] of sizes) {
      it(`${layout} at ${w}×${h}: every view on-canvas, helper views never overlap each other`, () => {
        const rects = layoutViews(layout, w, h);
        expect(rects.map((r) => r.slot).sort()).toEqual(['claw', 'main', 'side', 'top']);
        for (const r of rects) expect(inside(r, w, h)).toBe(true);
        const helpers = rects.filter((r) => r.slot !== 'main');
        for (const a of helpers) for (const b of helpers) if (a !== b) expect(overlaps(a, b)).toBe(false);
        if (layout === 'quad') {
          const main = rects.find((r) => r.slot === 'main')!;
          for (const hlp of helpers) expect(overlaps(main, hlp)).toBe(false);
        }
      });
    }
  }

  it('pip puts insets in a right-hand column on wide screens and a bottom row on phones', () => {
    const wide = layoutViews('pip', 1280, 555).filter((r) => r.slot !== 'main');
    expect(new Set(wide.map((r) => r.x)).size).toBe(1);
    const phone = layoutViews('pip', 390, 560).filter((r) => r.slot !== 'main');
    expect(new Set(phone.map((r) => r.y)).size).toBe(1);
  });
});

describe('feedback wording', () => {
  it('says which way and how far the nearest plush was', () => {
    expect(describeMiss({ dx: 0.034, dz: -0.021 })).toBe('沒夾到：最近的娃娃在右 3 公分、往裡 2 公分');
    expect(describeMiss({ dx: -0.1, dz: 0.004 })).toBe('沒夾到：最近的娃娃在左 10 公分');
    expect(describeMiss({ dx: 0.002, dz: 0.051 })).toBe('沒夾到：最近的娃娃在往外 5 公分');
    expect(describeMiss(null)).toBe('沒夾到');
  });

  it('explains a slip by claw power', () => {
    expect(describeSlip(true)).toContain('爪力轉弱');
    expect(describeSlip(false)).toContain('沒抓穩');
  });
});
