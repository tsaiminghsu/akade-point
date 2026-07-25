"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ControlCenterSidebar } from "./ControlCenterSidebar";
import { ControlCenterTopNav } from "./ControlCenterTopNav";
import { MachineDetailDrawer } from "@/components/control-center/drawer/MachineDetailDrawer";

export function ControlCenterShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="cc-theme flex h-screen w-full flex-col overflow-hidden">
        <ControlCenterTopNav />
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
