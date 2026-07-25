"use client";

import { useMemo, useState } from "react";
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
import { AlertRow } from "@/components/control-center/alerts/AlertRow";
import { useAlertStore } from "@/store/useAlertStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";
import type { AlertStatus } from "@/lib/control-center/types";

const STATUS_TABS: { value: AlertStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
];

export default function AlertsPageContent() {
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
            <ShieldAlert className="h-5 w-5 text-status-alarm" /> Alert Center
          </h1>
          <p className="text-sm text-muted-foreground">Acknowledge, resolve, or ignore fleet alerts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search alerts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-48"
          />
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
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
            key={tab.value}
            size="sm"
            variant={statusFilter === tab.value ? "secondary" : "ghost"}
            onClick={() => setStatusFilter(tab.value)}
            className="gap-1.5"
          >
            {tab.label}
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{counts[tab.value] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {filtered.length === 0 ? (
          <EmptyState title="No alerts match your filters" description="Try adjusting the status or store filter." />
        ) : (
          <div className="space-y-2 pb-4">
            {filtered.map((a) => (
              <AlertRow key={a.id} alert={a} onOpenMachine={openMachineDrawer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
