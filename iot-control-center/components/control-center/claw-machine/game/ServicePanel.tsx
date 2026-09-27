'use client';
import {
  SETTING_DEFS, SETTING_GROUPS, defaultSettings, formatSetting, settingDetail, type ClawSettings, type SettingKey,
} from './settings';
import { CHUTE_LIMITS, DEFAULT_CHUTE, clawClearance, type ChuteConfig, type Stats } from './clawSim';
import {
  CLAW_BENDS, CLAW_BEND_LABEL, CLAW_SIZES, CLAW_TYPES, OPEN_PCT, buildClawSpec, spanCm, spanEstimated, styleOf,
  type ClawFit, type ClawSpec, type ClawType,
} from './claws';
import { CATEGORY_INFO, ITEM_CATEGORIES, ITEMS, STOCK_COUNT, type ItemCategory, type Stock } from './items';

export type ServiceTab = 'board' | 'claw' | 'stock' | 'chute' | 'books';

const TABS: { id: ServiceTab; label: string }[] = [
  { id: 'board', label: '主機板' },
  { id: 'claw', label: '更換爪子' },
  { id: 'stock', label: '擺場商品' },
  { id: 'chute', label: '出貨口' },
  { id: 'books', label: '帳目' },
];

const CHUTE_PRESETS: { label: string; cfg: ChuteConfig; hint: string }[] = [
  { label: '標準', cfg: DEFAULT_CHUTE, hint: '洞口 23×22 cm，擋板 15 cm' },
  { label: '縮洞', cfg: { width: 0.16, depth: 0.16, wallH: 0.15 }, hint: '大娃娃要剛好對準才掉得下去' },
  { label: '高擋板', cfg: { width: 0.23, depth: 0.22, wallH: 0.26 }, hint: '要夾得夠高才越得過' },
  { label: '無擋板', cfg: { width: 0.23, depth: 0.22, wallH: 0 }, hint: '推、撥到洞邊就可能掉進去' },
];

const THEMES: { label: string; categories: ItemCategory[] }[] = [
  { label: '娃娃台', categories: ['plush'] },
  { label: '扭蛋台', categories: ['capsule'] },
  { label: '公仔盒台', categories: ['figure'] },
  { label: '零食台', categories: ['snack'] },
  { label: '綜合台', categories: [...ITEM_CATEGORIES] },
];

/** Items whose effect the scene shows as a height guide (TK08's 查看高度). */
const GUIDE: Partial<Record<SettingKey, { color: string; text: string }>> = {
  dropLine: { color: 'bg-rose-500', text: '機台內紅色平面 = 下線長度放完時爪尖的高度（沒甩爪時）' },
  dropSpeed: { color: 'bg-rose-500', text: '機台內紅色平面 = 下線長度放完時爪尖的高度（沒甩爪時）' },
  midPoint: { color: 'bg-sky-500', text: '機台內藍色平面 = 上升時轉中壓的位置（爪尖高度）；甩爪時實際會更高' },
  homeDrop: { color: 'bg-emerald-500', text: '機台內綠色平面 = 回停下降後爪尖停的高度' },
};

interface Props {
  tab: ServiceTab;
  onTab: (t: ServiceTab) => void;
  settings: ClawSettings;
  index: number;
  stats: Stats;
  clawType: ClawType;
  fit: ClawFit;
  stock: Stock;
  chute: ChuteConfig;
  /** Prizes in the cabinet right now. */
  remaining: number;
  /** The last load stopped short: the pile reached the raised claw. */
  full: boolean;
  onIndex: (i: number) => void;
  onStep: (dir: 1 | -1) => void;
  onSettings: (s: ClawSettings) => void;
  onClaw: (t: ClawType, fit: ClawFit) => void;
  onStock: (s: Stock) => void;
  onChute: (c: ChuteConfig) => void;
  onClearStats: () => void;
  onRestock: () => void;
  onTopUp: () => void;
  onClose: () => void;
  /** Close button text. Control Center: the panel only edits a draft, so not 儲存離開. */
  closeLabel?: string;
}

function Key({ children, onClick, label, wide }: { children: React.ReactNode; onClick: () => void; label: string; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`${wide ? 'px-3' : 'w-11'} h-10 rounded-md border border-slate-600 bg-gradient-to-b from-slate-600 to-slate-800 text-sm font-bold text-slate-100 shadow-[0_3px_0_#0f172a] active:translate-y-0.5 active:shadow-none`}
    >
      {children}
    </button>
  );
}

/** Top-down sketch of a claw: base disc plus its arms at their real angles. */
function ClawGlyph({ spec }: { spec: ClawSpec }) {
  const reach = 8 + spec.reachOpen * 150;
  return (
    <svg viewBox="-30 -30 60 60" className="h-12 w-12 shrink-0" aria-hidden>
      <circle r={reach} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 3" />
      {Array.from({ length: spec.prongs }, (_, i) => {
        const a = (i * Math.PI * 2) / spec.prongs + Math.PI / 2;
        const x = Math.cos(a) * reach, y = Math.sin(a) * reach;
        return (
          <g key={i}>
            <line x1={0} y1={0} x2={x} y2={y} stroke={spec.metal} strokeWidth={spec.armRadius * 420} strokeLinecap="round" />
            <circle cx={x} cy={y} r={spec.sleeveRadius * 260} fill={spec.sleeve} />
          </g>
        );
      })}
      <circle r={spec.hubR * 260} fill="#9ca3af" stroke="#1f2937" strokeWidth={1.5} />
    </svg>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400">
      <span className="w-12 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span className="w-8 text-right font-mono tabular-nums">×{value.toFixed(2)}</span>
    </div>
  );
}

function BoardTab({ settings, index, onIndex, onStep, onSettings }: Pick<Props, 'settings' | 'index' | 'onIndex' | 'onStep' | 'onSettings'>) {
  const def = SETTING_DEFS[index];
  const n = SETTING_DEFS.length;
  const group = SETTING_GROUPS.find((g) => g.id === def.group);
  const detail = settingDetail(def.key, settings);
  const guide = GUIDE[def.key];
  return (
    <>
      <div className="rounded-lg border-4 border-slate-700 bg-[#9bbc0f] px-3 py-2 font-mono text-[#0f380f] shadow-[inset_0_0_12px_rgba(0,0,0,0.35)]">
        <div className="flex justify-between text-sm">
          <span>SET-{def.code}</span>
          <span>{group?.label} {index + 1}/{n}</span>
        </div>
        <div className="mt-1 text-lg font-bold leading-tight">{def.label}</div>
        <div className="mt-0.5 text-right text-2xl font-bold tabular-nums">{formatSetting(def, settings[def.key])}</div>
        <div className="min-h-[1rem] text-right text-xs">{detail ?? ''}</div>
      </div>
      <p className="min-h-[2.5rem] text-xs leading-relaxed text-slate-400">{def.hint}</p>
      {guide && (
        <p className="flex items-center gap-2 rounded-md bg-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-300">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${guide.color}`} aria-hidden />
          {guide.text}
        </p>
      )}

      <div className="grid grid-cols-3 place-items-center gap-2 self-center">
        <span />
        <Key label="上一項" onClick={() => onIndex((index - 1 + n) % n)}>▲</Key>
        <span />
        <Key label="減少" onClick={() => onStep(-1)}>◀</Key>
        <Key label="預設值" onClick={() => onSettings({ ...settings, [def.key]: def.default })} wide>預設</Key>
        <Key label="增加" onClick={() => onStep(1)}>▶</Key>
        <span />
        <Key label="下一項" onClick={() => onIndex((index + 1) % n)}>▼</Key>
        <span />
      </div>
      <p className="text-center text-[11px] text-slate-500">搖桿 / 方向鍵：上下選項、左右調整；下爪鈕 = 下一項</p>

      <div className="rounded-lg border border-slate-700">
        {SETTING_GROUPS.map((g) => (
          <div key={g.id}>
            <h3 className="border-b border-slate-800 bg-slate-800/60 px-3 py-1 text-[11px] font-semibold tracking-wider text-amber-300/80">{g.label}</h3>
            {SETTING_DEFS.map((d, i) => d.group !== g.id ? null : (
              <button
                key={d.key}
                type="button"
                onClick={() => onIndex(i)}
                className={`flex w-full items-center justify-between border-b border-slate-800 px-3 py-1.5 text-left text-sm ${
                  i === index ? 'bg-amber-500/15 text-amber-300' : 'hover:bg-slate-800'
                }`}
              >
                <span><span className="mr-2 font-mono text-slate-500">{d.code}</span>{d.label}</span>
                <span className="font-mono tabular-nums">{formatSetting(d, settings[d.key])}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Which stocked categories the fitted claw opens wide enough to get around (largest of each). */
function FitChips({ spec }: { spec: ClawSpec }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ITEM_CATEGORIES.map((c) => {
        const biggest = ITEMS.filter((d) => d.category === c).map((d) => ({
          shape: d.shape,
          r: d.r?.[1] ?? 0,
          halfX: d.half?.x[1] ?? d.r?.[1] ?? 0,
          halfZ: d.half?.z[1] ?? d.r?.[1] ?? 0,
        }));
        const ok = biggest.every((item) => clawClearance(spec, item) >= 0);
        return (
          <span
            key={c}
            className={`rounded px-1.5 py-0.5 text-[10px] ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/10 text-rose-300/80 line-through'}`}
            title={ok ? '張開後包得住最大的一款' : '最大的一款包不住，爪子會壓在上面'}
          >
            {CATEGORY_INFO[c].icon} {CATEGORY_INFO[c].label}
          </span>
        );
      })}
    </div>
  );
}

function ClawTab({ clawType, fit, settings, stock, onClaw, onSettings }: Pick<Props, 'clawType' | 'fit' | 'settings' | 'stock' | 'onClaw' | 'onSettings'>) {
  const boxy = stock.categories.every((c) => c === 'figure' || c === 'snack');
  const spec = buildClawSpec(clawType, fit);
  const setFit = (next: Partial<ClawFit>) => onClaw(clawType, { ...fit, ...next });
  /** Span text for a size and bend; 約 marks spans the listing doesn't give (estimated). */
  const spanText = (size: ClawFit['size'], bend: ClawFit['bend']) =>
    `${spanEstimated(size, bend) ? '約' : ''}${spanCm(size, bend)}`;
  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        換爪不需重開機，下一次下爪就生效。爪型決定幾支爪與抓力倍率，號數決定爪距（張開的寬度），爪位再微調實際張開多少。
      </p>

      {/* 待機爪子: how the claw waits between rounds. Saved with the board settings. */}
      <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">待機爪子</p>
          <p className="text-[11px] text-slate-400">張開 {Math.round(spec.reachOpen * 200)} cm · 合爪 {Math.round(spec.reachClosed * 200)} cm · 離開設定後保持</p>
        </div>
        <div className="flex rounded-md border border-amber-400/60" role="radiogroup" aria-label="待機爪子">
          {(['合爪', '開爪'] as const).map((label, v) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={settings.idleOpen === v}
              onClick={() => onSettings({ ...settings, idleOpen: v })}
              className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${settings.idleOpen === v ? 'bg-amber-400 font-bold text-slate-950' : 'text-amber-300 hover:bg-amber-500/10'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-400">爪子號數（爪距）</h3>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="爪子號數">
          {CLAW_SIZES.map((row) => {
            const active = row.size === fit.size;
            const spans = `直${spanText(row.size, 'straight')} / 彎${spanText(row.size, 'curved')}`;
            return (
              <button
                key={row.size}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFit({ size: row.size })}
                className={`rounded-md border px-2 py-1.5 text-left ${active ? 'border-amber-400 bg-amber-500/15' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                <span className={`block text-sm font-semibold ${active ? 'text-amber-200' : ''}`}>{row.label}</span>
                <span className="block text-[10px] text-slate-400">{spans} cm</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-slate-400">爪臂</span>
          <div className="flex rounded-md border border-slate-600" role="radiogroup" aria-label="直爪或彎爪">
            {CLAW_BENDS.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={fit.bend === b}
                onClick={() => setFit({ bend: b })}
                className={`px-3 py-1 text-xs first:rounded-l-md last:rounded-r-md ${fit.bend === b ? 'bg-amber-400 font-bold text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {CLAW_BEND_LABEL[b]} {spanText(fit.size, b)}cm
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          彎爪爪尖內勾，包圓的娃娃比較穩；直爪面平，夾盒子側面比較好。每個號數都有直爪和彎爪；標「約」的是賣場沒標、依同號數直／彎比例估算的爪距。
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold text-slate-400">爪位（開爪幅度）</h3>
          <span className="font-mono text-sm tabular-nums">{fit.openPct}% · {Math.round(spec.reachOpen * 200)} cm</span>
        </div>
        <input
          type="range"
          min={OPEN_PCT.min}
          max={OPEN_PCT.max}
          step={OPEN_PCT.step}
          value={fit.openPct}
          onChange={(e) => setFit({ openPct: Number(e.target.value) })}
          className="w-full accent-amber-400"
          aria-label="爪位（開爪幅度）"
        />
        <p className="text-[11px] leading-snug text-slate-500">爪位調小，爪子張不開、包不住大的商品，只能勾邊；調大才包得進去。</p>
        <div className="mt-1.5"><FitChips spec={spec} /></div>
      </div>

      {boxy && clawType !== 'two' && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">目前擺的是盒裝商品，建議換「二爪（夾盒爪）」。</p>
      )}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-400">爪型</h3>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="爪子型號">
          {CLAW_TYPES.map((t) => {
            const s = buildClawSpec(t, fit);
            const style = styleOf(t);
            const active = t === clawType;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onClaw(t, fit)}
                className={`flex gap-3 rounded-lg border p-3 text-left transition-colors ${
                  active ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/60'
                }`}
              >
                <ClawGlyph spec={s} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{style.label}</span>
                    {active && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">使用中</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{style.hint}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {s.prongs} 爪 · 張口 {Math.round(s.reachOpen * 200)} cm · 爪臂 {Math.round(s.prongLen * 100)} cm
                  </p>
                  <div className="mt-1 space-y-0.5">
                    <Meter label="抓圓物" value={s.gripSphere} max={1.4} />
                    <Meter label="抓盒子" value={s.gripBox} max={1.4} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CountSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs font-semibold text-slate-400">{label}</span>
      <input
        type="range"
        min={STOCK_COUNT.min}
        max={STOCK_COUNT.max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-amber-400"
        aria-label={label}
      />
      <span className="w-10 text-right font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

function StockTab({ stock, remaining, full, onStock, onRestock, onTopUp }: Pick<Props, 'stock' | 'remaining' | 'full' | 'onStock' | 'onRestock' | 'onTopUp'>) {
  const toggle = (c: ItemCategory) => {
    const has = stock.categories.includes(c);
    if (has && stock.categories.length === 1) return; // keep at least one
    const categories = has ? stock.categories.filter((x) => x !== c) : ITEM_CATEGORIES.filter((x) => x === c || stock.categories.includes(x));
    onStock({ ...stock, categories });
  };
  const same = (a: ItemCategory[], b: ItemCategory[]) => a.length === b.length && a.every((x) => b.includes(x));
  return (
    <>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-400">快速主題</h3>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => onStock({ ...stock, categories: t.categories })}
              className={`rounded-full border px-3 py-1 text-xs ${
                same(t.categories, stock.categories) ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-slate-600 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-400">商品種類（可複選）</h3>
        <div className="flex flex-col gap-1.5">
          {ITEM_CATEGORIES.map((c) => {
            const info = CATEGORY_INFO[c];
            const on = stock.categories.includes(c);
            return (
              <label
                key={c}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${on ? 'border-amber-400/70 bg-amber-500/10' : 'border-slate-700 hover:bg-slate-800/60'}`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(c)} className="h-4 w-4 accent-amber-400" />
                <span className="text-xl" aria-hidden>{info.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{info.label}</span>
                  <span className="block text-[11px] text-slate-400">{info.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-700 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400">擺放數量</h3>
          <div className="flex rounded-md border border-slate-600" role="radiogroup" aria-label="數量模式">
            {([false, true] as const).map((random) => (
              <button
                key={String(random)}
                type="button"
                role="radio"
                aria-checked={stock.random === random}
                onClick={() => onStock({ ...stock, random })}
                className={`px-3 py-1 text-xs first:rounded-l-md last:rounded-r-md ${stock.random === random ? 'bg-amber-400 font-bold text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {random ? '隨機數量' : '固定數量'}
              </button>
            ))}
          </div>
        </div>
        {stock.random ? (
          <>
            <CountSlider label="最少" value={stock.countMin} onChange={(v) => onStock({ ...stock, countMin: v, count: Math.max(v, stock.count) })} />
            <CountSlider label="最多" value={stock.count} onChange={(v) => onStock({ ...stock, count: v, countMin: Math.min(v, stock.countMin) })} />
            <p className="text-[11px] text-slate-500">每次擺場或補貨，都在 {stock.countMin}–{stock.count} 個之間隨機。</p>
          </>
        ) : (
          <CountSlider label="數量" value={stock.count} onChange={(v) => onStock({ ...stock, count: v, countMin: Math.min(stock.countMin, v) })} />
        )}
        <p className="text-[11px] text-slate-500">
          機台內目前 <span className="font-mono text-slate-300">{remaining}</span> 個。最多 {STOCK_COUNT.max} 個，可以堆到爪子正下方。
        </p>
        {full && (
          <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
            已經堆到爪子下方，放不下更多了。換小一號的爪子（爪子升到頂比較高）或放扭蛋等小商品可以再多放。
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onRestock} className="flex-1 rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">
          清空並重新擺場
        </button>
        <button type="button" onClick={onTopUp} className="flex-1 rounded-md border border-amber-400/70 px-3 py-2 text-sm font-bold text-amber-300 hover:bg-amber-500/10">
          補貨
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        數量和商品種類一改就直接套用到機台：加量從上面補進去、減量從最上面拿掉，換種類會重新擺場。
        「清空並重新擺場」重新隨機擺一次；「補貨」把被夾走的補回來。
      </p>
    </>
  );
}

/** Which categories' biggest item fits down the hole: round ones by diameter, boxes on their two smallest sides. */
function HoleChips({ chute }: { chute: ChuteConfig }) {
  const lo = Math.min(chute.width, chute.depth), hi = Math.max(chute.width, chute.depth);
  return (
    <div className="flex flex-wrap gap-1">
      {ITEM_CATEGORIES.map((c) => {
        const ok = ITEMS.filter((d) => d.category === c).every((d) => {
          if (d.shape === 'sphere') return (d.r?.[1] ?? 0) * 2 < lo;
          const [a, b] = [d.half?.x[1] ?? 0, d.half?.y[1] ?? 0, d.half?.z[1] ?? 0].map((h) => h * 2).sort((x, y) => x - y);
          return a < lo && b < hi;
        });
        return (
          <span
            key={c}
            className={`rounded px-1.5 py-0.5 text-[10px] ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/10 text-rose-300/80'}`}
            title={ok ? '最大的一款也掉得進洞口' : '最大的一款比洞口大，會卡在洞邊'}
          >
            {CATEGORY_INFO[c].icon} {CATEGORY_INFO[c].label}{ok ? '' : ' 會卡洞'}
          </span>
        );
      })}
    </div>
  );
}

function CmSlider({ label, value, min, max, onChange, zero }: {
  label: string; value: number; min: number; max: number; onChange: (m: number) => void; zero?: string;
}) {
  const cm = Math.round(value * 100);
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        <span className="font-mono text-sm tabular-nums">{cm === 0 && zero ? zero : `${cm} cm`}</span>
      </div>
      <input
        type="range"
        min={Math.round(min * 100)}
        max={Math.round(max * 100)}
        value={cm}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-amber-400"
        aria-label={label}
      />
    </div>
  );
}

function ChuteTab({ chute, onChute }: Pick<Props, 'chute' | 'onChute'>) {
  const same = (a: ChuteConfig, b: ChuteConfig) => a.width === b.width && a.depth === b.depth && a.wallH === b.wallH;
  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        出貨口在機台左前角。擋板越高，夾起來的東西要升得越高才越得過；洞口縮小，大的娃娃會卡在洞邊，要擺正才掉得下去。調整後直接套用。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CHUTE_PRESETS.map((pr) => (
          <button
            key={pr.label}
            type="button"
            title={pr.hint}
            onClick={() => onChute(pr.cfg)}
            className={`rounded-full border px-3 py-1 text-xs ${same(pr.cfg, chute) ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
          >
            {pr.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-slate-700 p-3">
        <CmSlider label="擋板高度" value={chute.wallH} min={CHUTE_LIMITS.wallH.min} max={CHUTE_LIMITS.wallH.max} zero="無擋板"
          onChange={(wallH) => onChute({ ...chute, wallH })} />
        <CmSlider label="洞口寬度（左右）" value={chute.width} min={CHUTE_LIMITS.width.min} max={CHUTE_LIMITS.width.max}
          onChange={(width) => onChute({ ...chute, width })} />
        <CmSlider label="洞口深度（前後）" value={chute.depth} min={CHUTE_LIMITS.depth.min} max={CHUTE_LIMITS.depth.max}
          onChange={(depth) => onChute({ ...chute, depth })} />
      </div>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-400">掉得進洞口嗎（以最大的一款算）</h3>
        <HoleChips chute={chute} />
      </div>
    </>
  );
}

function BooksTab({ stats, onClearStats, onSettings }: Pick<Props, 'stats' | 'onClearStats' | 'onSettings'>) {
  return (
    <div className="rounded-lg border border-slate-700 p-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-400">總投幣</dt><dd className="text-right font-mono">{stats.coins}</dd>
        <dt className="text-slate-400">遊戲局數</dt><dd className="text-right font-mono">{stats.plays}</dd>
        <dt className="text-slate-400">出獎數</dt><dd className="text-right font-mono">{stats.wins}</dd>
        <dt className="text-slate-400">保夾觸發</dt><dd className="text-right font-mono">{stats.guarantees}</dd>
        <dt className="text-slate-400">出獎率</dt>
        <dd className="text-right font-mono">{stats.plays ? `${((stats.wins / stats.plays) * 100).toFixed(1)}%` : '—'}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onClearStats} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800">清除帳目</button>
        <button type="button" onClick={() => onSettings(defaultSettings())} className="rounded-md border border-rose-700 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950">主機板恢復出廠值</button>
      </div>
    </div>
  );
}

/**
 * Operator service mode. The 主機板 tab is laid out like a 飛絡力 board's
 * menu (a two-line LCD stepped with ▲▼ / ◀▶, items grouped as on the TK08
 * panel); the other tabs cover what an operator does with the door open:
 * swap and size the claw, restock, read the books.
 */
export default function ServicePanel(props: Props) {
  const { tab, onTab, onClose, closeLabel = '儲存離開' } = props;
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">Service Mode</p>
          <h2 className="text-lg font-bold">台主設定</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400">
          {closeLabel}
        </button>
      </div>
      <div className="mt-3 flex gap-1 overflow-x-auto border-b border-slate-700 px-4 [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-2 py-1.5 text-sm ${tab === t.id ? 'border-amber-400 font-semibold text-amber-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" role="tabpanel">
        {tab === 'board' && <BoardTab {...props} />}
        {tab === 'claw' && <ClawTab {...props} />}
        {tab === 'stock' && <StockTab {...props} />}
        {tab === 'chute' && <ChuteTab {...props} />}
        {tab === 'books' && <BooksTab {...props} />}
      </div>
    </div>
  );
}
