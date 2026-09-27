// Operator settings for the claw machine, modelled on a 飛絡力 (Feiloli)
// digital panel as of the TK08 chip: 基本設定, the three-stage 爪力電壓 with
// 中壓距離頂點, the claw's timing items (下爪長度時間, 上停上拉, 回停下降...)
// and the motor speeds. Each item is stepped with the joystick while the
// service switch is on. Pure data + helpers so the menu logic and the
// simulation can be tested without a browser.
//
// Item names follow the board; the codes (01, V1, A1, E1...) are this game's
// own numbering, not the chip's.

export type SettingKey =
  // 基本設定
  | 'coinsPerPlay' | 'playTime' | 'payoutMode' | 'guaranteeN' | 'resetOnWin'
  | 'autoDrop' | 'midAirGrab' | 'dropSteer' | 'idleOpen'
  // 爪力電壓
  | 'strongPower' | 'midPower' | 'midPoint' | 'weakPower' | 'guaranteePower'
  // 爪子動作
  | 'dropDelay' | 'dropLine' | 'closeDelay' | 'liftDelay' | 'topDelay' | 'topPull' | 'homeDrop'
  // 馬達速度
  | 'gantrySpeed' | 'dropSpeed' | 'upSpeed';

export type SettingGroup = 'basic' | 'power' | 'motion' | 'motor';

export const SETTING_GROUPS: { id: SettingGroup; label: string }[] = [
  { id: 'basic', label: '基本設定' },
  { id: 'power', label: '爪力電壓' },
  { id: 'motion', label: '爪子動作' },
  { id: 'motor', label: '馬達速度' },
];

export interface SettingDef {
  key: SettingKey;
  group: SettingGroup;
  /** Menu item code as shown on the LCD. */
  code: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  /** Enumerated items: value is the option index, and stepping wraps. */
  options?: string[];
  hint: string;
}

/** Top of the voltage range (V); the grip model scales with power / MAX_POWER. */
export const MAX_POWER = 48;
/** 中壓距離頂點 runs 1 (at the top stop) … 30 (the bottom of a full drop). */
export const MID_POINT_MAX = 30;
/** Cable length (m) that 中壓距離頂點 30 stands for: a full drop to the felt. */
export const MID_POINT_SPAN = 0.7;
/** One 回停下降 段 is this many seconds of the down motor. */
export const HOME_DROP_SEGMENT = 0.1;

export const SETTING_DEFS: readonly SettingDef[] = [
  // ── 基本設定 ──
  { key: 'coinsPerPlay', group: 'basic', code: '01', label: '投幣數/局', min: 1, max: 10, step: 1, default: 1, unit: '枚', hint: '累積幾枚硬幣換一局遊戲' },
  { key: 'playTime', group: 'basic', code: '02', label: '遊戲時間', min: 10, max: 60, step: 1, default: 30, unit: '秒', hint: '每局可移動天車的時間' },
  { key: 'payoutMode', group: 'basic', code: '03', label: '出獎模式', min: 0, max: 1, step: 1, default: 0, options: ['保夾', '機率'], hint: '保夾：固定局數給一次保夾局；機率：每局以 1/N 機率給保夾局' },
  { key: 'guaranteeN', group: 'basic', code: '04', label: '保夾局數 N', min: 0, max: 50, step: 1, default: 10, unit: '局', hint: '0 = 關閉；保夾模式為每 N 局一次，機率模式為 1/N' },
  { key: 'resetOnWin', group: 'basic', code: '05', label: '出獎重算保夾', min: 0, max: 1, step: 1, default: 1, options: ['否', '是'], hint: '任何一局出獎後，保夾局數從頭計算' },
  { key: 'autoDrop', group: 'basic', code: '06', label: '時間到自動下爪', min: 0, max: 1, step: 1, default: 1, options: ['關', '開'], hint: '關閉時，時間到即結束該局' },
  { key: 'midAirGrab', group: 'basic', code: '07', label: '空中取物', min: 0, max: 1, step: 1, default: 1, options: ['關', '開'], hint: '下降途中再按一次下爪鈕，爪子就地停下合爪' },
  { key: 'dropSteer', group: 'basic', code: '08', label: '下降中操控', min: 0, max: 1, step: 1, default: 1, options: ['關', '開'], hint: '爪子下降途中仍可用搖桿移動天車；來回推可甩爪改變落點' },
  { key: 'idleOpen', group: 'basic', code: '09', label: '待機爪子', min: 0, max: 1, step: 1, default: 0, options: ['合爪', '開爪'], hint: '沒人玩、移動天車時爪子的樣子。開爪 = 爪子一直張開著移動，下爪時直接往下' },

  // ── 爪力電壓：強 → (中壓距離頂點) → 中 → (天車回程) → 弱 ──
  { key: 'strongPower', group: 'power', code: 'V1', label: '強電壓', min: 0, max: MAX_POWER, step: 0.5, default: 40, unit: 'V', hint: '下爪合爪、開始上升時的電壓。調到 0 爪子在底部合不起來，要等轉中壓才收爪' },
  { key: 'midPower', group: 'power', code: 'V2', label: '中電壓', min: 0, max: MAX_POWER, step: 0.5, default: 30, unit: 'V', hint: '上升經過「中壓距離頂點」後改用的電壓，一路維持到天車開始回程' },
  { key: 'midPoint', group: 'power', code: 'V3', label: '中壓距離頂點', min: 1, max: MID_POINT_MAX, step: 1, default: 10, hint: '強轉中的位置：1 = 最上面，30 = 最低（一合爪就轉）。沿著線長計算，甩爪時實際高度比直直看到的高（斜邊比較長）' },
  { key: 'weakPower', group: 'power', code: 'V4', label: '弱電壓', min: 0, max: MAX_POWER, step: 0.5, default: 12, unit: 'V', hint: '天車回程（歸位）時的電壓；一般局獎品多半在此時滑落' },
  { key: 'guaranteePower', group: 'power', code: 'V5', label: '保夾電壓', min: 0, max: MAX_POWER, step: 0.5, default: 48, unit: 'V', hint: '保夾局從合爪到出獎口全程使用這個電壓' },

  // ── 爪子動作（依一次下爪的順序）──
  { key: 'dropDelay', group: 'motion', code: 'A1', label: '下爪延遲', min: 0, max: 1, step: 0.05, default: 0, unit: '秒', hint: '按下爪鈕到爪子開始下降的延遲。TK08 以「段數 × 每段秒數」設定；會讓玩家對不準時機，教學影片不建議使用' },
  { key: 'dropLine', group: 'motion', code: 'A2', label: '下線長度', min: 0.2, max: 4, step: 0.1, default: 2, unit: '秒', hint: '下爪馬達放線的時間（實機「下爪長度時間」），從上停位置算起；線長 = 時間 × 下降速度。線放完還沒碰到東西，就在半空中合爪' },
  { key: 'closeDelay', group: 'motion', code: 'A3', label: '延遲收爪', min: 0, max: 1, step: 0.05, default: 0, unit: '秒', hint: '爪子到底（下停）後，停多久才開始合爪' },
  { key: 'liftDelay', group: 'motion', code: 'A4', label: '下停上拉延遲', min: 0, max: 2, step: 0.05, default: 0.25, unit: '秒', hint: '爪子合好之後，停多久才開始往上拉' },
  { key: 'topDelay', group: 'motion', code: 'A5', label: '上停延遲', min: 0, max: 2, step: 0.1, default: 0.5, unit: '秒', hint: '爪子升到頂（上停）後，停多久天車才開始回程' },
  { key: 'topPull', group: 'motion', code: 'A6', label: '上停上拉', min: 0, max: 10, step: 1, default: 2, unit: '段', hint: '碰到上停開關後馬達多拉的段數；拉越多，爪子到頂頓一下晃得越大。0 = 不晃' },
  { key: 'homeDrop', group: 'motion', code: 'A7', label: '回停下降', min: 0, max: 10, step: 1, default: 0, unit: '段', hint: '天車歸位後爪子往下放線（1 段 = 0.1 秒）。爪子垂低、擺錘變長，下一局比較好甩爪' },

  // ── 馬達速度 ──
  { key: 'gantrySpeed', group: 'motor', code: 'E1', label: '天車速度', min: 1, max: 10, step: 1, default: 6, hint: '前後左右移動速度' },
  { key: 'dropSpeed', group: 'motor', code: 'E2', label: '下降速度', min: 1, max: 10, step: 1, default: 6, hint: '爪子下降（放線）的速度；同樣的下線長度秒數，速度越快線放得越長' },
  { key: 'upSpeed', group: 'motor', code: 'E3', label: '上升速度', min: 1, max: 10, step: 1, default: 6, hint: '爪子上升（收線）的速度' },
];

export type ClawSettings = Record<SettingKey, number>;

// ── Motors and cable ─────────────────────────────────────────────────────────

/** Trolley speed (m/s) for a 天車速度 level. */
export const gantrySpeed = (level: number) => 0.08 + 0.03 * level;
/** Winch speed (m of cable per second) for a 下降/上升速度 level. */
export const winchSpeed = (level: number) => 0.12 + 0.045 * level;

/** Cable the down motor pays out in the 下線長度 time, measured from the top stop (m). */
export function dropLineLength(s: Pick<ClawSettings, 'dropLine' | 'dropSpeed'>) {
  return s.dropLine * winchSpeed(s.dropSpeed);
}

/** Cable let out after the gantry returns home (回停下降), m. */
export function homeLineLength(s: Pick<ClawSettings, 'homeDrop' | 'dropSpeed'>) {
  return s.homeDrop * HOME_DROP_SEGMENT * winchSpeed(s.dropSpeed);
}

/** Cable still out when the lift passes 中壓距離頂點 and strong turns to mid (m). */
export function midLineLength(s: Pick<ClawSettings, 'midPoint'>) {
  return (s.midPoint / MID_POINT_MAX) * MID_POINT_SPAN;
}

// ── Menu helpers ─────────────────────────────────────────────────────────────

export function defaultSettings(): ClawSettings {
  const out = {} as ClawSettings;
  for (const def of SETTING_DEFS) out[def.key] = def.default;
  return out;
}

export function getDef(key: SettingKey): SettingDef {
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`unknown setting ${key}`);
  return def;
}

/** Snap to the item's step grid and clamp into range. */
export function clampSetting(def: SettingDef, value: number): number {
  if (!Number.isFinite(value)) return def.default;
  const snapped = Math.round((value - def.min) / def.step) * def.step + def.min;
  // Round off float noise from the fractional steps.
  const clean = Math.round(snapped * 1000) / 1000;
  return Math.min(def.max, Math.max(def.min, clean));
}

/**
 * One joystick nudge on a menu item. Enumerated items wrap around like the
 * board does; numeric items stop at their limits.
 */
export function stepSetting(settings: ClawSettings, key: SettingKey, dir: 1 | -1): ClawSettings {
  const def = getDef(key);
  const cur = settings[key];
  let next: number;
  if (def.options) {
    const n = def.options.length;
    next = (((cur - def.min + dir) % n) + n) % n + def.min;
  } else {
    next = clampSetting(def, cur + dir * def.step);
  }
  return { ...settings, [key]: next };
}

/** Accept anything (e.g. parsed localStorage) and return a valid settings object. */
export function sanitizeSettings(raw: unknown): ClawSettings {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const def of SETTING_DEFS) {
    const v = obj[def.key];
    if (typeof v === 'number') out[def.key] = clampSetting(def, v);
  }
  return out;
}

const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

export function formatSetting(def: SettingDef, value: number): string {
  if (def.options) return def.options[value - def.min] ?? String(value);
  if (def.key === 'guaranteeN' && value === 0) return '關閉';
  if (def.key === 'homeDrop' && value === 0) return '關閉';
  if (def.key === 'topPull' && value === 0) return '不晃';
  const text = value.toFixed(decimals(def.step));
  return def.unit ? `${text} ${def.unit}` : text;
}

const cm = (m: number) => `${Math.round(m * 100)} cm`;

/**
 * Second LCD line for the items whose effect is a length: what the board's
 * seconds and 段 come to in cable, at the current motor speed.
 */
export function settingDetail(key: SettingKey, s: ClawSettings): string | null {
  switch (key) {
    case 'dropLine':
    case 'dropSpeed':
      return `下線長度 ≈ ${cm(dropLineLength(s))}`;
    case 'homeDrop':
      return s.homeDrop === 0 ? null : `放線 ≈ ${cm(homeLineLength(s))}`;
    case 'midPoint':
      return `上停下方 ${cm(midLineLength(s))} 轉中壓`;
    default:
      return null;
  }
}
