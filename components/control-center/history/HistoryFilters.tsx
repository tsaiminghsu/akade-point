"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MachineEvent } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";

export interface HistoryFilterState {
  dateRange: DateRange | undefined;
  storeId: string;
  machineId: string;
  types: string[];
}

interface HistoryFiltersProps {
  filters: HistoryFilterState;
  onChange: (filters: HistoryFilterState) => void;
  allEvents: MachineEvent[];
}

export function HistoryFilters({ filters, onChange, allEvents }: HistoryFiltersProps) {
  const t = useTranslations("HistoryFilters");
  const tMachines = useTranslations("Machines");
  const locale = useLocale();
  const stores = useMachinesStore((s) => s.stores);
  const machines = useMachinesStore((s) => s.machines);

  const eventTypes = useMemo(() => Array.from(new Set(allEvents.map((e) => e.type))).sort(), [allEvents]);

  const machinesForStore = filters.storeId === "all" ? machines : machines.filter((m) => m.storeId === filters.storeId);

  function toggleType(type: string) {
    const has = filters.types.includes(type);
    onChange({ ...filters, types: has ? filters.types.filter((t) => t !== type) : [...filters.types, type] });
  }

  const hasActiveFilters =
    filters.dateRange?.from || filters.storeId !== "all" || filters.machineId !== "all" || filters.types.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {filters.dateRange?.from
              ? `${filters.dateRange.from.toLocaleDateString(locale)}${
                  filters.dateRange.to ? " – " + filters.dateRange.to.toLocaleDateString(locale) : ""
                }`
              : t("dateRange")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={filters.dateRange}
            onSelect={(range) => onChange({ ...filters, dateRange: range })}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      <Select
        value={filters.storeId}
        onValueChange={(v) => onChange({ ...filters, storeId: v, machineId: "all" })}
      >
        <SelectTrigger className="h-8 w-40">
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

      <Select value={filters.machineId} onValueChange={(v) => onChange({ ...filters, machineId: v })}>
        <SelectTrigger className="h-8 w-44">
          <SelectValue placeholder={t("allMachines")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allMachines")}</SelectItem>
          {machinesForStore.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {t("eventType")} {filters.types.length > 0 && `(${filters.types.length})`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="start">
          <div className="space-y-2">
            {eventTypes.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <Checkbox checked={filters.types.includes(type)} onCheckedChange={() => toggleType(type)} />
                {type}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => onChange({ dateRange: undefined, storeId: "all", machineId: "all", types: [] })}
        >
          <X className="h-3.5 w-3.5" /> {t("clear")}
        </Button>
      )}
    </div>
  );
}
