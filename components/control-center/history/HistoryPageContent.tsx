"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";

import { useMachinesStore } from "@/store/useMachinesStore";
import { HistoryFilters, type HistoryFilterState } from "./HistoryFilters";
import { HistoryTable } from "./HistoryTable";
import { ExportButtons } from "./ExportButtons";

const DEFAULT_FILTERS: HistoryFilterState = {
  dateRange: undefined,
  storeId: "all",
  machineId: "all",
  types: [],
};

export default function HistoryPageContent() {
  const t = useTranslations("History");
  const events = useMachinesStore((s) => s.events);
  const [filters, setFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filters.storeId !== "all" && e.storeId !== filters.storeId) return false;
      if (filters.machineId !== "all" && e.machineId !== filters.machineId) return false;
      if (filters.types.length > 0 && !filters.types.includes(e.type)) return false;
      if (filters.dateRange?.from) {
        const from = filters.dateRange.from.getTime();
        const to = (filters.dateRange.to ?? filters.dateRange.from).getTime() + 24 * 60 * 60 * 1000;
        if (e.timestamp < from || e.timestamp >= to) return false;
      }
      return true;
    });
  }, [events, filters]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6 md:overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <History className="h-5 w-5 text-primary" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ExportButtons events={filtered} />
      </div>

      <div className="mb-4">
        <HistoryFilters filters={filters} onChange={setFilters} allEvents={events} />
      </div>

      <div className="md:flex-1 md:overflow-hidden">
        <HistoryTable events={filtered} />
      </div>
    </div>
  );
}
