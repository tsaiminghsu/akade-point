"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cpu, Joystick, MapPin, Radio, Tag } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/control-center/shared/StatusBadge";
// This drawer is mounted on every Control Center route, so a static import
// would pull the whole charting library into the shared shell chunk even on
// pages that never open it.
const MachineCurrentChart = dynamic(() => import("./MachineCurrentChart").then((m) => m.MachineCurrentChart), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-lg bg-muted/40" />,
});
import { MachineLiveInfo } from "./MachineLiveInfo";
import { MachineEventsList } from "./MachineEventsList";
import { MachineAlertHistory } from "./MachineAlertHistory";
import { MachineMaintenanceRecords } from "./MachineMaintenanceRecords";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";

export function MachineDetailDrawer() {
  const t = useTranslations("MachineDrawer");
  const machineId = useUIStore((s) => s.drawerMachineId);
  const closeMachineDrawer = useUIStore((s) => s.closeMachineDrawer);
  const machine = useMachinesStore((s) => (machineId ? s.getMachine(machineId) : undefined));
  const store = useMachinesStore((s) => (machine ? s.stores.find((st) => st.id === machine.storeId) : undefined));
  const group = useMachinesStore((s) => (machine ? s.groups.find((g) => g.id === machine.groupId) : undefined));
  const events = useMachinesStore(
    useShallow((s) => (machineId ? s.events.filter((e) => e.machineId === machineId) : []))
  );
  const maintenanceRecords = useMachinesStore(
    useShallow((s) => (machineId ? s.maintenanceRecords.filter((r) => r.machineId === machineId) : []))
  );

  const open = Boolean(machine);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeMachineDrawer()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {machine && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  {machine.name}
                </SheetTitle>
                <StatusBadge status={machine.status} />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {machine.deviceId}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {store?.name}
                </span>
                <span className="flex items-center gap-1">
                  <Radio className="h-3 w-3" /> {group?.name}
                </span>
              </SheetDescription>
              <Button asChild variant="outline" size="sm" className="mt-2 self-start">
                <Link
                  href={`/iot-control-center/claw-machines?machine=${encodeURIComponent(machine.id)}`}
                  onClick={closeMachineDrawer}
                >
                  <Joystick className="mr-1.5 h-4 w-4" /> {t("clawConfig")}
                </Link>
              </Button>
            </SheetHeader>

            <div className="p-4">
              <Tabs defaultValue="live">
                <TabsList className="w-full">
                  <TabsTrigger value="live" className="flex-1">
                    {t("liveTab")}
                  </TabsTrigger>
                  <TabsTrigger value="overview" className="flex-1">
                    {t("overviewTab")}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">
                    {t("historyTab")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="live" className="space-y-4">
                  <div className="cc-card cc-glass p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t("currentLabel")}</p>
                    <MachineCurrentChart data={machine.currentHistory} />
                  </div>
                  <MachineLiveInfo machine={machine} />
                </TabsContent>

                <TabsContent value="overview" className="space-y-4">
                  <div className="cc-card cc-glass grid grid-cols-2 gap-y-3 p-4 text-sm">
                    <span className="text-muted-foreground">{t("machineName")}</span>
                    <span className="text-right text-foreground">{machine.name}</span>
                    <span className="text-muted-foreground">{t("deviceId")}</span>
                    <span className="text-right text-foreground">{machine.deviceId}</span>
                    <span className="text-muted-foreground">{t("store")}</span>
                    <span className="text-right text-foreground">{store?.name}</span>
                    <span className="text-muted-foreground">{t("group")}</span>
                    <span className="text-right text-foreground">{group?.name}</span>
                    <span className="text-muted-foreground">{t("firmware")}</span>
                    <span className="text-right text-foreground">{machine.firmware}</span>
                    <span className="text-muted-foreground">{t("restartCount")}</span>
                    <span className="text-right text-foreground">{machine.restartCount}</span>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t("recentEvents")}</p>
                    <MachineEventsList events={events} />
                  </div>
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t("alertHistory")}</p>
                    <MachineAlertHistory machineId={machine.id} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t("maintenanceRecords")}</p>
                    <MachineMaintenanceRecords records={maintenanceRecords} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
