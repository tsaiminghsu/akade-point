import { create } from "zustand";

import { apiRequest } from "@/lib/control-center/apiClient";
import { DEFAULT_GRID_SIZE } from "@/lib/control-center/constants";
import type { StoreSettings } from "@/lib/control-center/types";

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  gridSize: DEFAULT_GRID_SIZE,
  snapEnabled: true,
  gridVisible: true,
  animationEnabled: true,

  toastAlerts: true,
  emailDigest: true,
  criticalOnly: false,
  sound: false,

  mqttBroker: "mqtt://broker.iot.local:1883",
  mqttTopic: "iot/+/telemetry",
  mqttClientId: "control-center-01",

  apiEndpoint: "https://api.iot-control-center.local/v1",
  apiKey: "cc_live_••••••••••••4f2a",

  defaultWidgetSize: "medium",
  defaultMode: "edit",
};

const SAVE_DEBOUNCE_MS = 600;
// Per-storeId debounce timers for the network write side of updateSettings.
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();
// Per-storeId accumulated patch for the pending write. Only the fields the user
// actually touched are sent: writing the whole merged object would persist the
// DEFAULT_STORE_SETTINGS placeholders (including the masked apiKey) as if they
// were real configuration.
const pendingPatches = new Map<string, Partial<StoreSettings>>();

interface StoreSettingsState {
  settingsByStore: Record<string, StoreSettings>;
  loadedStores: Record<string, boolean>;

  getSettings: (storeId: string) => StoreSettings;
  hydrateStore: (storeId: string) => Promise<void>;
  /** Applies the patch to local state immediately; the network write is
   *  debounced per storeId so rapid input (typing, dragging a slider)
   *  collapses into a single request instead of one per keystroke. */
  updateSettings: (storeId: string, patch: Partial<StoreSettings>) => void;
}

export const useStoreSettingsStore = create<StoreSettingsState>()((set, get) => ({
  settingsByStore: {},
  loadedStores: {},

  getSettings: (storeId) => get().settingsByStore[storeId] ?? DEFAULT_STORE_SETTINGS,

  hydrateStore: async (storeId) => {
    if (!storeId || get().loadedStores[storeId]) return;
    const data = await apiRequest<{ settings: Partial<StoreSettings> | null }>(
      `/api/control-center/store-settings/${storeId}`,
      undefined,
      { silent: true }
    );
    if (!data) return;
    set((s) => ({
      settingsByStore: {
        ...s.settingsByStore,
        [storeId]: { ...DEFAULT_STORE_SETTINGS, ...(data.settings ?? {}) },
      },
      loadedStores: { ...s.loadedStores, [storeId]: true },
    }));
  },

  updateSettings: (storeId, patch) => {
    const previous = get().settingsByStore[storeId] ?? DEFAULT_STORE_SETTINGS;
    set((s) => ({ settingsByStore: { ...s.settingsByStore, [storeId]: { ...previous, ...patch } } }));

    const existingTimer = pendingSaves.get(storeId);
    if (existingTimer) clearTimeout(existingTimer);
    pendingPatches.set(storeId, { ...(pendingPatches.get(storeId) ?? {}), ...patch });

    pendingSaves.set(
      storeId,
      setTimeout(async () => {
        pendingSaves.delete(storeId);
        const body = pendingPatches.get(storeId);
        pendingPatches.delete(storeId);
        if (!body || Object.keys(body).length === 0) return;

        const applied = get().settingsByStore[storeId];
        const data = await apiRequest<{ settings: StoreSettings | null }>(
          `/api/control-center/store-settings/${storeId}`,
          { method: "PATCH", body: JSON.stringify(body) }
        );
        // Roll back only if nothing newer has been typed in the meantime.
        if (!data && get().settingsByStore[storeId] === applied) {
          set((s) => ({ settingsByStore: { ...s.settingsByStore, [storeId]: previous } }));
        }
      }, SAVE_DEBOUNCE_MS)
    );
  },
}));
