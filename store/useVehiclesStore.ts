import { create } from "zustand";

import { apiRequest } from "@/lib/control-center/apiClient";
import { resolveTimeouts } from "@/lib/control-center/vehicles/commandState";
import { VEHICLE_POLL_MS } from "@/lib/control-center/vehicles/constants";
import type {
  MissionItem,
  TelemetryPoint,
  Vehicle,
  VehicleCommand,
  VehicleMission,
} from "@/lib/control-center/vehicles/types";
import type { CommandRequest } from "@/lib/control-center/vehicles/schemas";

interface VehiclesState {
  vehicles: Vehicle[];
  vehiclesById: Record<string, Vehicle>;
  commandsByVehicle: Record<string, VehicleCommand[]>;
  telemetryByVehicle: Record<string, TelemetryPoint[]>;
  missionsByVehicle: Record<string, VehicleMission[]>;
  hydrated: boolean;
  hydrateError: boolean;

  hydrate: () => Promise<void>;
  refreshVehicles: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;

  getVehicle: (id: string) => Vehicle | undefined;

  addVehicle: (input: { name: string; type: "drone" | "rover"; companionId: string; notes?: string }) => Promise<Vehicle | null>;
  updateVehicle: (id: string, patch: Partial<Pick<Vehicle, "name" | "type" | "companionId" | "notes">>) => Promise<boolean>;
  removeVehicle: (id: string) => Promise<boolean>;
  issueToken: (id: string, label?: string) => Promise<{ token: string; tokenId: string; createdAt: number; directKey: string | null } | null>;

  issueCommand: (vehicleId: string, request: CommandRequest) => Promise<VehicleCommand | null>;
  fetchCommands: (vehicleId: string) => Promise<void>;
  fetchTelemetry: (vehicleId: string, since?: number) => Promise<void>;

  fetchMissions: (vehicleId: string) => Promise<void>;
  createMission: (vehicleId: string, name: string, items: MissionItem[], source?: "editor" | "import") => Promise<VehicleMission | null>;
  updateMission: (vehicleId: string, missionId: string, patch: { name?: string; items?: MissionItem[] }) => Promise<boolean>;
  deleteMission: (vehicleId: string, missionId: string) => Promise<boolean>;
}

function byId(vehicles: Vehicle[]): Record<string, Vehicle> {
  const map: Record<string, Vehicle> = {};
  for (const v of vehicles) map[v.id] = v;
  return map;
}

/** In-flight hydrate, shared by overlapping callers (see useMachinesStore). */
let hydrateInflight: Promise<void> | null = null;
/** Module-level poll timer so it survives re-renders and is easy to clear. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

const CMD_LOG_CAP = 100;

export const useVehiclesStore = create<VehiclesState>()((set, get) => ({
  vehicles: [],
  vehiclesById: {},
  commandsByVehicle: {},
  telemetryByVehicle: {},
  missionsByVehicle: {},
  hydrated: false,
  hydrateError: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve();
    if (hydrateInflight) return hydrateInflight;
    hydrateInflight = (async () => {
      const res = await apiRequest<{ vehicles: Vehicle[] }>("/api/control-center/vehicles", undefined, { silent: true });
      if (!res) {
        set({ hydrateError: true, hydrated: false });
        return;
      }
      set({ vehicles: res.vehicles, vehiclesById: byId(res.vehicles), hydrated: true, hydrateError: false });
    })()
      .catch(() => set({ hydrateError: true, hydrated: false }))
      .finally(() => {
        hydrateInflight = null;
      });
    return hydrateInflight;
  },

  refreshVehicles: async () => {
    const res = await apiRequest<{ vehicles: Vehicle[] }>("/api/control-center/vehicles", undefined, { silent: true });
    if (!res) return;
    // Preserve object identity for unchanged rows so the table doesn't churn.
    const prev = get().vehiclesById;
    const merged = res.vehicles.map((v) => {
      const old = prev[v.id];
      return old && old.stateAt === v.stateAt && old.updatedAt === v.updatedAt && old.lastSeenAt === v.lastSeenAt ? old : v;
    });
    set({ vehicles: merged, vehiclesById: byId(merged), hydrated: true, hydrateError: false });
  },

  startPolling: () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void get().refreshVehicles();
    }, VEHICLE_POLL_MS);
  },
  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  getVehicle: (id) => get().vehiclesById[id],

  addVehicle: async (input) => {
    const res = await apiRequest<{ vehicle: Vehicle }>("/api/control-center/vehicles", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res) return null;
    set((s) => {
      const vehicles = [...s.vehicles, res.vehicle];
      return { vehicles, vehiclesById: byId(vehicles) };
    });
    return res.vehicle;
  },

  updateVehicle: async (id, patch) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res) return false;
    set((s) => {
      const vehicles = s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v));
      return { vehicles, vehiclesById: byId(vehicles) };
    });
    return true;
  },

  removeVehicle: async (id) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/vehicles/${id}`, { method: "DELETE" });
    if (!res) return false;
    set((s) => {
      const vehicles = s.vehicles.filter((v) => v.id !== id);
      return { vehicles, vehiclesById: byId(vehicles) };
    });
    return true;
  },

  issueToken: async (id, label) => {
    return apiRequest<{ token: string; tokenId: string; createdAt: number; directKey: string | null }>(`/api/control-center/vehicles/${id}/token`, {
      method: "POST",
      body: JSON.stringify({ label: label ?? "companion" }),
    });
  },

  issueCommand: async (vehicleId, request) => {
    const res = await apiRequest<{ command: VehicleCommand }>(`/api/control-center/vehicles/${vehicleId}/commands`, {
      method: "POST",
      body: JSON.stringify(request),
    });
    if (!res) return null;
    set((s) => {
      const prev = s.commandsByVehicle[vehicleId] ?? [];
      return { commandsByVehicle: { ...s.commandsByVehicle, [vehicleId]: [res.command, ...prev].slice(0, CMD_LOG_CAP) } };
    });
    return res.command;
  },

  fetchCommands: async (vehicleId) => {
    const res = await apiRequest<{ commands: VehicleCommand[] }>(
      `/api/control-center/vehicles/${vehicleId}/commands?limit=${CMD_LOG_CAP}`,
      undefined,
      { silent: true }
    );
    if (!res) return;
    // Apply client-side timeout derivation so the log reads correctly between
    // polls without waiting for the server to persist the flip.
    const { commands } = resolveTimeouts(res.commands);
    set((s) => ({ commandsByVehicle: { ...s.commandsByVehicle, [vehicleId]: commands } }));
  },

  fetchTelemetry: async (vehicleId, since) => {
    const qs = since ? `?since=${since}` : "";
    const res = await apiRequest<{ points: TelemetryPoint[] }>(
      `/api/control-center/vehicles/${vehicleId}/telemetry${qs}`,
      undefined,
      { silent: true }
    );
    if (!res) return;
    set((s) => ({ telemetryByVehicle: { ...s.telemetryByVehicle, [vehicleId]: res.points } }));
  },

  fetchMissions: async (vehicleId) => {
    const res = await apiRequest<{ missions: VehicleMission[] }>(
      `/api/control-center/vehicles/${vehicleId}/missions`,
      undefined,
      { silent: true }
    );
    if (!res) return;
    set((s) => ({ missionsByVehicle: { ...s.missionsByVehicle, [vehicleId]: res.missions } }));
  },

  createMission: async (vehicleId, name, items, source) => {
    const res = await apiRequest<{ mission: VehicleMission }>(`/api/control-center/vehicles/${vehicleId}/missions`, {
      method: "POST",
      body: JSON.stringify({ name, items, source }),
    });
    if (!res) return null;
    set((s) => {
      const prev = s.missionsByVehicle[vehicleId] ?? [];
      return { missionsByVehicle: { ...s.missionsByVehicle, [vehicleId]: [res.mission, ...prev] } };
    });
    return res.mission;
  },

  updateMission: async (vehicleId, missionId, patch) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/vehicles/missions/${missionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res) return false;
    set((s) => ({
      missionsByVehicle: {
        ...s.missionsByVehicle,
        [vehicleId]: (s.missionsByVehicle[vehicleId] ?? []).map((m) =>
          m.id === missionId ? { ...m, ...patch, updatedAt: Date.now() } : m
        ),
      },
    }));
    return true;
  },

  deleteMission: async (vehicleId, missionId) => {
    const res = await apiRequest<{ ok: true }>(`/api/control-center/vehicles/missions/${missionId}`, { method: "DELETE" });
    if (!res) return false;
    set((s) => ({
      missionsByVehicle: {
        ...s.missionsByVehicle,
        [vehicleId]: (s.missionsByVehicle[vehicleId] ?? []).filter((m) => m.id !== missionId),
      },
    }));
    return true;
  },
}));
