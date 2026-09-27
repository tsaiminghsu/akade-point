import { create } from "zustand";

import { apiRequest } from "@/lib/control-center/apiClient";
import { chunk, fetchParamMeta, type ParamMetaTable, type ParamTable, type ParamValues } from "@/lib/control-center/vehicles/params/params";
import { useGcsStore } from "./useGcsStore";

export interface SnapshotMeta {
  capturedAt: number;
  count: number;
  fw: string | null;
}

interface ParamState {
  vehicleId: string | null;
  table: ParamTable | null;
  capturedAt: number | null;
  source: "vehicle" | "snapshot" | null;
  fw: string | null;
  snapshots: SnapshotMeta[];
  /** pending changes, not yet written */
  edits: ParamValues;
  meta: ParamMetaTable | null;
  metaState: "idle" | "loading" | "ready" | "error";
  busy: null | "fetch" | "write";
  lastWrite: { ok: string[]; failed: { name: string; code: string }[]; reboot: string[] } | null;

  init: (vehicleId: string, family: "copter" | "rover") => void;
  loadSnapshots: () => Promise<void>;
  loadSnapshot: (capturedAt: number) => Promise<ParamTable | null>;
  fetchFromVehicle: () => Promise<boolean>;
  setEdit: (name: string, value: number | null) => void;
  setEdits: (values: ParamValues) => void;
  clearEdits: () => void;
  writeEdits: () => Promise<boolean>;
}

export const useParamStore = create<ParamState>()((set, get) => ({
  vehicleId: null,
  table: null,
  capturedAt: null,
  source: null,
  fw: null,
  snapshots: [],
  edits: {},
  meta: null,
  metaState: "idle",
  busy: null,
  lastWrite: null,

  init: (vehicleId, family) => {
    if (get().vehicleId !== vehicleId) {
      set({ vehicleId, table: null, capturedAt: null, source: null, fw: null, snapshots: [], edits: {}, lastWrite: null });
      void get()
        .loadSnapshots()
        .then(() => {
          const newest = get().snapshots[0];
          if (newest && !get().table) void get().loadSnapshot(newest.capturedAt);
        });
    }
    if (get().metaState === "idle" || get().metaState === "error") {
      set({ metaState: "loading" });
      void fetchParamMeta(family).then((meta) => set({ meta, metaState: meta ? "ready" : "error" }));
    }
  },

  loadSnapshots: async () => {
    const id = get().vehicleId;
    if (!id) return;
    const res = await apiRequest<{ snapshots: SnapshotMeta[] }>(`/api/control-center/vehicles/${id}/params`, undefined, { silent: true });
    if (res) set({ snapshots: res.snapshots });
  },

  loadSnapshot: async (capturedAt) => {
    const id = get().vehicleId;
    if (!id) return null;
    const res = await apiRequest<{ snapshot: { params: ParamTable; capturedAt: number; fw: string | null } }>(
      `/api/control-center/vehicles/${id}/params/${capturedAt}`
    );
    if (!res) return null;
    set({ table: res.snapshot.params, capturedAt: res.snapshot.capturedAt, fw: res.snapshot.fw, source: "snapshot" });
    return res.snapshot.params;
  },

  fetchFromVehicle: async () => {
    const gcs = useGcsStore.getState();
    set({ busy: "fetch" });
    try {
      const res = await gcs.sendAndWait({ type: "param_fetch" }, { directExtra: { inline: true }, timeoutMs: 240_000 });
      if (res?.status !== "acked") return false;
      const inline = res.result?.params as ParamTable | undefined;
      await get().loadSnapshots();
      if (inline) {
        set({ table: inline, capturedAt: Date.now(), source: "vehicle", fw: gcs.state?.fw ?? null });
        return true;
      }
      const newest = get().snapshots[0];
      if (newest) await get().loadSnapshot(newest.capturedAt);
      set({ source: "vehicle" });
      return true;
    } finally {
      set({ busy: null });
    }
  },

  setEdit: (name, value) =>
    set((s) => {
      const edits = { ...s.edits };
      if (value === null || (s.table?.[name] && Math.fround(s.table[name][0]) === Math.fround(value))) delete edits[name];
      else edits[name] = value;
      return { edits };
    }),
  setEdits: (values) => set((s) => ({ edits: { ...s.edits, ...values } })),
  clearEdits: () => set({ edits: {} }),

  writeEdits: async () => {
    const gcs = useGcsStore.getState();
    const entries = Object.entries(get().edits);
    if (entries.length === 0) return true;
    set({ busy: "write" });
    const ok: string[] = [];
    const failed: { name: string; code: string }[] = [];
    try {
      for (const group of chunk(entries, 50)) {
        const res = await gcs.sendAndWait({ type: "param_set", params: Object.fromEntries(group) }, { timeoutMs: 120_000 });
        const results = (res?.result?.params ?? {}) as Record<string, { ok: boolean; code: string; value: number | null }>;
        for (const [name] of group) {
          const r = results[name];
          if (r?.ok) ok.push(name);
          else failed.push({ name, code: r?.code ?? res?.code ?? "TIMEOUT" });
        }
      }
      const meta = get().meta;
      set((s) => {
        const table = { ...(s.table ?? {}) };
        const edits = { ...s.edits };
        for (const name of ok) {
          table[name] = [edits[name], table[name]?.[1] ?? 9];
          delete edits[name];
        }
        return {
          table,
          edits,
          lastWrite: { ok, failed, reboot: ok.filter((n) => meta?.[n]?.reboot) },
        };
      });
      return failed.length === 0;
    } finally {
      set({ busy: null });
    }
  },
}));
