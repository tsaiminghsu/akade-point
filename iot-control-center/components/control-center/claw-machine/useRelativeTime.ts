"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";

/** "剛剛" / "5 分鐘前" / "3 小時前", then a date. */
export function useRelativeTime() {
  const t = useTranslations("ClawConfigs");
  const locale = useLocale();
  return useCallback(
    (ts: number) => {
      const mins = Math.round((Date.now() - ts) / 60000);
      if (mins < 1) return t("justNow");
      if (mins < 60) return t("minutesAgo", { mins });
      const hours = Math.round(mins / 60);
      if (hours < 24) return t("hoursAgo", { hours });
      return new Date(ts).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
    },
    [t, locale]
  );
}
