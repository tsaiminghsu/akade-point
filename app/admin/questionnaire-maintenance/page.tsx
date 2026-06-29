"use client";

import { useEffect, useState } from "react";
import { S1_GENRES, S5_INTEREST_OPTIONS } from "@/types/questionnaire";

interface CatalogItem {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
}

interface QuestionnaireCatalog {
  genres: CatalogItem[];
  interests: CatalogItem[];
}

const DEFAULT_CATALOG: QuestionnaireCatalog = {
  genres: S1_GENRES.map((g) => ({ id: g.id, label: g.label, enabled: true })),
  interests: S5_INTEREST_OPTIONS.map((o) => ({ id: o.id, label: o.label, enabled: true })),
};

function ItemRow({
  item,
  onChange,
  onDelete,
}: {
  item: CatalogItem;
  onChange: (patch: Partial<CatalogItem>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
      <button
        type="button"
        onClick={() => onChange({ enabled: !item.enabled })}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${item.enabled ? "bg-amber-500" : "bg-zinc-600"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.enabled ? "translate-x-4" : "translate-x-1"}`} />
      </button>
      <input
        type="text"
        value={item.label}
        onChange={(e) => onChange({ label: e.target.value })}
        className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
        placeholder="顯示標籤"
      />
      <input
        type="text"
        value={item.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
        className="w-40 bg-transparent text-xs text-zinc-400 placeholder:text-zinc-600 focus:outline-none"
        placeholder="說明（選填）"
      />
      <span className="text-xs text-zinc-600 font-mono">{item.id}</span>
      <button
        type="button"
        onClick={onDelete}
        className="text-red-500 hover:text-red-300 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

export default function QuestionnaireMaintenance() {
  const [catalog, setCatalog] = useState<QuestionnaireCatalog>(DEFAULT_CATALOG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/questionnaire/catalog")
      .then((r) => r.json())
      .then((data: { catalog?: QuestionnaireCatalog | null }) => {
        if (data.catalog) setCatalog(data.catalog);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/questionnaire/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog }),
      });
      if (!res.ok) throw new Error("儲存失敗");
      setMessage("✅ 已儲存");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const updateGenre = (id: string, patch: Partial<CatalogItem>) =>
    setCatalog((prev) => ({ ...prev, genres: prev.genres.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));

  const deleteGenre = (id: string) =>
    setCatalog((prev) => ({ ...prev, genres: prev.genres.filter((g) => g.id !== id) }));

  const addGenre = () =>
    setCatalog((prev) => ({
      ...prev,
      genres: [...prev.genres, { id: `genre_${Date.now()}`, label: "新類型", enabled: true }],
    }));

  const updateInterest = (id: string, patch: Partial<CatalogItem>) =>
    setCatalog((prev) => ({ ...prev, interests: prev.interests.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const deleteInterest = (id: string) =>
    setCatalog((prev) => ({ ...prev, interests: prev.interests.filter((i) => i.id !== id) }));

  const addInterest = () =>
    setCatalog((prev) => ({
      ...prev,
      interests: [...prev.interests, { id: `interest_${Date.now()}`, label: "新興趣", enabled: true }],
    }));

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 p-8 text-zinc-400">載入中...</div>;
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">問卷維護</h1>
            <p className="text-sm text-zinc-500 mt-1">管理遊戲類型與興趣領域選項</p>
          </div>
          <div className="flex items-center gap-3">
            {message && <span className={`text-sm ${message.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>{message}</span>}
            <button type="button" onClick={save} disabled={saving}
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500">
              {saving ? "儲存中..." : "儲存設定"}
            </button>
          </div>
        </div>

        {/* Genres section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="bg-indigo-900 text-indigo-300 text-xs px-2 py-0.5 rounded">S1</span>
              遊戲類型選項
            </h2>
            <button type="button" onClick={addGenre}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700">
              + 新增
            </button>
          </div>
          <div className="space-y-2">
            {catalog.genres.map((g) => (
              <ItemRow key={g.id} item={g} onChange={(p) => updateGenre(g.id, p)} onDelete={() => deleteGenre(g.id)} />
            ))}
          </div>
        </section>

        {/* Interests section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="bg-emerald-900 text-emerald-300 text-xs px-2 py-0.5 rounded">S5</span>
              遊戲興趣領域選項
            </h2>
            <button type="button" onClick={addInterest}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700">
              + 新增
            </button>
          </div>
          <div className="space-y-2">
            {catalog.interests.map((i) => (
              <ItemRow key={i.id} item={i} onChange={(p) => updateInterest(i.id, p)} onDelete={() => deleteInterest(i.id)} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
