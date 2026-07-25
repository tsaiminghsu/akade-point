"use client";

import { Camera, Grid2x2, MapPin } from "lucide-react";

import type {
  ArrowWidgetData,
  CameraWidgetData,
  CircleWidgetData,
  CounterWidgetData,
  DividerWidgetData,
  ImageWidgetData,
  LineWidgetData,
  MapWidgetData,
  RectangleWidgetData,
  TextWidgetData,
  ZoneWidgetData,
} from "@/lib/control-center/types";

export function TextWidget({ widget }: { widget: TextWidgetData }) {
  return (
    <div
      className="flex h-full w-full select-none items-center"
      style={{ fontSize: widget.fontSize, color: widget.color }}
    >
      {widget.text}
    </div>
  );
}

export function RectangleWidget({ widget }: { widget: RectangleWidgetData }) {
  return (
    <div
      className="h-full w-full rounded-md"
      style={{ background: widget.fill, border: `${widget.strokeWidth}px solid ${widget.stroke}` }}
    />
  );
}

export function CircleWidget({ widget }: { widget: CircleWidgetData }) {
  return (
    <div
      className="h-full w-full rounded-full"
      style={{ background: widget.fill, border: `${widget.strokeWidth}px solid ${widget.stroke}` }}
    />
  );
}

export function ZoneWidget({ widget }: { widget: ZoneWidgetData }) {
  return (
    <div
      className="flex h-full w-full items-start justify-start rounded-lg border-2 border-dashed p-2"
      style={{ background: widget.fill, borderColor: "hsl(var(--primary) / 0.35)" }}
    >
      <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {widget.label}
      </span>
    </div>
  );
}

export function ArrowWidget({ widget }: { widget: ArrowWidgetData }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <marker id={`arrowhead-${widget.id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={widget.stroke} />
        </marker>
      </defs>
      <line
        x1="4"
        y1="20"
        x2="92"
        y2="20"
        stroke={widget.stroke}
        strokeWidth={widget.strokeWidth}
        markerEnd={`url(#arrowhead-${widget.id})`}
      />
    </svg>
  );
}

export function LineWidget({ widget }: { widget: LineWidgetData }) {
  return <div className="h-full w-full" style={{ background: widget.stroke }} />;
}

export function DividerWidget({}: { widget: DividerWidgetData }) {
  return <div className="h-full w-full rounded-full bg-border" />;
}

export function CameraWidget({ widget }: { widget: CameraWidgetData }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-black/40 text-muted-foreground">
      <Camera className="h-5 w-5" />
      <span className="text-[10px]">{widget.label}</span>
    </div>
  );
}

export function ImageWidget({ widget }: { widget: ImageWidgetData }) {
  if (!widget.src) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-[10px] text-muted-foreground">
        Floor plan image
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={widget.src} alt={widget.name} className="h-full w-full rounded-lg object-cover" draggable={false} />;
}

export function CounterWidget({ widget }: { widget: CounterWidgetData }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-card/80">
      <span className="text-lg font-semibold tabular-nums text-foreground">{widget.value}</span>
      <span className="text-[10px] text-muted-foreground">{widget.label}</span>
    </div>
  );
}

export function MapWidget({ widget }: { widget: MapWidgetData }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted/10 text-muted-foreground">
      <Grid2x2 className="h-5 w-5" />
      <span className="flex items-center gap-1 text-[10px]">
        <MapPin className="h-3 w-3" /> {widget.label}
      </span>
    </div>
  );
}
