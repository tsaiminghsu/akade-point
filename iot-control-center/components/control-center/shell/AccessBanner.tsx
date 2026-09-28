"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";

import type { Action } from "@/lib/control-center/access";
import { allowsAt, allowsSomewhere, strongestRole } from "@/lib/control-center/access";
import { useAccessStore } from "@/store/useAccessStore";
import { useMachinesStore } from "@/store/useMachinesStore";

const ROOT = "/iot-control-center";

/** What a page needs beyond reading, by path prefix (most specific first). */
const PAGE_ACTIONS: [string, Action][] = [
  [`${ROOT}/machines`, "store.manage"],
  [`${ROOT}/claw-machines`, "store.manage"],
  [`${ROOT}/stores`, "store.manage"],
  [`${ROOT}/settings`, "store.manage"],
  [`${ROOT}/editor`, "store.manage"],
  [`${ROOT}/alerts`, "alert.handle"],
  [`${ROOT}/vehicles`, "vehicle.command"],
];

/**
 * Tells a user whose role cannot change what this page edits that they are
 * only looking. The API refuses such writes regardless; this saves them the
 * surprise.
 */
export function AccessBanner() {
  const t = useTranslations("Roles");
  const pathname = usePathname() ?? "";
  const { loaded, role, stores } = useAccessStore();
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const rule = PAGE_ACTIONS.find(([prefix]) => pathname.startsWith(prefix));
  const g = { role, stores };
  const shown = strongestRole(g);
  if (!loaded || !shown || !rule) return null;
  // Store pages count the store picked in the top bar; vehicles belong to various stores.
  const allowed = rule[1].startsWith("vehicle.") ? allowsSomewhere(g, rule[1]) : allowsAt(g, rule[1], activeStoreId || null);
  if (allowed) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground" role="status">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      {t("readOnlyBanner", { role: t(shown), need: t(`need_${rule[1].replace(".", "_")}`) })}
    </div>
  );
}
