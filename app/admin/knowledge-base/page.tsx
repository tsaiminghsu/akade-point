"use client";

import { useEffect, useState, useMemo } from "react";
import { useKnowledgeBaseStore } from "@/app/hooks/useKnowledgeBaseStore";
import {
  getAllTags,
  nextCardId,
  nextFAQId,
  nextGameCaseId,
  nextGameRuleId,
  nextStrategyId,
} from "@/lib/maintenance/knowledgeBaseDefaults";
import type {
  KBCard,
  KBFAQItem,
  KBGameCase,
  KBGameRule,
  KBStrategyMatrix,
  KBTabKey,
} from "@/lib/maintenance/knowledgeBaseTypes";

// ─── Tag Chip ──────────────────────────────────────────────────────────────────
const TAG_COLORS = ["bg-indigo-900 text-indigo-200", "bg-emerald-900 text-emerald-200", "bg-amber-900 text-amber-200", "bg-rose-900 text-rose-200", "bg-violet-900 text-violet-200", "bg-cyan-900 text-cyan-200", "bg-orange-900 text-orange-200", "bg-teal-900 text-teal-200"];

function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function TagChip({ tag }: { tag: string }) {
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${tagColor(tag)}`}>{tag}</span>;
}

// ─── Field Component ──────────────────────────────────────────────────────────
function Field({ label, value, onChange, textarea, placeholder }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string }) {
  const base = "mt-1 w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500";
  return (
    <label className="block text-xs font-medium text-zinc-400">
      {label}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${base} resize-y`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={base} />
      )}
    </label>
  );
}

// ─── Tags Editor ──────────────────────────────────────────────────────────────
function TagsEditor({ tags, allTags, onChange }: { tags: string[]; allTags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = (t: string) => { const v = t.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(""); };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));
  const suggestions = input ? allTags.filter((t) => t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t)).slice(0, 6) : [];

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((t) => (
          <span key={t} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tagColor(t)}`}>
            {t}
            <button type="button" onClick={() => remove(t)} className="opacity-60 hover:opacity-100 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
          placeholder="輸入標籤後按 Enter"
          className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded border border-zinc-600 bg-zinc-800 shadow-lg">
            {suggestions.map((t) => (
              <button key={t} type="button" onClick={() => add(t)} className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-700">
                <TagChip tag={t} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliced = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, setPage, totalPages, sliced };
}

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS: { key: KBTabKey; label: string; badge: (n: number) => string }[] = [
  { key: "cards", label: "卡片庫", badge: (n) => `P${String(n).padStart(3, "0")}` },
  { key: "gameRules", label: "遊戲規則", badge: (n) => `T${String(n).padStart(3, "0")}` },
  { key: "strategyMatrix", label: "攻略矩陣", badge: (n) => `L${String(n).padStart(3, "0")}` },
  { key: "gameCases", label: "遊戲案例", badge: (n) => `C${String(n).padStart(3, "0")}` },
  { key: "faqItems", label: "QA 問答", badge: (n) => `Q${String(n).padStart(3, "0")}` },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KnowledgeBasePage() {
  const { store, loading, saving, error, lastSaved, loadStore, saveStore, updateStore } = useKnowledgeBaseStore();
  const [activeTab, setActiveTab] = useState<KBTabKey>("cards");
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => { loadStore(); }, []);
  useEffect(() => { setExpandedId(null); setEditingItem(null); setEditingId(null); setSearchQuery(""); }, [activeTab]);

  const allTags = useMemo(() => getAllTags(store), [store]);

  const currentItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (activeTab === "cards") return store.cards.filter((i) => !q || i.nameZh.toLowerCase().includes(q) || i.element.toLowerCase().includes(q) || i.rarity.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)));
    if (activeTab === "gameRules") return store.gameRules.filter((i) => !q || i.scenarioCondition.toLowerCase().includes(q) || i.ruleDescription.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)));
    if (activeTab === "strategyMatrix") return store.strategyMatrix.filter((i) => !q || i.scenarioKeywords.toLowerCase().includes(q) || i.primaryCards.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)));
    if (activeTab === "gameCases") return store.gameCases.filter((i) => !q || i.mainChallenge.toLowerCase().includes(q) || i.playerProfile.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)));
    return store.faqItems.filter((i) => !q || i.question.toLowerCase().includes(q) || i.keywords.some((k) => k.toLowerCase().includes(q)));
  }, [activeTab, store, searchQuery]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { page, setPage, totalPages, sliced } = usePagination(currentItems as any[], pageSize);

  const handleSave = async () => {
    await saveStore(store);
    setSaveMsg("✅ 已儲存");
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const startEdit = (item: Record<string, unknown>) => {
    setEditingItem({ ...item });
    setEditingId(item.id as string);
    setExpandedId(item.id as string);
  };

  const cancelEdit = () => { setEditingItem(null); setEditingId(null); };

  const commitEdit = () => {
    if (!editingItem || !editingId) return;
    const updated = { ...store };
    if (activeTab === "cards") updated.cards = store.cards.map((i) => (i.id === editingId ? editingItem as unknown as KBCard : i));
    else if (activeTab === "gameRules") updated.gameRules = store.gameRules.map((i) => (i.id === editingId ? editingItem as unknown as KBGameRule : i));
    else if (activeTab === "strategyMatrix") updated.strategyMatrix = store.strategyMatrix.map((i) => (i.id === editingId ? editingItem as unknown as KBStrategyMatrix : i));
    else if (activeTab === "gameCases") updated.gameCases = store.gameCases.map((i) => (i.id === editingId ? editingItem as unknown as KBGameCase : i));
    else updated.faqItems = store.faqItems.map((i) => (i.id === editingId ? editingItem as unknown as KBFAQItem : i));
    updateStore(updated);
    cancelEdit();
  };

  const addNew = () => {
    let newItem: Record<string, unknown>;
    if (activeTab === "cards") {
      newItem = { id: nextCardId(store.cards), nameZh: "", nameEn: "", element: "", rarity: "N", seriesId: "", skills: "", stats: "", lore: "", tags: [] };
      updateStore({ ...store, cards: [...store.cards, newItem as unknown as KBCard] });
    } else if (activeTab === "gameRules") {
      newItem = { id: nextGameRuleId(store.gameRules), scenarioCondition: "", ruleDescription: "", mechanicDetails: "", exceptions: "", difficulty: "", tags: [] };
      updateStore({ ...store, gameRules: [...store.gameRules, newItem as unknown as KBGameRule] });
    } else if (activeTab === "strategyMatrix") {
      newItem = { id: nextStrategyId(store.strategyMatrix), scenarioKeywords: "", primaryCards: "", secondaryCards: "", counters: "", notes: "", tags: [] };
      updateStore({ ...store, strategyMatrix: [...store.strategyMatrix, newItem as unknown as KBStrategyMatrix] });
    } else if (activeTab === "gameCases") {
      newItem = { id: nextGameCaseId(store.gameCases), playerProfile: "", mainChallenge: "", recommendedCards: "", strategyNotes: "", followUpTips: "", tags: [] };
      updateStore({ ...store, gameCases: [...store.gameCases, newItem as unknown as KBGameCase] });
    } else {
      newItem = { id: nextFAQId(store.faqItems), question: "", keywords: [], adminThinking: "", recommendedAnswer: "", notes: "", tags: [] };
      updateStore({ ...store, faqItems: [...store.faqItems, newItem as unknown as KBFAQItem] });
    }
    startEdit(newItem);
    setPage(Math.ceil((currentItems.length + 1) / pageSize));
  };

  const deleteItem = (id: string) => {
    if (!confirm("確定要刪除這筆資料？")) return;
    const updated = { ...store };
    if (activeTab === "cards") updated.cards = store.cards.filter((i) => i.id !== id);
    else if (activeTab === "gameRules") updated.gameRules = store.gameRules.filter((i) => i.id !== id);
    else if (activeTab === "strategyMatrix") updated.strategyMatrix = store.strategyMatrix.filter((i) => i.id !== id);
    else if (activeTab === "gameCases") updated.gameCases = store.gameCases.filter((i) => i.id !== id);
    else updated.faqItems = store.faqItems.filter((i) => i.id !== id);
    updateStore(updated);
    if (editingId === id) cancelEdit();
  };

  const patchEdit = (patch: Record<string, unknown>) => setEditingItem((prev) => prev ? { ...prev, ...patch } : prev);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">遊戲知識庫維護</h1>
            <p className="text-sm text-zinc-500 mt-1">管理卡片、規則、攻略、案例與 QA 知識庫</p>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-sm text-emerald-400">{saveMsg}</span>}
            {lastSaved && !saveMsg && <span className="text-xs text-zinc-600">上次儲存：{lastSaved}</span>}
            <button type="button" onClick={handleSave} disabled={saving || loading}
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
              {saving ? "儲存中..." : "儲存知識庫"}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-sm text-red-300">{error}</div>}

        {/* Tabs */}
        <div className="flex border-b border-zinc-700 mb-6 overflow-x-auto">
          {TABS.map(({ key, label }) => {
            const count = store[key].length;
            return (
              <button key={key} type="button" onClick={() => setActiveTab(key)}
                className={`flex-shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? "border-amber-400 text-amber-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
                {label}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === key ? "bg-amber-900 text-amber-300" : "bg-zinc-800 text-zinc-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜尋..."
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 w-48" />
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-300 focus:outline-none">
              {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s} 筆</option>)}
            </select>
          </div>
          <button type="button" onClick={addNew}
            className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            + 新增
          </button>
        </div>

        {loading ? (
          <div className="text-center text-zinc-500 py-12">載入中...</div>
        ) : (
          <>
            {/* Item List */}
            <div className="space-y-2">
              {sliced.map((item) => {
                const id = (item as { id: string }).id;
                const isEditing = editingId === id;
                const isExpanded = expandedId === id;
                const editData = isEditing ? editingItem! : null;

                return (
                  <div key={id} className="rounded-xl border border-zinc-700 bg-zinc-800 overflow-hidden">
                    {/* Row header */}
                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-750" onClick={() => !isEditing && toggleExpand(id)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-zinc-500 flex-shrink-0">{id}</span>
                        <span className="text-sm text-white truncate">
                          {activeTab === "cards" && (item as KBCard).nameZh}
                          {activeTab === "gameRules" && (item as KBGameRule).scenarioCondition}
                          {activeTab === "strategyMatrix" && (item as KBStrategyMatrix).scenarioKeywords}
                          {activeTab === "gameCases" && (item as KBGameCase).mainChallenge}
                          {activeTab === "faqItems" && (item as KBFAQItem).question}
                        </span>
                        <div className="flex gap-1 flex-wrap hidden sm:flex">
                          {(item as { tags: string[] }).tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} />)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {!isEditing && (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(item as Record<string, unknown>); }}
                              className="text-xs px-3 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-700">
                              編輯
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); deleteItem(id); }}
                              className="text-xs px-3 py-1 rounded border border-red-900 text-red-400 hover:bg-red-950">
                              刪除
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); commitEdit(); }}
                              className="text-xs px-3 py-1 rounded bg-amber-500 text-black font-medium hover:bg-amber-400">
                              確認
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                              className="text-xs px-3 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-700">
                              取消
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded / Edit form */}
                    {(isExpanded || isEditing) && (
                      <div className="border-t border-zinc-700 px-4 py-4 space-y-3">
                        {activeTab === "cards" && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="中文名稱" value={(editData ?? item as KBCard).nameZh as string} onChange={(v) => patchEdit({ nameZh: v })} placeholder="卡片中文名稱" />
                              <Field label="英文名稱" value={(editData ?? item as KBCard).nameEn as string} onChange={(v) => patchEdit({ nameEn: v })} placeholder="Card English Name" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <Field label="元素" value={(editData ?? item as KBCard).element as string} onChange={(v) => patchEdit({ element: v })} placeholder="fire/water/earth/light/dark" />
                              <Field label="稀有度" value={(editData ?? item as KBCard).rarity as string} onChange={(v) => patchEdit({ rarity: v })} placeholder="N/R/SR/SSR/UR" />
                              <Field label="系列 ID" value={(editData ?? item as KBCard).seriesId as string} onChange={(v) => patchEdit({ seriesId: v })} placeholder="series-1" />
                            </div>
                            <Field label="能力數值" value={(editData ?? item as KBCard).stats as string} onChange={(v) => patchEdit({ stats: v })} placeholder="ATK:1200 / DEF:800 / HP:3000" />
                            <Field label="技能說明" value={(editData ?? item as KBCard).skills as string} onChange={(v) => patchEdit({ skills: v })} textarea placeholder="技能名稱與效果說明" />
                            <Field label="背景故事" value={(editData ?? item as KBCard).lore as string} onChange={(v) => patchEdit({ lore: v })} textarea placeholder="卡片背景故事" />
                          </>
                        )}

                        {activeTab === "gameRules" && (
                          <>
                            <Field label="適用場景條件" value={(editData ?? item as KBGameRule).scenarioCondition as string} onChange={(v) => patchEdit({ scenarioCondition: v })} placeholder="例如：玩家攻擊屬性相剋目標時" />
                            <Field label="規則說明" value={(editData ?? item as KBGameRule).ruleDescription as string} onChange={(v) => patchEdit({ ruleDescription: v })} textarea placeholder="詳細規則說明" />
                            <Field label="機制細節" value={(editData ?? item as KBGameRule).mechanicDetails as string} onChange={(v) => patchEdit({ mechanicDetails: v })} textarea placeholder="傷害計算、觸發條件等" />
                            <Field label="例外情況" value={(editData ?? item as KBGameRule).exceptions as string} onChange={(v) => patchEdit({ exceptions: v })} placeholder="此規則不適用的情況" />
                            <div>
                              <label className="block text-xs font-medium text-zinc-400">難度等級</label>
                              <select value={(editData ?? item as KBGameRule).difficulty as string} onChange={(e) => patchEdit({ difficulty: e.target.value })} disabled={!isEditing}
                                className="mt-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:outline-none">
                                <option value="">未分類</option>
                                <option value="EASY">EASY 簡單</option>
                                <option value="NORMAL">NORMAL 普通</option>
                                <option value="HARD">HARD 困難</option>
                                <option value="EXPERT">EXPERT 專家</option>
                              </select>
                            </div>
                          </>
                        )}

                        {activeTab === "strategyMatrix" && (
                          <>
                            <Field label="場景關鍵字" value={(editData ?? item as KBStrategyMatrix).scenarioKeywords as string} onChange={(v) => patchEdit({ scenarioKeywords: v })} placeholder="例如：BOSS戰、多敵人、回復不足" />
                            <Field label="首選推薦卡片" value={(editData ?? item as KBStrategyMatrix).primaryCards as string} onChange={(v) => patchEdit({ primaryCards: v })} textarea placeholder="P001 炎龍騎士、P003 水精靈…" />
                            <Field label="次選推薦卡片" value={(editData ?? item as KBStrategyMatrix).secondaryCards as string} onChange={(v) => patchEdit({ secondaryCards: v })} textarea placeholder="備用選擇" />
                            <Field label="剋制/應對方式" value={(editData ?? item as KBStrategyMatrix).counters as string} onChange={(v) => patchEdit({ counters: v })} textarea placeholder="如何反制或規避" />
                            <Field label="備註" value={(editData ?? item as KBStrategyMatrix).notes as string} onChange={(v) => patchEdit({ notes: v })} textarea placeholder="其他注意事項" />
                          </>
                        )}

                        {activeTab === "gameCases" && (
                          <>
                            <Field label="玩家概況" value={(editData ?? item as KBGameCase).playerProfile as string} onChange={(v) => patchEdit({ playerProfile: v })} placeholder="例如：休閒玩家、偏好收集、中等等級" />
                            <Field label="主要挑戰" value={(editData ?? item as KBGameCase).mainChallenge as string} onChange={(v) => patchEdit({ mainChallenge: v })} textarea placeholder="遇到的困難或目標" />
                            <Field label="推薦卡牌組合" value={(editData ?? item as KBGameCase).recommendedCards as string} onChange={(v) => patchEdit({ recommendedCards: v })} textarea placeholder="建議的卡牌配置" />
                            <Field label="攻略要點" value={(editData ?? item as KBGameCase).strategyNotes as string} onChange={(v) => patchEdit({ strategyNotes: v })} textarea placeholder="關鍵策略與技巧" />
                            <Field label="進階提示" value={(editData ?? item as KBGameCase).followUpTips as string} onChange={(v) => patchEdit({ followUpTips: v })} textarea placeholder="下一步可以挑戰的目標" />
                          </>
                        )}

                        {activeTab === "faqItems" && (
                          <>
                            <Field label="玩家問題" value={(editData ?? item as KBFAQItem).question as string} onChange={(v) => patchEdit({ question: v })} placeholder="例如：如何提升卡片等級？" />
                            <div>
                              <label className="block text-xs font-medium text-zinc-400 mb-1">關鍵字</label>
                              <input type="text"
                                value={Array.isArray((editData ?? item as KBFAQItem).keywords) ? ((editData ?? item as KBFAQItem).keywords as string[]).join("、") : ""}
                                onChange={(e) => patchEdit({ keywords: e.target.value.split(/[、,，\s]+/).filter(Boolean) })}
                                readOnly={!isEditing}
                                placeholder="以頓號或逗號分隔"
                                className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:outline-none" />
                            </div>
                            <Field label="管理員思考點" value={(editData ?? item as KBFAQItem).adminThinking as string} onChange={(v) => patchEdit({ adminThinking: v })} textarea placeholder="如何理解這個問題" />
                            <Field label="建議回答內容" value={(editData ?? item as KBFAQItem).recommendedAnswer as string} onChange={(v) => patchEdit({ recommendedAnswer: v })} textarea placeholder="建議的回答方式" />
                            <Field label="注意事項" value={(editData ?? item as KBFAQItem).notes as string} onChange={(v) => patchEdit({ notes: v })} placeholder="特殊情況說明" />
                          </>
                        )}

                        <div>
                          <p className="text-xs font-medium text-zinc-400 mb-1">標籤</p>
                          {isEditing ? (
                            <TagsEditor
                              tags={((editData as Record<string, unknown>).tags as string[]) || []}
                              allTags={allTags}
                              onChange={(t) => patchEdit({ tags: t })}
                            />
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(item as { tags: string[] }).tags.map((t) => <TagChip key={t} tag={t} />)}
                              {(item as { tags: string[] }).tags.length === 0 && <span className="text-xs text-zinc-600">無標籤</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {currentItems.length === 0 && (
              <div className="py-12 text-center text-zinc-500">
                {searchQuery ? "找不到符合條件的資料" : "尚無資料，點擊「+ 新增」開始建立"}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button type="button" onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30">«</button>
                <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} className="px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30">‹</button>
                <span className="text-sm text-zinc-400">第 {page} / {totalPages} 頁 · 共 {currentItems.length} 筆</span>
                <button type="button" onClick={() => setPage(page + 1)} disabled={page === totalPages} className="px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30">›</button>
                <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30">»</button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
