import { create } from "zustand";

import { computeAlignDeltas, computeDistributeDeltas, type AlignEdge, type DistributeAxis } from "@/lib/control-center/align";
import { DEFAULT_GRID_SIZE, MAX_ZOOM, MIN_ZOOM, UNDO_HISTORY_LIMIT, WIDGET_DEFAULT_LAYER, ZOOM_STEP } from "@/lib/control-center/constants";
import { canvasToScreen, clamp, screenToCanvas } from "@/lib/control-center/geometry";
import type { EditorMode, Point, StoreSettings, Viewport, Widget, WidgetType } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";

function cloneWidgets(widgets: Widget[]): Widget[] {
  return widgets.map((w) => ({ ...w }));
}

/** Persists a grid/snap/animation change to the active store's own settings,
 * so it survives switching away and back (see useStoreSettingsStore). */
function writeThroughStoreSettings(patch: Partial<StoreSettings>) {
  const activeStoreId = useMachinesStore.getState().activeStoreId;
  if (activeStoreId) useStoreSettingsStore.getState().updateSettings(activeStoreId, patch);
}

let widgetIdCounter = 0;
function newWidgetId(): string {
  widgetIdCounter += 1;
  return `w-${Date.now().toString(36)}-${widgetIdCounter}`;
}

interface ControlCenterState {
  widgets: Widget[];
  selection: string[];
  viewport: Viewport;
  mode: EditorMode;
  snapEnabled: boolean;
  gridVisible: boolean;
  gridSize: number;
  animationEnabled: boolean;
  clipboard: Widget[];
  isDirty: boolean;

  history: Widget[][];
  historyIndex: number;

  loadWidgets: (widgets: Widget[]) => void;

  addWidget: (partial: DistributiveOmit<Widget, "id" | "zIndex"> & { zIndex?: number }) => string;
  updateWidget: (id: string, patch: Partial<Widget>) => void;
  updateWidgets: (ids: string[], patch: Partial<Widget>) => void;
  setWidgetPositions: (positions: Record<string, { x: number; y: number }>) => void;
  removeWidgets: (ids: string[]) => void;
  duplicateWidgets: (ids: string[]) => string[];

  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  reorderWidget: (id: string, beforeId: string | null) => void;

  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string, additive?: boolean) => void;
  clearSelection: () => void;

  setViewport: (partial: Partial<Viewport>) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screenPoint: Point, factor: number) => void;
  fitToScreen: (canvasSize: { width: number; height: number }) => void;
  resetViewport: () => void;

  toggleSnap: () => void;
  toggleGrid: () => void;
  setGridSize: (size: number) => void;
  toggleAnimation: () => void;
  setMode: (mode: EditorMode) => void;

  align: (edge: AlignEdge) => void;
  distribute: (axis: DistributeAxis) => void;

  copySelection: () => void;
  pasteClipboard: () => string[];

  commit: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;

  canUndo: () => boolean;
  canRedo: () => boolean;

  savedWidgets: Widget[] | null;
  save: () => void;
  discard: () => void;
  autoArrange: () => void;
  zoomIn: (center: Point) => void;
  zoomOut: (center: Point) => void;
}

const initialViewport: Viewport = { x: 400, y: 160, zoom: 1 };

export const useControlCenterStore = create<ControlCenterState>((set, get) => ({
  widgets: [],
  selection: [],
  viewport: initialViewport,
  mode: "edit",
  snapEnabled: true,
  gridVisible: true,
  gridSize: DEFAULT_GRID_SIZE,
  animationEnabled: true,
  clipboard: [],
  isDirty: false,

  history: [[]],
  historyIndex: 0,

  loadWidgets: (widgets) =>
    set({
      widgets,
      history: [cloneWidgets(widgets)],
      historyIndex: 0,
      selection: [],
      isDirty: false,
      savedWidgets: cloneWidgets(widgets),
    }),

  addWidget: (partial) => {
    const id = newWidgetId();
    const zIndex = get().widgets.length;
    const widget = { ...partial, id, zIndex } as Widget;
    set((s) => ({ widgets: [...s.widgets, widget], selection: [id], isDirty: true }));
    return id;
  },

  updateWidget: (id, patch) =>
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === id ? ({ ...w, ...patch } as Widget) : w)),
      isDirty: true,
    })),

  updateWidgets: (ids, patch) => {
    const idSet = new Set(ids);
    set((s) => ({
      widgets: s.widgets.map((w) => (idSet.has(w.id) ? ({ ...w, ...patch } as Widget) : w)),
      isDirty: true,
    }));
  },

  setWidgetPositions: (positions) =>
    set((s) => ({
      widgets: s.widgets.map((w) =>
        positions[w.id] ? { ...w, x: positions[w.id].x, y: positions[w.id].y } : w
      ),
      isDirty: true,
    })),

  removeWidgets: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      widgets: s.widgets.filter((w) => !idSet.has(w.id)),
      selection: s.selection.filter((id) => !idSet.has(id)),
      isDirty: true,
    }));
    get().commit();
  },

  duplicateWidgets: (ids) => {
    const idSet = new Set(ids);
    const newIds: string[] = [];
    set((s) => {
      const originals = s.widgets.filter((w) => idSet.has(w.id));
      const copies = originals.map((w) => {
        const id = newWidgetId();
        newIds.push(id);
        return { ...w, id, x: w.x + 24, y: w.y + 24, zIndex: s.widgets.length + newIds.length, name: `${w.name} copy` };
      });
      return { widgets: [...s.widgets, ...copies], selection: newIds, isDirty: true };
    });
    get().commit();
    return newIds;
  },

  bringToFront: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const rest = s.widgets.filter((w) => !idSet.has(w.id));
      const moved = s.widgets.filter((w) => idSet.has(w.id));
      const reordered = [...rest, ...moved].map((w, i) => ({ ...w, zIndex: i }));
      return { widgets: reordered, isDirty: true };
    });
    get().commit();
  },

  sendToBack: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const moved = s.widgets.filter((w) => idSet.has(w.id));
      const rest = s.widgets.filter((w) => !idSet.has(w.id));
      const reordered = [...moved, ...rest].map((w, i) => ({ ...w, zIndex: i }));
      return { widgets: reordered, isDirty: true };
    });
    get().commit();
  },

  reorderWidget: (id, beforeId) => {
    set((s) => {
      const widget = s.widgets.find((w) => w.id === id);
      if (!widget) return s;
      const withoutMoved = s.widgets.filter((w) => w.id !== id);
      const targetIndex = beforeId ? withoutMoved.findIndex((w) => w.id === beforeId) : withoutMoved.length;
      const insertAt = targetIndex === -1 ? withoutMoved.length : targetIndex;
      const next = [...withoutMoved.slice(0, insertAt), widget, ...withoutMoved.slice(insertAt)];
      return { widgets: next.map((w, i) => ({ ...w, zIndex: i })), isDirty: true };
    });
    get().commit();
  },

  setSelection: (ids) => set({ selection: ids }),
  toggleSelection: (id, additive) =>
    set((s) => {
      if (!additive) return { selection: s.selection.includes(id) && s.selection.length === 1 ? [] : [id] };
      const has = s.selection.includes(id);
      return { selection: has ? s.selection.filter((x) => x !== id) : [...s.selection, id] };
    }),
  clearSelection: () => set({ selection: [] }),

  setViewport: (partial) => set((s) => ({ viewport: { ...s.viewport, ...partial } })),
  panBy: (dx, dy) => set((s) => ({ viewport: { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy } })),

  zoomAt: (screenPoint, factor) =>
    set((s) => {
      const canvasPoint = screenToCanvas(screenPoint, s.viewport);
      const newZoom = clamp(s.viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const newScreen = canvasToScreen(canvasPoint, { ...s.viewport, zoom: newZoom });
      const dx = screenPoint.x - newScreen.x;
      const dy = screenPoint.y - newScreen.y;
      return { viewport: { x: s.viewport.x + dx, y: s.viewport.y + dy, zoom: newZoom } };
    }),

  fitToScreen: (canvasSize) =>
    set((s) => {
      const visible = s.widgets.filter((w) => !w.hidden);
      if (visible.length === 0) return { viewport: initialViewport };
      const minX = Math.min(...visible.map((w) => w.x - w.width / 2));
      const minY = Math.min(...visible.map((w) => w.y - w.height / 2));
      const maxX = Math.max(...visible.map((w) => w.x + w.width / 2));
      const maxY = Math.max(...visible.map((w) => w.y + w.height / 2));
      const contentW = Math.max(1, maxX - minX);
      const contentH = Math.max(1, maxY - minY);
      const padding = 80;
      const zoom = clamp(
        Math.min((canvasSize.width - padding * 2) / contentW, (canvasSize.height - padding * 2) / contentH),
        MIN_ZOOM,
        MAX_ZOOM
      );
      const x = canvasSize.width / 2 - ((minX + maxX) / 2) * zoom;
      const y = canvasSize.height / 2 - ((minY + maxY) / 2) * zoom;
      return { viewport: { x, y, zoom } };
    }),

  resetViewport: () => set({ viewport: initialViewport }),

  toggleSnap: () => {
    const snapEnabled = !get().snapEnabled;
    set({ snapEnabled });
    writeThroughStoreSettings({ snapEnabled });
  },
  toggleGrid: () => {
    const gridVisible = !get().gridVisible;
    set({ gridVisible });
    writeThroughStoreSettings({ gridVisible });
  },
  setGridSize: (size) => {
    const gridSize = Math.max(4, size);
    set({ gridSize });
    writeThroughStoreSettings({ gridSize });
  },
  toggleAnimation: () => {
    const animationEnabled = !get().animationEnabled;
    set({ animationEnabled });
    writeThroughStoreSettings({ animationEnabled });
  },
  setMode: (mode) => set({ mode, selection: mode === "live" ? [] : get().selection }),

  align: (edge) => {
    const s = get();
    const selected = s.widgets.filter((w) => s.selection.includes(w.id));
    const deltas = computeAlignDeltas(selected, edge);
    set((state) => ({
      widgets: state.widgets.map((w) =>
        deltas[w.id] ? { ...w, x: w.x + deltas[w.id].dx, y: w.y + deltas[w.id].dy } : w
      ),
      isDirty: true,
    }));
    get().commit();
  },

  distribute: (axis) => {
    const s = get();
    const selected = s.widgets.filter((w) => s.selection.includes(w.id));
    const deltas = computeDistributeDeltas(selected, axis);
    set((state) => ({
      widgets: state.widgets.map((w) =>
        deltas[w.id] ? { ...w, x: w.x + deltas[w.id].dx, y: w.y + deltas[w.id].dy } : w
      ),
      isDirty: true,
    }));
    get().commit();
  },

  copySelection: () => {
    const s = get();
    set({ clipboard: cloneWidgets(s.widgets.filter((w) => s.selection.includes(w.id))) });
  },

  pasteClipboard: () => {
    const s = get();
    if (s.clipboard.length === 0) return [];
    const newIds: string[] = [];
    set((state) => {
      const copies = state.clipboard.map((w) => {
        const id = newWidgetId();
        newIds.push(id);
        return { ...w, id, x: w.x + 32, y: w.y + 32, zIndex: state.widgets.length + newIds.length };
      });
      return { widgets: [...state.widgets, ...copies], selection: newIds, isDirty: true };
    });
    get().commit();
    return newIds;
  },

  commit: () =>
    set((s) => {
      const snapshot = cloneWidgets(s.widgets);
      const truncated = s.history.slice(0, s.historyIndex + 1);
      const nextHistory = [...truncated, snapshot].slice(-UNDO_HISTORY_LIMIT);
      return { history: nextHistory, historyIndex: nextHistory.length - 1 };
    }),

  undo: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s;
      const newIndex = s.historyIndex - 1;
      return { widgets: cloneWidgets(s.history[newIndex]), historyIndex: newIndex, selection: [] };
    }),

  redo: () =>
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return s;
      const newIndex = s.historyIndex + 1;
      return { widgets: cloneWidgets(s.history[newIndex]), historyIndex: newIndex, selection: [] };
    }),

  markSaved: () => set({ isDirty: false }),

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  savedWidgets: null,
  save: () => set((s) => ({ savedWidgets: cloneWidgets(s.widgets), isDirty: false })),
  discard: () => {
    const s = get();
    if (!s.savedWidgets) return;
    set({ widgets: cloneWidgets(s.savedWidgets), selection: [], isDirty: false });
    get().commit();
  },

  autoArrange: () => {
    set((s) => {
      const cols = 6;
      const cellW = 180;
      const cellH = 150;
      const marginX = 120;
      const marginY = 220;
      let i = 0;
      const widgets = s.widgets.map((w) => {
        if (w.type !== "machine") return w;
        const col = i % cols;
        const row = Math.floor(i / cols);
        i += 1;
        return { ...w, x: marginX + col * cellW, y: marginY + row * cellH, rotation: 0 };
      });
      return { widgets, isDirty: true };
    });
    get().commit();
  },

  zoomIn: (center) => get().zoomAt(center, ZOOM_STEP),
  zoomOut: (center) => get().zoomAt(center, 1 / ZOOM_STEP),
}));

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function defaultWidgetPartial(type: WidgetType, x: number, y: number): DistributiveOmit<Widget, "id" | "zIndex"> {
  const base = {
    x,
    y,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    layerGroup: WIDGET_DEFAULT_LAYER[type],
    name: type[0].toUpperCase() + type.slice(1),
  };
  switch (type) {
    case "machine":
      return { ...base, type, width: 140, height: 96, size: "medium", machineId: "" };
    case "text":
      return { ...base, type, width: 160, height: 32, text: "Label", fontSize: 16, color: "#e2e8f0" };
    case "rectangle":
      return { ...base, type, width: 160, height: 100, fill: "hsl(199 89% 48% / 0.12)", stroke: "#38bdf8", strokeWidth: 2 };
    case "circle":
      return { ...base, type, width: 100, height: 100, fill: "hsl(199 89% 48% / 0.12)", stroke: "#38bdf8", strokeWidth: 2 };
    case "arrow":
      return { ...base, type, width: 120, height: 40, stroke: "#38bdf8", strokeWidth: 2 };
    case "line":
      return { ...base, type, width: 120, height: 4, stroke: "#38bdf8", strokeWidth: 2 };
    case "zone":
      return { ...base, type, width: 240, height: 180, fill: "hsl(199 89% 48% / 0.06)", label: "Zone" };
    case "camera":
      return { ...base, type, width: 100, height: 72, label: "CAM" };
    case "image":
      return { ...base, type, width: 200, height: 140, src: null };
    case "counter":
      return { ...base, type, width: 140, height: 70, label: "Counter", value: 0 };
    case "map":
      return { ...base, type, width: 220, height: 160, label: "Map" };
    case "divider":
      return { ...base, type, width: 200, height: 4, orientation: "horizontal" };
    default:
      throw new Error(`Unhandled widget type: ${type}`);
  }
}
