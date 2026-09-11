"use client";

import { useLocale, useTranslations } from "next-intl";
import { Wrench } from "lucide-react";

import { EmptyState } from "@/components/control-center/shared/EmptyState";
import type { MaintenanceRecord } from "@/lib/control-center/types";

export function MachineMaintenanceRecords({ records }: { records: MaintenanceRecord[] }) {
  const t = useTranslations("MachineMaintenanceRecords");
  const locale = useLocale();
  if (records.length === 0) {
    return <EmptyState icon={Wrench} title={t("emptyTitle")} description={t("emptyDescription")} />;
  }
  return (
    <div className="space-y-1.5">
      {records.slice(0, 15).map((r) => (
        <div key={r.id} className="flex items-start gap-2.5 rounded-md border border-border/60 p-2.5 text-xs">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground">{r.description}</p>
            <p className="text-muted-foreground">
              {new Date(r.date).toLocaleDateString(locale)} · {r.technician}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
