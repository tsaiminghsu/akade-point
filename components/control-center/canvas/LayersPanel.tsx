"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import { Eye, EyeOff, GripVertical, Lock, Unlock } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import type { WidgetLayerGroup } from "@/lib/control-center/types";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { cn } from "@/lib/utils";

const GROUP_ORDER: WidgetLayerGroup[] = ["overlays", "machines", "texts", "zones", "background"];

interface LayerRowProps {
  id: string;
  name: string;
  locked: boolean;
  hidden: boolean;
  selected: boolean;
}

/**
 * Props are primitives on purpose: a row's appearance doesn't depend on
 * position, so memoising on (id, name, locked, hidden, selected) means a drag
 * re-renders no rows at all. Passing the whole widget defeated that, since every
 * drag frame produces a new widget object.
 */
const LayerRow = memo(function LayerRow({ id, name, locked, hidden, selected }: LayerRowProps) {
  const t = useTranslations("LayersPanel");
  const setSelection = useControlCenterStore((s) => s.setSelection);
  const updateWidget = useControlCenterStore((s) => s.updateWidget);
  const commit = useControlCenterStore((s) => s.commit);
  const reorderWidget = useControlCenterStore((s) => s.reorderWidget);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => e.dataTransfer.setData("application/x-cc-layer-id", id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("application/x-cc-layer-id");
        if (draggedId && draggedId !== id) {
          reorderWidget(draggedId, id);
        }
      }}
      onClick={() => setSelection([id])}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs",
        selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/40",
        hidden && "opacity-50"
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            updateWidget(id, { name: draft || name });
            commit();
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(name);
              setRenaming(false);
            }
          }}
          className="h-6 flex-1 px-1 text-xs"
        />
      ) : (
        <span className="flex-1 truncate" onDoubleClick={() => setRenaming(true)}>
          {name}
        </span>
      )}
      <button
        type="button"
        aria-label={locked ? t("unlockLayer", { name }) : t("lockLayer", { name })}
        onClick={(e) => {
          e.stopPropagation();
          updateWidget(id, { locked: !locked });
          commit();
        }}
        className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:text-primary"
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-30" />}
      </button>
      <button
        type="button"
        aria-label={hidden ? t("showLayer", { name }) : t("hideLayer", { name })}
        onClick={(e) => {
          e.stopPropagation();
          updateWidget(id, { hidden: !hidden });
          commit();
        }}
        className="hover:text-primary"
      >
        {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 opacity-60" />}
      </button>
    </div>
  );
});

export function LayersPanel() {
  const t = useTranslations("LayersPanel");
  const tLayer = useTranslations("LayerGroup");
  const widgets = useControlCenterStore((s) => s.widgets);
  const selection = useControlCenterStore(useShallow((s) => s.selection));
  const selectedIds = new Set(selection);

  if (widgets.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} className="m-3" />;
  }

  return (
    <div className="flex h-64 flex-col border-t border-border bg-card/40">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("title")}</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-2">
          {GROUP_ORDER.map((group) => {
            // Front-most first, matching what the canvas paints.
            const members = widgets
              .filter((w) => w.layerGroup === group)
              .slice()
              .sort((a, b) => b.zIndex - a.zIndex);
            if (members.length === 0) return null;
            return (
              <div key={group}>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {tLayer(group)}
                </p>
                <div className="space-y-0.5">
                  {members.map((w) => (
                    <LayerRow
                      key={w.id}
                      id={w.id}
                      name={w.name}
                      locked={w.locked}
                      hidden={w.hidden}
                      selected={selectedIds.has(w.id)}
                    />
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
