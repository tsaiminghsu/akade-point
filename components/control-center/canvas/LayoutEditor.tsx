"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { generateInitialWidgets } from "@/lib/control-center/mockData";
import { screenToCanvas } from "@/lib/control-center/geometry";
import type { WidgetType } from "@/lib/control-center/types";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { useControlCenterStore, defaultWidgetPartial } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";
import { useLayoutVersionsStore } from "@/store/useLayoutVersionsStore";
import { Toolbar } from "./Toolbar";
import { WidgetPalette } from "./WidgetPalette";
import { CanvasViewport } from "./CanvasViewport";
import { Minimap } from "./Minimap";
import { PropertyPanel } from "./PropertyPanel";
import { LayersPanel } from "./LayersPanel";
import { useLiveModeTicker } from "./useLiveModeTicker";

export default function LayoutEditor() {
  const t = useTranslations("Toolbar");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);

  /** Store whose layout is currently on the canvas, so a store switch can be
   *  told apart from the first load and from a cancelled switch. */
  const loadedStoreIdRef = useRef<string | null>(null);
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);

  useLiveModeTicker();

  const loadStore = useCallback(
    async (storeId: string, cancelled?: () => boolean) => {
      try {
        const versionsStore = useLayoutVersionsStore.getState();
        let active = versionsStore.getActiveVersion(storeId);
        if (!active) {
          const machines = useMachinesStore.getState().machines;
          active = await versionsStore.ensureDefaultVersion(storeId, generateInitialWidgets(machines, storeId));
        }
        await useStoreSettingsStore.getState().hydrateStore(storeId);
        if (cancelled?.()) return;

        loadedStoreIdRef.current = storeId;
        useControlCenterStore.getState().loadWidgets(active.widgets);
        const settings = useStoreSettingsStore.getState().getSettings(storeId);
        useControlCenterStore.setState({
          gridSize: settings.gridSize,
          snapEnabled: settings.snapEnabled,
          gridVisible: settings.gridVisible,
          animationEnabled: settings.animationEnabled,
        });
      } catch {
        // ensureDefaultVersion throws when the layout-version request fails.
        // Left unhandled this was an unhandled rejection and a blank canvas.
        if (!cancelled?.()) toast.error(t("loadFailed"));
      }
    },
    [t]
  );

  useEffect(() => {
    if (!activeStoreId || loadedStoreIdRef.current === activeStoreId) return;
    let cancelled = false;

    // Switching store replaces the canvas, so unsaved work needs a confirmation
    // first — the same guard the version switcher already applies.
    if (loadedStoreIdRef.current !== null && useControlCenterStore.getState().isDirty) {
      setPendingStoreId(activeStoreId);
      return;
    }

    void loadStore(activeStoreId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [activeStoreId, loadStore]);

  // Closing the tab or navigating away can't be intercepted with a dialog, so
  // fall back to the browser's own "leave site?" prompt while work is unsaved.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!useControlCenterStore.getState().isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable) return;
      const s = useControlCenterStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if ((mod && e.key.toLowerCase() === "y") || (mod && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === "c") {
        s.copySelection();
      } else if (mod && e.key.toLowerCase() === "v") {
        s.pasteClipboard();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (s.selection.length) s.duplicateWidgets(s.selection);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selection.length) s.removeWidgets(s.selection);
      } else if (e.key === "Escape") {
        s.clearSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleAddWidget(type: WidgetType) {
    const s = useControlCenterStore.getState();
    const rect = containerRef.current?.getBoundingClientRect();
    const screenCenter = { x: (rect?.width ?? 800) / 2, y: (rect?.height ?? 600) / 2 };
    const canvasCenter = screenToCanvas(screenCenter, s.viewport);
    s.addWidget(defaultWidgetPartial(type, canvasCenter.x, canvasCenter.y));
    s.commit();
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar containerRef={containerRef} />
      {/* Phones get the canvas alone (view, pan, switch to live mode); adding widgets and editing properties needs a wider screen. */}
      <p className="shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground md:hidden">{t("mobileHint")}</p>
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <WidgetPalette onAddWidget={handleAddWidget} />
        </div>
        <div className="relative flex-1">
          <CanvasViewport containerRef={containerRef} />
          <div className="hidden md:block">
            <Minimap containerRef={containerRef} />
          </div>
        </div>
        <div className="hidden w-72 shrink-0 flex-col md:flex">
          <div className="flex-1 overflow-hidden">
            <PropertyPanel />
          </div>
          <LayersPanel />
        </div>
      </div>

      <ConfirmDialog
        open={pendingStoreId !== null}
        onOpenChange={(open) => {
          if (open || pendingStoreId === null) return;
          // Cancelled: put the store switcher back where it was so the canvas
          // and the selected store stop disagreeing.
          const previous = loadedStoreIdRef.current;
          setPendingStoreId(null);
          if (previous) useMachinesStore.getState().setActiveStore(previous);
        }}
        title={t("switchStoreTitle")}
        description={t("switchStoreDescription")}
        confirmLabel={t("switchStoreConfirm")}
        onConfirm={() => {
          const target = pendingStoreId;
          setPendingStoreId(null);
          if (target) void loadStore(target);
        }}
      />
    </div>
  );
}
