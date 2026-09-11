"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Palette } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setControlCenterLocale } from "@/lib/control-center/actions/setControlCenterLocale";
import { LOCALE_NATIVE_LABEL, SUPPORTED_LOCALES } from "@/lib/control-center/constants";
import type { ControlCenterLocale } from "@/lib/control-center/types";
import { SettingsSection, SettingsRow } from "./SettingsSection";

export function AppearanceSettingsForm() {
  const t = useTranslations("AppearanceSettings");
  const activeLocale = useLocale() as ControlCenterLocale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [pendingLocale, setPendingLocale] = useState<ControlCenterLocale>(activeLocale);
  const [theme, setTheme] = useState("dark");

  useEffect(() => setPendingLocale(activeLocale), [activeLocale]);

  function handleLocaleChange(next: ControlCenterLocale) {
    setPendingLocale(next);
    if (next === activeLocale) return;
    startTransition(async () => {
      await setControlCenterLocale(next);
      router.refresh();
    });
  }

  function handleSave() {
    toast.success(t("saveToast"));
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      icon={Palette}
      actions={
        <Button size="sm" variant="outline" onClick={handleSave} disabled={isPending}>
          {t("save")}
        </Button>
      }
    >
      <SettingsRow label={t("languageLabel")}>
        <Select value={pendingLocale} onValueChange={(v) => handleLocaleChange(v as ControlCenterLocale)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {LOCALE_NATIVE_LABEL[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label={t("themeLabel")} description={t("themeDescription")}>
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">{t("themeOptions.dark")}</SelectItem>
            <SelectItem value="light">{t("themeOptions.light")}</SelectItem>
            <SelectItem value="system">{t("themeOptions.system")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsSection>
  );
}
