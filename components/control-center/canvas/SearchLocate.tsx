"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchCommand } from "@/components/control-center/shared/SearchCommand";
import { useControlCenterStore } from "@/store/useControlCenterStore";

interface SearchLocateProps {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function SearchLocate({ containerRef }: SearchLocateProps) {
  const t = useTranslations("SearchLocate");
  const [open, setOpen] = useState(false);

  function locateMachine(machineId: string) {
    const s = useControlCenterStore.getState();
    const widget = s.widgets.find((w) => w.type === "machine" && w.machineId === machineId);
    if (!widget) return;
    s.setSelection([widget.id]);
    const rect = containerRef.current?.getBoundingClientRect();
    const containerW = rect?.width ?? 1200;
    const containerH = rect?.height ?? 800;
    const zoom = Math.max(s.viewport.zoom, 1);
    s.setViewport({
      x: containerW / 2 - widget.x * zoom,
      y: containerH / 2 - widget.y * zoom,
      zoom,
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setOpen(true)}>
        <Search className="h-3.5 w-3.5" /> <span className="hidden md:inline">{t("locateMachine")}</span>
      </Button>
      <SearchCommand open={open} onOpenChange={setOpen} onSelectMachine={locateMachine} />
    </>
  );
}
