"use client";

import { memo } from "react";

import { cn } from "@/lib/utils";
import type { Widget } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";
import { MachineWidget } from "./widgets/MachineWidget";
import { WidgetContextMenu } from "./WidgetContextMenu";
import {
  ArrowWidget,
  CameraWidget,
  CircleWidget,
  CounterWidget,
  DividerWidget,
  ImageWidget,
  LineWidget,
  MapWidget,
  RectangleWidget,
  TextWidget,
  ZoneWidget,
} from "./widgets/ShapeWidgets";

interface WidgetRendererProps {
  widget: Widget;
  selected: boolean;
  mode: "edit" | "live";
  animate: boolean;
  onPointerDownWidget: (e: React.PointerEvent, widget: Widget) => void;
  onOpenDrawer: (machineId: string) => void;
}

function WidgetContent({ widget, animate }: { widget: Widget; animate: boolean }) {
  const machine = useMachinesStore((s) => (widget.type === "machine" ? s.getMachine(widget.machineId) : undefined));

  switch (widget.type) {
    case "machine":
      return <MachineWidget widget={widget} machine={machine} animate={animate} />;
    case "text":
      return <TextWidget widget={widget} />;
    case "rectangle":
      return <RectangleWidget widget={widget} />;
    case "circle":
      return <CircleWidget widget={widget} />;
    case "zone":
      return <ZoneWidget widget={widget} />;
    case "arrow":
      return <ArrowWidget widget={widget} />;
    case "line":
      return <LineWidget widget={widget} />;
    case "divider":
      return <DividerWidget widget={widget} />;
    case "camera":
      return <CameraWidget widget={widget} />;
    case "image":
      return <ImageWidget widget={widget} />;
    case "counter":
      return <CounterWidget widget={widget} />;
    case "map":
      return <MapWidget widget={widget} />;
    default:
      return null;
  }
}

function WidgetRendererImpl({ widget, selected, mode, animate, onPointerDownWidget, onOpenDrawer }: WidgetRendererProps) {
  if (widget.hidden) return null;

  const node = (
    <div
      className={cn(
        "absolute",
        !widget.locked && mode === "edit" && "cursor-move",
        widget.locked && "cursor-not-allowed"
      )}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        opacity: widget.opacity,
        zIndex: widget.zIndex,
        transform: `translate(-50%, -50%) rotate(${widget.rotation}deg)`,
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        if (mode !== "edit") return;
        e.stopPropagation();
        onPointerDownWidget(e, widget);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (widget.type === "machine") onOpenDrawer(widget.machineId);
      }}
      onClick={(e) => {
        if (mode !== "live") return;
        e.stopPropagation();
        if (widget.type === "machine") onOpenDrawer(widget.machineId);
      }}
      data-widget-id={widget.id}
    >
      <div
        className={cn(
          "h-full w-full rounded-lg ring-offset-0 transition-shadow",
          selected && mode === "edit" && "outline outline-2 outline-offset-2 outline-primary"
        )}
      >
        <WidgetContent widget={widget} animate={animate} />
      </div>
    </div>
  );

  if (mode !== "edit") return node;
  return <WidgetContextMenu widget={widget}>{node}</WidgetContextMenu>;
}

export const WidgetRenderer = memo(WidgetRendererImpl);
