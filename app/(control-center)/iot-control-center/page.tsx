"use client";

import dynamic from "next/dynamic";

import { KpiGridSkeleton, ListSkeleton } from "@/components/control-center/shared/LoadingSkeletons";

const DashboardPageContent = dynamic(() => import("@/components/control-center/dashboard/DashboardPageContent"), {
  ssr: false,
  loading: () => (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-6 space-y-2">
        <div className="h-5 w-32 rounded bg-muted/60" />
      </div>
      <div className="space-y-6">
        <KpiGridSkeleton />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ListSkeleton />
          <ListSkeleton />
        </div>
      </div>
    </div>
  ),
});

export default function ControlCenterDashboardPage() {
  return <DashboardPageContent />;
}
