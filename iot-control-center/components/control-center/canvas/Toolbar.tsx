"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Download,
  Grid3x3,
  LayoutGrid,
  Magnet,
  Maximize,
  Pencil,
  Radio,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { SearchLocate } from "./SearchLocate";
import { LayoutVersionsMenu } from "./LayoutVersionsMenu";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useLayoutVersionsStore } from "@/store/useLayoutVersionsStore";
import { deserializeLayout, downloadTextFile, serializeLayout } from "@/lib/control-center/export";
import type { Widget } from "@/lib/control-center/types";

interface ToolbarProps {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={active ? "secondary" : "ghost"} size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({ containerRef }: ToolbarProps) {
  const t = useTranslations("Toolbar");
  const canUndo = useControlCenterStore((s) => s.canUndo());
  const canRedo = useControlCenterStore((s) => s.canRedo());
  const undo = useControlCenterStore((s) => s.undo);
  const redo = useControlCenterStore((s) => s.redo);
  const save = useControlCenterStore((s) => s.save);
  const discard = useControlCenterStore((s) => s.discard);
  const isDirty = useControlCenterStore((s) => s.isDirty);
  const autoArrange = useControlCenterStore((s) => s.autoArrange);
  const snapEnabled = useControlCenterStore((s) => s.snapEnabled);
  const toggleSnap = useControlCenterStore((s) => s.toggleSnap);
  const gridVisible = useControlCenterStore((s) => s.gridVisible);
  const toggleGrid = useControlCenterStore((s) => s.toggleGrid);
  const zoomIn = useControlCenterStore((s) => s.zoomIn);
  const zoomOut = useControlCenterStore((s) => s.zoomOut);
  const fitToScreen = useControlCenterStore((s) => s.fitToScreen);
  const mode = useControlCenterStore((s) => s.mode);
  const setMode = useControlCenterStore((s) => s.setMode);
  const loadWidgets = useControlCenterStore((s) => s.loadWidgets);
  const zoom = useControlCenterStore((s) => s.viewport.zoom);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const updateActiveVersion = useLayoutVersionsStore((s) => s.updateActiveVersion);

  const [discardOpen, setDiscardOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!activeStoreId) return;
    // Only clear the dirty flag once the server actually has the layout —
    // otherwise a failed write left an error toast next to a disabled Save
    // button, with the work unrecoverable.
    const ok = await updateActiveVersion(activeStoreId, useControlCenterStore.getState().widgets);
    if (ok) save();
  }

  function centerPoint() {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 400, y: 300 };
  }

  function handleFit() {
    const rect = containerRef.current?.getBoundingClientRect();
    fitToScreen({ width: rect?.width ?? 1200, height: rect?.height ?? 800 });
  }

  // Phones open on a sliver of a layout drawn for a wide screen: show all of it on each load.
  const savedWidgets = useControlCenterStore((s) => s.savedWidgets);
  useEffect(() => {
    if (savedWidgets && window.matchMedia("(max-width: 767px)").matches) handleFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedWidgets]);

  function handleExport() {
    // Read at click time: subscribing to `widgets` would re-render the whole
    // toolbar on every frame of every drag.
    downloadTextFile(`layout-${Date.now()}.json`, serializeLayout(useControlCenterStore.getState().widgets));
    toast.success(t("exported"));
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported: Widget[] = deserializeLayout(String(reader.result));
        loadWidgets(imported);
        toast.success(t("imported", { count: imported.length }));
      } catch {
        toast.error(t("invalidFile"));
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card/60 px-2 py-1 md:h-12 md:flex-nowrap md:overflow-x-auto md:overflow-y-hidden md:py-0 custom-scrollbar">
      {/* Editing tools: phones can't edit the layout (see mobileHint), so they only get the view tools. */}
      <div className="hidden items-center gap-1 md:contents">
      <ToolbarIconButton label={t("undo")} onClick={undo} disabled={!canUndo}>
        <Undo2 className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t("redo")} onClick={redo} disabled={!canRedo}>
        <Redo2 className="h-4 w-4" />
      </ToolbarIconButton>

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      <Button size="sm" variant="ghost" className="shrink-0 gap-1.5" onClick={handleSave} disabled={!isDirty}>
        <Save className="h-4 w-4" /> <span className="hidden lg:inline">{t("save")}</span>
      </Button>
      <Button size="sm" variant="ghost" className="shrink-0 gap-1.5 text-muted-foreground" onClick={() => setDiscardOpen(true)}>
        <RotateCcw className="h-4 w-4" /> <span className="hidden lg:inline">{t("discard")}</span>
      </Button>
      <Button size="sm" variant="ghost" className="shrink-0 gap-1.5" onClick={autoArrange}>
        <LayoutGrid className="h-4 w-4" /> <span className="hidden lg:inline">{t("autoArrange")}</span>
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      <LayoutVersionsMenu />

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      <ToolbarIconButton label={t("snapToGrid")} onClick={toggleSnap} active={snapEnabled}>
        <Magnet className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t("showGrid")} onClick={toggleGrid} active={gridVisible}>
        <Grid3x3 className="h-4 w-4" />
      </ToolbarIconButton>

      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />
      </div>

      <ToolbarIconButton label={t("zoomOut")} onClick={() => zoomOut(centerPoint())}>
        <ZoomOut className="h-4 w-4" />
      </ToolbarIconButton>
      <span className="w-10 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <ToolbarIconButton label={t("zoomIn")} onClick={() => zoomIn(centerPoint())}>
        <ZoomIn className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t("fitScreen")} onClick={handleFit}>
        <Maximize className="h-4 w-4" />
      </ToolbarIconButton>

      <div className="hidden items-center gap-1 md:contents">
      <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />

      <ToolbarIconButton label={t("exportLayout")} onClick={handleExport}>
        <Download className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t("importLayout")} onClick={() => fileInputRef.current?.click()}>
        <Upload className="h-4 w-4" />
      </ToolbarIconButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          e.target.value = "";
        }}
      />
      </div>

      <div className="min-w-2 flex-1" />

      <div className="shrink-0">
        <SearchLocate containerRef={containerRef} />
      </div>

      <Separator orientation="vertical" className="mx-1 hidden h-6 shrink-0 md:block" />

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as "edit" | "live")}
        variant="outline"
        className="shrink-0"
      >
        <ToggleGroupItem value="edit" className="gap-1.5 px-3 text-xs">
          <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("editMode")}</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="live" className="gap-1.5 px-3 text-xs">
          <Radio className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("liveMode")}</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("discardTitle")}
        description={t("discardDescription")}
        confirmLabel={t("discard")}
        onConfirm={discard}
      />
    </div>
  );
}
