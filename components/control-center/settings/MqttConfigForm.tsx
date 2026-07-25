"use client";

import { Wifi } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";

export function MqttConfigForm() {
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title="MQTT Configuration"
      description="Broker connection used for real-time device telemetry (placeholder)"
      icon={Wifi}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-status-online/40 bg-status-online/10 text-status-online">
            Connected
          </Badge>
          <Button size="sm" variant="outline" onClick={() => toast.success("MQTT configuration saved")}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Broker URL</Label>
          <Input
            className="h-9"
            value={settings.mqttBroker}
            onChange={(e) => updateSettings(activeStoreId, { mqttBroker: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Topic Pattern</Label>
          <Input
            className="h-9"
            value={settings.mqttTopic}
            onChange={(e) => updateSettings(activeStoreId, { mqttTopic: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Client ID</Label>
          <Input
            className="h-9"
            value={settings.mqttClientId}
            onChange={(e) => updateSettings(activeStoreId, { mqttClientId: e.target.value })}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
