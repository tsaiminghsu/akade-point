// ─── 知識庫 A：卡片庫 ─────────────────────────────────────────────────────────
export interface KBCard {
  id: string;                    // P001, P002…
  nameZh: string;               // 卡片名稱（中文）
  nameEn: string;               // 卡片名稱（英文）
  element: string;              // 元素屬性（fire/water/earth/light/dark）
  rarity: string;               // 稀有度（N/R/SR/SSR/UR）
  seriesId: string;             // 系列 ID
  skills: string;               // 技能說明
  stats: string;                // 能力數值（攻/防/血）
  lore: string;                 // 背景故事
  tags: string[];               // 串接標籤
}

// ─── 知識庫 B：遊戲規則表 ────────────────────────────────────────────────────
export interface KBGameRule {
  id: string;                    // T001, T002…
  scenarioCondition: string;    // 適用場景條件
  ruleDescription: string;      // 規則說明
  mechanicDetails: string;      // 機制細節
  exceptions: string;           // 例外情況
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT" | "";
  tags: string[];
}

// ─── 知識庫 C：攻略矩陣 ──────────────────────────────────────────────────────
export interface KBStrategyMatrix {
  id: string;                    // L001, L002…
  scenarioKeywords: string;     // 場景關鍵字
  primaryCards: string;         // 首選推薦卡片
  secondaryCards: string;       // 次選推薦卡片
  counters: string;             // 剋制/應對方式
  notes: string;                // 備註說明
  tags: string[];
}

// ─── 知識庫 D：遊戲案例庫 ────────────────────────────────────────────────────
export interface KBGameCase {
  id: string;                    // C001, C002…
  playerProfile: string;        // 玩家概況
  mainChallenge: string;        // 主要挑戰
  recommendedCards: string;     // 推薦卡牌組合
  strategyNotes: string;        // 攻略要點
  followUpTips: string;         // 後續進階提示
  tags: string[];
}

// ─── 知識庫 F：常見 QA 問答集 ────────────────────────────────────────────────
export interface KBFAQItem {
  id: string;                    // Q001, Q002…
  question: string;             // 玩家問題
  keywords: string[];           // 關鍵字（分詞索引）
  adminThinking: string;        // 管理員思考點
  recommendedAnswer: string;    // 建議回答內容
  notes: string;                // 注意事項
  tags: string[];
}

// ─── 完整知識庫 Store ─────────────────────────────────────────────────────────
export interface KnowledgeBaseStore {
  version: number;
  cards: KBCard[];
  gameRules: KBGameRule[];
  strategyMatrix: KBStrategyMatrix[];
  gameCases: KBGameCase[];
  faqItems: KBFAQItem[];
}

export type KBTabKey = "cards" | "gameRules" | "strategyMatrix" | "gameCases" | "faqItems";
