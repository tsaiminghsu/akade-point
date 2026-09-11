"use client";

import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Camera,
  Circle,
  Hash,
  Image as ImageIcon,
  Map as MapIcon,
  Minus,
  Cpu,
  Square,
  SeparatorHorizontal,
  Type,
  Shapes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { WIDGET_LIBRARY } from "@/lib/control-center/constants";
import type { WidgetType } from "@/lib/control-center/types";
import { cn } from "@/lib/utils";

const ICONS: Record<WidgetType, LucideIcon> = {
  machine: Cpu,
  text: Type,
  rectangle: Square,
  circle: Circle,
  arrow: ArrowRight,
  zone: Shapes,
  camera: Camera,
  image: ImageIcon,
  counter: Hash,
  map: MapIcon,
  divider: SeparatorHorizontal,
  line: Minus,
};

interface WidgetPaletteProps {
  onAddWidget: (type: WidgetType) => void;
}

export function WidgetPalette({ onAddWidget }: WidgetPaletteProps) {
  const t = useTranslations("WidgetPalette");
  const tType = useTranslations("WidgetType");
  return (
    <div className="flex w-48 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("title")}</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-2 p-2">
          {WIDGET_LIBRARY.map(({ type }) => {
            const Icon = ICONS[type];
            return (
              <button
                key={type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-cc-widget-type", type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onAddWidget(type)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-center transition-colors hover:border-primary/50 hover:bg-primary/10"
                )}
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-[11px] text-foreground">{tType(type)}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <p className="border-t border-border p-2 text-center text-[10px] text-muted-foreground">
        {t("hint")}
      </p>
    </div>
  );
}
