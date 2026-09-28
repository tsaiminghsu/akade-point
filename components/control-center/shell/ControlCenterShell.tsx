"use client";

import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAccessStore } from "@/store/useAccessStore";
import { ControlCenterSidebar } from "./ControlCenterSidebar";
import { HydrationErrorBanner } from "./HydrationErrorBanner";
import { ControlCenterTopNav } from "./ControlCenterTopNav";
import { MachineDetailDrawer } from "@/components/control-center/drawer/MachineDetailDrawer";
import { useAlertStore } from "@/store/useAlertStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useStoreSettingsStore } from "@/store/useStoreSettingsStore";
import { AccessBanner } from "./AccessBanner";

export function ControlCenterShell({ children }: { children: React.ReactNode }) {
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);

  useEffect(() => {
    void useAccessStore.getState().load();
    void useMachinesStore.getState().hydrate();
    void useAlertStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (activeStoreId) useStoreSettingsStore.getState().hydrateStore(activeStoreId);
  }, [activeStoreId]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="cc-theme flex h-screen w-full flex-col overflow-hidden">
        <ControlCenterTopNav />
        <HydrationErrorBanner />
        <AccessBanner />
        <div className="flex flex-1 overflow-hidden">
          <ControlCenterSidebar />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
        <MachineDetailDrawer />
        <Toaster position="top-right" richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
