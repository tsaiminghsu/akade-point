import { create } from "zustand";
import { toast } from "sonner";

import { apiRequest } from "@/lib/control-center/apiClient";
import { chunk, MAX_BATCH_ITEMS } from "@/lib/control-center/batch";
import { HYDRATE_EVENT_LIMIT } from "@/lib/control-center/constants";
import type { Alert, AlertStatus } from "@/lib/control-center/types";

interface AlertsState {
  alerts: Alert[];
  hydrated: boolean;
  /** Set when hydration failed, so the shell can offer a retry instead of
   *  rendering an empty Alert Center that looks like "nothing wrong". */
  hydrateError: boolean;
  hydrate: () => Promise<void>;
  pushAlerts: (alerts: Alert[], opts?: { silent?: boolean }) => void;
  /** Persists freshly-detected alerts (e.g. from the live telemetry simulation)
   *  to the backend, then pushes the server-confirmed records (real ids) into
   *  local state. Use this instead of pushAlerts for alerts that don't exist
   *  in the DB yet. */
  ingestAlerts: (alerts: Alert[]) => Promise<void>;
  setStatus: (id: string, status: AlertStatus) => void;
  acknowledge: (id: string) => void;
  resolve: (id: string) => void;
  ignore: (id: string) => void;
  unreadCount: () => number;
}

/** In-flight hydrate, so overlapping callers share one request. */
let hydrateInflight: Promise<void> | null = null;

export const useAlertStore = create<AlertsState>((set, get) => ({
  alerts: [],
  hydrated: false,
  hydrateError: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve();
    if (hydrateInflight) return hydrateInflight;

    hydrateInflight = (async () => {
      const res = await apiRequest<{ alerts: Alert[] }>(
        `/api/control-center/alerts?limit=${HYDRATE_EVENT_LIMIT}`,
        undefined,
        { silent: true }
      );
      // Don't mark hydrated on failure — an empty Alert Center reads as "all
      // clear", which is the opposite of what a fetch failure means.
      if (!res) {
        set({ hydrateError: true, hydrated: false });
        return;
      }
      set({ alerts: res.alerts, hydrated: true, hydrateError: false });
    })()
      .catch(() => {
        set({ hydrateError: true, hydrated: false });
      })
      .finally(() => {
        hydrateInflight = null;
      });

    return hydrateInflight;
  },

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

  ingestAlerts: async (drafts) => {
    if (drafts.length === 0) return;
    const toPush: Alert[] = [];

    for (const batch of chunk(drafts, MAX_BATCH_ITEMS)) {
      const res = await apiRequest<{ alerts: Alert[] }>(
        "/api/control-center/alerts/batch",
        {
          method: "POST",
          body: JSON.stringify({
            alerts: batch.map((a) => ({
              machineId: a.machineId,
              storeId: a.storeId,
              type: a.type,
              message: a.message,
              severity: a.severity,
            })),
          }),
        },
        { silent: true }
      );
      // On failure keep the drafts: the operator still needs to see the alert,
      // even if it isn't durable yet.
      toPush.push(...(res ? res.alerts : batch));
    }

    get().pushAlerts(toPush);
  },

  setStatus: (id, status) => {
    set((prev) => ({
      alerts: prev.alerts.map((a) => (a.id === id ? { ...a, status, updatedAt: Date.now() } : a)),
    }));
    void apiRequest(`/api/control-center/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }, { silent: true });
  },

  acknowledge: (id) => get().setStatus(id, "acknowledged"),
  resolve: (id) => get().setStatus(id, "resolved"),
  ignore: (id) => get().setStatus(id, "ignored"),

  unreadCount: () => get().alerts.filter((a) => a.status === "active").length,
}));
