"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("WidgetContextMenu");
  // One of these is mounted per widget in edit mode, so it must not subscribe to
  // the selection array — that re-rendered every widget's wrapper on every
  // marquee frame. A single derived number is all the menu's shape depends on.
  const activeCount = useControlCenterStore((s) => (s.selection.includes(widget.id) ? s.selection.length : 1));
  const bringToFront = useControlCenterStore((s) => s.bringToFront);
  const sendToBack = useControlCenterStore((s) => s.sendToBack);
  const duplicateWidgets = useControlCenterStore((s) => s.duplicateWidgets);
  const removeWidgets = useControlCenterStore((s) => s.removeWidgets);
  const updateWidgets = useControlCenterStore((s) => s.updateWidgets);
  const align = useControlCenterStore((s) => s.align);
  const distribute = useControlCenterStore((s) => s.distribute);

  /** Read at action time so no subscription is needed. */
  function activeIds(): string[] {
    const { selection } = useControlCenterStore.getState();
    return selection.includes(widget.id) ? selection : [widget.id];
  }

  function ensureSelected() {
    const store = useControlCenterStore.getState();
    if (!store.selection.includes(widget.id)) store.setSelection([widget.id]);
  }

  const multi = activeCount > 1;

  /** The other two lock/hide entry points (PropertyPanel, LayersPanel) commit;
   *  this one didn't, so its change was outside the undo history and the next
   *  Ctrl+Z reverted it as a side effect. */
  function toggleAndCommit(patch: Partial<Widget>) {
    updateWidgets(activeIds(), patch);
    useControlCenterStore.getState().commit();
  }

  return (
    <ContextMenu onOpenChange={(open) => open && ensureSelected()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => duplicateWidgets(activeIds())}>
          <Copy className="h-4 w-4" /> {t("duplicate")}
          <ContextMenuShortcut>Ctrl D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => bringToFront(activeIds())}>
          <BringToFront className="h-4 w-4" /> {t("bringToFront")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => sendToBack(activeIds())}>
          <SendToBack className="h-4 w-4" /> {t("sendToBack")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => toggleAndCommit({ locked: !widget.locked })}>
          {widget.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {widget.locked ? t("unlock") : t("lock")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => toggleAndCommit({ hidden: !widget.hidden })}>
          {widget.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {widget.hidden ? t("show") : t("hide")}
        </ContextMenuItem>
        {multi && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => align("left")}>
              <AlignStartVertical className="h-4 w-4" /> {t("alignLeft")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("center-h")}>
              <AlignCenterVertical className="h-4 w-4" /> {t("alignCenter")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("right")}>
              <AlignEndVertical className="h-4 w-4" /> {t("alignRight")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("top")}>
              <AlignStartHorizontal className="h-4 w-4" /> {t("alignTop")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("center-v")}>
              <AlignCenterHorizontal className="h-4 w-4" /> {t("alignMiddle")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => align("bottom")}>
              <AlignEndHorizontal className="h-4 w-4" /> {t("alignBottom")}
            </ContextMenuItem>
            {activeCount > 2 && (
              <>
                <ContextMenuItem onSelect={() => distribute("horizontal")}>{t("distributeHorizontally")}</ContextMenuItem>
                <ContextMenuItem onSelect={() => distribute("vertical")}>{t("distributeVertically")}</ContextMenuItem>
              </>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem className="text-status-alarm" onSelect={() => removeWidgets(activeIds())}>
          <Trash2 className="h-4 w-4" /> {t("delete")}
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
