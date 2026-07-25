"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Eye, EyeOff, GripVertical, Lock, Unlock } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { LAYER_GROUP_LABEL } from "@/lib/control-center/constants";
import type { Widget, WidgetLayerGroup } from "@/lib/control-center/types";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { cn } from "@/lib/utils";

const GROUP_ORDER: WidgetLayerGroup[] = ["overlays", "machines", "texts", "zones", "background"];

function LayerRow({ widget, selected }: { widget: Widget; selected: boolean }) {
  const setSelection = useControlCenterStore((s) => s.setSelection);
  const updateWidget = useControlCenterStore((s) => s.updateWidget);
  const commit = useControlCenterStore((s) => s.commit);
  const reorderWidget = useControlCenterStore((s) => s.reorderWidget);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(widget.name);

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => e.dataTransfer.setData("application/x-cc-layer-id", widget.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("application/x-cc-layer-id");
        if (draggedId && draggedId !== widget.id) {
          reorderWidget(draggedId, widget.id);
        }
      }}
      onClick={() => setSelection([widget.id])}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs",
        selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/40",
        widget.hidden && "opacity-50"
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            updateWidget(widget.id, { name: draft || widget.name });
            commit();
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(widget.name);
              setRenaming(false);
            }
          }}
          className="h-6 flex-1 px-1 text-xs"
        />
      ) : (
        <span className="flex-1 truncate" onDoubleClick={() => setRenaming(true)}>
          {widget.name}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          updateWidget(widget.id, { locked: !widget.locked });
          commit();
        }}
        className="opacity-0 group-hover:opacity-100 hover:text-primary"
      >
        {widget.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-30" />}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          updateWidget(widget.id, { hidden: !widget.hidden });
          commit();
        }}
        className="hover:text-primary"
      >
        {widget.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 opacity-60" />}
      </button>
    </div>
  );
}

export function LayersPanel() {
  const widgets = useControlCenterStore((s) => s.widgets);
  const selection = useControlCenterStore(useShallow((s) => s.selection));

  if (widgets.length === 0) {
    return <EmptyState title="No layers" description="Add a widget to see it here." className="m-3" />;
  }

  return (
    <div className="flex h-64 flex-col border-t border-border bg-card/40">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-2">
          {GROUP_ORDER.map((group) => {
            const members = widgets.filter((w) => w.layerGroup === group).slice().reverse();
            if (members.length === 0) return null;
            return (
              <div key={group}>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {LAYER_GROUP_LABEL[group]}
                </p>
                <div className="space-y-0.5">
                  {members.map((w) => (
                    <LayerRow key={w.id} widget={w} selected={selection.includes(w.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
