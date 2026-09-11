import { create } from "zustand";

import { apiRequest } from "@/lib/control-center/apiClient";
import { chunk, MAX_BATCH_ITEMS } from "@/lib/control-center/batch";
import { HYDRATE_EVENT_LIMIT } from "@/lib/control-center/constants";
import {
  generateBrands,
  generateEvents,
  generateGroups,
  generateMachines,
  generateMaintenanceRecords,
  generateStores,
} from "@/lib/control-center/mockData";
import { tick } from "@/lib/control-center/simulation";
import type {
  Alert,
  Brand,
  Machine,
  MachineEvent,
  MachineGroup,
  MachineStatus,
  MaintenanceRecord,
  Store,
} from "@/lib/control-center/types";

export interface CreateMachineInput {
  name: string;
  deviceId: string;
  storeId: string;
  groupId: string;
  status: MachineStatus;
}

interface MachinesState {
  brands: Brand[];
  stores: Store[];
  groups: MachineGroup[];
  machines: Machine[];
  machinesById: Record<string, Machine>;
  events: MachineEvent[];
  maintenanceRecords: MaintenanceRecord[];
  activeStoreId: string;
  hydrated: boolean;
  /** Set when hydration failed, so the shell can offer a retry instead of
   *  rendering an empty dashboard that looks like "no devices". */
  hydrateError: boolean;

  hydrate: () => Promise<void>;
  setActiveStore: (storeId: string) => void;
  getMachine: (id: string) => Machine | undefined;
  runLiveTick: () => { events: MachineEvent[]; alerts: Alert[] };
  /** Persists freshly-generated telemetry events (e.g. from the live
   *  simulation) to the backend in batches, then swaps the locally-minted ids
   *  for the server-assigned ones so a refresh doesn't duplicate rows. */
  persistEvents: (events: MachineEvent[]) => Promise<void>;
  /** Dev/demo utility: replaces local state with freshly generated mock data.
   *  Does not write to the server — reload will bring back the real data. */
  resetMockData: () => void;

  addBrand: (input: Omit<Brand, "id">) => Promise<string | null>;
  updateBrand: (id: string, patch: Partial<Omit<Brand, "id">>) => Promise<boolean>;
  removeBrand: (id: string) => Promise<boolean>;

  addStore: (input: Omit<Store, "id" | "activeLayoutVersionId">) => Promise<string | null>;
  updateStore: (id: string, patch: Partial<Omit<Store, "id">>) => Promise<boolean>;
  removeStore: (id: string) => Promise<boolean>;

  addGroup: (input: Omit<MachineGroup, "id">) => Promise<string | null>;
  updateGroup: (id: string, patch: Partial<Omit<MachineGroup, "id">>) => Promise<boolean>;
  removeGroup: (id: string) => Promise<boolean>;

  addMachine: (input: CreateMachineInput) => Promise<string | null>;
  updateMachine: (id: string, patch: Partial<Machine>) => Promise<boolean>;
  removeMachine: (id: string) => Promise<boolean>;
}

/** In-flight hydrate, so overlapping callers share one fan-out. Deliberately
 *  outside the store: a promise is not state React should re-render on. */
let hydrateInflight: Promise<void> | null = null;

function toById(machines: Machine[]): Record<string, Machine> {
  const map: Record<string, Machine> = {};
  for (const m of machines) map[m.id] = m;
  return map;
}

function seedAll() {
  const brands = generateBrands();
  const stores = generateStores(brands);
  const groups = generateGroups(stores);
  const machines = generateMachines(stores, groups);
  const events = generateEvents(machines);
  const maintenanceRecords = generateMaintenanceRecords(machines);
  return {
    brands,
    stores,
    groups,
    machines,
    machinesById: toById(machines),
    events,
    maintenanceRecords,
    activeStoreId: stores[0]?.id ?? "",
  };
}

export const useMachinesStore = create<MachinesState>()((set, get) => ({
  brands: [],
  stores: [],
  groups: [],
  machines: [],
  machinesById: {},
  events: [],
  maintenanceRecords: [],
  activeStoreId: "",
  hydrated: false,
  hydrateError: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve();
    // Dedupe concurrent callers: the `hydrated` flag only flips after six
    // awaits, so without this a remount (or React's dev double-effect) fires
    // the whole fan-out twice.
    if (hydrateInflight) return hydrateInflight;

    hydrateInflight = (async () => {
      const silent = { silent: true } as const;
      const [brandsRes, storesRes, groupsRes, machinesRes, eventsRes, maintenanceRes] = await Promise.all([
        apiRequest<{ brands: Brand[] }>("/api/control-center/brands", undefined, silent),
        apiRequest<{ stores: Store[] }>("/api/control-center/stores", undefined, silent),
        apiRequest<{ groups: MachineGroup[] }>("/api/control-center/groups", undefined, silent),
        apiRequest<{ machines: Machine[] }>("/api/control-center/machines", undefined, silent),
        apiRequest<{ events: MachineEvent[] }>(
          `/api/control-center/events?limit=${HYDRATE_EVENT_LIMIT}`,
          undefined,
          silent
        ),
        apiRequest<{ records: MaintenanceRecord[] }>("/api/control-center/maintenance-records", undefined, silent),
      ]);

      // Partial data would render as "some stores missing" with no way to tell.
      // Leave `hydrated` false so the shell can show one error with a retry
      // instead of six stacked toasts.
      if (!brandsRes || !storesRes || !groupsRes || !machinesRes || !eventsRes || !maintenanceRes) {
        set({ hydrateError: true, hydrated: false });
        return;
      }

      const stores = storesRes.stores;
      const machines = machinesRes.machines;
      set({
        brands: brandsRes.brands,
        stores,
        groups: groupsRes.groups,
        machines,
        machinesById: toById(machines),
        events: eventsRes.events,
        maintenanceRecords: maintenanceRes.records,
        activeStoreId: get().activeStoreId || (stores[0]?.id ?? ""),
        hydrated: true,
        hydrateError: false,
      });
    })()
      .catch(() => {
        set({ hydrateError: true, hydrated: false });
      })
      .finally(() => {
        hydrateInflight = null;
      });

    return hydrateInflight;
  },

  setActiveStore: (storeId) => set({ activeStoreId: storeId }),

  getMachine: (id) => get().machinesById[id],

  runLiveTick: () => {
    const result = tick(get().machines);
    set((prev) => ({
      machines: result.updatedMachines,
      machinesById: toById(result.updatedMachines),
      events: result.newEvents.length ? [...result.newEvents, ...prev.events].slice(0, 500) : prev.events,
    }));
    return { events: result.newEvents, alerts: result.newAlerts };
  },

  persistEvents: async (events) => {
    for (const batch of chunk(events, MAX_BATCH_ITEMS)) {
      const res = await apiRequest<{ events: MachineEvent[] }>(
        "/api/control-center/events/batch",
        {
          method: "POST",
          body: JSON.stringify({
            events: batch.map((e) => ({
              machineId: e.machineId,
              storeId: e.storeId,
              type: e.type,
              message: e.message,
              severity: e.severity,
              timestamp: e.timestamp,
            })),
          }),
        },
        { silent: true }
      );

      // The batch endpoint answers in request order, so index i is the server
      // record for draft i. Adopting its id keeps a later refresh from showing
      // the same event twice under two different keys.
      if (!res || res.events.length !== batch.length) continue;
      const idMap = new Map(batch.map((e, i) => [e.id, res.events[i].id]));
      set((prev) => ({
        events: prev.events.map((e) => {
          const serverId = idMap.get(e.id);
          return serverId && serverId !== e.id ? { ...e, id: serverId } : e;
        }),
      }));
    }
  },

  resetMockData: () => set({ ...seedAll(), hydrated: true, hydrateError: false }),

  addBrand: async (input) => {
    const res = await apiRequest<{ brand: Brand }>("/api/control-center/brands", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res) return null;
    set((s) => ({ brands: [...s.brands, res.brand] }));
    return res.brand.id;
  },

  updateBrand: async (id, patch) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/brands/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res) return false;
    set((s) => ({ brands: s.brands.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    return true;
  },

  removeBrand: async (id) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/brands/${id}`, { method: "DELETE" });
    if (!res) return false;
    set((s) => ({ brands: s.brands.filter((b) => b.id !== id) }));
    return true;
  },

  addStore: async (input) => {
    const res = await apiRequest<{ store: Store }>("/api/control-center/stores", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res) return null;
    set((s) => ({ stores: [...s.stores, res.store] }));
    return res.store.id;
  },

  updateStore: async (id, patch) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/stores/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res) return false;
    set((s) => ({ stores: s.stores.map((st) => (st.id === id ? { ...st, ...patch } : st)) }));
    return true;
  },

  removeStore: async (id) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/stores/${id}`, { method: "DELETE" });
    if (!res) return false;
    set((s) => ({
      stores: s.stores.filter((st) => st.id !== id),
      groups: s.groups.filter((g) => g.storeId !== id),
      activeStoreId: s.activeStoreId === id ? (s.stores.find((st) => st.id !== id)?.id ?? "") : s.activeStoreId,
    }));
    return true;
  },

  addGroup: async (input) => {
    const res = await apiRequest<{ group: MachineGroup }>("/api/control-center/groups", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res) return null;
    set((s) => ({ groups: [...s.groups, res.group] }));
    return res.group.id;
  },

  updateGroup: async (id, patch) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res) return false;
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
    return true;
  },

  removeGroup: async (id) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/groups/${id}`, { method: "DELETE" });
    if (!res) return false;
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
    return true;
  },

  addMachine: async (input) => {
    const res = await apiRequest<{ machine: Machine }>("/api/control-center/machines", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res) return null;
    set((s) => ({
      machines: [...s.machines, res.machine],
      machinesById: { ...s.machinesById, [res.machine.id]: res.machine },
    }));
    return res.machine.id;
  },

  updateMachine: async (id, patch) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/machines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res) return false;
    set((s) => {
      const machines = s.machines.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return { machines, machinesById: toById(machines) };
    });
    return true;
  },

  removeMachine: async (id) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/machines/${id}`, { method: "DELETE" });
    if (!res) return false;
    set((s) => {
      const machines = s.machines.filter((m) => m.id !== id);
      return { machines, machinesById: toById(machines) };
    });
    return true;
  },
}));
