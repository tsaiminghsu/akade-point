"use client";

import { Grid3x3 } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useControlCenterStore } from "@/store/useControlCenterStore";

export function GridSnapSettingsForm() {
  const gridSize = useControlCenterStore((s) => s.gridSize);
  const setGridSize = useControlCenterStore((s) => s.setGridSize);
  const snapEnabled = useControlCenterStore((s) => s.snapEnabled);
  const toggleSnap = useControlCenterStore((s) => s.toggleSnap);
  const gridVisible = useControlCenterStore((s) => s.gridVisible);
  const toggleGrid = useControlCenterStore((s) => s.toggleGrid);
  const animationEnabled = useControlCenterStore((s) => s.animationEnabled);
  const toggleAnimation = useControlCenterStore((s) => s.toggleAnimation);

  return (
    <SettingsSection title="Layout Editor" description="Grid, snapping, and animation behavior for the Control Center canvas" icon={Grid3x3}>
      <SettingsRow label="Grid Size" description={`${gridSize}px`}>
        <div className="w-40">
          <Slider value={[gridSize]} min={8} max={80} step={4} onValueChange={([v]) => setGridSize(v)} />
        </div>
      </SettingsRow>
      <SettingsRow label="Snap to Grid" description="Widgets snap to the grid while dragging or resizing">
        <Switch checked={snapEnabled} onCheckedChange={toggleSnap} />
      </SettingsRow>
      <SettingsRow label="Show Grid" description="Display the background grid on the canvas">
        <Switch checked={gridVisible} onCheckedChange={toggleGrid} />
      </SettingsRow>
      <SettingsRow label="Animations" description="Status pulse/blink animations and transitions">
        <Switch checked={animationEnabled} onCheckedChange={toggleAnimation} />
      </SettingsRow>
    </SettingsSection>
  );
}
