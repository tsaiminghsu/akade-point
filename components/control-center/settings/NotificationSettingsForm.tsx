"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";

export function NotificationSettingsForm() {
  const t = useTranslations("NotificationSettings");
  const tCommon = useTranslations("Common");
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      icon={Bell}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success(t("saveToast"))}>
          {tCommon("save")}
        </Button>
      }
    >
      <SettingsRow label={t("toastAlerts")} description={t("toastAlertsDescription")}>
        <Switch
          checked={settings.toastAlerts}
          onCheckedChange={(v) => updateSettings(activeStoreId, { toastAlerts: v })}
        />
      </SettingsRow>
      <SettingsRow label={t("emailDigest")} description={t("emailDigestDescription")}>
        <Switch
          checked={settings.emailDigest}
          onCheckedChange={(v) => updateSettings(activeStoreId, { emailDigest: v })}
        />
      </SettingsRow>
      <SettingsRow label={t("criticalOnly")} description={t("criticalOnlyDescription")}>
        <Switch
          checked={settings.criticalOnly}
          onCheckedChange={(v) => updateSettings(activeStoreId, { criticalOnly: v })}
        />
      </SettingsRow>
      <SettingsRow label={t("sound")} description={t("soundDescription")}>
        <Switch checked={settings.sound} onCheckedChange={(v) => updateSettings(activeStoreId, { sound: v })} />
      </SettingsRow>
    </SettingsSection>
  );
}
