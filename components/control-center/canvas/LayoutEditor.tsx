"use client";

import { useEffect, useRef } from "react";

import { generateInitialWidgets } from "@/lib/control-center/mockData";
import { screenToCanvas } from "@/lib/control-center/geometry";
import type { WidgetType } from "@/lib/control-center/types";
import { useControlCenterStore, defaultWidgetPartial } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";
import { Toolbar } from "./Toolbar";
import { WidgetPalette } from "./WidgetPalette";
import { CanvasViewport } from "./CanvasViewport";
import { Minimap } from "./Minimap";
import { PropertyPanel } from "./PropertyPanel";
import { LayersPanel } from "./LayersPanel";
import { useLiveModeTicker } from "./useLiveModeTicker";

export default function LayoutEditor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const loadWidgets = useControlCenterStore((s) => s.loadWidgets);

  useLiveModeTicker();

  useEffect(() => {
    const machines = useMachinesStore.getState().machines;
    loadWidgets(generateInitialWidgets(machines, activeStoreId));

    const settings = useStoreSettingsStore.getState().getSettings(activeStoreId);
    useControlCenterStore.setState({
      gridSize: settings.gridSize,
      snapEnabled: settings.snapEnabled,
      gridVisible: settings.gridVisible,
      animationEnabled: settings.animationEnabled,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
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
      <div className="flex flex-1 overflow-hidden">
        <WidgetPalette onAddWidget={handleAddWidget} />
        <div className="relative flex-1">
          <CanvasViewport containerRef={containerRef} />
          <Minimap containerRef={containerRef} />
        </div>
        <div className="flex w-72 shrink-0 flex-col">
          <div className="flex-1 overflow-hidden">
            <PropertyPanel />
          </div>
          <LayersPanel />
        </div>
      </div>
    </div>
  );
}
