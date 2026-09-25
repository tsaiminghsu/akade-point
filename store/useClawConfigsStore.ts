import { create } from "zustand";
import { toast } from "sonner";

import { apiRequest } from "@/lib/control-center/apiClient";
import { factoryConfig, type ClawConfig, type ClawConfigPart, type ClawDraft } from "@/lib/control-center/claw/config";
import type { ClawNotifyMode, ClawSync } from "@/lib/control-center/claw/device";
import type { MachineEvent } from "@/lib/control-center/types";
import { useMachinesStore } from "./useMachinesStore";

export interface MachineTokenInfo {
  tokenId: string;
  label: string;
  createdAt: number;
  revokedAt: number | null;
}

/** How often the setup page re-reads what the boards pulled and applied. */
export const SYNC_POLL_MS = 5000;

/** What a save or copy did about ringing the boards (null: nothing to ring for). */
export interface NotifyOutcome {
  mode: ClawNotifyMode;
  sent: number;
  failed: number;
}

export type SaveResult =
  | { ok: true; config: ClawConfig; notify: NotifyOutcome | null }
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
  ) => Promise<{ copied: number; missing: number; notify: NotifyOutcome | null } | null>;

  /** What each machine's board last pulled and applied, by machineId. */
  sync: Record<string, ClawSync>;
  /** How the server rings boards on a save, and where boards should connect. */
  notify: { mode: ClawNotifyMode; brokerUri: string | null };
  refreshSync: () => Promise<void>;
  startSyncPolling: () => void;
  stopSyncPolling: () => void;
  listTokens: (machineId: string) => Promise<MachineTokenInfo[] | null>;
  /** Issue the board token (plaintext returned once); revokes the old ones. */
  issueToken: (machineId: string, label?: string) => Promise<{ token: string; tokenId: string; createdAt: number } | null>;
  revokeTokens: (machineId: string) => Promise<number | null>;
}

let hydrateInflight: Promise<void> | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

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
      | { config?: ClawConfig; event?: MachineEvent | null; notify?: NotifyOutcome | null; error?: string }
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
    return { ok: true, config, notify: body.notify ?? null };
  },

  copyTo: async (draft, parts, machineIds, sourceMachineId) => {
    const res = await apiRequest<{
      configs: ClawConfig[];
      missing: string[];
      events: MachineEvent[];
      notify: NotifyOutcome | null;
    }>(
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
    return { copied: res.configs.length, missing: res.missing.length, notify: res.notify };
  },

  sync: {},
  notify: { mode: "off", brokerUri: null },

  refreshSync: async () => {
    const res = await apiRequest<{ sync: ClawSync[]; notify: ClawConfigsState["notify"] }>(
      "/api/control-center/claw-configs/sync",
      undefined,
      { silent: true }
    );
    if (!res) return;
    const sync: Record<string, ClawSync> = {};
    for (const row of res.sync) sync[row.machineId] = row;
    // Most polls change nothing; don't re-render the page for those.
    if (JSON.stringify(sync) !== JSON.stringify(get().sync)) set({ sync });
    if (JSON.stringify(res.notify) !== JSON.stringify(get().notify)) set({ notify: res.notify });
  },

  startSyncPolling: () => {
    if (syncTimer) return;
    void get().refreshSync();
    syncTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void get().refreshSync();
    }, SYNC_POLL_MS);
  },

  stopSyncPolling: () => {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
  },

  listTokens: async (machineId) => {
    const res = await apiRequest<{ tokens: MachineTokenInfo[] }>(
      `/api/control-center/machines/${encodeURIComponent(machineId)}/token`,
      undefined,
      { silent: true }
    );
    return res?.tokens ?? null;
  },

  issueToken: async (machineId, label) =>
    apiRequest<{ token: string; tokenId: string; createdAt: number }>(
      `/api/control-center/machines/${encodeURIComponent(machineId)}/token`,
      { method: "POST", body: JSON.stringify(label ? { label } : {}) }
    ),

  revokeTokens: async (machineId) => {
    const res = await apiRequest<{ ok: true; revoked: number }>(
      `/api/control-center/machines/${encodeURIComponent(machineId)}/token`,
      { method: "DELETE" }
    );
    return res ? res.revoked : null;
  },
}));
