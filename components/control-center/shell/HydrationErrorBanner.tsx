"use client";

import { useTranslations } from "next-intl";
import { AlertOctagon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAlertStore } from "@/store/useAlertStore";
import { useMachinesStore } from "@/store/useMachinesStore";

/**
 * Shown when the shell's initial data fetch failed. Without it a failed fetch
 * is indistinguishable from a healthy-but-empty deployment: the dashboard shows
 * zeros, the machine list shows "no machines" and the Alert Center reads as
 * "all clear". A strip is used rather than replacing the page so routes that
 * don't depend on this data (e.g. Users, which loads server-side) stay usable.
 */
export function HydrationErrorBanner() {
  const t = useTranslations("ErrorState");
  const machinesFailed = useMachinesStore((s) => s.hydrateError);
  const alertsFailed = useAlertStore((s) => s.hydrateError);

  if (!machinesFailed && !alertsFailed) return null;

  function retry() {
    if (machinesFailed) void useMachinesStore.getState().hydrate();
    if (alertsFailed) void useAlertStore.getState().hydrate();
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-status-alarm/30 bg-status-alarm/10 px-4 py-2"
    >
      <p className="flex items-center gap-2 text-xs text-foreground">
        <AlertOctagon aria-hidden className="h-4 w-4 shrink-0 text-status-alarm" />
        <span className="font-medium">{t("title")}</span>
        <span className="text-muted-foreground">{t("description")}</span>
      </p>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={retry}>
        <RefreshCw aria-hidden className="h-3.5 w-3.5" />
        {t("retry")}
      </Button>
    </div>
  );
}
