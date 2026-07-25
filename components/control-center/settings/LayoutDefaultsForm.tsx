"use client";

import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";
import type { EditorMode, MachineWidgetSize } from "@/lib/control-center/types";

export function LayoutDefaultsForm() {
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title="Layout Defaults"
      description="Defaults applied when a new Control Center layout is created"
      icon={LayoutTemplate}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success("Layout defaults saved")}>
          Save
        </Button>
      }
    >
      <SettingsRow label="Default machine widget size">
        <Select
          value={settings.defaultWidgetSize}
          onValueChange={(v) => updateSettings(activeStoreId, { defaultWidgetSize: v as MachineWidgetSize })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label="Default mode on open">
        <Select
          value={settings.defaultMode}
          onValueChange={(v) => updateSettings(activeStoreId, { defaultMode: v as EditorMode })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edit">Edit Mode</SelectItem>
            <SelectItem value="live">Live Mode</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}
