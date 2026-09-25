"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, CloudOff, Unplug, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEVICE_POLL_S, deliveryState, settingsSha, type ClawSync, type DeliveryState } from "@/lib/control-center/claw/device";
import type { ClawSettings } from "./game/settings";
import { useRelativeTime } from "./useRelativeTime";

const STYLE: Record<DeliveryState, { icon: LucideIcon; className: string }> = {
  never: { icon: Unplug, className: "text-muted-foreground" },
  applied: { icon: CheckCircle2, className: "text-status-online" },
  pending: { icon: Clock, className: "text-status-warning" },
  offline: { icon: CloudOff, className: "text-muted-foreground" },
  failed: { icon: AlertTriangle, className: "text-status-alarm" },
};

/** Where the saved board settings stand on the machine's own board. */
export function useDelivery(savedSettings: ClawSettings, sync: ClawSync | undefined) {
  const t = useTranslations("ClawConfigs");
  const relativeTime = useRelativeTime();
  const sha = useMemo(() => settingsSha(savedSettings), [savedSettings]);
  // Evaluated on render; the page re-renders whenever the sync poll brings news.
  const { state, online } = deliveryState(sha, sync, Date.now());
  const lastSeen = sync?.pulledAt ? relativeTime(sync.pulledAt) : null;

  let label: string;
  if (state === "never") label = t("deliveryNever");
  else if (state === "applied") label = online ? t("deliveryApplied") : t("deliveryAppliedOffline");
  else if (state === "pending") label = t("deliveryPending", { seconds: DEVICE_POLL_S });
  else if (state === "offline") label = t("deliveryOffline", { time: lastSeen ?? "—" });
  else label = t("deliveryFailed", { code: sync?.lastAck?.code ?? "?" });

  const title = lastSeen ? t("lastSeenTitle", { time: lastSeen }) + (sync?.fw ? ` · ${sync.fw}` : "") : label;
  return { state, online, label, title };
}

export function DeliveryBadge({
  savedSettings,
  sync,
  className,
}: {
  savedSettings: ClawSettings;
  sync: ClawSync | undefined;
  className?: string;
}) {
  const { state, label, title } = useDelivery(savedSettings, sync);
  const { icon: Icon, className: tone } = STYLE[state];
  return (
    <span className={cn("inline-flex items-center gap-1", tone, className)} title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

/** Icon-only form for the machine list; "never" shows nothing to keep the list quiet. */
export function DeliveryIcon({ savedSettings, sync }: { savedSettings: ClawSettings; sync: ClawSync | undefined }) {
  const { state, label, title } = useDelivery(savedSettings, sync);
  if (state === "never") return null;
  const { icon: Icon, className: tone } = STYLE[state];
  return (
    <span className={cn("shrink-0", tone)} title={title}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
