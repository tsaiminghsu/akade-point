"use client";

import dynamic from "next/dynamic";

const ClawConfigsPageContent = dynamic(() => import("@/components/control-center/claw-machine/ClawConfigsPageContent"), {
  ssr: false,
  loading: () => (
    <div className="h-full p-4 sm:p-6">
      <div className="mb-6 h-5 w-40 rounded bg-muted/60" />
      <div className="h-[60vh] rounded-lg bg-muted/30" />
    </div>
  ),
});

export default function ClawMachinesPage() {
  return <ClawConfigsPageContent />;
}
