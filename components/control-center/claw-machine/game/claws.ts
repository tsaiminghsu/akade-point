// Interchangeable claw heads. An operator picks three things, as with real
// claws bought for a 飛絡力 cabinet:
//   爪型  the style: three-prong, four-prong, two-prong box claw, 金剛K爪
//   號數  the size: JS-style 1號 … 6號 (巨無霸), sold by open span (爪距),
//         in straight (直爪) or curved (彎爪) arms
//   爪位  how far the arms are set to open (開爪幅度), as a share of the span
// Pure data so the sim, the renderer and the tests share one definition.

export type ClawType = 'standard' | 'four' | 'two' | 'kingkong';
export type ClawSize = '1' | '2' | '2.5' | '3' | '3.5' | '4' | '4.5' | '5' | '6';
export type ClawBend = 'straight' | 'curved';

export interface ClawFit {
  size: ClawSize;
  bend: ClawBend;
  /** 爪位: opening as a percentage of the size's full span. */
  openPct: number;
}

export interface ClawSpec {
  type: ClawType;
  size: ClawSize;
  bend: ClawBend;
  /** Open span as sold (cm), before the 爪位 setting. */
  spanCm: number;
  label: string;
  hint: string;
  prongs: number;
  /** Arm length from hinge to tip (m). */
  prongLen: number;
  /** Hinge radius from the claw axis. */
  pivotR: number;
  /** Tip radius from the axis, fully open (as set by 爪位) / fully closed. */
  reachOpen: number;
  reachClosed: number;
  /** Radius of the base disc that lands on the pile. */
  hubR: number;
  /** Grip multipliers against round items and boxes. */
  gripSphere: number;
  gripBox: number;
  // ── Looks ──
  armRadius: number;
  sleeveRadius: number;
  /** Scale of the tube housing and base. */
  headScale: number;
  metal: string;
  sleeve: string;
  coil: string;
}

/**
 * Straight arms span this much more than curved ones of the same number:
 * the mean ratio over the sizes listed both ways (3, 3.5, 4, 5, 6號).
 */
const STRAIGHT_PER_CURVED = 1.09;

/** Seller-listed open spans (爪距, tip to tip, cm); some sizes are only listed one way. */
const LISTED: { size: ClawSize; label: string; straight?: number; curved?: number }[] = [
  { size: '1', label: '1號', straight: 11 },
  { size: '2', label: '2號', straight: 14 },
  { size: '2.5', label: '2號半', straight: 18 },
  { size: '3', label: '3號', straight: 17, curved: 16 },
  { size: '3.5', label: '3號半', straight: 19, curved: 18 },
  { size: '4', label: '4號', straight: 22, curved: 20 },
  { size: '4.5', label: '4號半', curved: 22 },
  { size: '5', label: '5號', straight: 27, curved: 23 },
  { size: '6', label: '6號 巨無霸', straight: 30, curved: 28 },
];

/**
 * Claw sizes by 號數, each in straight (直爪) and curved (彎爪) arms. Curved
 * tips hook inward, so a curved claw of the same number spans less. Where the
 * listing gives one bend only, the other is estimated from STRAIGHT_PER_CURVED
 * and marked `estimated`.
 */
export const CLAW_SIZES: { size: ClawSize; label: string; straight: number; curved: number; estimated?: ClawBend }[] =
  LISTED.map((row) => {
    if (row.straight !== undefined && row.curved !== undefined) return { ...row, straight: row.straight, curved: row.curved };
    if (row.straight !== undefined) {
      return { ...row, straight: row.straight, curved: Math.round(row.straight / STRAIGHT_PER_CURVED), estimated: 'curved' as const };
    }
    const curved = row.curved ?? 20;
    return { ...row, curved, straight: Math.round(curved * STRAIGHT_PER_CURVED), estimated: 'straight' as const };
  });

export const CLAW_BEND_LABEL: Record<ClawBend, string> = { straight: '直爪', curved: '彎爪' };

/** 爪位 range: arms set to open from half their span up to all of it. */
export const OPEN_PCT = { min: 50, max: 100, step: 5 } as const;

/** 4號彎爪 (20 cm) at full opening: the size the grip model was calibrated on. */
export const DEFAULT_FIT: ClawFit = { size: '4', bend: 'curved', openPct: 100 };

interface Style {
  label: string;
  hint: string;
  prongs: number;
  gripSphere: number;
  gripBox: number;
  /** Relative to the standard claw at the same size. */
  armLen: number; pivot: number; closed: number; hub: number; head: number; thick: number;
  metal: string; sleeve: string; coil: string;
}

const STYLES: Record<ClawType, Style> = {
  standard: {
    label: '標準三爪', hint: '台灣機台最常見的三爪，娃娃、扭蛋都能用',
    prongs: 3, gripSphere: 1, gripBox: 0.8,
    armLen: 1, pivot: 1, closed: 1, hub: 1, head: 1, thick: 1,
    metal: '#e8eaee', sleeve: '#dc2626', coil: '#b45309',
  },
  four: {
    label: '四爪', hint: '四支爪臂包覆面積大，夾得比較穩',
    prongs: 4, gripSphere: 1.03, gripBox: 1,
    armLen: 1.03, pivot: 1.1, closed: 1.07, hub: 1.07, head: 1.08, thick: 1,
    metal: '#e8eaee', sleeve: '#2563eb', coil: '#b45309',
  },
  two: {
    label: '二爪（夾盒爪）', hint: '兩片寬爪面對夾，專夾盒裝公仔、零食盒；圓的東西容易滑掉',
    prongs: 2, gripSphere: 0.7, gripBox: 1.3,
    armLen: 0.96, pivot: 1.2, closed: 0.71, hub: 1.07, head: 1.1, thick: 1.15,
    metal: '#d4d8de', sleeve: '#16a34a', coil: '#b45309',
  },
  kingkong: {
    label: '金剛K爪', hint: '加粗鋼臂與大線圈，抓力最強，適合重獎品',
    prongs: 3, gripSphere: 1.15, gripBox: 1.1,
    armLen: 1.03, pivot: 1.3, closed: 1.07, hub: 1.33, head: 1.35, thick: 1.45,
    metal: '#f5c542', sleeve: '#111827', coil: '#7c2d12',
  },
};

export const CLAW_TYPES = Object.keys(STYLES) as ClawType[];

export function isClawType(v: unknown): v is ClawType {
  return typeof v === 'string' && v in STYLES;
}

export function isClawSize(v: unknown): v is ClawSize {
  return CLAW_SIZES.some((s) => s.size === v);
}

export function styleOf(type: ClawType) {
  return STYLES[type];
}

export const CLAW_BENDS: readonly ClawBend[] = ['straight', 'curved'];

function sizeRow(size: ClawSize) {
  return CLAW_SIZES.find((s) => s.size === size) ?? CLAW_SIZES[0];
}

/** Open span (cm) of a size in a bend. */
export function spanCm(size: ClawSize, bend: ClawBend): number {
  return sizeRow(size)[bend];
}

/** True when that size/bend isn't in the seller listing and its span is our estimate. */
export function spanEstimated(size: ClawSize, bend: ClawBend) {
  return sizeRow(size).estimated === bend;
}

export function sizeLabel(size: ClawSize) {
  return CLAW_SIZES.find((s) => s.size === size)?.label ?? `${size}號`;
}

/** Accept anything (e.g. parsed localStorage) and return a valid fit. */
export function sanitizeFit(raw: unknown): ClawFit {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const size = isClawSize(obj.size) ? obj.size : DEFAULT_FIT.size;
  const bend = CLAW_BENDS.includes(obj.bend as ClawBend) ? (obj.bend as ClawBend) : DEFAULT_FIT.bend;
  const pct = typeof obj.openPct === 'number' && Number.isFinite(obj.openPct) ? obj.openPct : DEFAULT_FIT.openPct;
  const openPct = Math.min(OPEN_PCT.max, Math.max(OPEN_PCT.min, Math.round(pct / OPEN_PCT.step) * OPEN_PCT.step));
  return { size, bend, openPct };
}

/**
 * Build the claw for a style, size and 爪位. Everything scales off the open
 * span: the arms are 1.3× the open tip radius, and the hinge, closed reach,
 * base and head grow with its square root. The 4號彎爪 standard claw comes
 * out at the original calibrated geometry (open tip radius 10 cm, arms 13 cm).
 */
export function buildClawSpec(type: ClawType, fit: Partial<ClawFit> = {}): ClawSpec {
  const f = sanitizeFit({ ...DEFAULT_FIT, ...fit });
  const st = STYLES[type];
  const cm = spanCm(f.size, f.bend);
  const k = cm / 20;
  const sk = Math.sqrt(k);
  const fullReach = (cm / 100) / 2;
  const reachClosed = 0.028 * sk * st.closed;
  const reachOpen = reachClosed + (fullReach - reachClosed) * (f.openPct / 100);
  // Curved tips cradle round things; straight arms bear flat on box sides.
  const bendSphere = f.bend === 'curved' ? 1 : 0.95;
  const bendBox = f.bend === 'curved' ? 1 : 1.08;
  return {
    type, size: f.size, bend: f.bend, spanCm: cm,
    label: `${st.label} ${sizeLabel(f.size)}${CLAW_BEND_LABEL[f.bend]}`,
    hint: st.hint,
    prongs: st.prongs,
    prongLen: 0.13 * k * st.armLen,
    pivotR: 0.02 * sk * st.pivot,
    reachOpen,
    reachClosed,
    hubR: 0.03 * sk * st.hub,
    gripSphere: st.gripSphere * bendSphere,
    gripBox: st.gripBox * bendBox,
    armRadius: 0.009 * sk * st.thick,
    sleeveRadius: 0.0135 * sk * st.thick,
    headScale: sk * st.head,
    metal: st.metal, sleeve: st.sleeve, coil: st.coil,
  };
}

/** Each style at the default size, e.g. for the picker's thumbnails. */
export const CLAW_SPECS = Object.fromEntries(
  CLAW_TYPES.map((t) => [t, buildClawSpec(t)]),
) as Record<ClawType, ClawSpec>;

/**
 * An arm's profile in its hinge frame (x outward, y up), shared by the drawn
 * arm and its physics collider. It hangs down, bows out, and at the tip a
 * curved arm hooks back in while a straight one barely turns.
 * Points: hinge, upper bow, knee, lower bow, tip, hook.
 */
export function armProfile(spec: Pick<ClawSpec, 'prongLen' | 'bend'>): [number, number][] {
  const L = spec.prongLen;
  const k = L / 0.13;
  return spec.bend === 'curved'
    ? [[0, 0], [0.013 * k, -0.03 * k], [0.018 * k, -0.075 * k], [0.009 * k, -0.11 * k], [-0.006 * k, -L], [-0.02 * k, -L - 0.006 * k]]
    : [[0, 0], [0.011 * k, -0.03 * k], [0.015 * k, -0.075 * k], [0.013 * k, -0.11 * k], [0.007 * k, -L], [-0.001 * k, -L - 0.008 * k]];
}
