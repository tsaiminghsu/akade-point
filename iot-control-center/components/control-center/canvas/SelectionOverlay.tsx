"use client";

import { RotateCw } from "lucide-react";

import { canvasToScreen, getRotatedCorners, getWidgetAABB, rotateVector } from "@/lib/control-center/geometry";
import type { ResizeHandle, Viewport, Widget } from "@/lib/control-center/types";
import { cn } from "@/lib/utils";

interface SelectionOverlayProps {
  widgets: Widget[];
  selection: string[];
  viewport: Viewport;
  onPointerDownResizeHandle: (e: React.PointerEvent, widgetId: string, handle: ResizeHandle) => void;
  onPointerDownRotateHandle: (e: React.PointerEvent, widgetId: string) => void;
}

const HANDLE_POS: { handle: ResizeHandle; cursor: string }[] = [
  { handle: "nw", cursor: "nwse-resize" },
  { handle: "n", cursor: "ns-resize" },
  { handle: "ne", cursor: "nesw-resize" },
  { handle: "e", cursor: "ew-resize" },
  { handle: "se", cursor: "nwse-resize" },
  { handle: "s", cursor: "ns-resize" },
  { handle: "sw", cursor: "nesw-resize" },
  { handle: "w", cursor: "ew-resize" },
];

export function SelectionOverlay({
  widgets,
  selection,
  viewport,
  onPointerDownResizeHandle,
  onPointerDownRotateHandle,
}: SelectionOverlayProps) {
  const selected = widgets.filter((w) => selection.includes(w.id) && !w.hidden);
  if (selected.length === 0) return null;

  if (selected.length > 1) {
    const boxes = selected.map((w) => getWidgetAABB(w));
    const minX = Math.min(...boxes.map((b) => b.minX));
    const minY = Math.min(...boxes.map((b) => b.minY));
    const maxX = Math.max(...boxes.map((b) => b.maxX));
    const maxY = Math.max(...boxes.map((b) => b.maxY));
    const topLeft = canvasToScreen({ x: minX, y: minY }, viewport);
    const bottomRight = canvasToScreen({ x: maxX, y: maxY }, viewport);
    return (
      <div
        className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary/70"
        style={{
          left: topLeft.x,
          top: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        }}
      />
    );
  }

  const widget = selected[0];
  if (widget.locked) {
    const corners = getRotatedCorners(widget).map((c) => canvasToScreen(c, viewport));
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    return (
      <div
        className="pointer-events-none absolute rounded-sm border-2 border-muted-foreground/60"
        style={{
          left: Math.min(...xs),
          top: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        }}
      />
    );
  }

  const centerCanvas = { x: widget.x, y: widget.y };
  const hw = widget.width / 2;
  const hh = widget.height / 2;

  const localHandlePoints: Record<ResizeHandle, { x: number; y: number }> = {
    nw: { x: -hw, y: -hh },
    n: { x: 0, y: -hh },
    ne: { x: hw, y: -hh },
    e: { x: hw, y: 0 },
    se: { x: hw, y: hh },
    s: { x: 0, y: hh },
    sw: { x: -hw, y: hh },
    w: { x: -hw, y: 0 },
  };

  function toScreen(localX: number, localY: number) {
    const r = rotateVector(localX, localY, widget.rotation);
    return canvasToScreen({ x: centerCanvas.x + r.x, y: centerCanvas.y + r.y }, viewport);
  }

  const rotateHandleLocal = { x: 0, y: -hh - 28 / viewport.zoom };
  const rotateHandleScreen = toScreen(rotateHandleLocal.x, rotateHandleLocal.y);
  const nScreen = toScreen(localHandlePoints.n.x, localHandlePoints.n.y);

  return (
    <>
      <div
        className="pointer-events-none absolute rounded-sm border-2 border-primary"
        style={{
          left: canvasToScreen(centerCanvas, viewport).x,
          top: canvasToScreen(centerCanvas, viewport).y,
          width: widget.width * viewport.zoom,
          height: widget.height * viewport.zoom,
          transform: `translate(-50%, -50%) rotate(${widget.rotation}deg)`,
        }}
      />

      <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible">
        <line x1={nScreen.x} y1={nScreen.y} x2={rotateHandleScreen.x} y2={rotateHandleScreen.y} stroke="hsl(var(--primary))" strokeWidth={1.5} />
      </svg>

      {HANDLE_POS.map(({ handle, cursor }) => {
        const p = toScreen(localHandlePoints[handle].x, localHandlePoints[handle].y);
        return (
          <div
            key={handle}
            onPointerDown={(e) => onPointerDownResizeHandle(e, widget.id, handle)}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-primary bg-background shadow"
            style={{ left: p.x, top: p.y, cursor }}
          />
        );
      })}

      <div
        onPointerDown={(e) => onPointerDownRotateHandle(e, widget.id)}
        className={cn(
          "absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background shadow"
        )}
        style={{ left: rotateHandleScreen.x, top: rotateHandleScreen.y, cursor: "grab" }}
      >
        <RotateCw className="h-3 w-3 text-primary" />
      </div>
    </>
  );
}
