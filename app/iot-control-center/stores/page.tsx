"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "@/components/control-center/shared/LoadingSkeletons";

const StoreManagementPageContent = dynamic(
  () => import("@/components/control-center/stores/StoreManagementPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full p-4 sm:p-6">
        <div className="mb-6 h-5 w-40 rounded bg-muted/60" />
        <ListSkeleton />
      </div>
    ),
  }
);

export default function StoreManagementPage() {
  return <StoreManagementPageContent />;
}
