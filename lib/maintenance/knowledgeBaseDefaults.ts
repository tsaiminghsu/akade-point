import type {
  KBCard,
  KBFAQItem,
  KBGameCase,
  KBGameRule,
  KBStrategyMatrix,
  KnowledgeBaseStore,
} from "./knowledgeBaseTypes";

export const DEFAULT_KB_STORE: KnowledgeBaseStore = {
  version: 1,
  cards: [],
  gameRules: [],
  strategyMatrix: [],
  gameCases: [],
  faqItems: [],
};

export function normalizeKBStore(raw: Partial<KnowledgeBaseStore>): KnowledgeBaseStore {
  return {
    version: raw.version ?? 1,
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    gameRules: Array.isArray(raw.gameRules) ? raw.gameRules : [],
    strategyMatrix: Array.isArray(raw.strategyMatrix) ? raw.strategyMatrix : [],
    gameCases: Array.isArray(raw.gameCases) ? raw.gameCases : [],
    faqItems: Array.isArray(raw.faqItems) ? raw.faqItems : [],
  };
}

function nextId(prefix: string, items: { id: string }[]): string {
  const nums = items
    .map((i) => parseInt(i.id.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function nextCardId(cards: KBCard[]): string {
  return nextId("P", cards);
}

export function nextGameRuleId(rules: KBGameRule[]): string {
  return nextId("T", rules);
}

export function nextStrategyId(matrix: KBStrategyMatrix[]): string {
  return nextId("L", matrix);
}

export function nextGameCaseId(cases: KBGameCase[]): string {
  return nextId("C", cases);
}

export function nextFAQId(items: KBFAQItem[]): string {
  return nextId("Q", items);
}

export function getAllTags(store: KnowledgeBaseStore): string[] {
  const tagSet = new Set<string>();
  const allItems = [
    ...store.cards,
    ...store.gameRules,
    ...store.strategyMatrix,
    ...store.gameCases,
    ...store.faqItems,
  ];
  for (const item of allItems) {
    for (const tag of item.tags) {
      if (tag) tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}
