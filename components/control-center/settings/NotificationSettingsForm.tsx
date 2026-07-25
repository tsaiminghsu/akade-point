"use client";

import { Bell } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";

export function NotificationSettingsForm() {
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title="Notifications"
      description="Choose how you're notified about alerts and events"
      icon={Bell}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success("Notification preferences saved")}>
          Save
        </Button>
      }
    >
      <SettingsRow label="Toast alerts" description="Show a toast in the top-right when a new alert fires">
        <Switch
          checked={settings.toastAlerts}
          onCheckedChange={(v) => updateSettings(activeStoreId, { toastAlerts: v })}
        />
      </SettingsRow>
      <SettingsRow label="Daily email digest" description="Summary of events and alerts sent every morning">
        <Switch
          checked={settings.emailDigest}
          onCheckedChange={(v) => updateSettings(activeStoreId, { emailDigest: v })}
        />
      </SettingsRow>
      <SettingsRow label="Critical alerts only" description="Suppress warning-level notifications">
        <Switch
          checked={settings.criticalOnly}
          onCheckedChange={(v) => updateSettings(activeStoreId, { criticalOnly: v })}
        />
      </SettingsRow>
      <SettingsRow label="Sound" description="Play a sound when a critical alert fires">
        <Switch checked={settings.sound} onCheckedChange={(v) => updateSettings(activeStoreId, { sound: v })} />
      </SettingsRow>
    </SettingsSection>
  );
}
