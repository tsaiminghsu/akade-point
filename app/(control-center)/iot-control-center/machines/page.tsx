"use client";

import dynamic from "next/dynamic";

import { TableSkeleton } from "@/components/control-center/shared/LoadingSkeletons";

const MachinesPageContent = dynamic(() => import("@/components/control-center/machines/MachinesPageContent"), {
  ssr: false,
  loading: () => (
    <div className="h-full p-4 sm:p-6">
      <div className="mb-6 h-5 w-40 rounded bg-muted/60" />
      <TableSkeleton />
    </div>
  ),
});

export default function MachinesPage() {
  return <MachinesPageContent />;
}
