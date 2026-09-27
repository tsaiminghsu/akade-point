"use client";

import dynamic from "next/dynamic";

const SettingsPageContent = dynamic(() => import("@/components/control-center/settings/SettingsPageContent"), {
  ssr: false,
  loading: () => (
    <div className="h-full p-4 sm:p-6">
      <div className="mb-6 h-5 w-32 rounded bg-muted/60" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-lg border border-border bg-muted/20" />
        ))}
      </div>
    </div>
  ),
});

export default function ControlCenterSettingsPage() {
  return <SettingsPageContent />;
}
