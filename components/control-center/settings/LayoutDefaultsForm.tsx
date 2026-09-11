"use client";

import { useTranslations } from "next-intl";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection, SettingsRow } from "./SettingsSection";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";
import type { EditorMode, MachineWidgetSize } from "@/lib/control-center/types";

export function LayoutDefaultsForm() {
  const t = useTranslations("LayoutDefaults");
  const tCommon = useTranslations("Common");
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const settings = useStoreSettingsStore((s) => s.getSettings(activeStoreId));
  const updateSettings = useStoreSettingsStore((s) => s.updateSettings);

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      icon={LayoutTemplate}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success(t("saveToast"))}>
          {tCommon("save")}
        </Button>
      }
    >
      <SettingsRow label={t("widgetSizeLabel")}>
        <Select
          value={settings.defaultWidgetSize}
          onValueChange={(v) => updateSettings(activeStoreId, { defaultWidgetSize: v as MachineWidgetSize })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">{t("small")}</SelectItem>
            <SelectItem value="medium">{t("medium")}</SelectItem>
            <SelectItem value="large">{t("large")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label={t("modeLabel")}>
        <Select
          value={settings.defaultMode}
          onValueChange={(v) => updateSettings(activeStoreId, { defaultMode: v as EditorMode })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edit">{t("editMode")}</SelectItem>
            <SelectItem value="live">{t("liveMode")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}
