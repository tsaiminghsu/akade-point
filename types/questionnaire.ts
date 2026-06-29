// ─── S1：遊戲類型偏好 ─────────────────────────────────────────────────────────
export const S1_GENRES = [
  { id: "action", label: "動作/格鬥" },
  { id: "rpg", label: "角色扮演 (RPG)" },
  { id: "strategy", label: "策略/塔防" },
  { id: "simulation", label: "模擬/經營" },
  { id: "collection", label: "收集/養成" },
  { id: "puzzle", label: "解謎/益智" },
  { id: "sports", label: "體育/競速" },
  { id: "casual", label: "休閒/放置" },
] as const;

export type GenreId = (typeof S1_GENRES)[number]["id"];

// ─── S2：玩家資料 ──────────────────────────────────────────────────────────────
export const S2_AGE_RANGES = [
  { id: "under18", label: "18 歲以下" },
  { id: "18to24", label: "18–24 歲" },
  { id: "25to34", label: "25–34 歲" },
  { id: "35to44", label: "35–44 歲" },
  { id: "45plus", label: "45 歲以上" },
] as const;

export const S2_EXPERIENCE_LEVELS = [
  { id: "beginner", label: "新手（玩遊戲不到 1 年）" },
  { id: "casual", label: "休閒玩家（偶爾玩，無特定偏好）" },
  { id: "regular", label: "一般玩家（固定遊玩，有喜好類型）" },
  { id: "hardcore", label: "核心玩家（深度投入，追求進步）" },
  { id: "competitive", label: "競技玩家（參加競賽或排行榜）" },
] as const;

export type AgeRangeId = (typeof S2_AGE_RANGES)[number]["id"];
export type ExperienceLevelId = (typeof S2_EXPERIENCE_LEVELS)[number]["id"];

// ─── S3：遊戲習慣 ──────────────────────────────────────────────────────────────
export const S3_DAILY_HOURS = [
  { id: "less1", label: "不到 1 小時" },
  { id: "1to2", label: "1–2 小時" },
  { id: "3to4", label: "3–4 小時" },
  { id: "5plus", label: "5 小時以上" },
] as const;

export const S3_PLATFORMS = [
  { id: "mobile", label: "手機 (iOS/Android)" },
  { id: "pc", label: "電腦 (PC/Mac)" },
  { id: "console", label: "遊戲主機 (PS/Xbox/Switch)" },
  { id: "multi", label: "多平台皆有" },
] as const;

export const S3_SESSION_LENGTHS = [
  { id: "short", label: "短局（5–15 分鐘）" },
  { id: "medium", label: "中等（15–60 分鐘）" },
  { id: "long", label: "長局（1–3 小時）" },
  { id: "marathon", label: "馬拉松（3 小時以上）" },
] as const;

export const S3_PLAY_FREQUENCIES = [
  { id: "daily", label: "每天" },
  { id: "few_week", label: "每週數次" },
  { id: "once_week", label: "每週一次" },
  { id: "occasional", label: "偶爾（月數次）" },
] as const;

export type DailyHoursId = (typeof S3_DAILY_HOURS)[number]["id"];
export type PlatformId = (typeof S3_PLATFORMS)[number]["id"];
export type SessionLengthId = (typeof S3_SESSION_LENGTHS)[number]["id"];
export type PlayFrequencyId = (typeof S3_PLAY_FREQUENCIES)[number]["id"];

// ─── S4：卡牌偏好 ──────────────────────────────────────────────────────────────
export const S4_RARITY_PREFS = [
  { id: "common", label: "普通卡 (N) — 不在乎稀有度，實用就好" },
  { id: "rare", label: "稀有卡 (R) — 稍有特色的卡牌" },
  { id: "super_rare", label: "超稀有 (SR) — 強力且有個性的卡牌" },
  { id: "ultra_rare", label: "究極稀有 (SSR/UR) — 最頂尖的卡牌" },
] as const;

export const S4_ELEMENT_PREFS = [
  { id: "fire", label: "火焰系 — 高攻擊，爆發強" },
  { id: "water", label: "水流系 — 防禦穩，持久戰" },
  { id: "earth", label: "大地系 — 均衡型，防守佳" },
  { id: "light", label: "光明系 — 輔助支援，治癒隊伍" },
  { id: "dark", label: "暗影系 — 控制弱化，奇兵制勝" },
] as const;

export const S4_PLAYSTYLES = [
  { id: "aggressive", label: "攻擊型 — 快速解決戰鬥" },
  { id: "defensive", label: "防守型 — 穩扎穩打、持久戰" },
  { id: "balanced", label: "均衡型 — 攻守兼備" },
  { id: "support", label: "輔助型 — 增強隊友、弱化敵人" },
  { id: "control", label: "控制型 — 操控場面節奏" },
] as const;

export type RarityPrefId = (typeof S4_RARITY_PREFS)[number]["id"];
export type ElementPrefId = (typeof S4_ELEMENT_PREFS)[number]["id"];
export type PlaystyleId = (typeof S4_PLAYSTYLES)[number]["id"];

// ─── S5：遊戲興趣領域 ─────────────────────────────────────────────────────────
export const S5_INTEREST_OPTIONS = [
  { id: "pvp", label: "PvP 競技對戰" },
  { id: "pve", label: "PvE 關卡挑戰" },
  { id: "collection_complete", label: "收集完整圖鑑" },
  { id: "story", label: "故事劇情探索" },
  { id: "ranking", label: "排行榜爭名次" },
  { id: "guild", label: "公會/團隊合作" },
  { id: "trading", label: "卡牌交易收藏" },
  { id: "daily_events", label: "每日任務/活動" },
] as const;

export type InterestId = (typeof S5_INTEREST_OPTIONS)[number]["id"];

// ─── S6：遊戲歷程 ──────────────────────────────────────────────────────────────
export const S6_YEARS_GAMING = [
  { id: "less1", label: "不到 1 年" },
  { id: "1to3", label: "1–3 年" },
  { id: "4to7", label: "4–7 年" },
  { id: "8to15", label: "8–15 年" },
  { id: "15plus", label: "15 年以上" },
] as const;

export const S6_SPENDING_HABITS = [
  { id: "free", label: "免費玩家 — 不消費" },
  { id: "light", label: "輕度消費 — 偶爾少量" },
  { id: "moderate", label: "中度消費 — 每月固定金額" },
  { id: "heavy", label: "重度消費 — 追求最強陣容" },
] as const;

export type YearsGamingId = (typeof S6_YEARS_GAMING)[number]["id"];
export type SpendingHabitId = (typeof S6_SPENDING_HABITS)[number]["id"];

// ─── 完整問卷資料型別 ──────────────────────────────────────────────────────────
export interface FullQuestionnaireValues {
  // S0
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
  agreedToDataUse: boolean;

  // S1
  s1Genres: GenreId[];

  // S2
  ageRange: AgeRangeId | "";
  experienceLevel: ExperienceLevelId | "";

  // S3
  dailyHours: DailyHoursId | "";
  platform: PlatformId | "";
  sessionLength: SessionLengthId | "";
  playFrequency: PlayFrequencyId | "";

  // S4
  favoriteRarity: RarityPrefId | "";
  favoriteElement: ElementPrefId | "";
  playstyle: PlaystyleId | "";

  // S5
  s5Interests: InterestId[];

  // S6
  currentGames: string;
  yearsGaming: YearsGamingId | "";
  spendingHabit: SpendingHabitId | "";

  // S7 (auto-generated)
  reportGenerated: boolean;
}

export const FULL_QUESTIONNAIRE_DEFAULT: FullQuestionnaireValues = {
  agreedToTerms: false,
  agreedToPrivacy: false,
  agreedToDataUse: false,
  s1Genres: [],
  ageRange: "",
  experienceLevel: "",
  dailyHours: "",
  platform: "",
  sessionLength: "",
  playFrequency: "",
  favoriteRarity: "",
  favoriteElement: "",
  playstyle: "",
  s5Interests: [],
  currentGames: "",
  yearsGaming: "",
  spendingHabit: "",
  reportGenerated: false,
};

// ─── 問卷模式設定 ─────────────────────────────────────────────────────────────
export type QuestionnaireMode = "standard" | "quick";

export const QUESTIONNAIRE_MODE_CONFIGS: Record<QuestionnaireMode, {
  id: QuestionnaireMode;
  label: string;
  description: string;
  stepCount: number;
  estimatedMinutes: number;
}> = {
  standard: {
    id: "standard",
    label: "完整評估",
    description: "包含所有步驟，獲得最精確的玩家偏好分析與卡牌推薦",
    stepCount: 7,
    estimatedMinutes: 8,
  },
  quick: {
    id: "quick",
    label: "快速版",
    description: "3 個核心步驟，快速獲得基本推薦",
    stepCount: 3,
    estimatedMinutes: 3,
  },
};

export type StepId = "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";

export const STEP_TITLES: Record<StepId, string> = {
  S0: "服務條款與同意",
  S1: "遊戲類型偏好",
  S2: "玩家基本資料",
  S3: "遊戲習慣",
  S4: "卡牌偏好設定",
  S5: "遊戲興趣領域",
  S6: "遊戲歷程",
  S7: "個人化推薦報告",
};

export const STANDARD_STEPS: StepId[] = ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7"];
export const QUICK_STEPS: StepId[] = ["S1", "S4", "S7"];
