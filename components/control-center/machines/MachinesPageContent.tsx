"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { HardDrive, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MachinesTable } from "./MachinesTable";
import { MachineFormDialog } from "./MachineFormDialog";
import { useMachinesStore } from "@/store/useMachinesStore";
import type { MachineStatus } from "@/lib/control-center/types";

const STATUS_TABS: (MachineStatus | "all")[] = ["all", "online", "warning", "alarm", "offline"];

export default function MachinesPageContent() {
  const t = useTranslations("Machines");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);
  const groups = useMachinesStore((s) => s.groups);

  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<MachineStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  const groupsForStore = storeFilter === "all" ? groups : groups.filter((g) => g.storeId === storeFilter);

  const filtered = useMemo(() => {
    return machines.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (storeFilter !== "all" && m.storeId !== storeFilter) return false;
      if (groupFilter !== "all" && m.groupId !== groupFilter) return false;
      if (query && !`${m.name} ${m.deviceId}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [machines, statusFilter, storeFilter, groupFilter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: machines.length };
    for (const s of ["online", "warning", "alarm", "offline"]) {
      c[s] = machines.filter((m) => m.status === s).length;
    }
    return c;
  }, [machines]);

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <HardDrive className="h-5 w-5 text-primary" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 w-56" />
          <Select
            value={storeFilter}
            onValueChange={(v) => {
              setStoreFilter(v);
              setGroupFilter("all");
            }}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder={t("allStores")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStores")}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder={t("allGroups")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allGroups")}</SelectItem>
              {groupsForStore.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> {t("addMachine")}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            variant={statusFilter === tab ? "secondary" : "ghost"}
            onClick={() => setStatusFilter(tab)}
            className="gap-1.5"
          >
            {tab === "all" ? tCommon("all") : tStatus(tab)}
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{counts[tab] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        <MachinesTable machines={filtered} />
      </div>

      <MachineFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
