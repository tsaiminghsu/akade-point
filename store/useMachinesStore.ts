import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

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

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

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
  events: MachineEvent[];
  maintenanceRecords: MaintenanceRecord[];
  activeStoreId: string;

  setActiveStore: (storeId: string) => void;
  getMachine: (id: string) => Machine | undefined;
  runLiveTick: () => { events: MachineEvent[]; alerts: Alert[] };
  resetMockData: () => void;

  addBrand: (input: Omit<Brand, "id">) => string;
  updateBrand: (id: string, patch: Partial<Omit<Brand, "id">>) => void;
  removeBrand: (id: string) => boolean;

  addStore: (input: Omit<Store, "id">) => string;
  updateStore: (id: string, patch: Partial<Omit<Store, "id">>) => void;
  removeStore: (id: string) => boolean;

  addGroup: (input: Omit<MachineGroup, "id">) => string;
  updateGroup: (id: string, patch: Partial<Omit<MachineGroup, "id">>) => void;
  removeGroup: (id: string) => boolean;

  addMachine: (input: CreateMachineInput) => string;
  updateMachine: (id: string, patch: Partial<Machine>) => void;
  removeMachine: (id: string) => boolean;
}

function seedDirectory() {
  const brands = generateBrands();
  const stores = generateStores(brands);
  const groups = generateGroups(stores);
  return { brands, stores, groups };
}

function seedTelemetry(stores: Store[], groups: MachineGroup[]) {
  const machines = generateMachines(stores, groups);
  const events = generateEvents(machines);
  const maintenanceRecords = generateMaintenanceRecords(machines);
  return { machines, events, maintenanceRecords };
}

function seedAll() {
  const { brands, stores, groups } = seedDirectory();
  return { brands, stores, groups, activeStoreId: stores[0].id, ...seedTelemetry(stores, groups) };
}

export const useMachinesStore = create<MachinesState>()(
  persist(
    (set, get) => ({
      ...seedAll(),

      setActiveStore: (storeId) => set({ activeStoreId: storeId }),

      getMachine: (id) => get().machines.find((m) => m.id === id),

      runLiveTick: () => {
        const result = tick(get().machines);
        set((prev) => ({
          machines: result.updatedMachines,
          events: result.newEvents.length ? [...result.newEvents, ...prev.events].slice(0, 500) : prev.events,
        }));
        return { events: result.newEvents, alerts: result.newAlerts };
      },

      resetMockData: () => set(seedAll()),

      addBrand: (input) => {
        const id = nextId("brand");
        set((s) => ({ brands: [...s.brands, { ...input, id }] }));
        return id;
      },

      updateBrand: (id, patch) =>
        set((s) => ({ brands: s.brands.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),

      removeBrand: (id) => {
        const s = get();
        const brand = s.brands.find((b) => b.id === id);
        const dependentStores = s.stores.filter((st) => st.brandId === id);
        if (dependentStores.length > 0) {
          toast.error(`Cannot delete '${brand?.name ?? id}': ${dependentStores.length} store(s) still assigned to it`);
          return false;
        }
        set({ brands: s.brands.filter((b) => b.id !== id) });
        return true;
      },

      addStore: (input) => {
        const id = nextId("store");
        set((s) => ({ stores: [...s.stores, { ...input, id }] }));
        return id;
      },

      updateStore: (id, patch) =>
        set((s) => ({ stores: s.stores.map((st) => (st.id === id ? { ...st, ...patch } : st)) })),

      removeStore: (id) => {
        const s = get();
        const store = s.stores.find((st) => st.id === id);
        const dependentMachines = s.machines.filter((m) => m.storeId === id);
        if (dependentMachines.length > 0) {
          toast.error(`Cannot delete '${store?.name ?? id}': ${dependentMachines.length} machine(s) still in this store`);
          return false;
        }
        set({
          stores: s.stores.filter((st) => st.id !== id),
          groups: s.groups.filter((g) => g.storeId !== id),
          activeStoreId: s.activeStoreId === id ? (s.stores.find((st) => st.id !== id)?.id ?? "") : s.activeStoreId,
        });
        return true;
      },

      addGroup: (input) => {
        const id = nextId("group");
        set((s) => ({ groups: [...s.groups, { ...input, id }] }));
        return id;
      },

      updateGroup: (id, patch) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      removeGroup: (id) => {
        const s = get();
        const group = s.groups.find((g) => g.id === id);
        const dependentMachines = s.machines.filter((m) => m.groupId === id);
        if (dependentMachines.length > 0) {
          toast.error(`Cannot delete '${group?.name ?? id}': ${dependentMachines.length} machine(s) still in this group`);
          return false;
        }
        set({ groups: s.groups.filter((g) => g.id !== id) });
        return true;
      },

      addMachine: (input) => {
        const id = nextId("mach");
        const now = Date.now();
        const machine: Machine = {
          id,
          name: input.name,
          deviceId: input.deviceId,
          storeId: input.storeId,
          groupId: input.groupId,
          status: input.status,
          current: input.status === "alarm" ? 11.5 : input.status === "warning" ? 9 : 3,
          door: "closed",
          doorOpenSince: null,
          heartbeatAt: now,
          rssi: -50,
          firmware: "v2.5.0",
          restartCount: 0,
          lastUpdate: now,
          currentHistory: [{ t: now, value: 3 }],
        };
        set((s) => ({ machines: [...s.machines, machine] }));
        return id;
      },

      updateMachine: (id, patch) =>
        set((s) => ({ machines: s.machines.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

      removeMachine: (id) => {
        set((s) => ({ machines: s.machines.filter((m) => m.id !== id) }));
        return true;
      },
    }),
    {
      name: "cc-machines-directory",
      partialize: (s) => ({
        brands: s.brands,
        stores: s.stores,
        groups: s.groups,
        machines: s.machines,
        activeStoreId: s.activeStoreId,
      }),
    }
  )
);
