"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { PaginationBar, usePagination } from "@/components/control-center/shared/Pagination";
import { cn } from "@/lib/utils";
import type { MachineEvent } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: ShieldAlert } as const;
const SEVERITY_CLASS = {
  info: "text-muted-foreground",
  warning: "text-status-warning",
  critical: "text-status-alarm",
} as const;

export function HistoryTable({ events }: { events: MachineEvent[] }) {
  const t = useTranslations("HistoryTable");
  const tMachinesTable = useTranslations("MachinesTable");
  const locale = useLocale();
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);

  const pagination = usePagination(events);

  // Maps, not `find` per row — a page of 20 events was doing 20 linear scans of
  // the machine list and 20 of the store list on every render.
  const machineNameById = useMemo(() => new Map(machines.map((m) => [m.id, m.name])), [machines]);
  const storeNameById = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  if (events.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="flex flex-col md:h-full">
      {/* Phones: one card per event. */}
      <ul className="space-y-2 md:hidden">
        {pagination.pageItems.map((e) => {
          const Icon = SEVERITY_ICON[e.severity];
          return (
            <li key={e.id} className="rounded-lg border border-border bg-card/60 p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium", SEVERITY_CLASS[e.severity])}>
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> {e.type}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{new Date(e.timestamp).toLocaleString(locale)}</span>
              </div>
              <p className="mt-1 text-foreground">{e.message}</p>
              <p className="mt-1 truncate text-muted-foreground">
                {machineNameById.get(e.machineId) ?? e.machineId} · {storeNameById.get(e.storeId) ?? e.storeId}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="hidden flex-1 overflow-auto rounded-lg border border-border md:block">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>{t("timestamp")}</TableHead>
              <TableHead>{t("machine")}</TableHead>
              <TableHead>{tMachinesTable("store")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("message")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((e) => {
              const Icon = SEVERITY_ICON[e.severity];
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(e.timestamp).toLocaleString(locale)}
                  </TableCell>
                  <TableCell className="text-xs">{machineNameById.get(e.machineId) ?? e.machineId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{storeNameById.get(e.storeId) ?? e.storeId}</TableCell>
                  <TableCell className="text-xs">
                    <span className={cn("flex items-center gap-1.5", SEVERITY_CLASS[e.severity])}>
                      <Icon aria-hidden className="h-3.5 w-3.5" /> {e.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">{e.message}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <PaginationBar pagination={pagination} />
    </div>
  );
}
