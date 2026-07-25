"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useControlCenterStore, defaultWidgetPartial } from "@/store/useControlCenterStore";
import { useUIStore } from "@/store/useUIStore";
import { screenToCanvas } from "@/lib/control-center/geometry";
import type { WidgetType } from "@/lib/control-center/types";
import { CanvasStage } from "./CanvasStage";
import { SelectionOverlay } from "./SelectionOverlay";
import { useCanvasInteractions } from "./useCanvasInteractions";
import { cn } from "@/lib/utils";

interface CanvasViewportProps {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function CanvasViewport({ containerRef }: CanvasViewportProps) {
  const widgets = useControlCenterStore((s) => s.widgets);
  const selection = useControlCenterStore(useShallow((s) => s.selection));
  const viewport = useControlCenterStore(useShallow((s) => s.viewport));
  const mode = useControlCenterStore((s) => s.mode);
  const gridVisible = useControlCenterStore((s) => s.gridVisible);
  const gridSize = useControlCenterStore((s) => s.gridSize);
  const animationEnabled = useControlCenterStore((s) => s.animationEnabled);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  const {
    spaceHeld,
    isPanning,
    marqueeScreenRect,
    onWheel,
    onPointerDownBackground,
    onPointerDownWidget,
    onPointerDownResizeHandle,
    onPointerDownRotateHandle,
  } = useCanvasInteractions(containerRef);

  const wheelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  return (
    <div
      ref={(node) => {
        wheelRef.current = node;
        containerRef.current = node;
      }}
      className={cn(
        "relative h-full w-full overflow-hidden bg-background/40",
        mode === "edit" && (spaceHeld || isPanning ? "cursor-grab" : "cursor-default")
      )}
      onWheel={onWheel}
      onPointerDown={onPointerDownBackground}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-cc-widget-type")) e.preventDefault();
      }}
      onDrop={(e) => {
        const type = e.dataTransfer.getData("application/x-cc-widget-type") as WidgetType;
        if (!type) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const s = useControlCenterStore.getState();
        const canvasPoint = screenToCanvas(screenPoint, s.viewport);
        s.addWidget(defaultWidgetPartial(type, canvasPoint.x, canvasPoint.y));
        s.commit();
      }}
    >
      <CanvasStage
        widgets={widgets}
        selection={selection}
        viewport={viewport}
        mode={mode}
        gridVisible={gridVisible}
        gridSize={gridSize}
        animate={animationEnabled}
        onPointerDownWidget={onPointerDownWidget}
        onOpenDrawer={openMachineDrawer}
      />

      {mode === "edit" && (
        <SelectionOverlay
          widgets={widgets}
          selection={selection}
          viewport={viewport}
          onPointerDownResizeHandle={onPointerDownResizeHandle}
          onPointerDownRotateHandle={onPointerDownRotateHandle}
        />
      )}

      {marqueeScreenRect && (
        <div
          className="pointer-events-none absolute rounded-sm border border-primary bg-primary/10"
          style={{
            left: marqueeScreenRect.x,
            top: marqueeScreenRect.y,
            width: marqueeScreenRect.width,
            height: marqueeScreenRect.height,
          }}
        />
      )}
    </div>
  );
}
