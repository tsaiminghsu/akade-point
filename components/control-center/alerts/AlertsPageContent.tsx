"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { PaginationBar, usePagination } from "@/components/control-center/shared/Pagination";
import { AlertRow } from "@/components/control-center/alerts/AlertRow";
import { useAlertStore } from "@/store/useAlertStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";
import type { AlertStatus } from "@/lib/control-center/types";

const STATUS_TABS: (AlertStatus | "all")[] = ["all", "active", "acknowledged", "resolved", "ignored"];

export default function AlertsPageContent() {
  const t = useTranslations("Alerts");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("AlertStatus");
  const tMachines = useTranslations("Machines");
  const alerts = useAlertStore((s) => s.alerts);
  const stores = useMachinesStore((s) => s.stores);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (storeFilter !== "all" && a.storeId !== storeFilter) return false;
      if (query && !a.message.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [alerts, statusFilter, storeFilter, query]);

  // Was rendering the whole filtered list — up to the store's 500-alert cap —
  // each row carrying its own confirm dialog. Machines and History already page.
  const pagination = usePagination(filtered);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: alerts.length };
    for (const s of ["active", "acknowledged", "resolved", "ignored"]) {
      c[s] = alerts.filter((a) => a.status === s).length;
    }
    return c;
  }, [alerts]);

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldAlert className="h-5 w-5 text-status-alarm" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-48"
          />
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

      {filtered.length === 0 ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-2 pb-4">
              {pagination.pageItems.map((a) => (
                <AlertRow key={a.id} alert={a} onOpenMachine={openMachineDrawer} />
              ))}
            </div>
          </div>
          <PaginationBar pagination={pagination} />
        </>
      )}
    </div>
  );
}
