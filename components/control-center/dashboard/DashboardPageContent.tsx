"use client";

import { KpiGrid } from "@/components/control-center/dashboard/KpiGrid";
import { RecentEventsList } from "@/components/control-center/dashboard/RecentEventsList";
import { RecentAlertsList } from "@/components/control-center/dashboard/RecentAlertsList";

export default function DashboardPageContent() {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview of your device fleet</p>
      </div>

      <div className="space-y-6">
        <KpiGrid />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RecentEventsList />
          <RecentAlertsList />
        </div>
      </div>
    </div>
  );
}
