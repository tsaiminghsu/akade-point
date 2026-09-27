"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("MqttConfig");
  const tCommon = useTranslations("Common");
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      icon={Wifi}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-status-online/40 bg-status-online/10 text-status-online">
            {t("connected")}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => toast.success(t("saveToast"))}>
            {tCommon("save")}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("brokerAddress")}</Label>
          <Input
            className="h-9"
            value={settings.mqttBroker}
            onChange={(e) => updateSettings(activeStoreId, { mqttBroker: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("topicPattern")}</Label>
          <Input
            className="h-9"
            value={settings.mqttTopic}
            onChange={(e) => updateSettings(activeStoreId, { mqttTopic: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("clientId")}</Label>
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
