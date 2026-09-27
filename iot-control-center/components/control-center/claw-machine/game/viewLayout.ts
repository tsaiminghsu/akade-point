// Screen layout for the multi-view display. Pure so the WebGL scissor pass
// (ClawScene) and the HTML labels/click targets (ClawMachineGame) compute the
// exact same rectangles.

export type ViewLayout = 'single' | 'pip' | 'quad';
/** main = the free-orbit camera; the rest are fixed helper cameras. */
export type ViewSlot = 'main' | 'side' | 'top' | 'claw';

export interface ViewRect {
  slot: ViewSlot;
  /** CSS pixels, origin top-left of the canvas. */
  x: number; y: number; w: number; h: number;
}

export const SLOT_LABEL: Record<ViewSlot, string> = {
  main: '自由視角',
  side: '側面（看前後）',
  top: '俯視（看位置）',
  claw: '爪子視角',
};

const GAP = 8;
const INSETS: ViewSlot[] = ['side', 'top', 'claw'];

export function layoutViews(layout: ViewLayout, width: number, height: number): ViewRect[] {
  const W = Math.max(1, Math.floor(width));
  const H = Math.max(1, Math.floor(height));
  const main: ViewRect = { slot: 'main', x: 0, y: 0, w: W, h: H };

  if (layout === 'single') return [main];

  if (layout === 'quad') {
    const cw = Math.floor((W - 2) / 2);
    const ch = Math.floor((H - 2) / 2);
    return [
      { slot: 'main', x: 0, y: 0, w: cw, h: ch },
      { slot: 'side', x: W - cw, y: 0, w: cw, h: ch },
      { slot: 'top', x: 0, y: H - ch, w: cw, h: ch },
      { slot: 'claw', x: W - cw, y: H - ch, w: cw, h: ch },
    ];
  }

  // Picture-in-picture. Wide screens: a column of insets on the right.
  // Narrow screens: a row of insets along the bottom.
  const n = INSETS.length;
  if (W >= 640) {
    let w = Math.min(300, Math.floor(W * 0.24));
    let h = Math.floor(w * 0.68);
    const maxH = Math.floor((H - GAP * (n + 1)) / n);
    if (h > maxH) { h = Math.max(40, maxH); w = Math.floor(h / 0.68); }
    return [main, ...INSETS.map((slot, i) => ({
      slot, x: W - w - GAP, y: GAP + i * (h + GAP), w, h,
    }))];
  }
  const w = Math.floor((W - GAP * (n + 1)) / n);
  const h = Math.min(Math.floor(w * 0.85), Math.floor(H * 0.3));
  return [main, ...INSETS.map((slot, i) => ({
    slot, x: GAP + i * (w + GAP), y: H - h - GAP, w, h,
  }))];
}
