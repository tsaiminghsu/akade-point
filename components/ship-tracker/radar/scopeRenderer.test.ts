import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from './engine';
import { ScopeRenderer, screenToPolar } from './scopeRenderer';
import type { ScopeOverlay } from './scopeRenderer';
import { DEFAULT_OWN_SHIP } from './world';
import type { RadarPlot, RadarSnapshot } from './types';

/**
 * A canvas context that records what it was asked to draw.
 *
 * The scope is the one part of this module a unit test cannot judge by looking
 * at, and the browser it runs in throttles animation frames when the tab is not
 * visible, which makes a screenshot a poor witness. Recording the draw calls
 * pins down the things that actually go wrong: echoes skipped, painted at zero
 * size, or faded away by time the sweep never advanced through.
 */
class RecordingContext {
  fills: Array<{ style: string; op: string; ellipse?: { rx: number; ry: number } }> = [];
  clears: number[][] = [];
  gradients: Array<{ r1: number; stops: string[] }> = [];

  fillStyle: string | object = '';
  strokeStyle: string | object = '';
  lineWidth = 1;
  globalCompositeOperation = 'source-over';
  font = '';
  textAlign = '';
  textBaseline = '';

  private pendingEllipse: { rx: number; ry: number } | undefined;

  setTransform() {}
  clearRect() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  clip() {}
  beginPath() {
    this.pendingEllipse = undefined;
  }
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  stroke() {}
  strokeRect() {}
  fillRect(x: number, y: number, w: number, h: number) {
    if (this.globalCompositeOperation === 'destination-out') {
      this.clears.push([x, y, w, h, alphaOf(String(this.fillStyle))]);
    }
  }
  fillText() {}
  setLineDash() {}
  drawImage() {}
  ellipse(_x: number, _y: number, rx: number, ry: number) {
    this.pendingEllipse = { rx, ry };
  }
  fill() {
    this.fills.push({
      style: typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient',
      op: this.globalCompositeOperation,
      ellipse: this.pendingEllipse,
    });
  }
  createRadialGradient(_x0: number, _y0: number, _r0: number, _x1: number, _y1: number, r1: number) {
    const record = { r1, stops: [] as string[] };
    this.gradients.push(record);
    return {
      addColorStop: (_offset: number, color: string) => {
        record.stops.push(color);
      },
    };
  }
  createLinearGradient() {
    return { addColorStop: () => {} };
  }
  createConicGradient() {
    return { addColorStop: () => {} };
  }
}

function alphaOf(style: string): number {
  const m = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(style);
  return m ? Number(m[1]) : 1;
}

function fakeCanvas() {
  const ctx = new RecordingContext();
  return {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx,
    ctx,
  };
}

let created: ReturnType<typeof fakeCanvas>[] = [];

beforeEach(() => {
  created = [];
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => {
      const c = fakeCanvas();
      created.push(c);
      return c;
    },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

function makeRenderer(size = 600) {
  const main = fakeCanvas();
  const renderer = new ScopeRenderer(main as unknown as HTMLCanvasElement);
  renderer.resize(size, size, 1);
  // The offscreen echo buffer is the one the renderer made for itself.
  return { renderer, main: main.ctx, echo: created[0].ctx };
}

function plot(overrides: Partial<RadarPlot> = {}): RadarPlot {
  return {
    id: 'p1',
    t: 0,
    rangeNm: 3,
    bearing: 45,
    strength: 0.9,
    widthDeg: 2,
    ...overrides,
  };
}

function snapshot(plots: RadarPlot[], advancedSec = 1 / 60): RadarSnapshot {
  return {
    t: 0,
    advancedSec,
    own: DEFAULT_OWN_SHIP,
    ownVec: { x: 0, y: 0 },
    targets: [],
    plots,
    sweepAngle: 0,
    scanCount: 0,
    alarms: [],
    guardAlarms: [],
  };
}

const overlay: ScopeOverlay = {
  selectedTrackId: null,
  cursor: null,
  eblEnabled: false,
  eblBearing: 0,
  vrmRange: 1,
};

describe('ScopeRenderer echo layer', () => {
  it('paints one blob per plot, at a size a human can see', () => {
    const { renderer, echo } = makeRenderer();
    const plots = Array.from({ length: 5 }, (_, i) => plot({ id: `p${i}`, bearing: i * 60 }));
    renderer.render(snapshot(plots), DEFAULT_CONFIG, overlay);

    const blobs = echo.fills.filter((f) => f.op === 'lighter');
    expect(blobs).toHaveLength(5);
    for (const b of blobs) {
      expect(b.ellipse).toBeDefined();
      // A sub-pixel echo is invisible, which is the failure this guards.
      expect(b.ellipse!.rx).toBeGreaterThanOrEqual(2);
      expect(b.ellipse!.ry).toBeGreaterThanOrEqual(2);
    }
  });

  it('skips echoes outside the selected range scale', () => {
    const { renderer, echo } = makeRenderer();
    renderer.render(
      snapshot([plot({ rangeNm: 3 }), plot({ id: 'far', rangeNm: 99 })]),
      DEFAULT_CONFIG,
      overlay
    );
    expect(echo.fills.filter((f) => f.op === 'lighter')).toHaveLength(1);
  });

  it('paints land in the land colour and vessels in the echo colour', () => {
    const { renderer, echo } = makeRenderer();
    renderer.render(
      snapshot([plot({ id: 'p1' }), plot({ id: 'l1_2' })]),
      DEFAULT_CONFIG,
      overlay
    );
    const colours = echo.gradients.map((g) => g.stops[0]);
    expect(colours.some((c) => c.includes('61, 255, 158'))).toBe(true);
    expect(colours.some((c) => c.includes('32, 190, 110'))).toBe(true);
  });

  it('fades the phosphor by the swept time, not the wall clock', () => {
    // One frame at 60 Hz should barely touch a layer that persists for about
    // one antenna revolution.
    const { renderer, echo } = makeRenderer();
    renderer.render(snapshot([], 1 / 60), DEFAULT_CONFIG, overlay);
    const perFrame = echo.clears.at(-1)![4];
    expect(perFrame).toBeGreaterThan(0);
    expect(perFrame).toBeLessThan(0.02);

    // A frame that arrived late still only fades by the time the antenna
    // actually turned through. Fading by the full stall would wipe the picture.
    renderer.render(snapshot([], 1.5), DEFAULT_CONFIG, overlay);
    const afterStall = echo.clears.at(-1)![4];
    expect(afterStall).toBeLessThan(0.7);
  });

  it('does not age the layer on a repaint that is not a new frame', () => {
    const { renderer, echo } = makeRenderer();
    renderer.render(snapshot([], 1 / 60), DEFAULT_CONFIG, overlay, false);
    expect(echo.clears.at(-1)![4]).toBe(0);
  });

  it('clears the layer when the range scale changes', () => {
    const { renderer, echo } = makeRenderer();
    renderer.render(snapshot([plot()]), DEFAULT_CONFIG, overlay);
    const before = echo.fills.length;
    renderer.render(snapshot([plot()]), { ...DEFAULT_CONFIG, rangeNm: 12 }, overlay);
    // Old echoes were painted at the old scale, so keeping them would put every
    // contact at the wrong range until it was swept again.
    expect(echo.fills.length).toBeGreaterThan(before);
  });
});

describe('screenToPolar', () => {
  const g = { cx: 300, cy: 300, radius: 274, scale: 274 / 6, rotationOffset: 0 };

  it('reads north-up bearings off the screen', () => {
    expect(screenToPolar(300, 100, g).bearing).toBeCloseTo(0);
    expect(screenToPolar(500, 300, g).bearing).toBeCloseTo(90);
    expect(screenToPolar(300, 500, g).bearing).toBeCloseTo(180);
  });

  it('adds the display rotation back in for head-up', () => {
    const headUp = { ...g, rotationOffset: 70 };
    // Straight up the screen is own ship's head, so it reads as her heading.
    expect(screenToPolar(300, 100, headUp).bearing).toBeCloseTo(70);
  });

  it('converts pixels back into nautical miles', () => {
    expect(screenToPolar(300, 300 - g.scale * 3, g).range).toBeCloseTo(3, 6);
  });
});
