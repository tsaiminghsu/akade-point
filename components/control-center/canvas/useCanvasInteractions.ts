"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { screenToCanvas, snapValue, angleFromCenter, resizeFromHandle, clamp } from "@/lib/control-center/geometry";
import { getWidgetAABB, aabbIntersects, pointsToAABB } from "@/lib/control-center/geometry";
import type { Point, ResizeHandle, Widget } from "@/lib/control-center/types";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { MIN_ZOOM, MAX_ZOOM } from "@/lib/control-center/constants";

type Interaction =
  | { type: "pan"; startScreen: Point; startViewport: { x: number; y: number } }
  | { type: "marquee"; startCanvas: Point; currentCanvas: Point; additive: boolean }
  | { type: "drag"; startCanvas: Point; starts: Record<string, { x: number; y: number }> }
  | { type: "resize"; widgetId: string; handle: ResizeHandle; startWidget: Widget }
  | { type: "rotate"; widgetId: string; startPointerAngle: number; startRotation: number };

export function useCanvasInteractions(containerRef: React.MutableRefObject<HTMLDivElement | null>) {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marqueeScreenRect, setMarqueeScreenRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const interactionRef = useRef<Interaction | null>(null);
  const [, forceRender] = useState(0);

  const store = useControlCenterStore;

  const toScreenPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [containerRef]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
        e.preventDefault();
        setSpaceHeld(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const screenPoint = toScreenPoint(e);
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      store.getState().zoomAt(screenPoint, factor);
    },
    [store, toScreenPoint]
  );

  const onPointerDownBackground = useCallback(
    (e: React.PointerEvent) => {
      const s = store.getState();
      if (s.mode !== "edit") return;
      const screenPoint = toScreenPoint(e);
      const isMiddle = e.button === 1;
      const isPanGesture = spaceHeld || isMiddle;

      (e.target as Element).setPointerCapture?.(e.pointerId);

      if (isPanGesture) {
        interactionRef.current = { type: "pan", startScreen: screenPoint, startViewport: { x: s.viewport.x, y: s.viewport.y } };
        return;
      }

      const canvasPoint = screenToCanvas(screenPoint, s.viewport);
      if (!e.shiftKey) s.clearSelection();
      interactionRef.current = { type: "marquee", startCanvas: canvasPoint, currentCanvas: canvasPoint, additive: e.shiftKey };
      setMarqueeScreenRect({ x: screenPoint.x, y: screenPoint.y, width: 0, height: 0 });
    },
    [store, toScreenPoint, spaceHeld]
  );

  const onPointerDownWidget = useCallback(
    (e: React.PointerEvent, widget: Widget) => {
      const s = store.getState();
      if (s.mode !== "edit") return;
      (e.target as Element).setPointerCapture?.(e.pointerId);

      const additive = e.shiftKey;
      let nextSelection: string[];
      if (additive) {
        nextSelection = s.selection.includes(widget.id)
          ? s.selection.filter((id) => id !== widget.id)
          : [...s.selection, widget.id];
      } else {
        nextSelection = s.selection.includes(widget.id) ? s.selection : [widget.id];
      }
      s.setSelection(nextSelection);

      if (widget.locked) return;

      const screenPoint = toScreenPoint(e);
      const canvasPoint = screenToCanvas(screenPoint, s.viewport);
      const starts: Record<string, { x: number; y: number }> = {};
      for (const w of s.widgets) {
        if (nextSelection.includes(w.id)) starts[w.id] = { x: w.x, y: w.y };
      }
      interactionRef.current = { type: "drag", startCanvas: canvasPoint, starts };
    },
    [store, toScreenPoint]
  );

  const onPointerDownResizeHandle = useCallback(
    (e: React.PointerEvent, widgetId: string, handle: ResizeHandle) => {
      e.stopPropagation();
      const s = store.getState();
      const widget = s.widgets.find((w) => w.id === widgetId);
      if (!widget) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      interactionRef.current = { type: "resize", widgetId, handle, startWidget: widget };
    },
    [store]
  );

  const onPointerDownRotateHandle = useCallback(
    (e: React.PointerEvent, widgetId: string) => {
      e.stopPropagation();
      const s = store.getState();
      const widget = s.widgets.find((w) => w.id === widgetId);
      if (!widget) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const screenPoint = toScreenPoint(e);
      const canvasPoint = screenToCanvas(screenPoint, s.viewport);
      const startPointerAngle = angleFromCenter({ x: widget.x, y: widget.y }, canvasPoint);
      interactionRef.current = { type: "rotate", widgetId, startPointerAngle, startRotation: widget.rotation };
    },
    [store, toScreenPoint]
  );

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const s = store.getState();
      const screenPoint = toScreenPoint(e);

      if (interaction.type === "pan") {
        const dx = screenPoint.x - interaction.startScreen.x;
        const dy = screenPoint.y - interaction.startScreen.y;
        s.setViewport({ x: interaction.startViewport.x + dx, y: interaction.startViewport.y + dy });
        return;
      }

      const canvasPoint = screenToCanvas(screenPoint, s.viewport);

      if (interaction.type === "marquee") {
        interactionRef.current = { ...interaction, currentCanvas: canvasPoint };
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const startScreen = { x: interaction.startCanvas.x * s.viewport.zoom + s.viewport.x, y: interaction.startCanvas.y * s.viewport.zoom + s.viewport.y };
          setMarqueeScreenRect({
            x: Math.min(startScreen.x, screenPoint.x),
            y: Math.min(startScreen.y, screenPoint.y),
            width: Math.abs(screenPoint.x - startScreen.x),
            height: Math.abs(screenPoint.y - startScreen.y),
          });
        }
        const marqueeBounds = pointsToAABB([interaction.startCanvas, canvasPoint]);
        const hitIds = s.widgets.filter((w) => !w.hidden && aabbIntersects(getWidgetAABB(w), marqueeBounds)).map((w) => w.id);
        const base = interaction.additive ? s.selection.filter((id) => !hitIds.includes(id)) : [];
        s.setSelection(Array.from(new Set([...base, ...hitIds])));
        return;
      }

      if (interaction.type === "drag") {
        let dx = canvasPoint.x - interaction.startCanvas.x;
        let dy = canvasPoint.y - interaction.startCanvas.y;
        if (s.snapEnabled) {
          const ids = Object.keys(interaction.starts);
          if (ids.length > 0) {
            const first = interaction.starts[ids[0]];
            dx = snapValue(first.x + dx, s.gridSize) - first.x;
            dy = snapValue(first.y + dy, s.gridSize) - first.y;
          }
        }
        const positions: Record<string, { x: number; y: number }> = {};
        for (const [id, start] of Object.entries(interaction.starts)) {
          positions[id] = { x: start.x + dx, y: start.y + dy };
        }
        s.setWidgetPositions(positions);
        return;
      }

      if (interaction.type === "resize") {
        const result = resizeFromHandle(interaction.startWidget, interaction.handle, canvasPoint);
        if (s.snapEnabled) {
          result.width = Math.max(8, snapValue(result.width, s.gridSize));
          result.height = Math.max(8, snapValue(result.height, s.gridSize));
        }
        s.updateWidget(interaction.widgetId, result);
        return;
      }

      if (interaction.type === "rotate") {
        const widget = s.widgets.find((w) => w.id === interaction.widgetId);
        if (!widget) return;
        const currentAngle = angleFromCenter({ x: widget.x, y: widget.y }, canvasPoint);
        let rotation = interaction.startRotation + (currentAngle - interaction.startPointerAngle);
        rotation = ((rotation % 360) + 360) % 360;
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        s.updateWidget(interaction.widgetId, { rotation });
      }
    }

    function onPointerUp() {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const s = store.getState();
      if (interaction.type === "drag" || interaction.type === "resize" || interaction.type === "rotate") {
        s.commit();
      }
      interactionRef.current = null;
      setMarqueeScreenRect(null);
      forceRender((n) => n + 1);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [store, toScreenPoint, containerRef]);

  const isPanning = interactionRef.current?.type === "pan";

  return {
    spaceHeld,
    isPanning,
    marqueeScreenRect,
    onWheel,
    onPointerDownBackground,
    onPointerDownWidget,
    onPointerDownResizeHandle,
    onPointerDownRotateHandle,
  };
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}
