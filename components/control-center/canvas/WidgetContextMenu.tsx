"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Copy,
  Eye,
  EyeOff,
  Lock,
  SendToBack,
  BringToFront,
  Trash2,
  Unlock,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import type { Widget } from "@/lib/control-center/types";

export function WidgetContextMenu({ widget, children }: { widget: Widget; children: React.ReactNode }) {
  const selection = useControlCenterStore((s) => s.selection);
  const setSelection = useControlCenterStore((s) => s.setSelection);
  const bringToFront = useControlCenterStore((s) => s.bringToFront);
  const sendToBack = useControlCenterStore((s) => s.sendToBack);
  const duplicateWidgets = useControlCenterStore((s) => s.duplicateWidgets);
  const removeWidgets = useControlCenterStore((s) => s.removeWidgets);
  const updateWidgets = useControlCenterStore((s) => s.updateWidgets);
  const align = useControlCenterStore((s) => s.align);
  const distribute = useControlCenterStore((s) => s.distribute);

  function activeIds(): string[] {
    return selection.includes(widget.id) ? selection : [widget.id];
  }

  function ensureSelected() {
    if (!selection.includes(widget.id)) setSelection([widget.id]);
  }

  const multi = activeIds().length > 1;

  return (
    <ContextMenu onOpenChange={(open) => open && ensureSelected()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => duplicateWidgets(activeIds())}>
          <Copy className="h-4 w-4" /> Duplicate
          <ContextMenuShortcut>Ctrl D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => bringToFront(activeIds())}>
          <BringToFront className="h-4 w-4" /> Bring to Front
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => sendToBack(activeIds())}>
          <SendToBack className="h-4 w-4" /> Send to Back
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => updateWidgets(activeIds(), { locked: !widget.locked })}>
          {widget.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {widget.locked ? "Unlock" : "Lock"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => updateWidgets(activeIds(), { hidden: !widget.hidden })}>
          {widget.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {widget.hidden ? "Show" : "Hide"}
        </ContextMenuItem>
        {multi && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => align("left")}>
              <AlignStartVertical className="h-4 w-4" /> Align Left
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("center-h")}>
              <AlignCenterVertical className="h-4 w-4" /> Align Center
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("right")}>
              <AlignEndVertical className="h-4 w-4" /> Align Right
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("top")}>
              <AlignStartHorizontal className="h-4 w-4" /> Align Top
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("center-v")}>
              <AlignCenterHorizontal className="h-4 w-4" /> Align Middle
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("bottom")}>
              <AlignEndHorizontal className="h-4 w-4" /> Align Bottom
            </ContextMenuItem>
            {activeIds().length > 2 && (
              <>
                <ContextMenuItem onSelect={() => distribute("horizontal")}>Distribute Horizontally</ContextMenuItem>
                <ContextMenuItem onSelect={() => distribute("vertical")}>Distribute Vertically</ContextMenuItem>
              </>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem className="text-status-alarm" onSelect={() => removeWidgets(activeIds())}>
          <Trash2 className="h-4 w-4" /> Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
