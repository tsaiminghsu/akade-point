"use client";

import { create } from "zustand";
import { DEFAULT_KB_STORE, normalizeKBStore } from "@/lib/maintenance/knowledgeBaseDefaults";
import type { KnowledgeBaseStore } from "@/lib/maintenance/knowledgeBaseTypes";

interface KBStoreState {
  store: KnowledgeBaseStore;
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastSaved: string | null;

  loadStore: () => Promise<void>;
  saveStore: (next: KnowledgeBaseStore) => Promise<void>;
  updateStore: (next: KnowledgeBaseStore) => void;
}

export const useKnowledgeBaseStore = create<KBStoreState>((set, get) => ({
  store: DEFAULT_KB_STORE,
  loading: false,
  saving: false,
  error: null,
  lastSaved: null,

  loadStore: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/knowledge-base", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { store?: Partial<KnowledgeBaseStore> };
      set({ store: normalizeKBStore(data.store ?? {}), loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "載入失敗", loading: false });
    }
  },

  saveStore: async (next: KnowledgeBaseStore) => {
    set({ saving: true, error: null });
    try {
      const res = await fetch("/api/knowledge-base", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store: next }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      set({ store: next, saving: false, lastSaved: new Date().toLocaleTimeString("zh-TW") });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "儲存失敗", saving: false });
    }
  },

  updateStore: (next: KnowledgeBaseStore) => set({ store: next }),
}));
