"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { GridSnapSettingsForm } from "./GridSnapSettingsForm";
import { AppearanceSettingsForm } from "./AppearanceSettingsForm";
import { NotificationSettingsForm } from "./NotificationSettingsForm";
import { LayoutDefaultsForm } from "./LayoutDefaultsForm";
import { StoreConfigForm } from "./StoreConfigForm";
import { MqttConfigForm } from "./MqttConfigForm";
import { ApiConfigForm } from "./ApiConfigForm";

export default function SettingsPageContent() {
  const t = useTranslations("Settings");

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <SettingsIcon className="h-5 w-5 text-primary" /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GridSnapSettingsForm />
        <AppearanceSettingsForm />
        <NotificationSettingsForm />
        <LayoutDefaultsForm />
        <StoreConfigForm />
        <MqttConfigForm />
        <div className="xl:col-span-2">
          <ApiConfigForm />
        </div>
      </div>
    </div>
  );
}
