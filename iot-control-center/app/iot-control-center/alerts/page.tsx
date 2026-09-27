"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "@/components/control-center/shared/LoadingSkeletons";

const AlertsPageContent = dynamic(() => import("@/components/control-center/alerts/AlertsPageContent"), {
  ssr: false,
  loading: () => (
    <div className="h-full p-4 sm:p-6">
      <div className="mb-6 h-5 w-32 rounded bg-muted/60" />
      <ListSkeleton rows={8} />
    </div>
  ),
});

export default function ControlCenterAlertsPage() {
  return <AlertsPageContent />;
}
