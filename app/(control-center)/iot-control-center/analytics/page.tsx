"use client";

import dynamic from "next/dynamic";

import { KpiGridSkeleton } from "@/components/control-center/shared/LoadingSkeletons";

const AnalyticsPageContent = dynamic(() => import("@/components/control-center/analytics/AnalyticsPageContent"), {
  ssr: false,
  loading: () => (
    <div className="h-full p-4 sm:p-6">
      <div className="mb-6 h-5 w-40 rounded bg-muted/60" />
      <KpiGridSkeleton count={4} />
    </div>
  ),
});

export default function AnalyticsPage() {
  return <AnalyticsPageContent />;
}
