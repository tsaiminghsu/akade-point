'use client';
import { useState } from 'react';
import {
  SETTING_DEFS, SETTING_GROUPS, defaultSettings, formatSetting, settingDetail, type ClawSettings, type SettingKey,
} from './settings';
import {
  ANTI_SWING_LIMITS, BED_LIFT, BOX, CHUTE_LIMITS, DEFAULT_CHUTE, DEFAULT_GANTRY, FIELD_INFO, FIELD_TYPES, GANTRY_RANGE,
  chuteFrom, clawClearance, gantryHome, holdsDiceOnly, inChute, isCorded, pinnedGantry, sanitizeGantry, topLean,
  type AntiSwing, type ChuteConfig, type FieldType, type GantryConfig, type Stats,
} from './clawSim';
import {
  DICE_RULES, DICE_RULE_INFO, TOWER_COUNT, TOWER_DICE, TOWER_SPRING, towerChance, towerSites, winChance,
  type CellConfig, type TowerConfig, type TowerSetup,
} from './tower';
import {
  SHAKER, SHAKER_DICE, SHAKER_RULES, SHAKER_RULE_INFO, SHAKER_TENSION, shakerChance, shakerFootprint,
  type ShakerConfig,
} from './shaker';
import {
  CLAW_BENDS, CLAW_BEND_LABEL, CLAW_SIZES, CLAW_TYPES, OPEN_PCT, buildClawSpec, spanCm, spanEstimated, styleOf,
  type ClawFit, type ClawSpec, type ClawType,
} from './claws';
import { CATEGORY_INFO, ITEM_CATEGORIES, ITEMS, STOCK_COUNT, type ItemCategory, type Stock } from './items';

export type ServiceTab = 'board' | 'claw' | 'stock' | 'chute' | 'gantry' | 'books';

const TABS: { id: ServiceTab; label: string }[] = [
  { id: 'board', label: '主機板' },
  { id: 'claw', label: '更換爪子' },
  { id: 'stock', label: '擺場商品' },
  { id: 'chute', label: '檯面·出貨口' },
  { id: 'gantry', label: '天車限位' },
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
  { label: '飲料台', categories: ['drink'] },
  { label: '骰子台', categories: ['dice6', 'dice12'] },
  { label: '鐵球台', categories: ['steel'] },
  { label: '綜合台', categories: ['plush', 'capsule', 'ball', 'figure', 'snack', 'drink', 'dice6', 'dice12'] },
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
  field: FieldType;
  /** A 3D 彈跳台's corner lift (m). */
  bedLift: number;
  /** The 大怒神's dice and winning rule. */
  tower: TowerConfig;
  shaker: ShakerConfig;
  /** 限位器 and 起始點. */
  gantry: GantryConfig;
  antiSwing: AntiSwing;
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
  onField: (f: FieldType) => void;
  onBedLift: (lift: number) => void;
  onTower: (t: TowerConfig) => void;
  onShaker: (s: ShakerConfig) => void;
  onGantry: (g: GantryConfig) => void;
  onAntiSwing: (a: AntiSwing) => void;
  onClearStats: () => void;
  onRestock: () => void;
  onTopUp: () => void;
  onClose: () => void;
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
        const defs = ITEMS.filter((d) => d.category === c);
        const biggest = defs.map((d) => {
          const round = (d.r?.[1] ?? 0) * (d.shape === 'dodeca' ? 0.8 : 1);
          return { shape: d.shape, r: d.r?.[1] ?? 0, halfX: d.half?.x[1] ?? round, halfZ: d.half?.z[1] ?? round };
        });
        const ok = spec.prongs === 0
          ? defs.every((d) => d.magnetic)
          : biggest.every((item) => clawClearance(spec, item) >= 0);
        return (
          <span
            key={c}
            className={`rounded px-1.5 py-0.5 text-[10px] ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/10 text-rose-300/80 line-through'}`}
            title={spec.prongs === 0 ? (ok ? '鐵做的，吸得起來' : '不是鐵，磁鐵吸不動') : ok ? '張開後包得住最大的一款' : '最大的一款包不住，爪子會壓在上面'}
          >
            {CATEGORY_INFO[c].icon} {CATEGORY_INFO[c].label}
          </span>
        );
      })}
    </div>
  );
}

function ClawTab({ clawType, fit, settings, stock, field, antiSwing, onClaw, onSettings, onAntiSwing }: Pick<Props, 'clawType' | 'fit' | 'settings' | 'stock' | 'field' | 'antiSwing' | 'onClaw' | 'onSettings' | 'onAntiSwing'>) {
  const boxy = stock.categories.every((c) => c === 'figure' || c === 'snack');
  const spec = buildClawSpec(clawType, fit);
  const lean = Math.round(topLean(spec, antiSwing));
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

      {clawType === 'magnet' ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-xs leading-relaxed text-slate-300">
          <p className="font-semibold">磁吸爪不分號數，也不用調爪位。</p>
          <p className="mt-1 text-slate-400">下爪碰到鐵球就通電吸住，吸力跟著強／中／弱電壓變；弱電壓吸不住重的鐵球。其他商品吸不起來。</p>
          <div className="mt-2"><FitChips spec={spec} /></div>
        </div>
      ) : (
      <>
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
      </>
      )}

      <div className="flex flex-col gap-2.5 rounded-lg border border-slate-700 p-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-400">防甩片</h3>
          <p className="text-[11px] leading-snug text-slate-500">天車下方、爪子筒身正上方的鐵片。爪子升到頂會頂住它；鎖越緊越甩不動，扳斜會把東西往洞口反方向丟（內丟）。</p>
        </div>
        <div>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="text-xs text-slate-400">間隙（鎖緊程度）</span>
            <span className="font-mono text-sm tabular-nums">
              {antiSwing.gap === 0 ? '鎖緊' : `${(antiSwing.gap * 100).toFixed(1)} cm`}
            </span>
          </div>
          <input
            type="range"
            min={ANTI_SWING_LIMITS.gap.min * 1000}
            max={ANTI_SWING_LIMITS.gap.max * 1000}
            step={5}
            value={Math.round(antiSwing.gap * 1000)}
            onChange={(e) => onAntiSwing({ ...antiSwing, gap: Number(e.target.value) / 1000 })}
            className="w-full accent-amber-400"
            aria-label="防甩片間隙"
          />
        </div>
        <div>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="text-xs text-slate-400">角度</span>
            <span className="font-mono text-sm tabular-nums">{antiSwing.tilt === 0 ? '水平' : `扳斜 ${antiSwing.tilt}°（內丟）`}</span>
          </div>
          <input
            type="range"
            min={ANTI_SWING_LIMITS.tilt.min}
            max={ANTI_SWING_LIMITS.tilt.max}
            step={5}
            value={antiSwing.tilt}
            onChange={(e) => onAntiSwing({ ...antiSwing, tilt: Number(e.target.value) })}
            className="w-full accent-amber-400"
            aria-label="防甩片角度"
          />
          {antiSwing.tilt > 0 && (
            <p className="mt-1 text-[11px] leading-snug text-slate-500" data-testid="top-lean">
              {lean > 0
                ? `爪子升到頂會跟著歪 ${lean}°，底部朝機台內側；下降離開防甩片後才慢慢擺回垂直。`
                : `間隙太鬆，這個角度全被間隙吃掉，爪子還是垂直的；鎖緊一點或扳更斜才會歪。`}
            </p>
          )}
        </div>
      </div>

      {field === 'tower' && clawType !== 'magnet' && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">大怒神要用「磁吸爪」：一般爪子張開太寬伸不進塔裡，也吸不住壓克力盒蓋上的鐵片。</p>
      )}
      {field === 'shaker' && clawType !== 'magnet' && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">搖骰子盒要用「磁吸爪」吸盒蓋上的鐵板：一般爪子只會停在盒蓋上，拉不動綁著橡皮繩的盒子。</p>
      )}
      {!holdsDiceOnly(field) && stock.categories.every((c) => c === 'steel') && clawType !== 'magnet' && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">目前擺的是鐵球，建議換「磁吸爪」。</p>
      )}
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

function StockTab({ stock, remaining, full, field, onStock, onRestock, onTopUp }: Pick<Props, 'stock' | 'remaining' | 'full' | 'field' | 'onStock' | 'onRestock' | 'onTopUp'>) {
  const toggle = (c: ItemCategory) => {
    const has = stock.categories.includes(c);
    if (has && stock.categories.length === 1) return; // keep at least one
    const categories = has ? stock.categories.filter((x) => x !== c) : ITEM_CATEGORIES.filter((x) => x === c || stock.categories.includes(x));
    onStock({ ...stock, categories });
  };
  const same = (a: ItemCategory[], b: ItemCategory[]) => a.length === b.length && a.every((x) => b.includes(x));
  return (
    <>
      {holdsDiceOnly(field) && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          {field === 'tower' ? '大怒神' : '搖骰子盒'}台裡只放骰子，不擺商品。骰子中獎時，出貨口會掉出一個這裡選的商品；下面的數量用不到。
        </p>
      )}
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
          if (d.shape !== 'box') return (d.r?.[1] ?? 0) * 2 < lo;
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

/** A row of choice chips (a radiogroup). */
function Chips<T extends string | number>({ label, options, value, onPick, testId }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onPick(o.value)}
          className={`h-8 min-w-9 rounded-md border px-2.5 text-sm ${value === o.value ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One cell's dice and what wins in it. `name` tells a 雙格's cells apart (「左格」); empty on a 單格. */
function CellSetup({ name, cell, onCell }: { name: string; cell: CellConfig; onCell: (c: CellConfig) => void }) {
  const set = (patch: Partial<CellConfig>) => {
    const next = { ...cell, ...patch };
    onCell({ ...next, sum: Math.min(next.dice * 6, Math.max(next.dice, next.sum)) });
  };
  const pct = (p: number) => (p >= 0.1 ? Math.round(p * 100) : Math.round(p * 1000) / 10);
  return (
    <div className={`flex flex-col gap-2 ${name ? 'rounded-md border border-slate-700/70 bg-slate-900/40 p-2' : ''}`} data-testid={name ? `cell-${name}` : undefined}>
      {name && (
        <div className="flex items-baseline justify-between">
          <h5 className="text-xs font-bold text-amber-200">{name}</h5>
          <span className="text-[11px] text-slate-500">這格單獨中獎機率 {pct(winChance(cell))}%</span>
        </div>
      )}
      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400">骰子顆數</h4>
        <Chips
          label={`${name}骰子顆數`}
          options={Array.from({ length: TOWER_DICE.max - TOWER_DICE.min + 1 }, (_, i) => ({ value: TOWER_DICE.min + i, label: String(TOWER_DICE.min + i) }))}
          value={cell.dice}
          onPick={(dice) => set({ dice })}
        />
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400">中獎條件</h4>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label={`${name}中獎條件`}>
          {DICE_RULES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={cell.rule === r}
              onClick={() => set({ rule: r })}
              className={`rounded-md border px-2.5 py-1.5 text-left ${cell.rule === r ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 hover:bg-slate-800/60'}`}
            >
              <span className={`text-sm font-semibold ${cell.rule === r ? 'text-amber-200' : ''}`}>{DICE_RULE_INFO[r].label}</span>
              <span className="ml-2 text-[11px] text-slate-400">{DICE_RULE_INFO[r].hint}</span>
            </button>
          ))}
        </div>
      </div>
      {cell.rule === 'sum' && (
        <div>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate-400">總點數門檻</span>
            <span className="font-mono text-sm tabular-nums">≥ {cell.sum}</span>
          </div>
          <input
            type="range"
            min={cell.dice}
            max={cell.dice * 6}
            value={cell.sum}
            onChange={(e) => set({ sum: Number(e.target.value) })}
            className="w-full accent-amber-400"
            aria-label={`${name}總點數門檻`}
          />
        </div>
      )}
    </div>
  );
}

const CELL_NAMES = ['左格', '右格'];

/**
 * The 大怒神 setup: how many towers stand in the cabinet, and for the one
 * picked, 單格 or 雙格 and each cell's dice and rule; the springs for all of
 * them; and the chance a fair throw pays out.
 */
function TowerSetup({ tower, chute, onTower }: Pick<Props, 'tower' | 'chute' | 'onTower'>) {
  const [picked, setPicked] = useState(0);
  const at = Math.min(picked, tower.count - 1);
  const setup = tower.towers[at];
  const setSetup = (patch: Partial<TowerSetup>) =>
    onTower({ ...tower, towers: tower.towers.map((t, i) => (i === at ? { ...t, ...patch } : t)) });
  const setCell = (ci: number, cell: CellConfig) => {
    const cells: [CellConfig, CellConfig] = [setup.cells[0], setup.cells[1]];
    cells[ci] = cell;
    setSetup({ cells });
  };
  const chance = towerChance(setup);
  const pct = chance >= 0.1 ? Math.round(chance * 100) : Math.round(chance * 1000) / 10;
  const sites = towerSites(tower, BOX, chuteFrom(chute));
  const rows = new Set(sites.map((s) => s.z.toFixed(3))).size;
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-slate-700 p-3" data-testid="tower-setup">
      <p className="text-[11px] leading-relaxed text-slate-500">
        磁吸爪伸進塔裡吸住壓克力盒蓋上的鐵片，連盒帶骰子往上拉；電壓撐不住（或拉到塔頂卡住）就放開，盒子自由落體砸在彈簧升降台上，骰子在盒裡亂滾。
        要對準盒蓋中間的鐵片，偏到壓克力邊緣吸不住。中電壓調低，盒子在中壓距離頂點就會掉，落差比較小、骰子比較不會翻。保夾局只要有落下就出貨。
      </p>
      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400">大怒神座數</h4>
        <Chips
          label="大怒神座數"
          testId="tower-count"
          options={Array.from({ length: TOWER_COUNT.max - TOWER_COUNT.min + 1 }, (_, i) => ({ value: TOWER_COUNT.min + i, label: `${TOWER_COUNT.min + i} 座` }))}
          value={tower.count}
          onPick={(count) => onTower({ ...tower, count })}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          {rows > 1
            ? '三座都是雙格排不下一排：前兩座靠後面玻璃，第 3 座擺到前面出貨口右邊。'
            : tower.count > 1 ? '由左到右排一排，編號從左邊算起。' : '擺在檯面中間。'}
        </p>
      </div>
      {tower.count > 1 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-400">設定哪一座</h4>
          <Chips
            label="設定哪一座"
            options={Array.from({ length: tower.count }, (_, i) => ({ value: i, label: `第 ${i + 1} 座${tower.towers[i].double ? '（雙格）' : ''}` }))}
            value={at}
            onPick={setPicked}
          />
        </div>
      )}
      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400">格數</h4>
        <Chips
          label="格數"
          options={[{ value: 'single', label: '單格' }, { value: 'double', label: '雙格（加大）' }]}
          value={setup.double ? 'double' : 'single'}
          onPick={(v) => setSetup({ double: v === 'double' })}
        />
        {setup.double && (
          <p className="mt-1 text-[11px] text-slate-500">加大的壓克力盒中間一片隔板分成左右兩格，各放各的骰子、各算各的；任一格中就出貨。盒子比較重，磁力要夠。</p>
        )}
      </div>
      {setup.double
        ? CELL_NAMES.map((name, ci) => <CellSetup key={name} name={name} cell={setup.cells[ci]} onCell={(c) => setCell(ci, c)} />)
        : <CellSetup name="" cell={setup.cells[0]} onCell={(c) => setCell(0, c)} />}
      <div>
        <div className="mb-0.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-400">彈簧彈性{tower.count > 1 ? '（每座都一樣）' : ''}</span>
          <span className="font-mono text-sm tabular-nums" data-testid="tower-spring">
            {tower.spring}{tower.spring <= 3 ? '（很少彈）' : tower.spring >= 8 ? '（彈很高）' : ''}
          </span>
        </div>
        <input
          type="range"
          min={TOWER_SPRING.min}
          max={TOWER_SPRING.max}
          value={tower.spring}
          onChange={(e) => onTower({ ...tower, spring: Number(e.target.value) })}
          className="w-full accent-amber-400"
          aria-label="彈簧彈性"
        />
        <p className="text-[11px] leading-snug text-slate-500">
          越高盒子砸下去彈得越高，骰子翻得越亂、要比較久才停；調低盒子落下幾乎不彈，很快就停（骰子一樣會被撞翻）。
        </p>
      </div>
      <p className="text-xs text-slate-300" data-testid="tower-chance">
        {tower.count > 1 ? `第 ${at + 1} 座` : ''}骰子有翻滾的話，每次落下中獎機率約 <span className="font-mono font-semibold text-amber-200">{pct}%</span>
        {setup.double ? '（兩格任一格中）' : ''}
      </p>
    </div>
  );
}

/**
 * The 搖骰子盒 setup: how many dice, what wins (and how many reds or what
 * total), how tight the cords are, and the chance a fair shake pays out.
 */
function ShakerSetup({ shaker, onShaker }: Pick<Props, 'shaker' | 'onShaker'>) {
  const set = (patch: Partial<ShakerConfig>) => {
    const next = { ...shaker, ...patch };
    const n = next.dice;
    onShaker({ ...next, reds: Math.min(n, next.reds), sum: Math.min(n * 6, Math.max(n, next.sum)) });
  };
  const n = shaker.dice;
  const chance = shakerChance(shaker);
  const pct = chance >= 0.1 ? Math.round(chance * 100) : Math.round(chance * 1000) / 10;
  const t = shaker.tension;
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-slate-700 p-3" data-testid="shaker-setup">
      <p className="text-[11px] leading-relaxed text-slate-500">
        木架四根柱子頂端拉橡皮繩吊著正方體壓克力盒，骰子散放在盒裡。磁吸爪吸住盒蓋的鐵板往上拉，繩子越拉越緊，拉力超過磁力就被扯開，盒子被繩子彈回去上下亂晃，骰子在盒裡亂翻。
        電壓越強拉得越高、晃得越兇；中電壓調低，在中壓距離頂點就會被扯開。保夾局只要有拉起來就出貨。
      </p>
      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400">骰子顆數</h4>
        <Chips
          label="骰子顆數"
          options={Array.from({ length: SHAKER_DICE.max - SHAKER_DICE.min + 1 }, (_, i) => ({ value: SHAKER_DICE.min + i, label: String(SHAKER_DICE.min + i) }))}
          value={shaker.dice}
          onPick={(dice) => set({ dice })}
        />
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400">中獎條件</h4>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="中獎條件">
          {SHAKER_RULES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={shaker.rule === r}
              onClick={() => set({ rule: r })}
              className={`rounded-md border px-2.5 py-1.5 text-left ${shaker.rule === r ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 hover:bg-slate-800/60'}`}
            >
              <span className={`text-sm font-semibold ${shaker.rule === r ? 'text-amber-200' : ''}`}>{SHAKER_RULE_INFO[r].label}</span>
              <span className="ml-2 text-[11px] text-slate-400">{SHAKER_RULE_INFO[r].hint}</span>
            </button>
          ))}
        </div>
      </div>
      {shaker.rule === 'reds' && (
        <div>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate-400">紅點顆數</span>
            <span className="font-mono text-sm tabular-nums">≥ {shaker.reds} / {n}</span>
          </div>
          <input type="range" min={1} max={n} value={shaker.reds} onChange={(e) => set({ reds: Number(e.target.value) })}
            className="w-full accent-amber-400" aria-label="紅點顆數" />
        </div>
      )}
      {shaker.rule === 'sum' && (
        <div>
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate-400">總點數門檻</span>
            <span className="font-mono text-sm tabular-nums">≥ {shaker.sum}</span>
          </div>
          <input type="range" min={n} max={n * 6} value={shaker.sum} onChange={(e) => set({ sum: Number(e.target.value) })}
            className="w-full accent-amber-400" aria-label="總點數門檻" />
        </div>
      )}
      <div>
        <div className="mb-0.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-400">橡皮繩鬆緊</span>
          <span className="font-mono text-sm tabular-nums" data-testid="shaker-tension">
            {t}{t <= 3 ? '（鬆）' : t >= 8 ? '（緊）' : ''}
          </span>
        </div>
        <input type="range" min={SHAKER_TENSION.min} max={SHAKER_TENSION.max} value={t}
          onChange={(e) => set({ tension: Number(e.target.value) })} className="w-full accent-amber-400" aria-label="橡皮繩鬆緊" />
        <p className="text-[11px] leading-snug text-slate-500">
          越緊盒子掛得越高、一拉就吃力，磁吸爪拉不高就被扯開，但彈回去甩得比較兇；越鬆拉得比較高，晃得比較慢、比較軟。
        </p>
      </div>
      <p className="text-xs text-slate-300" data-testid="shaker-chance">
        骰子有翻滾的話，每次搖中獎機率約 <span className="font-mono font-semibold text-amber-200">{pct}%</span>
      </p>
    </div>
  );
}

function ChuteTab({ chute, field, bedLift, tower, shaker, onChute, onField, onBedLift, onTower, onShaker }: Pick<
  Props, 'chute' | 'field' | 'bedLift' | 'tower' | 'shaker' | 'onChute' | 'onField' | 'onBedLift' | 'onTower' | 'onShaker'
>) {
  const corded = isCorded(field);
  const same = (a: ChuteConfig, b: ChuteConfig) => a.width === b.width && a.depth === b.depth && a.wallH === b.wallH;
  return (
    <>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-400">檯面</h3>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="檯面">
          {FIELD_TYPES.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={field === f}
              onClick={() => onField(f)}
              className={`rounded-lg border px-3 py-2 text-left ${field === f ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 hover:bg-slate-800/60'}`}
            >
              <span className={`block text-sm font-semibold ${field === f ? 'text-amber-200' : ''}`}>{FIELD_INFO[f].label}</span>
              <span className="block text-[11px] text-slate-400">{FIELD_INFO[f].hint}</span>
            </button>
          ))}
        </div>
        {field === 'tower' && <TowerSetup tower={tower} chute={chute} onTower={onTower} />}
        {field === 'shaker' && <ShakerSetup shaker={shaker} onShaker={onShaker} />}
        {corded && (
          <div className="mt-2 rounded-lg border border-slate-700 p-3">
            <CmSlider label="左後、右後、右前三個角抬高" value={bedLift} min={BED_LIFT.min} max={BED_LIFT.max} zero="平的"
              onChange={onBedLift} />
            <p className="mt-1 text-[11px] text-slate-500">越高整面越往洞口斜，東西會自己往洞口滾、彈。</p>
          </div>
        )}
      </div>
      <h3 className="-mb-1 text-xs font-semibold text-slate-400">出貨口</h3>
      <p className="text-xs leading-relaxed text-slate-400">
        {field === 'volcano'
          ? '出貨口在機台左前角，做成火山口：沒有擋板，改成一圈圈衝繩往上收到木框邊。火山口越高，繩牆越往檯面外斜。洞口寬度、深度調小時木框不動，改在框裡拉洞口網蓋住多的地方，只留角落的洞口。調整後直接套用。'
          : corded
            ? '出貨口在機台左前角。擋板越高，夾起來的東西要升得越高才越得過。洞口寬度、深度調小時木框不動，改在框裡拉洞口網蓋住多的地方，只留角落的洞口；東西落在網上不算出貨。調整後直接套用。'
            : '出貨口在機台左前角。擋板越高，夾起來的東西要升得越高才越得過；洞口縮小，大的娃娃會卡在洞邊，要擺正才掉得下去。調整後直接套用。'}
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
        <CmSlider label={field === 'volcano' ? '火山口高度' : '擋板高度'} value={chute.wallH}
          min={CHUTE_LIMITS.wallH.min} max={CHUTE_LIMITS.wallH.max} zero={field === 'volcano' ? '無火山口' : '無擋板'}
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

const MAP_SCALE = 300; // px per metre

/**
 * Top-down sketch of the cabinet: the chute, any 大怒神, the box the 限位器
 * let the gantry run in, and the start point. Clicking inside the box moves
 * the start point there.
 */
function GantryMap({ gantry, chute, field, tower, onGantry }: Pick<Props, 'gantry' | 'chute' | 'field' | 'tower' | 'onGantry'>) {
  const w = (BOX.maxX - BOX.minX) * MAP_SCALE, d = (BOX.maxZ - BOX.minZ) * MAP_SCALE;
  const px = (x: number) => (x - BOX.minX) * MAP_SCALE;
  const pz = (z: number) => (z - BOX.minZ) * MAP_SCALE;
  const hole = chuteFrom(chute);
  const home = gantryHome(gantry, hole);
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = BOX.minX + ((e.clientX - r.left) / r.width) * (BOX.maxX - BOX.minX);
    const z = BOX.minZ + ((e.clientY - r.top) / r.height) * (BOX.maxZ - BOX.minZ);
    onGantry(sanitizeGantry({ ...gantry, home: { x, z } }));
  };
  const sites = field === 'tower' ? towerSites(tower, BOX, hole) : [];
  return (
    <svg
      viewBox={`-6 -6 ${w + 12} ${d + 12}`}
      className="w-full cursor-crosshair rounded-lg bg-slate-950"
      onClick={pick}
      role="img"
      aria-label="天車範圍俯視圖（點一下設定起始點）"
    >
      <rect x={0} y={0} width={w} height={d} fill="#1e293b" stroke="#475569" />
      <text x={w / 2} y={d + 4} textAnchor="middle" fontSize={9} fill="#64748b" dominantBaseline="hanging">前（玩家這邊）</text>
      <rect x={px(hole.minX)} y={pz(hole.minZ)} width={(hole.maxX - hole.minX) * MAP_SCALE} height={(hole.maxZ - hole.minZ) * MAP_SCALE} fill="#f59e0b" opacity={0.35} />
      <text x={px((hole.minX + hole.maxX) / 2)} y={pz((hole.minZ + hole.maxZ) / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#fcd34d">出貨口</text>
      {sites.map((t) => (
        <g key={t.index}>
          <rect x={px(t.x - t.collar.x)} y={pz(t.z - t.collar.z)} width={t.collar.x * 2 * MAP_SCALE} height={t.collar.z * 2 * MAP_SCALE} fill="#c8a57a" opacity={0.35} />
          <rect x={px(t.x - t.size.inner.x)} y={pz(t.z - t.size.inner.z)} width={t.size.inner.x * 2 * MAP_SCALE} height={t.size.inner.z * 2 * MAP_SCALE} fill="#0f172a" stroke="#e2e8f0" strokeOpacity={0.6} />
          {t.kind === 'double' && <line x1={px(t.x)} y1={pz(t.z - t.size.inner.z)} x2={px(t.x)} y2={pz(t.z + t.size.inner.z)} stroke="#e2e8f0" strokeOpacity={0.4} />}
          <text x={px(t.x)} y={pz(t.z)} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#e7d3b0">
            {sites.length > 1 ? `大怒神 ${t.index + 1}` : '大怒神'}
          </text>
        </g>
      ))}
      {field === 'shaker' && (() => {
        const f = shakerFootprint(), b = SHAKER.box.half;
        return (
          <g>
            <rect x={px(f.minX)} y={pz(f.minZ)} width={(f.maxX - f.minX) * MAP_SCALE} height={(f.maxZ - f.minZ) * MAP_SCALE}
              fill="none" stroke="#e3c79a" strokeWidth={3} opacity={0.7} />
            <rect x={px(SHAKER.x - b)} y={pz(SHAKER.z - b)} width={b * 2 * MAP_SCALE} height={b * 2 * MAP_SCALE}
              fill="#0f172a" stroke="#f472b6" strokeOpacity={0.8} />
            <text x={px(SHAKER.x)} y={pz(SHAKER.z)} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#fbcfe8">搖骰子盒</text>
          </g>
        );
      })()}
      <rect
        x={px(gantry.minX) - 2} y={pz(gantry.minZ) - 2}
        width={(gantry.maxX - gantry.minX) * MAP_SCALE + 4} height={(gantry.maxZ - gantry.minZ) * MAP_SCALE + 4}
        fill="#22d3ee" fillOpacity={0.12} stroke="#22d3ee" strokeDasharray="4 3"
      />
      <circle cx={px(home.x)} cy={pz(home.z)} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

/** The 限位器 and 起始點: presets, one slider per limit switch, and where the claw starts. */
function GantryTab({ gantry, chute, field, tower, onGantry }: Pick<Props, 'gantry' | 'chute' | 'field' | 'tower' | 'onGantry'>) {
  const hole = chuteFrom(chute);
  const home = gantryHome(gantry, hole);
  const set = (patch: Partial<GantryConfig>) => onGantry(sanitizeGantry({ ...gantry, ...patch }));
  const R = GANTRY_RANGE;
  const same = (a: GantryConfig, b: GantryConfig) => JSON.stringify(a) === JSON.stringify(b);
  const sites = field === 'tower' ? towerSites(tower, BOX, hole) : [];
  const first = sites[0];
  const presets: { label: string; cfg: GantryConfig; hint: string }[] = [
    { label: '全範圍（標準）', cfg: DEFAULT_GANTRY, hint: '限位器在軌道兩端，起始點在出貨口上方' },
    ...(sites.length === 1
      ? [
        { label: '固定在大怒神', cfg: pinnedGantry(first.x, first.z), hint: '天車鎖在塔口正上方，投幣直接下爪' },
        {
          label: '大怒神附近微調',
          cfg: sanitizeGantry({ minX: first.x - 0.03, maxX: first.x + 0.03, minZ: first.z - 0.03, maxZ: first.z + 0.03, home: { x: first.x, z: first.z } }),
          hint: '從塔口上方出發，只能前後左右各動 3 cm',
        },
      ]
      : sites.length > 1
        ? [
          ...sites.map((t) => ({
            label: `固定在第 ${t.index + 1} 座`, cfg: pinnedGantry(t.x, t.z), hint: `天車鎖在第 ${t.index + 1} 座塔口正上方，投幣直接下爪`,
          })),
          {
            label: '只在大怒神之間移動',
            cfg: sanitizeGantry({
              minX: Math.min(...sites.map((t) => t.x)), maxX: Math.max(...sites.map((t) => t.x)),
              minZ: Math.min(...sites.map((t) => t.z)), maxZ: Math.max(...sites.map((t) => t.z)),
              home: { x: first.x, z: first.z },
            }),
            hint: '限位器收到各座塔口之間，從第 1 座上方出發，自己選要吸哪一座',
          },
        ]
        : []),
    ...(field === 'shaker'
      ? [
        { label: '固定在搖骰子盒', cfg: pinnedGantry(SHAKER.x, SHAKER.z), hint: '天車鎖在盒蓋鐵板正上方，投幣直接下爪' },
        {
          label: '搖骰子盒附近微調',
          cfg: sanitizeGantry({ minX: SHAKER.x - 0.03, maxX: SHAKER.x + 0.03, minZ: SHAKER.z - 0.03, maxZ: SHAKER.z + 0.03, home: { x: SHAKER.x, z: SHAKER.z } }),
          hint: '從鐵板上方出發，只能前後左右各動 3 cm',
        },
      ]
      : []),
  ];
  const spanX = Math.round((gantry.maxX - gantry.minX) * 100), spanZ = Math.round((gantry.maxZ - gantry.minZ) * 100);
  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        限位器（限位開關）夾在天車軌道和橫樑上，天車碰到就停，決定爪子能跑的範圍；四個都收到同一點，天車就固定不動。
        起始點是爪子待機、每局出發和回來放爪的位置。點下面的圖也可以直接設起始點。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((pr) => (
          <button
            key={pr.label}
            type="button"
            title={pr.hint}
            onClick={() => onGantry(pr.cfg)}
            className={`rounded-full border px-3 py-1 text-xs ${same(pr.cfg, gantry) ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
          >
            {pr.label}
          </button>
        ))}
      </div>
      <GantryMap gantry={gantry} chute={chute} field={field} tower={tower} onGantry={onGantry} />
      <p className="text-xs text-slate-300" data-testid="gantry-status">
        {spanX === 0 && spanZ === 0 ? '天車固定不動，投幣後只能直接下爪。' : `爪子可以左右 ${spanX} cm、前後 ${spanZ} cm 移動。`}
        {!holdsDiceOnly(field) && !inChute(home.x, home.z, 0, hole) && (
          <span className="block text-amber-300">起始點不在出貨口上方：夾到的東西會放在起始點，不會掉進出貨口。</span>
        )}
      </p>
      <div className="flex flex-col gap-3 rounded-lg border border-slate-700 p-3">
        <CmSlider label="左限位（距左邊玻璃）" value={gantry.minX - BOX.minX} min={R.minX - BOX.minX} max={R.maxX - BOX.minX}
          onChange={(v) => { const minX = BOX.minX + v; set({ minX, maxX: Math.max(gantry.maxX, minX) }); }} />
        <CmSlider label="右限位（距右邊玻璃）" value={BOX.maxX - gantry.maxX} min={BOX.maxX - R.maxX} max={BOX.maxX - R.minX}
          onChange={(v) => { const maxX = BOX.maxX - v; set({ maxX, minX: Math.min(gantry.minX, maxX) }); }} />
        <CmSlider label="後限位（距後面玻璃）" value={gantry.minZ - BOX.minZ} min={R.minZ - BOX.minZ} max={R.maxZ - BOX.minZ}
          onChange={(v) => { const minZ = BOX.minZ + v; set({ minZ, maxZ: Math.max(gantry.maxZ, minZ) }); }} />
        <CmSlider label="前限位（距前面玻璃）" value={BOX.maxZ - gantry.maxZ} min={BOX.maxZ - R.maxZ} max={BOX.maxZ - R.minZ}
          onChange={(v) => { const maxZ = BOX.maxZ - v; set({ maxZ, minZ: Math.min(gantry.minZ, maxZ) }); }} />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-slate-700 p-3">
        <h3 className="text-xs font-semibold text-slate-400">起始點</h3>
        <div className="flex gap-1.5" role="radiogroup" aria-label="起始點">
          {[
            { label: '出貨口上方', on: gantry.home === null, pick: () => set({ home: null }) },
            { label: '自訂位置', on: gantry.home !== null, pick: () => set({ home: { x: home.x, z: home.z } }) },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={o.on}
              onClick={o.pick}
              className={`rounded-md border px-3 py-1.5 text-sm ${o.on ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {gantry.home !== null && (
          <>
            <CmSlider label="起始點左右（距左邊玻璃）" value={home.x - BOX.minX} min={gantry.minX - BOX.minX} max={gantry.maxX - BOX.minX}
              onChange={(v) => set({ home: { x: BOX.minX + v, z: home.z } })} />
            <CmSlider label="起始點前後（距前面玻璃）" value={BOX.maxZ - home.z} min={BOX.maxZ - gantry.maxZ} max={BOX.maxZ - gantry.minZ}
              onChange={(v) => set({ home: { x: home.x, z: BOX.maxZ - v } })} />
          </>
        )}
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
  const { tab, onTab, onClose } = props;
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">Service Mode</p>
          <h2 className="text-lg font-bold">台主設定</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400">
          儲存離開
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
        {tab === 'gantry' && <GantryTab {...props} />}
        {tab === 'books' && <BooksTab {...props} />}
      </div>
    </div>
  );
}
