/**
 * Where the touch HUD sits, in CSS px from the screen edges. The components
 * add the safe-area insets on top.
 *
 * Portrait keeps the minimap bottom-centre between the thumbs and the quick
 * buttons halfway down the right edge. A phone held sideways has room for
 * neither: the minimap landed on the car and the quick column ran into the
 * action buttons. Landscape follows GTA's mobile layout instead: radar in the
 * top-left corner, quick buttons stacked up the right edge from the bottom,
 * and the action buttons just inside them.
 *
 * Kept pure so the no-overlap rules can be unit-tested at real phone sizes;
 * a misplaced button is otherwise invisible until someone turns a phone.
 */

/** Virtual joystick, bottom-left in both orientations. */
export const JOYSTICK = { left: 24, bottom: 24, size: 120 } as const;
/** Action buttons: size, gap between rows, gap between buttons in a row. */
export const ACTION_BTN = 52;
export const ACTION_ROW_GAP = 8;
export const ACTION_COL_GAP = 6;
/** The widest action row: brake, cannon and autopilot. */
export const ACTION_MAX_WIDTH = ACTION_BTN * 3 + ACTION_COL_GAP * 2;
/** Quick buttons: pause, phone, challenges, map, weather (+ town hall nearby). */
export const QUICK_BUTTONS = 5;
export const QUICK_BUTTONS_MAX = 6;
/** One notification toast and one order card, with the gap under each. */
export const TOAST_H = 38;
export const TOAST_GAP = 6;
export const ORDER_H = 44;

const EDGE = 12;
const MINIMAP = 104;
/** The top-right health / wanted / cash block ends above this. */
const STATUS_BOTTOM = 96;

export interface TouchLayout {
  landscape: boolean;
  /** Compact minimap, `size` px square; portrait centres it horizontally. */
  minimap: { size: number; top?: number; left?: number; bottom?: number };
  /** Left edge of the top-left HUD column and of the mission panel. */
  hudLeft: number;
  missionMaxWidth: number;
  /** Quick buttons: a column on the right edge. Portrait centres it vertically;
   *  landscape stacks it up from `bottom`. */
  quick: { right: number; size: number; gap: number; bottom?: number };
  /** Action buttons, bottom-right. */
  cluster: { right: number; bottom: number };
  /** Toasts hang from `top`, right-aligned, and end above `limit`. */
  notifications: { right: number; top: number; limit: number };
  /** Order cards (taxi, food…) stack up from `bottom`; without it they head
   *  the toast stack instead. */
  orders?: { right: number; bottom: number };
  /** The contextual "tap to …" prompt, centred horizontally. */
  prompt: { top?: number; bottom?: number };
}

/** Height of an action cluster with `rows` rows of buttons. */
export function clusterHeight(rows: number): number {
  return rows * ACTION_BTN + (rows - 1) * ACTION_ROW_GAP;
}

export interface ActionState {
  playerState: 'onFoot' | 'inCar' | 'inHelicopter' | 'inDrone';
  /** The contextual E button (view a brief, start taxi work) is showing. */
  interact: boolean;
  /** Racing the drone: boost, respawn and FPV get a row. */
  racing: boolean;
}

/** Rows of buttons MobileControls' action cluster shows; keep the two in step. */
export function actionRows(s: ActionState): number {
  const drone = s.playerState === 'inDrone';
  let rows = 1;                                                       // board / leave
  if (s.interact) rows++;
  if (s.racing) rows++;
  if (drone) rows++;                                                  // yaw
  if (drone || s.playerState === 'inHelicopter') rows++;              // climb / descend
  if (s.playerState === 'onFoot' || s.playerState === 'inCar') rows++; // run+jump / brake+autopilot
  return rows;
}

/**
 * Lowest point the toast stack may reach over an action cluster of `rows`
 * rows. Only landscape stacks toasts above the cluster; portrait keeps them
 * at the top, clear of it.
 */
export function stackLimit(layout: TouchLayout, rows: number): number {
  if (!layout.landscape) return layout.notifications.limit;
  return layout.notifications.limit - (rows - 2) * (ACTION_BTN + ACTION_ROW_GAP);
}

/** Height of a quick column with `n` buttons. */
export function quickHeight(layout: TouchLayout, n: number): number {
  return n * layout.quick.size + (n - 1) * layout.quick.gap;
}

/**
 * How many toasts fit between `top` and `limit` under `orders` order cards:
 * at most four, and never none, so a fresh message always shows.
 */
export function toastsThatFit(top: number, limit: number, orders = 0): number {
  const free = limit - top - orders * (ORDER_H + TOAST_GAP);
  const n = Math.floor((free + TOAST_GAP) / (TOAST_H + TOAST_GAP));
  return Math.max(1, Math.min(4, n));
}

export function touchLayout(width: number, height: number): TouchLayout {
  const bottom = 24;

  if (width <= height) {
    // As shipped.
    return {
      landscape: false,
      minimap: { size: MINIMAP, bottom: 150 },
      hudLeft: 10,
      missionMaxWidth: width - 150,
      quick: { right: EDGE, size: 48, gap: 8 },
      cluster: { right: EDGE, bottom },
      notifications: { right: EDGE, top: STATUS_BOTTOM, limit: Infinity },
      // Just above the usual cluster: one row of actions over the F button.
      orders: { right: EDGE, bottom: bottom + clusterHeight(2) + 8 },
      // Above the minimap.
      prompt: { bottom: 150 + MINIMAP + 12 },
    };
  }

  const quick = { right: EDGE, size: 40, gap: 6, bottom };
  // The action buttons move in beside the quick column.
  const inner = quick.right + quick.size + 10;
  const hudLeft = 10 + MINIMAP + 8;
  return {
    landscape: true,
    minimap: { size: MINIMAP, top: 10, left: 10 },
    hudLeft,
    missionMaxWidth: Math.min(320, width - hudLeft - 130),
    quick,
    cluster: { right: inner, bottom },
    // Orders head this stack, which ends above a two-row cluster; stackLimit
    // lifts that for taller ones.
    notifications: { right: inner, top: STATUS_BOTTOM, limit: height - bottom - clusterHeight(2) - 8 },
    // Under the weather pill; the top-centre is otherwise empty sky.
    prompt: { top: 44 },
  };
}
