"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Activity, BarChart3, Gauge, ShieldCheck, Zap } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KPICard } from "@/components/control-center/shared/KPICard";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { StatusBreakdownChart } from "./StatusBreakdownChart";
import { StoreComparisonChart } from "./StoreComparisonChart";
import { AlertActivityChart } from "./AlertActivityChart";
import { TopEventTypesChart } from "./TopEventTypesChart";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useAlertStore } from "@/store/useAlertStore";
import type { MachineStatus } from "@/lib/control-center/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

function dayKey(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
}

export default function AnalyticsPageContent() {
  const t = useTranslations("Analytics");
  const tMachines = useTranslations("Machines");
  const locale = useLocale();
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);
  const events = useMachinesStore((s) => s.events);
  const alerts = useAlertStore((s) => s.alerts);

  const [storeFilter, setStoreFilter] = useState("all");

  const scopedMachines = useMemo(
    () => (storeFilter === "all" ? machines : machines.filter((m) => m.storeId === storeFilter)),
    [machines, storeFilter]
  );
  const scopedAlerts = useMemo(
    () => (storeFilter === "all" ? alerts : alerts.filter((a) => a.storeId === storeFilter)),
    [alerts, storeFilter]
  );
  const scopedEvents = useMemo(
    () => (storeFilter === "all" ? events : events.filter((e) => e.storeId === storeFilter)),
    [events, storeFilter]
  );

  const statusCounts = useMemo(() => {
    const c: Record<MachineStatus, number> = { online: 0, warning: 0, alarm: 0, offline: 0 };
    for (const m of scopedMachines) c[m.status]++;
    return c;
  }, [scopedMachines]);

  const total = scopedMachines.length;
  const uptimePct = total === 0 ? 0 : Math.round((statusCounts.online / total) * 100);
  const avgCurrent = total === 0 ? 0 : scopedMachines.reduce((sum, m) => sum + m.current, 0) / total;

  const last7dAlerts = useMemo(
    () => scopedAlerts.filter((a) => a.createdAt >= Date.now() - 7 * DAY_MS),
    [scopedAlerts]
  );
  const resolutionRate = useMemo(() => {
    if (scopedAlerts.length === 0) return 0;
    const resolvedOrIgnored = scopedAlerts.filter((a) => a.status === "resolved" || a.status === "ignored");
    return Math.round((resolvedOrIgnored.length / scopedAlerts.length) * 100);
  }, [scopedAlerts]);

  const storeComparisonData = useMemo(
    () =>
      stores.map((s) => {
        const storeMachines = machines.filter((m) => m.storeId === s.id);
        return {
          store: s.name,
          online: storeMachines.filter((m) => m.status === "online").length,
          warning: storeMachines.filter((m) => m.status === "warning").length,
          alarm: storeMachines.filter((m) => m.status === "alarm").length,
          offline: storeMachines.filter((m) => m.status === "offline").length,
        };
      }),
    [stores, machines]
  );

  const alertActivityData = useMemo(() => {
    const now = Date.now();
    const buckets: { date: string; info: number; warning: number; critical: number }[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      buckets.push({ date: dayKey(now - i * DAY_MS, locale), info: 0, warning: 0, critical: 0 });
    }
    for (const a of scopedAlerts) {
      const diffDays = Math.floor((now - a.createdAt) / DAY_MS);
      if (diffDays < 0 || diffDays >= WINDOW_DAYS) continue;
      buckets[WINDOW_DAYS - 1 - diffDays][a.severity]++;
    }
    return buckets;
  }, [scopedAlerts, locale]);

  const topEventTypesData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of scopedEvents) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type: type.replace(/_/g, " "), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [scopedEvents]);

  return (
    <div className="flex h-full flex-col overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder={tMachines("allStores")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tMachines("allStores")}</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPICard
          label={t("fleetUptime")}
          value={`${uptimePct}%`}
          icon={ShieldCheck}
          accent="online"
          sub={t("uptimeSub", { online: statusCounts.online, total })}
        />
        <KPICard label={t("avgCurrentDraw")} value={`${avgCurrent.toFixed(1)}A`} icon={Zap} accent="primary" sub={t("avgCurrentSub")} />
        <KPICard label={t("alerts7d")} value={last7dAlerts.length} icon={Activity} accent="alarm" sub={t("alerts7dSub")} />
        <KPICard label={t("resolutionRate")} value={`${resolutionRate}%`} icon={Gauge} accent="muted" sub={t("resolutionSub")} />
      </div>

      {total === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="cc-card cc-glass p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">{t("statusBreakdown")}</h2>
            <StatusBreakdownChart counts={statusCounts} />
          </div>
          <div className="cc-card cc-glass p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">{t("machinesByStore")}</h2>
            <StoreComparisonChart data={storeComparisonData} />
          </div>
          <div className="cc-card cc-glass p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">{t("alertActivity")}</h2>
            <AlertActivityChart data={alertActivityData} />
          </div>
          <div className="cc-card cc-glass p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">{t("topEventTypes")}</h2>
            <TopEventTypesChart data={topEventTypesData} />
          </div>
        </div>
      )}
    </div>
  );
}
