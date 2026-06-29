"use client";

import { useEffect, useMemo, useState } from "react";

interface LineAuthConfigItem {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  isActive: boolean;
  updatedAt: string;
}

interface MessagingApiConfigItem {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  isEnabled: boolean;
  updatedAt: string;
}

interface LineAuthConfigResponse {
  configured: boolean;
  source: "ui" | "env" | "unset";
  activeConfigId: string | null;
  redirectUri: string;
  configs: LineAuthConfigItem[];
  messagingApiConfigs?: MessagingApiConfigItem[];
  updatedAt: string | null;
}

type EditableCard = {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  isEnabled: boolean;
};

type MessagingEditableCard = {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  isEnabled: boolean;
};

function createDraftCard(): EditableCard {
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    channelId: "",
    channelSecret: "",
    isEnabled: true,
  };
}

export default function LineAuthSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [testingCardId, setTestingCardId] = useState<string | null>(null);
  const [loginTestingCardId, setLoginTestingCardId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [cardMessages, setCardMessages] = useState<Record<string, string>>({});

  const [source, setSource] = useState<"ui" | "env" | "unset">("unset");
  const [redirectUri, setRedirectUri] = useState("");
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);

  const [cards, setCards] = useState<EditableCard[]>([]);
  const [savedCards, setSavedCards] = useState<EditableCard[]>([]);
  const [editingCardIds, setEditingCardIds] = useState<string[]>([]);

  const [messagingCards, setMessagingCards] = useState<MessagingEditableCard[]>([]);
  const [savedMessagingCards, setSavedMessagingCards] = useState<MessagingEditableCard[]>([]);
  const [messagingEditingCardIds, setMessagingEditingCardIds] = useState<string[]>([]);

  const hasUnsavedChanges = useMemo(() => {
    const toSave = (c: EditableCard) => ({ id: c.id, name: c.name, channelId: c.channelId, channelSecret: c.channelSecret, isEnabled: c.isEnabled });
    const toSaveM = (c: MessagingEditableCard) => ({ id: c.id, name: c.name, channelId: c.channelId, channelSecret: c.channelSecret, isEnabled: c.isEnabled });
    return (
      JSON.stringify(cards.map(toSave)) !== JSON.stringify(savedCards.map(toSave)) ||
      JSON.stringify(messagingCards.map(toSaveM)) !== JSON.stringify(savedMessagingCards.map(toSaveM))
    );
  }, [cards, savedCards, messagingCards, savedMessagingCards]);

  const loadConfig = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/line/config", { method: "GET", cache: "no-store" });
      const data = (await res.json()) as LineAuthConfigResponse;
      setSource(data.source);
      setRedirectUri(data.redirectUri || "");
      setActiveConfigId(data.activeConfigId);

      const mapped = (data.configs || []).map((item) => ({
        id: item.id,
        name: item.name,
        channelId: item.channelId,
        channelSecret: item.channelSecret,
        isEnabled: item.id === data.activeConfigId,
      }));
      setCards(mapped);
      setSavedCards(mapped);
      setEditingCardIds([]);

      const mappedM = (data.messagingApiConfigs || []).map((item) => ({
        id: item.id,
        name: item.name,
        channelId: item.channelId,
        channelSecret: item.channelSecret,
        isEnabled: item.isEnabled !== false,
      }));
      setMessagingCards(mappedM);
      setSavedMessagingCards(mappedM);
      setMessagingEditingCardIds([]);
      setCardMessages({});
    } catch {
      setMessage("讀取 LINE 設定失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig().catch(console.error); }, []);

  const updateCard = (id: string, patch: Partial<EditableCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    clearCardMessage(id);
  };

  const setCardEditing = (id: string, editing: boolean) =>
    setEditingCardIds((prev) => editing ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id));

  const isCardEditing = (id: string) => editingCardIds.includes(id);

  const addCard = () => {
    if (cards.length >= 1) return;
    const next = createDraftCard();
    setCards((prev) => [...prev, next]);
    setCardEditing(next.id, true);
    if (!activeConfigId) setActiveConfigId(next.id);
  };

  const removeCard = (id: string) => {
    setCards((prev) => { const next = prev.filter((c) => c.id !== id); if (activeConfigId === id) setActiveConfigId(next[0]?.id || null); return next; });
    setSavedCards((prev) => prev.filter((c) => c.id !== id));
    setEditingCardIds((prev) => prev.filter((x) => x !== id));
  };

  const cancelEdit = (id: string) => {
    const saved = savedCards.find((c) => c.id === id);
    if (saved) setCards((prev) => prev.map((c) => (c.id === id ? saved : c)));
    else { setCards((prev) => prev.filter((c) => c.id !== id)); if (activeConfigId === id) setActiveConfigId(savedCards[0]?.id || null); }
    setCardEditing(id, false);
  };

  const updateMessagingCard = (id: string, patch: Partial<MessagingEditableCard>) => {
    setMessagingCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    clearCardMessage(id);
  };

  const setMessagingCardEditing = (id: string, editing: boolean) =>
    setMessagingEditingCardIds((prev) => editing ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id));

  const isMessagingCardEditing = (id: string) => messagingEditingCardIds.includes(id);

  const addMessagingCard = () => {
    const next = createDraftCard();
    setMessagingCards((prev) => [...prev, next]);
    setMessagingCardEditing(next.id, true);
  };

  const removeMessagingCard = (id: string) => {
    setMessagingCards((prev) => prev.filter((c) => c.id !== id));
    setSavedMessagingCards((prev) => prev.filter((c) => c.id !== id));
    setMessagingEditingCardIds((prev) => prev.filter((x) => x !== id));
  };

  const cancelMessagingEdit = (id: string) => {
    const saved = savedMessagingCards.find((c) => c.id === id);
    if (saved) setMessagingCards((prev) => prev.map((c) => (c.id === id ? saved : c)));
    else setMessagingCards((prev) => prev.filter((c) => c.id !== id));
    setMessagingCardEditing(id, false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const enabledLoginCard = cards.find((c) => c.isEnabled);
      const payload = {
        activeConfigId: enabledLoginCard?.id ?? null,
        configs: cards.map((c) => ({ id: c.id, name: c.name, channelId: c.channelId, channelSecret: c.channelSecret })),
        messagingApiConfigs: messagingCards.map((c) => ({ id: c.id, name: c.name, channelId: c.channelId, channelSecret: c.channelSecret, isEnabled: c.isEnabled })),
      };
      const res = await fetch("/api/auth/line/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setMessage("✅ LINE 驗證設定已儲存");
      await loadConfig();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const clearCardMessage = (cardId: string) =>
    setCardMessages((prev) => { if (!prev[cardId]) return prev; const next = { ...prev }; delete next[cardId]; return next; });

  const setCardMessage = (cardId: string, text: string) =>
    setCardMessages((prev) => ({ ...prev, [cardId]: text }));

  const handleTestConnection = async (card: MessagingEditableCard) => {
    if (!card.channelId.trim() || !card.channelSecret.trim()) {
      setCardMessage(card.id, "請先填入 Channel ID 與 Channel Secret 再測試。");
      return;
    }
    setTestingCardId(card.id);
    setCardMessage(card.id, "");
    try {
      const res = await fetch("/api/auth/line/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: card.id, configName: card.name, channelId: card.channelId.trim(), channelSecret: card.channelSecret.trim() }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; botInfo?: { displayName?: string; basicId?: string }; error?: string; hint?: string };
      if (!res.ok || !data.success) throw new Error(data.hint ? `${data.error || "測試失敗"}（建議：${data.hint}）` : data.error || "測試失敗");
      const oaName = data.botInfo?.displayName || "未知帳號";
      const oaBasicId = data.botInfo?.basicId ? `（${data.botInfo.basicId}）` : "";
      setCardMessage(card.id, `✅ LINE OA 串接測試成功：${oaName}${oaBasicId}`);
    } catch (error) {
      setCardMessage(card.id, error instanceof Error ? error.message : "LINE OA 串接測試失敗");
    } finally {
      setTestingCardId(null);
    }
  };

  const handleTestLoginFormat = async (card: EditableCard) => {
    if (!card.channelId.trim() && !card.channelSecret.trim()) {
      setCardMessage(card.id, "請先填入 Channel ID 與 Channel Secret 再測試。");
      return;
    }
    setLoginTestingCardId(card.id);
    setCardMessage(card.id, "");
    try {
      const res = await fetch("/api/auth/line/config/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: card.channelId.trim(), channelSecret: card.channelSecret.trim(), redirectUri }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string; errors?: string[] };
      if (!res.ok || !data.success) throw new Error(data.error || data.message || "格式驗證失敗");
      setCardMessage(card.id, `✅ ${data.message || "LINE Login 格式驗證通過"}`);
    } catch (error) {
      setCardMessage(card.id, error instanceof Error ? error.message : "格式驗證失敗");
    } finally {
      setLoginTestingCardId(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8">
        <div className="mx-auto max-w-4xl text-zinc-400 text-sm">載入中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg sm:p-8">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">LINE 驗證與串接設定</h1>
              <p className="mt-2 text-sm text-zinc-400">
                管理 LINE Login（使用者登入）與 LINE Messaging API（OA 推播）憑證。
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
            >
              {saving ? "儲存中..." : "儲存所有設定"}
            </button>
          </div>

          {source === "env" && (
            <p className="mt-4 text-xs text-amber-300 bg-amber-950 border border-amber-800 rounded-lg px-3 py-2">
              目前 LINE 設定來源為環境變數（env），儲存後即改由 DynamoDB 管理。
            </p>
          )}

          {message && (
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm border ${message.startsWith("✅") ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
              {message}
            </p>
          )}

          {/* ─── LINE Login Section ─────────────────────────────── */}
          <div className="mt-8 border-t border-zinc-700 pt-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-indigo-300 flex items-center gap-2">
                  <span className="bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded text-xs">①</span>
                  LINE Login Channel
                </h2>
                <p className="text-sm text-zinc-500 mt-1">用於讓使用者透過 LINE 帳號登入，僅限設定一組。</p>
              </div>
              {cards.length === 0 && (
                <button type="button" onClick={addCard} disabled={saving}
                  className="rounded-lg border border-indigo-700 bg-indigo-950 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900 disabled:opacity-60">
                  + 新增 Login 設定
                </button>
              )}
            </div>

            {redirectUri && (
              <div className="mt-3 rounded-lg bg-zinc-800 px-4 py-2.5 text-xs flex items-center gap-2 flex-wrap">
                <span className="font-medium text-zinc-400 whitespace-nowrap">Callback URL：</span>
                <code className="select-all text-zinc-200 bg-zinc-900 px-2 py-1 rounded border border-zinc-700 text-xs break-all">{redirectUri}</code>
              </div>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {cards.map((card) => (
                <section key={card.id} className="rounded-xl border border-indigo-800 bg-zinc-800 overflow-hidden">
                  <div className="flex items-center justify-between bg-indigo-950 border-b border-indigo-800 px-4 py-3">
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
                      <button type="button" role="switch" aria-checked={card.isEnabled}
                        onClick={() => setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, isEnabled: !c.isEnabled } : c))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${card.isEnabled ? "bg-emerald-500" : "bg-zinc-600"}`}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${card.isEnabled ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                      <span className={card.isEnabled ? "text-emerald-400" : "text-zinc-500"}>{card.isEnabled ? "啟用中" : "已停用"}</span>
                    </label>
                    {!isCardEditing(card.id) ? (
                      <button type="button" onClick={() => setCardEditing(card.id, true)}
                        className="rounded border border-indigo-700 bg-zinc-900 px-3 py-1 text-xs text-indigo-300 hover:bg-indigo-950">
                        編輯
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => cancelEdit(card.id)} className="rounded border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">取消</button>
                        <button type="button" onClick={() => removeCard(card.id)} className="rounded border border-red-800 bg-zinc-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950">移除</button>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {(["name", "channelId", "channelSecret"] as const).map((field) => (
                      <label key={field} className="block text-xs font-medium text-zinc-400">
                        {field === "name" ? "設定名稱" : field === "channelId" ? "Channel ID" : "Channel Secret"}
                        <input
                          type={field === "channelSecret" ? "password" : "text"}
                          value={card[field]}
                          onChange={(e) => updateCard(card.id, { [field]: e.target.value })}
                          readOnly={!isCardEditing(card.id)}
                          placeholder={field === "name" ? "例如：正式站 Login" : field === "channelId" ? "數字 ID" : "32 字元英數字串"}
                          className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white read-only:opacity-60 read-only:cursor-default focus:outline-none focus:border-indigo-500"
                        />
                      </label>
                    ))}
                    <button type="button" onClick={() => handleTestLoginFormat(card)}
                      disabled={saving || loginTestingCardId === card.id}
                      className="mt-2 rounded-lg border border-indigo-700 bg-indigo-950 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900 disabled:opacity-60">
                      {loginTestingCardId === card.id ? "檢查中..." : "✓ 測試 Login 格式"}
                    </button>
                  </div>
                  {cardMessages[card.id] && (
                    <div className={`mx-4 mb-4 rounded-lg px-3 py-2 text-xs border ${cardMessages[card.id].startsWith("✅") ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
                      {cardMessages[card.id]}
                    </div>
                  )}
                </section>
              ))}
            </div>
            {cards.length === 0 && (
              <div className="mt-4 p-8 border-2 border-dashed border-zinc-700 rounded-xl text-center">
                <p className="text-sm text-zinc-500">尚未建立 LINE Login 設定</p>
              </div>
            )}
          </div>

          {/* ─── Messaging API Section ─────────────────────────── */}
          <div className="mt-10 border-t border-zinc-700 pt-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-emerald-300 flex items-center gap-2">
                  <span className="bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded text-xs">②</span>
                  Messaging API Channel (OA 串接)
                </h2>
                <p className="text-sm text-zinc-500 mt-1">讓系統能傳送訊息給 LINE 官方帳號的粉絲，可設定多組。</p>
              </div>
              <button type="button" onClick={addMessagingCard} disabled={saving}
                className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900 disabled:opacity-60">
                + 新增 Messaging API
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {messagingCards.map((card) => (
                <section key={card.id} className="rounded-xl border border-emerald-800 bg-zinc-800 overflow-hidden">
                  <div className="flex items-center justify-between bg-emerald-950 border-b border-emerald-800 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button type="button" role="switch" aria-checked={card.isEnabled}
                        onClick={() => updateMessagingCard(card.id, { isEnabled: !card.isEnabled })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${card.isEnabled ? "bg-emerald-500" : "bg-zinc-600"}`}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${card.isEnabled ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                      <span className={`text-sm font-semibold ${card.isEnabled ? "text-emerald-300" : "text-zinc-500"}`}>{card.name || "新 OA 設定"}</span>
                    </div>
                    {!isMessagingCardEditing(card.id) ? (
                      <button type="button" onClick={() => setMessagingCardEditing(card.id, true)}
                        className="rounded border border-emerald-700 bg-zinc-900 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-950">
                        編輯
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => cancelMessagingEdit(card.id)} className="rounded border border-zinc-600 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">取消</button>
                        <button type="button" onClick={() => removeMessagingCard(card.id)} className="rounded border border-red-800 bg-zinc-900 px-3 py-1 text-xs text-red-400 hover:bg-red-950">移除</button>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {(["name", "channelId", "channelSecret"] as const).map((field) => (
                      <label key={field} className="block text-xs font-medium text-zinc-400">
                        {field === "name" ? "設定名稱" : field === "channelId" ? "Channel ID" : "Channel Secret"}
                        <input
                          type={field === "channelSecret" ? "password" : "text"}
                          value={card[field]}
                          onChange={(e) => updateMessagingCard(card.id, { [field]: e.target.value })}
                          readOnly={!isMessagingCardEditing(card.id)}
                          placeholder={field === "name" ? "例如：客服機器人" : field === "channelId" ? "數字 ID" : "32 字元英數字串"}
                          className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white read-only:opacity-60 read-only:cursor-default focus:outline-none focus:border-emerald-500"
                        />
                      </label>
                    ))}
                    <button type="button" onClick={() => handleTestConnection(card)}
                      disabled={saving || testingCardId === card.id}
                      className="mt-2 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900 disabled:opacity-60">
                      {testingCardId === card.id ? "測試中..." : "✓ 測試 OA 串接"}
                    </button>
                  </div>
                  {cardMessages[card.id] && (
                    <div className={`mx-4 mb-4 rounded-lg px-3 py-2 text-xs border ${cardMessages[card.id].startsWith("✅") ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
                      {cardMessages[card.id]}
                    </div>
                  )}
                </section>
              ))}
            </div>
            {messagingCards.length === 0 && (
              <div className="mt-4 p-8 border-2 border-dashed border-zinc-700 rounded-xl text-center">
                <p className="text-sm text-zinc-500">尚未建立 Messaging API 設定</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
