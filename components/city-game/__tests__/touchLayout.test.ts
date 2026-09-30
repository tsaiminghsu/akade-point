import { describe, it, expect } from 'vitest';
import {
  ACTION_MAX_WIDTH,
  JOYSTICK,
  ORDER_H,
  QUICK_BUTTONS,
  QUICK_BUTTONS_MAX,
  TOAST_GAP,
  TOAST_H,
  actionRows,
  clusterHeight,
  quickHeight,
  stackLimit,
  toastsThatFit,
  touchLayout,
} from '../touchLayout';

interface Box { x: number; y: number; w: number; h: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Screen rectangles of the touch HUD, in CSS px without safe-area insets.
 * The quick column has `quickButtons`, the action cluster `rows` rows, and
 * `orders` order cards are active.
 */
function boxes(W: number, H: number, quickButtons = QUICK_BUTTONS, orders = 0, rows = 2) {
  const L = touchLayout(W, H);
  const m = L.minimap;
  const minimap: Box = m.top !== undefined
    ? { x: m.left!, y: m.top, w: m.size, h: m.size }
    : { x: W / 2 - m.size / 2, y: H - m.bottom! - m.size, w: m.size, h: m.size };

  const qh = quickHeight(L, quickButtons);
  const quick: Box = {
    x: W - L.quick.right - L.quick.size,
    y: L.quick.bottom !== undefined ? H - L.quick.bottom - qh : H / 2 - qh / 2,
    w: L.quick.size,
    h: qh,
  };

  // The action cluster at its widest (brake, cannon, autopilot).
  const cluster: Box = {
    x: W - L.cluster.right - ACTION_MAX_WIDTH,
    y: H - L.cluster.bottom - clusterHeight(rows),
    w: ACTION_MAX_WIDTH,
    h: clusterHeight(rows),
  };

  const joystick: Box = {
    x: JOYSTICK.left, y: H - JOYSTICK.bottom - JOYSTICK.size, w: JOYSTICK.size, h: JOYSTICK.size,
  };

  // Toast stack, headed by the order cards when the layout puts them there.
  const inStack = L.orders ? 0 : orders;
  const toasts = toastsThatFit(L.notifications.top, stackLimit(L, rows), inStack);
  const stack: Box = {
    x: W - L.notifications.right - 280,
    y: L.notifications.top,
    w: 280,
    h: inStack * (ORDER_H + TOAST_GAP) + toasts * TOAST_H + (toasts - 1) * TOAST_GAP,
  };

  const promptH = 26;
  const prompt: Box = {
    x: W / 2 - 110,
    y: L.prompt.top !== undefined ? L.prompt.top : H - L.prompt.bottom! - promptH,
    w: 220,
    h: promptH,
  };

  // Speed and vehicle cards.
  const hudColumn: Box = { x: L.hudLeft, y: 10, w: 100, h: 100 };

  // Where the chase camera frames the player's car: 48–61% of the height in
  // portrait (measured on a 375×812 screenshot), low and centred in landscape.
  const car: Box = L.landscape
    ? { x: W / 2 - 100, y: H * 0.5, w: 200, h: H * 0.5 }
    : { x: W / 2 - 60, y: H * 0.48, w: 120, h: H * 0.13 };

  return { L, minimap, quick, cluster, joystick, stack, prompt, hudColumn, car };
}

const PORTRAIT: Array<[number, number]> = [
  [375, 667], [360, 740], [375, 812], [390, 844], [412, 915], [430, 932],
];
const LANDSCAPE: Array<[number, number]> = PORTRAIT.map(([w, h]) => [h, w]);

describe('touch layout: portrait', () => {
  it('is what the game shipped with', () => {
    const L = touchLayout(375, 812);
    expect(L.landscape).toBe(false);
    expect(L.minimap).toEqual({ size: 104, bottom: 150 });
    expect(L.quick).toEqual({ right: 12, size: 48, gap: 8 });
    expect(L.cluster).toEqual({ right: 12, bottom: 24 });
    expect(L.orders).toEqual({ right: 12, bottom: 144 });
    expect(L.prompt).toEqual({ bottom: 266 });
    expect(toastsThatFit(L.notifications.top, L.notifications.limit)).toBe(4);
  });

  for (const [W, H] of PORTRAIT) {
    it(`${W}×${H}: the minimap sits under the car, between the thumbs`, () => {
      const b = boxes(W, H);
      expect(overlaps(b.minimap, b.car)).toBe(false);
      expect(overlaps(b.minimap, b.joystick)).toBe(false);
      expect(overlaps(b.minimap, b.cluster)).toBe(false);
    });
  }
});

describe('action rows', () => {
  it('counts the rows MobileControls draws in each state', () => {
    const rows = (playerState: 'onFoot' | 'inCar' | 'inHelicopter' | 'inDrone', interact = false, racing = false) =>
      actionRows({ playerState, interact, racing });
    expect(rows('onFoot')).toBe(2);         // run + jump, board
    expect(rows('inCar')).toBe(2);          // brake + autopilot, leave
    expect(rows('inCar', true)).toBe(3);    // + view brief / start taxi work
    expect(rows('inHelicopter')).toBe(2);   // climb + descend, land
    expect(rows('inDrone')).toBe(3);        // yaw, climb + descend, land
    expect(rows('inDrone', false, true)).toBe(4); // + boost / respawn / FPV
  });

  it('lifts the landscape toast limit one button row at a time', () => {
    const L = touchLayout(812, 375);
    expect(stackLimit(L, 2) - stackLimit(L, 3)).toBe(60);
    expect(stackLimit(touchLayout(375, 812), 4)).toBe(Infinity); // portrait: unaffected
  });
});

describe('touch layout: landscape', () => {
  it('is used exactly when the screen is wider than tall', () => {
    expect(touchLayout(812, 375).landscape).toBe(true);
    expect(touchLayout(400, 400).landscape).toBe(false);
  });

  it('used to put the minimap on the car', () => {
    // The portrait placement held sideways: bottom-centre, 150 px up.
    const W = 812, H = 375;
    const old: Box = { x: W / 2 - 52, y: H - 150 - 104, w: 104, h: 104 };
    expect(overlaps(old, boxes(W, H).car)).toBe(true);
  });

  it('used to run the quick column into the action buttons', () => {
    // The portrait column, centred on the right edge, over the portrait cluster.
    const W = 812, H = 375;
    const qh = QUICK_BUTTONS * 48 + (QUICK_BUTTONS - 1) * 8;
    const oldQuick: Box = { x: W - 12 - 48, y: H / 2 - qh / 2, w: 48, h: qh };
    const oldCluster: Box = {
      x: W - 12 - ACTION_MAX_WIDTH, y: H - 24 - clusterHeight(2), w: ACTION_MAX_WIDTH, h: clusterHeight(2),
    };
    expect(overlaps(oldQuick, oldCluster)).toBe(true);
  });

  for (const [W, H] of LANDSCAPE) {
    const shape = `${W}×${H}`;

    it(`${shape}: the minimap stays off the car, the thumbs and the HUD`, () => {
      const b = boxes(W, H);
      expect(overlaps(b.minimap, b.car)).toBe(false);
      expect(overlaps(b.minimap, b.joystick)).toBe(false);
      expect(overlaps(b.minimap, b.cluster)).toBe(false);
      expect(overlaps(b.minimap, b.hudColumn)).toBe(false);
    });

    it(`${shape}: quick buttons clear the action buttons, joystick and cash`, () => {
      for (const n of [QUICK_BUTTONS, QUICK_BUTTONS_MAX]) {
        const b = boxes(W, H, n);
        expect(overlaps(b.quick, b.cluster)).toBe(false);
        expect(overlaps(b.quick, b.joystick)).toBe(false);
        expect(overlaps(b.quick, b.minimap)).toBe(false);
        expect(b.quick.y).toBeGreaterThan(56); // under the cash total
      }
    });

    it(`${shape}: toasts stay clear of every button`, () => {
      for (const rows of [2, 3]) {           // on foot / driving, and with the E button
        for (const n of [QUICK_BUTTONS, QUICK_BUTTONS_MAX]) {
          const b = boxes(W, H, n, 0, rows);
          expect(overlaps(b.stack, b.quick)).toBe(false);
          expect(overlaps(b.stack, b.cluster)).toBe(false);
          expect(overlaps(b.stack, b.joystick)).toBe(false);
          expect(overlaps(b.stack, b.minimap)).toBe(false);
        }
      }
    });

    it(`${shape}: an order card and a toast fit over the usual cluster`, () => {
      // Only the shortest screens run out of room with a third row as well:
      // the newest toast still shows, over the top of the E button.
      const b = boxes(W, H, QUICK_BUTTONS_MAX, 1, 2);
      expect(overlaps(b.stack, b.cluster)).toBe(false);
      expect(overlaps(b.stack, b.quick)).toBe(false);
    });

    it(`${shape}: the prompt covers neither the minimap nor the HUD`, () => {
      const b = boxes(W, H);
      expect(overlaps(b.prompt, b.minimap)).toBe(false);
      expect(overlaps(b.prompt, b.stack)).toBe(false);
      expect(overlaps(b.prompt, b.hudColumn)).toBe(false);
      expect(overlaps(b.prompt, b.cluster)).toBe(false);
    });

    it(`${shape}: room for at least two toasts`, () => {
      const L = touchLayout(W, H);
      expect(toastsThatFit(L.notifications.top, L.notifications.limit)).toBeGreaterThanOrEqual(2);
    });
  }
});
