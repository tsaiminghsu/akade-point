"use client";

import { useTranslations } from "next-intl";
import { Grid3x3 } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useControlCenterStore } from "@/store/useControlCenterStore";

export function GridSnapSettingsForm() {
  const t = useTranslations("GridSnapSettings");
  const gridSize = useControlCenterStore((s) => s.gridSize);
  const setGridSize = useControlCenterStore((s) => s.setGridSize);
  const snapEnabled = useControlCenterStore((s) => s.snapEnabled);
  const toggleSnap = useControlCenterStore((s) => s.toggleSnap);
  const gridVisible = useControlCenterStore((s) => s.gridVisible);
  const toggleGrid = useControlCenterStore((s) => s.toggleGrid);
  const animationEnabled = useControlCenterStore((s) => s.animationEnabled);
  const toggleAnimation = useControlCenterStore((s) => s.toggleAnimation);

  return (
    <SettingsSection title={t("title")} description={t("description")} icon={Grid3x3}>
      <SettingsRow label={t("gridSize")} description={`${gridSize}px`}>
        <div className="w-40">
          <Slider value={[gridSize]} min={8} max={80} step={4} onValueChange={([v]) => setGridSize(v)} />
        </div>
      </SettingsRow>
      <SettingsRow label={t("snapToGrid")} description={t("snapToGridDescription")}>
        <Switch checked={snapEnabled} onCheckedChange={toggleSnap} />
      </SettingsRow>
      <SettingsRow label={t("showGrid")} description={t("showGridDescription")}>
        <Switch checked={gridVisible} onCheckedChange={toggleGrid} />
      </SettingsRow>
      <SettingsRow label={t("animation")} description={t("animationDescription")}>
        <Switch checked={animationEnabled} onCheckedChange={toggleAnimation} />
      </SettingsRow>
    </SettingsSection>
  );
}
