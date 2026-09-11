import { create } from "zustand";
import { toast } from "sonner";

import { apiRequest } from "@/lib/control-center/apiClient";
import { MAX_LAYOUT_VERSIONS_PER_STORE } from "@/lib/control-center/constants";
import type { Widget } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";

export interface LayoutVersion {
  id: string;
  name: string;
  savedAt: number;
  widgets: Widget[];
}

interface ServerLayoutVersion {
  storeId: string;
  id: string;
  name: string;
  savedAt: number;
  widgets: Widget[];
}

function fromServer(v: ServerLayoutVersion): LayoutVersion {
  return { id: v.id, name: v.name, savedAt: v.savedAt, widgets: v.widgets };
}

interface LayoutVersionsState {
  versionsByStore: Record<string, LayoutVersion[]>;
  activeVersionIdByStore: Record<string, string>;
  loadedStores: Record<string, boolean>;

  getVersions: (storeId: string) => LayoutVersion[];
  getActiveVersion: (storeId: string) => LayoutVersion | null;
  /** Fetches this store's saved versions (once), creating a "Default Layout"
   *  from `fallbackWidgets` on the server if none exist yet. */
  ensureDefaultVersion: (storeId: string, fallbackWidgets: Widget[]) => Promise<LayoutVersion>;
  saveAsNewVersion: (storeId: string, name: string, widgets: Widget[]) => Promise<string | null>;
  /** Resolves true only once the server has the layout, so callers never mark
   *  the editor clean on a failed write. */
  updateActiveVersion: (storeId: string, widgets: Widget[]) => Promise<boolean>;
  renameVersion: (storeId: string, versionId: string, name: string) => Promise<void>;
  deleteVersion: (storeId: string, versionId: string) => Promise<boolean>;
  setActiveVersion: (storeId: string, versionId: string) => Promise<void>;
}

/** Returns null when the request itself failed, which must stay distinct from
 *  "this store genuinely has no versions" — treating a transient failure as
 *  "none" made ensureDefaultVersion POST a fresh "Default Layout" every time,
 *  silently filling the per-store version quota. */
async function fetchVersions(storeId: string): Promise<ServerLayoutVersion[] | null> {
  const data = await apiRequest<{ versions: ServerLayoutVersion[] }>(
    `/api/control-center/layout-versions/${storeId}`,
    undefined,
    { silent: true }
  );
  return data ? data.versions : null;
}

export const useLayoutVersionsStore = create<LayoutVersionsState>()((set, get) => ({
  versionsByStore: {},
  activeVersionIdByStore: {},
  loadedStores: {},

  getVersions: (storeId) => get().versionsByStore[storeId] ?? [],

  getActiveVersion: (storeId) => {
    const versions = get().versionsByStore[storeId];
    if (!versions || versions.length === 0) return null;
    const activeId = get().activeVersionIdByStore[storeId];
    return versions.find((v) => v.id === activeId) ?? versions[0];
  },

  ensureDefaultVersion: async (storeId, fallbackWidgets) => {
    if (!get().loadedStores[storeId]) {
      const serverVersions = await fetchVersions(storeId);
      if (!serverVersions) throw new Error(`Failed to load layout versions for store ${storeId}`);
      const versions = serverVersions.map(fromServer);
      const activeFromStore = useMachinesStore.getState().stores.find((s) => s.id === storeId)?.activeLayoutVersionId;
      const activeId =
        activeFromStore && versions.some((v) => v.id === activeFromStore) ? activeFromStore : versions[0]?.id;
      set((s) => ({
        versionsByStore: { ...s.versionsByStore, [storeId]: versions },
        activeVersionIdByStore: activeId
          ? { ...s.activeVersionIdByStore, [storeId]: activeId }
          : s.activeVersionIdByStore,
        loadedStores: { ...s.loadedStores, [storeId]: true },
      }));
    }

    const existing = get().getActiveVersion(storeId);
    if (existing) return existing;

    const data = await apiRequest<{ version: ServerLayoutVersion }>(`/api/control-center/layout-versions/${storeId}`, {
      method: "POST",
      body: JSON.stringify({ name: "Default Layout", widgets: fallbackWidgets }),
    });
    if (!data) throw new Error(`Failed to create the default layout version for store ${storeId}`);

    const version = fromServer(data.version);
    set((s) => ({
      versionsByStore: { ...s.versionsByStore, [storeId]: [version] },
      activeVersionIdByStore: { ...s.activeVersionIdByStore, [storeId]: version.id },
    }));
    return version;
  },

  saveAsNewVersion: async (storeId, name, widgets) => {
    const versions = get().versionsByStore[storeId] ?? [];
    if (versions.length >= MAX_LAYOUT_VERSIONS_PER_STORE) {
      toast.error(`Cannot save: this store already has ${MAX_LAYOUT_VERSIONS_PER_STORE} saved versions. Delete one first.`);
      return null;
    }
    const data = await apiRequest<{ version: ServerLayoutVersion }>(
      `/api/control-center/layout-versions/${storeId}`,
      { method: "POST", body: JSON.stringify({ name, widgets }) },
      { silent: true }
    );
    if (!data) {
      toast.error("Failed to save layout version");
      return null;
    }
    const version = fromServer(data.version);
    set((s) => ({
      versionsByStore: { ...s.versionsByStore, [storeId]: [...(s.versionsByStore[storeId] ?? []), version] },
    }));
    await get().setActiveVersion(storeId, version.id);
    return version.id;
  },

  updateActiveVersion: async (storeId, widgets) => {
    const active = get().getActiveVersion(storeId);
    if (!active) {
      try {
        await get().ensureDefaultVersion(storeId, widgets);
        return true;
      } catch {
        return false;
      }
    }
    const data = await apiRequest<{ ok: true }>(
      `/api/control-center/layout-versions/${storeId}/${active.id}`,
      { method: "PATCH", body: JSON.stringify({ widgets }) },
      { silent: true }
    );
    if (!data) {
      toast.error("Failed to save layout");
      return false;
    }
    set((s) => ({
      versionsByStore: {
        ...s.versionsByStore,
        [storeId]: (s.versionsByStore[storeId] ?? []).map((v) =>
          v.id === active.id ? { ...v, widgets, savedAt: Date.now() } : v
        ),
      },
    }));
    return true;
  },

  renameVersion: async (storeId, versionId, name) => {
    const data = await apiRequest<{ ok: true }>(
      `/api/control-center/layout-versions/${storeId}/${versionId}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
      { silent: true }
    );
    if (!data) {
      toast.error("Failed to rename version");
      return;
    }
    set((s) => ({
      versionsByStore: {
        ...s.versionsByStore,
        [storeId]: (s.versionsByStore[storeId] ?? []).map((v) => (v.id === versionId ? { ...v, name } : v)),
      },
    }));
  },

  deleteVersion: async (storeId, versionId) => {
    const versions = get().versionsByStore[storeId] ?? [];
    if (versions.length <= 1) {
      toast.error("Cannot delete the only saved layout version for this store.");
      return false;
    }
    // Not silenced — apiRequest surfaces the server's specific error message
    // (e.g. a race where another client already deleted the last version).
    const data = await apiRequest<{ ok: true }>(`/api/control-center/layout-versions/${storeId}/${versionId}`, {
      method: "DELETE",
    });
    if (!data) return false;
    const remaining = versions.filter((v) => v.id !== versionId);
    const wasActive = get().activeVersionIdByStore[storeId] === versionId;
    set((s) => ({ versionsByStore: { ...s.versionsByStore, [storeId]: remaining } }));
    if (wasActive) await get().setActiveVersion(storeId, remaining[0].id);
    return true;
  },

  setActiveVersion: async (storeId, versionId) => {
    set((s) => ({ activeVersionIdByStore: { ...s.activeVersionIdByStore, [storeId]: versionId } }));
    await useMachinesStore.getState().updateStore(storeId, { activeLayoutVersionId: versionId });
  },
}));
