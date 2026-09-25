// Prize catalogue: what the operator can stock the cabinet with. Round items
// are spheres in the physics, boxed items are upright boxes (AABBs). Pure data
// shared by the sim, the renderer and the HUD.

export type ItemCategory = 'plush' | 'capsule' | 'ball' | 'figure' | 'snack';
export type PrizeKind =
  | 'bear' | 'cat' | 'bunny' | 'chick' | 'frog'
  | 'capsule' | 'ball' | 'figure' | 'snack';
export type PrizeShape = 'sphere' | 'box';

type Range = [number, number];

export interface ItemDef {
  kind: PrizeKind;
  category: ItemCategory;
  label: string;
  icon: string;
  shape: PrizeShape;
  /** Sphere radius range. */
  r?: Range;
  /** Box half-extent ranges (x wide, y tall, z deep). */
  half?: { x: Range; y: Range; z: Range };
  /** Heft range, small → large; grip has to beat this to hold on. */
  weight: Range;
  /** Surface friction: plush 1, smooth plastic and cardboard less. */
  grip: number;
  /** [main, accent] colour pairs; one is picked per prize. */
  colors: [string, string][];
}

export const CATEGORY_INFO: Record<ItemCategory, { label: string; icon: string; hint: string }> = {
  plush: { label: '絨毛娃娃', icon: '🧸', hint: '軟、好抓，大隻的比較重' },
  capsule: { label: '扭蛋', icon: '🥚', hint: '輕但表面光滑，容易從爪縫滑掉' },
  ball: { label: '球類', icon: '⚽', hint: '圓又硬，三爪要夾在正中間' },
  figure: { label: '盒裝公仔', icon: '📦', hint: '直立盒裝，重；用二爪夾盒最穩' },
  snack: { label: '零食盒', icon: '🍪', hint: '扁平紙盒，輕但寬' },
};

export const ITEM_CATEGORIES = Object.keys(CATEGORY_INFO) as ItemCategory[];

/**
 * Rigid-body material per category. Plush is grippy and barely rolls (it
 * slumps into gaps); capsules are slick; balls bounce and roll; boxes slide
 * and tip. Damping is per second.
 */
export const MATERIALS: Record<ItemCategory, {
  friction: number; restitution: number; linearDamping: number; angularDamping: number;
}> = {
  plush: { friction: 0.95, restitution: 0.02, linearDamping: 0.5, angularDamping: 3.5 },
  capsule: { friction: 0.3, restitution: 0.3, linearDamping: 0.2, angularDamping: 0.7 },
  // Rapier has no rolling resistance; angular damping stands in for it.
  ball: { friction: 0.6, restitution: 0.45, linearDamping: 0.15, angularDamping: 0.7 },
  figure: { friction: 0.5, restitution: 0.05, linearDamping: 0.3, angularDamping: 0.8 },
  snack: { friction: 0.55, restitution: 0.05, linearDamping: 0.3, angularDamping: 0.8 },
};

/** Physical mass (kg) from the catalogue's relative heft. */
export const massFor = (weight: number) => 0.15 + weight * 0.5;

const PLUSH = { shape: 'sphere' as const, category: 'plush' as const, r: [0.06, 0.085] as Range, weight: [0.35, 0.8] as Range, grip: 1 };

export const ITEMS: ItemDef[] = [
  { ...PLUSH, kind: 'bear', label: '小熊', icon: '🧸', colors: [['#c98b5a', '#fde7c8'], ['#f4d6b0', '#fff7ed'], ['#8a5a3c', '#d6b08c']] },
  { ...PLUSH, kind: 'cat', label: '貓咪', icon: '🐱', colors: [['#f2a65a', '#fff'], ['#d9d9d9', '#fff'], ['#555566', '#e5e7eb']] },
  { ...PLUSH, kind: 'bunny', label: '兔兔', icon: '🐰', colors: [['#fbe3ec', '#f9a8d4'], ['#ffffff', '#f9a8d4'], ['#f7b6cf', '#fff']] },
  { ...PLUSH, kind: 'chick', label: '小雞', icon: '🐥', colors: [['#ffd84d', '#f97316'], ['#ffe98a', '#f97316']] },
  { ...PLUSH, kind: 'frog', label: '青蛙', icon: '🐸', colors: [['#7cc96b', '#fef9c3'], ['#a8dc8a', '#fef9c3']] },
  {
    kind: 'capsule', category: 'capsule', label: '扭蛋', icon: '🥚', shape: 'sphere',
    r: [0.045, 0.055], weight: [0.25, 0.4], grip: 0.53,
    colors: [['#ef4444', '#f8fafc'], ['#3b82f6', '#f8fafc'], ['#22c55e', '#f8fafc'], ['#eab308', '#f8fafc'], ['#a855f7', '#f8fafc']],
  },
  {
    kind: 'ball', category: 'ball', label: '球', icon: '⚽', shape: 'sphere',
    r: [0.055, 0.07], weight: [0.3, 0.5], grip: 0.6,
    colors: [['#f97316', '#1f2937'], ['#f8fafc', '#111827'], ['#fde047', '#2563eb']],
  },
  {
    kind: 'figure', category: 'figure', label: '盒裝公仔', icon: '📦', shape: 'box',
    half: { x: [0.045, 0.055], y: [0.065, 0.08], z: [0.035, 0.042] }, weight: [0.5, 0.8], grip: 0.85,
    colors: [['#1d4ed8', '#facc15'], ['#be123c', '#f8fafc'], ['#111827', '#22d3ee'], ['#7c3aed', '#fde68a']],
  },
  {
    kind: 'snack', category: 'snack', label: '零食盒', icon: '🍪', shape: 'box',
    half: { x: [0.06, 0.07], y: [0.024, 0.03], z: [0.045, 0.052] }, weight: [0.3, 0.45], grip: 0.7,
    colors: [['#dc2626', '#fde047'], ['#f59e0b', '#7c2d12'], ['#16a34a', '#fef08a'], ['#0ea5e9', '#f8fafc']],
  },
];

export function itemDef(kind: PrizeKind): ItemDef {
  const def = ITEMS.find((d) => d.kind === kind);
  if (!def) throw new Error(`unknown prize kind ${kind}`);
  return def;
}

export function itemsIn(category: ItemCategory): ItemDef[] {
  return ITEMS.filter((d) => d.category === category);
}

// ── Stock (what the operator loads) ──────────────────────────────────────────

export interface Stock {
  categories: ItemCategory[];
  /** How many to load; with `random` on, the most a restock rolls. */
  count: number;
  /** Roll a different amount (countMin..count) on every restock. */
  random: boolean;
  countMin: number;
}

/**
 * How many the operator can ask for. What actually fits depends on the items
 * and the claw (the pile stops just under the raised claw): about 80 plush,
 * 110 mixed, or 200 capsules.
 */
export const STOCK_COUNT = { min: 4, max: 200 } as const;
export const DEFAULT_STOCK: Stock = { categories: ['plush'], count: 60, random: false, countMin: 40 };

export function sanitizeStock(raw: unknown): Stock {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STOCK, categories: [...DEFAULT_STOCK.categories] };
  const obj = raw as Record<string, unknown>;
  const cats = Array.isArray(obj.categories)
    ? ITEM_CATEGORIES.filter((c) => (obj.categories as unknown[]).includes(c))
    : [];
  const num = (v: unknown, fallback: number) =>
    Math.min(STOCK_COUNT.max, Math.max(STOCK_COUNT.min, typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback));
  const count = num(obj.count, DEFAULT_STOCK.count);
  return {
    categories: cats.length ? cats : [...DEFAULT_STOCK.categories],
    count,
    random: obj.random === true,
    countMin: Math.min(count, num(obj.countMin, DEFAULT_STOCK.countMin)),
  };
}
