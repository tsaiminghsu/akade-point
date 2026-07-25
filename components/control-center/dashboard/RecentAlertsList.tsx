"use client";

import { ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { AlertRow } from "@/components/control-center/alerts/AlertRow";
import { useAlertStore } from "@/store/useAlertStore";
import { useUIStore } from "@/store/useUIStore";
import Link from "next/link";

export function RecentAlertsList() {
  const alerts = useAlertStore((s) => s.alerts);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  return (
    <Card className="cc-glass">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert className="h-4 w-4 text-status-alarm" /> Alerts
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link href="/iot-control-center/alerts">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <EmptyState title="No alerts" description="Your fleet is healthy." />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto custom-scrollbar pr-1">
            {alerts.slice(0, 10).map((a) => (
              <AlertRow key={a.id} alert={a} onOpenMachine={openMachineDrawer} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
