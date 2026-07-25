"use client";

import type { Viewport, Widget } from "@/lib/control-center/types";
import { WidgetRenderer } from "./WidgetRenderer";

interface CanvasStageProps {
  widgets: Widget[];
  selection: string[];
  viewport: Viewport;
  mode: "edit" | "live";
  gridVisible: boolean;
  gridSize: number;
  animate: boolean;
  onPointerDownWidget: (e: React.PointerEvent, widget: Widget) => void;
  onOpenDrawer: (machineId: string) => void;
}

export function CanvasStage({
  widgets,
  selection,
  viewport,
  mode,
  gridVisible,
  gridSize,
  animate,
  onPointerDownWidget,
  onOpenDrawer,
}: CanvasStageProps) {
  const selectionSet = new Set(selection);

  return (
    <div
      className="absolute left-0 top-0"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: "0 0",
      }}
    >
      {gridVisible && (
        <div
          className="cc-grid-bg absolute"
          style={{
            left: -5000,
            top: -5000,
            width: 15000,
            height: 15000,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          }}
        />
      )}

      {widgets.map((w) => (
        <WidgetRenderer
          key={w.id}
          widget={w}
          selected={selectionSet.has(w.id)}
          mode={mode}
          animate={animate}
          onPointerDownWidget={onPointerDownWidget}
          onOpenDrawer={onOpenDrawer}
        />
      ))}
    </div>
  );
}
