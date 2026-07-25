import { create } from "zustand";
import { toast } from "sonner";

import { generateAlerts } from "@/lib/control-center/mockData";
import type { Alert, AlertStatus } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";

interface AlertsState {
  alerts: Alert[];
  pushAlerts: (alerts: Alert[], opts?: { silent?: boolean }) => void;
  setStatus: (id: string, status: AlertStatus) => void;
  acknowledge: (id: string) => void;
  resolve: (id: string) => void;
  ignore: (id: string) => void;
  unreadCount: () => number;
}

export const useAlertStore = create<AlertsState>((set, get) => ({
  alerts: generateAlerts(useMachinesStore.getState().machines),

  pushAlerts: (newAlerts, opts) => {
    if (newAlerts.length === 0) return;
    set((prev) => ({ alerts: [...newAlerts, ...prev.alerts].slice(0, 500) }));
    if (!opts?.silent) {
      for (const alert of newAlerts) {
        toast.error(alert.message, {
          description: new Date(alert.createdAt).toLocaleTimeString("zh-TW"),
        });
      }
    }
  },

  setStatus: (id, status) =>
    set((prev) => ({
      alerts: prev.alerts.map((a) => (a.id === id ? { ...a, status, updatedAt: Date.now() } : a)),
    })),

  acknowledge: (id) => get().setStatus(id, "acknowledged"),
  resolve: (id) => get().setStatus(id, "resolved"),
  ignore: (id) => get().setStatus(id, "ignored"),

  unreadCount: () => get().alerts.filter((a) => a.status === "active").length,
}));
