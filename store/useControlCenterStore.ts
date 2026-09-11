import { create } from "zustand";
import { createId } from "@paralleldrive/cuid2";

import { computeAlignDeltas, computeDistributeDeltas, type AlignEdge, type DistributeAxis } from "@/lib/control-center/align";
import {
  DEFAULT_GRID_SIZE,
  LAYER_GROUP_Z_BASE,
  MAX_ZOOM,
  MIN_ZOOM,
  UNDO_HISTORY_LIMIT,
  WIDGET_DEFAULT_LAYER,
  ZOOM_STEP,
} from "@/lib/control-center/constants";
import { canvasToScreen, clamp, screenToCanvas } from "@/lib/control-center/geometry";
import type { EditorMode, Point, StoreSettings, Viewport, Widget, WidgetType } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";

/** Shared so the initial `widgets` and `history[0]` are the same reference. */
const EMPTY_WIDGETS: Widget[] = [];

function cloneWidgets(widgets: Widget[]): Widget[] {
  return widgets.map((w) => ({ ...w }));
}

/** Persists a grid/snap/animation change to the active store's own settings,
 * so it survives switching away and back (see useStoreSettingsStore). */
function writeThroughStoreSettings(patch: Partial<StoreSettings>) {
  const activeStoreId = useMachinesStore.getState().activeStoreId;
  if (activeStoreId) useStoreSettingsStore.getState().updateSettings(activeStoreId, patch);
}

function newWidgetId(): string {
  return createId();
}

/**
 * Re-numbers z so that widgets stay inside their layer group's band (see
 * LAYER_GROUP_Z_BASE). Relative order *within* a group is taken from the given
 * array order. Without this, "bring to front" or adding a widget assigned a
 * flat 0..n index and permanently flattened the bands, letting a background
 * shape paint over machines — while LayersPanel still grouped by band.
 */
function restackWithinBands(widgets: Widget[]): Widget[] {
  const nextInBand: Record<string, number> = {};
  return widgets.map((w) => {
    const base = LAYER_GROUP_Z_BASE[w.layerGroup];
    const offset = nextInBand[w.layerGroup] ?? 0;
    nextInBand[w.layerGroup] = offset + 1;
    const zIndex = base + offset;
    return zIndex === w.zIndex ? w : { ...w, zIndex };
  });
}

/**
 * Ordered comparison. Selection order is meaningful (the drag snap anchor and
 * the single-selection property editor both read index 0), so this is not set
 * equality. Marquee dragging recomputes the same hit list on every frame, and
 * bailing out here keeps one context-menu wrapper per widget from re-rendering.
 */
function sameIds(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Ordered by paint order (back to front), which is what the ordering actions
 *  and LayersPanel both reason about. */
function inPaintOrder(widgets: Widget[]): Widget[] {
  return [...widgets].sort((a, b) => a.zIndex - b.zIndex);
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
  /** History slot whose content is what the server currently holds, or null when
   *  the saved state is no longer reachable by undo/redo (a new branch replaced
   *  it, or it aged out of the capped history). Lets undo/redo recompute
   *  `isDirty` instead of leaving it stale. */
  savedHistoryIndex: number | null;

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
  widgets: EMPTY_WIDGETS,
  selection: [],
  viewport: initialViewport,
  mode: "edit",
  snapEnabled: true,
  gridVisible: true,
  gridSize: DEFAULT_GRID_SIZE,
  animationEnabled: true,
  clipboard: [],
  isDirty: false,

  history: [EMPTY_WIDGETS],
  historyIndex: 0,
  savedHistoryIndex: 0,

  loadWidgets: (widgets) =>
    set({
      widgets,
      // Same reference in both, so `history[historyIndex] === widgets` is an
      // exact "nothing uncommitted" test (widgets are never mutated in place).
      history: [widgets],
      historyIndex: 0,
      savedHistoryIndex: 0,
      selection: [],
      isDirty: false,
      savedWidgets: cloneWidgets(widgets),
    }),

  addWidget: (partial) => {
    const id = newWidgetId();
    const widget = { ...partial, id, zIndex: 0 } as Widget;
    set((s) => ({
      // Front of its own band, not of the whole canvas.
      widgets: restackWithinBands([...s.widgets, widget]),
      selection: [id],
      isDirty: true,
    }));
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
        return { ...w, id, x: w.x + 24, y: w.y + 24, name: `${w.name} copy` };
      });
      return { widgets: restackWithinBands([...s.widgets, ...copies]), selection: newIds, isDirty: true };
    });
    get().commit();
    return newIds;
  },

  bringToFront: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const ordered = inPaintOrder(s.widgets);
      const rest = ordered.filter((w) => !idSet.has(w.id));
      const moved = ordered.filter((w) => idSet.has(w.id));
      return { widgets: restackWithinBands([...rest, ...moved]), isDirty: true };
    });
    get().commit();
  },

  sendToBack: (ids) => {
    const idSet = new Set(ids);
    set((s) => {
      const ordered = inPaintOrder(s.widgets);
      const moved = ordered.filter((w) => idSet.has(w.id));
      const rest = ordered.filter((w) => !idSet.has(w.id));
      return { widgets: restackWithinBands([...moved, ...rest]), isDirty: true };
    });
    get().commit();
  },

  reorderWidget: (id, beforeId) => {
    set((s) => {
      const ordered = inPaintOrder(s.widgets);
      const widget = ordered.find((w) => w.id === id);
      if (!widget) return s;
      const withoutMoved = ordered.filter((w) => w.id !== id);
      const targetIndex = beforeId ? withoutMoved.findIndex((w) => w.id === beforeId) : withoutMoved.length;
      const insertAt = targetIndex === -1 ? withoutMoved.length : targetIndex;
      const next = [...withoutMoved.slice(0, insertAt), widget, ...withoutMoved.slice(insertAt)];
      return { widgets: restackWithinBands(next), isDirty: true };
    });
    get().commit();
  },

  setSelection: (ids) => set((s) => (sameIds(s.selection, ids) ? s : { selection: ids })),
  toggleSelection: (id, additive) =>
    set((s) => {
      if (!additive) return { selection: s.selection.includes(id) && s.selection.length === 1 ? [] : [id] };
      const has = s.selection.includes(id);
      return { selection: has ? s.selection.filter((x) => x !== id) : [...s.selection, id] };
    }),
  clearSelection: () => set((s) => (s.selection.length === 0 ? s : { selection: [] })),

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
        return { ...w, id, x: w.x + 32, y: w.y + 32 };
      });
      return { widgets: restackWithinBands([...state.widgets, ...copies]), selection: newIds, isDirty: true };
    });
    get().commit();
    return newIds;
  },

  commit: () =>
    set((s) => {
      // Nothing changed since the last commit (a click without a drag, a blur
      // with no edit). Pushing a duplicate would also throw away the redo
      // branch, so bail out instead.
      if (s.history[s.historyIndex] === s.widgets) return s;

      const truncated = s.history.slice(0, s.historyIndex + 1);
      const appended = [...truncated, s.widgets];
      const dropped = Math.max(0, appended.length - UNDO_HISTORY_LIMIT);
      const nextHistory = appended.slice(dropped);

      // The saved snapshot survives only if it is still in the kept window and
      // wasn't on the redo branch this commit just discarded.
      let savedHistoryIndex = s.savedHistoryIndex;
      if (savedHistoryIndex !== null) {
        savedHistoryIndex = savedHistoryIndex > s.historyIndex ? null : savedHistoryIndex - dropped;
        if (savedHistoryIndex !== null && savedHistoryIndex < 0) savedHistoryIndex = null;
      }

      return { history: nextHistory, historyIndex: nextHistory.length - 1, savedHistoryIndex };
    }),

  undo: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s;
      const newIndex = s.historyIndex - 1;
      return {
        widgets: s.history[newIndex],
        historyIndex: newIndex,
        selection: [],
        isDirty: s.savedHistoryIndex === null || newIndex !== s.savedHistoryIndex,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return s;
      const newIndex = s.historyIndex + 1;
      return {
        widgets: s.history[newIndex],
        historyIndex: newIndex,
        selection: [],
        isDirty: s.savedHistoryIndex === null || newIndex !== s.savedHistoryIndex,
      };
    }),

  // Same thing as save(): both mean "the server now holds what's on screen".
  // Keeping them different let discard() revert past a "save as new version".
  markSaved: () => get().save(),

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  savedWidgets: null,
  save: () => {
    // Fold any uncommitted edit into history first, so savedHistoryIndex points
    // at a slot that actually holds what was saved.
    if (get().history[get().historyIndex] !== get().widgets) get().commit();
    set((s) => ({ savedWidgets: cloneWidgets(s.widgets), savedHistoryIndex: s.historyIndex, isDirty: false }));
  },
  discard: () => {
    const s = get();
    if (!s.savedWidgets) return;
    set({ widgets: cloneWidgets(s.savedWidgets), selection: [], isDirty: false });
    get().commit();
    set({ savedHistoryIndex: get().historyIndex });
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
