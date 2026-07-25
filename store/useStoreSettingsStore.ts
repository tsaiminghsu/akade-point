import { create } from "zustand";
import { persist } from "zustand/middleware";

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

interface StoreSettingsState {
  settingsByStore: Record<string, StoreSettings>;
  getSettings: (storeId: string) => StoreSettings;
  updateSettings: (storeId: string, patch: Partial<StoreSettings>) => void;
}

export const useStoreSettingsStore = create<StoreSettingsState>()(
  persist(
    (set, get) => ({
      settingsByStore: {},

      getSettings: (storeId) => get().settingsByStore[storeId] ?? DEFAULT_STORE_SETTINGS,

      updateSettings: (storeId, patch) =>
        set((s) => ({
          settingsByStore: {
            ...s.settingsByStore,
            [storeId]: { ...(s.settingsByStore[storeId] ?? DEFAULT_STORE_SETTINGS), ...patch },
          },
        })),
    }),
    { name: "cc-store-settings" }
  )
);
