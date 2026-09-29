"use client";

import { useTranslations } from "next-intl";
import { ArrowDownToLine, Ellipsis, Home, Lock, Map as MapIcon, Pause, Play, PlaneTakeoff, Unlock, Video } from "lucide-react";

import type { StripButton } from "@/lib/control-center/vehicles/gcs/flyView";
import { cn } from "@/lib/utils";

const ICON: Record<StripButton["kind"], React.ComponentType<{ className?: string }>> = {
  arm: Unlock,
  disarm: Lock,
  takeoff: PlaneTakeoff,
  land: ArrowDownToLine,
  rtl: Home,
  pause: Pause,
  mission: Play,
};

function StripItem({
  icon: Icon,
  label,
  onClick,
  enabled = true,
  active = false,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  enabled?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={!enabled}
      aria-pressed={active || undefined}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 text-[10px] font-medium leading-tight text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "h-9" : "min-h-10 sm:min-h-12",
        active ? "bg-primary text-primary-foreground" : "hover:bg-white/15",
        !enabled && "opacity-40"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
      {!compact && <span className="w-full break-words text-center">{label}</span>}
    </button>
  );
}

/**
 * QGroundControl's fly-view tool strip: a column of guided actions down the
 * left edge of the map. Actions that don't apply stay visible but dimmed;
 * pressing one opens the slide-to-confirm panel (or says why it can't run).
 */
export function FlyToolStrip({
  buttons,
  onAction,
  missionLabel,
  missionPauses = false,
  compact = false,
  onMore,
  moreOpen,
  video,
}: {
  buttons: StripButton[];
  onAction: (b: StripButton) => void;
  missionLabel?: string;
  /** the mission button pauses a running mission (pause icon) */
  missionPauses?: boolean;
  /** icons only, for a map too short for labelled buttons */
  compact?: boolean;
  onMore: () => void;
  moreOpen: boolean;
  /** when the vehicle has video: which view is main, and the toggle */
  video?: { main: "map" | "video"; toggle: () => void };
}) {
  const t = useTranslations("Gcs.flyView");
  return (
    <nav aria-label={t("stripLabel")} className="flex w-[52px] flex-col gap-0.5 rounded-lg bg-black/70 p-1 shadow-lg backdrop-blur sm:w-[60px]">
      {buttons.map((b) => (
        <StripItem
          key={b.kind}
          icon={b.kind === "mission" && missionPauses ? Pause : ICON[b.kind]}
          label={b.kind === "mission" && missionLabel ? missionLabel : t(`strip_${b.kind}`)}
          enabled={b.enabled}
          compact={compact}
          onClick={() => onAction(b)}
        />
      ))}
      {video && (
        <StripItem
          icon={video.main === "map" ? Video : MapIcon}
          label={video.main === "map" ? t("strip_video") : t("strip_map")}
          compact={compact}
          onClick={video.toggle}
        />
      )}
      <StripItem icon={Ellipsis} label={t("strip_more")} onClick={onMore} active={moreOpen} compact={compact} />
    </nav>
  );
}
