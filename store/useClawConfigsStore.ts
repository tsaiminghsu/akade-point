import { create } from "zustand";
import { toast } from "sonner";

import { apiRequest } from "@/lib/control-center/apiClient";
import { factoryConfig, type ClawConfig, type ClawConfigPart, type ClawDraft } from "@/lib/control-center/claw/config";
import type { MachineEvent } from "@/lib/control-center/types";
import { useMachinesStore } from "./useMachinesStore";

export type SaveResult =
  | { ok: true; config: ClawConfig }
  /** Someone saved first; `config` is theirs. */
  | { ok: false; conflict: ClawConfig }
  | { ok: false; conflict?: undefined };

interface ClawConfigsState {
  /** Saved configs by machineId. A machine missing here runs factory defaults. */
  configs: Record<string, ClawConfig>;
  hydrated: boolean;
  hydrateError: boolean;

  /** Fetch every saved config. Re-fetches each call, so a page visit sees others' saves. */
  hydrate: () => Promise<void>;
  /** The machine's saved config, or the factory one (revision 0). */
  configFor: (machineId: string) => ClawConfig;
  /** Re-read one machine's config from the server (null on failure). */
  fetchConfig: (machineId: string) => Promise<ClawConfig | null>;
  save: (machineId: string, draft: ClawDraft, revision: number) => Promise<SaveResult>;
  copyTo: (
    draft: ClawDraft,
    parts: ClawConfigPart[],
    machineIds: string[],
    sourceMachineId?: string
  ) => Promise<{ copied: number; missing: number } | null>;
}

let hydrateInflight: Promise<void> | null = null;

/** Show config events in the machine drawer and history without a reload. */
function recordEvents(events: (MachineEvent | null | undefined)[]) {
  const fresh = events.filter((e): e is MachineEvent => Boolean(e));
  if (!fresh.length) return;
  useMachinesStore.setState((s) => ({ events: [...fresh, ...s.events].slice(0, 500) }));
}

export const useClawConfigsStore = create<ClawConfigsState>()((set, get) => ({
  configs: {},
  hydrated: false,
  hydrateError: false,

  hydrate: () => {
    if (hydrateInflight) return hydrateInflight;
    hydrateInflight = (async () => {
      const res = await apiRequest<{ configs: ClawConfig[] }>("/api/control-center/claw-configs", undefined, {
        silent: true,
      });
      if (!res) {
        // A failed refresh keeps what's already loaded.
        if (!get().hydrated) set({ hydrateError: true });
        return;
      }
      const configs: Record<string, ClawConfig> = {};
      for (const c of res.configs) configs[c.machineId] = c;
      set({ configs, hydrated: true, hydrateError: false });
    })()
      .catch(() => {
        if (!get().hydrated) set({ hydrateError: true });
      })
      .finally(() => {
        hydrateInflight = null;
      });
    return hydrateInflight;
  },

  configFor: (machineId) => get().configs[machineId] ?? factoryConfig(machineId),

  fetchConfig: async (machineId) => {
    const res = await apiRequest<{ config: ClawConfig }>(
      `/api/control-center/claw-configs/${encodeURIComponent(machineId)}`,
      undefined,
      { silent: true }
    );
    if (!res) return null;
    set((s) => {
      const configs = { ...s.configs };
      if (res.config.revision > 0) configs[machineId] = res.config;
      else delete configs[machineId];
      return { configs };
    });
    return res.config;
  },

  save: async (machineId, draft, revision) => {
    // Not apiRequest(): a 409 carries the winning config, which it would drop.
    let res: Response;
    try {
      res = await fetch(`/api/control-center/claw-configs/${encodeURIComponent(machineId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, revision }),
      });
    } catch {
      toast.error("Network error");
      return { ok: false };
    }
    const body = (await res.json().catch(() => null)) as
      | { config?: ClawConfig; event?: MachineEvent | null; error?: string }
      | null;
    if (res.status === 409 && body?.config) {
      const conflict = body.config;
      set((s) => ({ configs: { ...s.configs, [machineId]: conflict } }));
      return { ok: false, conflict };
    }
    if (!res.ok || !body?.config) {
      toast.error(body?.error ?? `Request failed (${res.status})`);
      return { ok: false };
    }
    const config = body.config;
    set((s) => ({ configs: { ...s.configs, [machineId]: config } }));
    recordEvents([body.event]);
    return { ok: true, config };
  },

  copyTo: async (draft, parts, machineIds, sourceMachineId) => {
    const res = await apiRequest<{ configs: ClawConfig[]; missing: string[]; events: MachineEvent[] }>(
      "/api/control-center/claw-configs/copy",
      { method: "POST", body: JSON.stringify({ ...draft, parts, machineIds, sourceMachineId }) }
    );
    if (!res) return null;
    set((s) => {
      const configs = { ...s.configs };
      for (const c of res.configs) configs[c.machineId] = c;
      return { configs };
    });
    recordEvents(res.events);
    return { copied: res.configs.length, missing: res.missing.length };
  },
}));
