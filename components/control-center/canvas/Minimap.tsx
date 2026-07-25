"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  computeContentBounds,
  computeMinimapProjection,
  screenToCanvas,
  worldToMinimap,
} from "@/lib/control-center/geometry";
import { STATUS_BG_CLASS } from "@/lib/control-center/constants";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";

const MINIMAP_WIDTH = 220;
const MINIMAP_HEIGHT = 150;

interface MinimapProps {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function Minimap({ containerRef }: MinimapProps) {
  const widgets = useControlCenterStore((s) => s.widgets);
  const viewport = useControlCenterStore(useShallow((s) => s.viewport));
  const setViewport = useControlCenterStore((s) => s.setViewport);
  const getMachine = useMachinesStore((s) => s.getMachine);

  const bounds = computeContentBounds(widgets);
  const proj = computeMinimapProjection(bounds, MINIMAP_WIDTH, MINIMAP_HEIGHT);

  const rect = containerRef.current?.getBoundingClientRect();
  const containerW = rect?.width ?? 0;
  const containerH = rect?.height ?? 0;
  const worldTopLeft = screenToCanvas({ x: 0, y: 0 }, viewport);
  const worldBottomRight = screenToCanvas({ x: containerW, y: containerH }, viewport);
  const viewTopLeft = worldToMinimap(worldTopLeft, proj);
  const viewBottomRight = worldToMinimap(worldBottomRight, proj);

  const jumpTo = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      const mmRect = target.getBoundingClientRect();
      const local = { x: clientX - mmRect.left, y: clientY - mmRect.top };
      const world = { x: (local.x - proj.offsetX) / proj.scale, y: (local.y - proj.offsetY) / proj.scale };
      if (!containerRef.current) return;
      const size = containerRef.current.getBoundingClientRect();
      setViewport({
        x: size.width / 2 - world.x * viewport.zoom,
        y: size.height / 2 - world.y * viewport.zoom,
      });
    },
    [proj, setViewport, viewport.zoom, containerRef]
  );

  return (
    <div
      className="cc-glass absolute bottom-3 right-3 overflow-hidden rounded-lg border border-border shadow-lg"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        jumpTo(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) jumpTo(e.clientX, e.clientY, e.currentTarget);
      }}
    >
      <div className="relative h-full w-full bg-background/60">
        {widgets
          .filter((w) => !w.hidden)
          .map((w) => {
            const p = worldToMinimap({ x: w.x, y: w.y }, proj);
            const isMachine = w.type === "machine";
            const machine = isMachine ? getMachine(w.machineId) : undefined;
            return (
              <span
                key={w.id}
                className={
                  "absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full " +
                  (machine ? STATUS_BG_CLASS[machine.status] : "bg-muted-foreground/50")
                }
                style={{ left: p.x, top: p.y }}
              />
            );
          })}
        <div
          className="pointer-events-none absolute border border-primary bg-primary/10"
          style={{
            left: Math.min(viewTopLeft.x, viewBottomRight.x),
            top: Math.min(viewTopLeft.y, viewBottomRight.y),
            width: Math.abs(viewBottomRight.x - viewTopLeft.x),
            height: Math.abs(viewBottomRight.y - viewTopLeft.y),
          }}
        />
      </div>
    </div>
  );
}
