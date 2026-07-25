"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, ShieldAlert } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { MachineEvent } from "@/lib/control-center/types";
import { useMachinesStore } from "@/store/useMachinesStore";

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: ShieldAlert } as const;
const SEVERITY_CLASS = {
  info: "text-muted-foreground",
  warning: "text-status-warning",
  critical: "text-status-alarm",
} as const;

const PAGE_SIZE = 20;

export function HistoryTable({ events }: { events: MachineEvent[] }) {
  const [page, setPage] = useState(0);
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageEvents = events.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE);

  if (events.length === 0) {
    return <EmptyState title="No events found" description="Try adjusting your filters or date range." />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageEvents.map((e) => {
              const Icon = SEVERITY_ICON[e.severity];
              const machine = machines.find((m) => m.id === e.machineId);
              const store = stores.find((s) => s.id === e.storeId);
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(e.timestamp).toLocaleString("zh-TW")}
                  </TableCell>
                  <TableCell className="text-xs">{machine?.name ?? e.machineId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{store?.name ?? e.storeId}</TableCell>
                  <TableCell className="text-xs">
                    <span className={cn("flex items-center gap-1.5", SEVERITY_CLASS[e.severity])}>
                      <Icon className="h-3.5 w-3.5" /> {e.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">{e.message}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {pageClamped * PAGE_SIZE + 1}–{Math.min(events.length, (pageClamped + 1) * PAGE_SIZE)} of {events.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={pageClamped === 0}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            Page {pageClamped + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageClamped >= totalPages - 1}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
