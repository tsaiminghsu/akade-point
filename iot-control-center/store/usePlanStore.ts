import { create } from "zustand";

import { blankItem, fenceToItems, itemsToFence, itemsToMission, itemsToRally, missionToItems, newKey, rallyToItems } from "@/lib/control-center/vehicles/plan/planModel";
import type { FenceDoc, MissionDoc, PlanItem, RallyPoint } from "@/lib/control-center/vehicles/plan/planModel";
import type { PlanKind } from "@/lib/control-center/vehicles/plan/mavCmdMeta";
import type { MissionItem } from "@/lib/control-center/vehicles/types";

export type DrawMode = "none" | "addWp" | "polygonIn" | "polygonOut" | "circleIn" | "circleOut" | "rally" | "survey" | "fenceReturn" | "orbit";

interface PlanState {
  kind: PlanKind;
  /** stored record being edited, per kind (null = new, unsaved) */
  recordId: Record<PlanKind, string | null>;
  name: Record<PlanKind, string>;
  dirty: Record<PlanKind, boolean>;
  mission: MissionDoc;
  fence: FenceDoc;
  rally: RallyPoint[];
  selected: string | null;
  draw: DrawMode;
  /** vertices collected while drawing a polygon (fence or survey area) */
  drawPoints: [number, number][];
  defaultAlt: number;
  defaultFrame: number;
  /** result of the last upload check, per kind */
  verified: Record<PlanKind, "ok" | "mismatch" | null>;

  setKind: (k: PlanKind) => void;
  setDraw: (d: DrawMode) => void;
  addDrawPoint: (lat: number, lon: number) => void;
  clearDraw: () => void;
  select: (key: string | null) => void;
  setDefaults: (alt: number, frame: number) => void;

  loadRecord: (kind: PlanKind, id: string | null, name: string, items: MissionItem[]) => void;
  newPlan: (kind: PlanKind, home?: { lat: number; lon: number; alt: number }) => void;
  markSaved: (kind: PlanKind, id: string, name: string) => void;
  setName: (kind: PlanKind, name: string) => void;
  setVerified: (kind: PlanKind, v: "ok" | "mismatch" | null) => void;
  itemsFor: (kind: PlanKind) => MissionItem[];

  // mission
  setHome: (lat: number, lon: number, alt?: number) => void;
  addWaypointAt: (lat: number, lon: number) => void;
  insertAfter: (index: number, item: PlanItem) => void;
  appendItems: (items: PlanItem[]) => void;
  replaceMission: (doc: MissionDoc) => void;
  updateItem: (key: string, patch: Partial<PlanItem>) => void;
  moveItem: (key: string, delta: number) => void;
  removeItem: (key: string) => void;

  // fence
  finishPolygon: (inclusion: boolean, points?: [number, number][]) => void;
  addCircle: (inclusion: boolean, lat: number, lon: number, radius: number) => void;
  updateFence: (fn: (f: FenceDoc) => FenceDoc) => void;
  setFenceReturn: (p: { lat: number; lon: number } | null) => void;

  // rally
  addRally: (lat: number, lon: number) => void;
  updateRally: (key: string, patch: Partial<RallyPoint>) => void;
  removeRally: (key: string) => void;
}

const EMPTY_MISSION: MissionDoc = { home: { lat: 0, lon: 0, alt: 0 }, items: [] };
const EMPTY_FENCE: FenceDoc = { polygons: [], circles: [], returnPoint: null };

export const usePlanStore = create<PlanState>()((set, get) => {
  const touch = (kind: PlanKind) => ({ dirty: { ...get().dirty, [kind]: true }, verified: { ...get().verified, [kind]: null } });

  return {
    kind: "mission",
    recordId: { mission: null, fence: null, rally: null },
    name: { mission: "", fence: "", rally: "" },
    dirty: { mission: false, fence: false, rally: false },
    mission: EMPTY_MISSION,
    fence: EMPTY_FENCE,
    rally: [],
    selected: null,
    draw: "none",
    drawPoints: [],
    defaultAlt: 30,
    defaultFrame: 3,
    verified: { mission: null, fence: null, rally: null },

    setKind: (kind) => set({ kind, draw: "none", drawPoints: [], selected: null }),
    setDraw: (draw) => set({ draw, drawPoints: [] }),
    addDrawPoint: (lat, lon) => set((s) => ({ drawPoints: [...s.drawPoints, [lat, lon]] })),
    clearDraw: () => set({ draw: "none", drawPoints: [] }),
    select: (selected) => set({ selected }),
    setDefaults: (defaultAlt, defaultFrame) => set({ defaultAlt, defaultFrame }),

    loadRecord: (kind, id, name, items) => {
      const patch: Partial<PlanState> = {
        recordId: { ...get().recordId, [kind]: id },
        name: { ...get().name, [kind]: name },
        dirty: { ...get().dirty, [kind]: id === null },
        verified: { ...get().verified, [kind]: null },
        selected: null,
      };
      if (kind === "mission") patch.mission = itemsToMission(items);
      else if (kind === "fence") patch.fence = itemsToFence(items);
      else patch.rally = itemsToRally(items);
      set(patch);
    },

    newPlan: (kind, home) => {
      const patch: Partial<PlanState> = {
        recordId: { ...get().recordId, [kind]: null },
        name: { ...get().name, [kind]: "" },
        dirty: { ...get().dirty, [kind]: false },
        verified: { ...get().verified, [kind]: null },
        selected: null,
      };
      if (kind === "mission") patch.mission = { home: home ?? get().mission.home, items: [] };
      else if (kind === "fence") patch.fence = { polygons: [], circles: [], returnPoint: null };
      else patch.rally = [];
      set(patch);
    },

    markSaved: (kind, id, name) =>
      set((s) => ({ recordId: { ...s.recordId, [kind]: id }, name: { ...s.name, [kind]: name }, dirty: { ...s.dirty, [kind]: false } })),
    setName: (kind, name) => set((s) => ({ name: { ...s.name, [kind]: name }, dirty: { ...s.dirty, [kind]: true } })),
    setVerified: (kind, v) => set((s) => ({ verified: { ...s.verified, [kind]: v } })),

    itemsFor: (kind) => {
      const s = get();
      if (kind === "mission") return missionToItems(s.mission);
      if (kind === "fence") return fenceToItems(s.fence);
      return rallyToItems(s.rally);
    },

    setHome: (lat, lon, alt) => set((s) => ({ mission: { ...s.mission, home: { lat, lon, alt: alt ?? s.mission.home.alt } }, ...touch("mission") })),

    addWaypointAt: (lat, lon) => {
      const s = get();
      const item = blankItem(16, lat, lon, s.defaultAlt, s.defaultFrame);
      // Insert after the selected item, else append.
      const idx = s.selected ? s.mission.items.findIndex((i) => i.key === s.selected) : -1;
      const items = [...s.mission.items];
      items.splice(idx >= 0 ? idx + 1 : items.length, 0, item);
      set({ mission: { ...s.mission, items }, selected: item.key, ...touch("mission") });
    },

    insertAfter: (index, item) => {
      const s = get();
      const items = [...s.mission.items];
      items.splice(index + 1, 0, item);
      set({ mission: { ...s.mission, items }, selected: item.key, ...touch("mission") });
    },

    appendItems: (newItems) => set((s) => ({ mission: { ...s.mission, items: [...s.mission.items, ...newItems] }, ...touch("mission") })),

    replaceMission: (doc) => set({ mission: doc, selected: null, ...touch("mission") }),

    updateItem: (key, patch) =>
      set((s) => ({ mission: { ...s.mission, items: s.mission.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }, ...touch("mission") })),

    moveItem: (key, delta) => {
      const s = get();
      const items = [...s.mission.items];
      const i = items.findIndex((x) => x.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      set({ mission: { ...s.mission, items }, ...touch("mission") });
    },

    removeItem: (key) =>
      set((s) => ({ mission: { ...s.mission, items: s.mission.items.filter((i) => i.key !== key) }, selected: s.selected === key ? null : s.selected, ...touch("mission") })),

    finishPolygon: (inclusion, points) => {
      const pts = points ?? get().drawPoints;
      if (pts.length < 3) return;
      set((s) => ({
        fence: { ...s.fence, polygons: [...s.fence.polygons, { key: newKey(), inclusion, points: pts }] },
        draw: "none",
        drawPoints: [],
        ...touch("fence"),
      }));
    },

    addCircle: (inclusion, lat, lon, radius) =>
      set((s) => ({ fence: { ...s.fence, circles: [...s.fence.circles, { key: newKey(), inclusion, lat, lon, radius }] }, draw: "none", ...touch("fence") })),

    updateFence: (fn) => set((s) => ({ fence: fn(s.fence), ...touch("fence") })),

    setFenceReturn: (p) => set((s) => ({ fence: { ...s.fence, returnPoint: p }, draw: "none", ...touch("fence") })),

    addRally: (lat, lon) => set((s) => ({ rally: [...s.rally, { key: newKey(), lat, lon, alt: s.defaultAlt }], ...touch("rally") })),
    updateRally: (key, patch) => set((s) => ({ rally: s.rally.map((r) => (r.key === key ? { ...r, ...patch } : r)), ...touch("rally") })),
    removeRally: (key) => set((s) => ({ rally: s.rally.filter((r) => r.key !== key), ...touch("rally") })),
  };
});
