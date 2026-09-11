"use client";

import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { AlertRow } from "@/components/control-center/alerts/AlertRow";
import { useAlertStore } from "@/store/useAlertStore";

export function MachineAlertHistory({ machineId }: { machineId: string }) {
  const t = useTranslations("MachineAlertHistory");
  const alerts = useAlertStore(useShallow((s) => s.alerts.filter((a) => a.machineId === machineId)));

  if (alerts.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="space-y-2">
      {alerts.slice(0, 15).map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </div>
  );
}
