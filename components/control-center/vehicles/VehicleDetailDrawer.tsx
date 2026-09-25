"use client";

import { useTranslations } from "next-intl";
import { Plane, Car, Tag } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LinkStateBadge } from "./LinkStateBadge";
import { VehicleLiveInfo } from "./VehicleLiveInfo";
import { VehicleCommandBar } from "./VehicleCommandBar";
import { VehicleCommandLog } from "./VehicleCommandLog";
import { VehicleTokenPanel } from "./VehicleTokenPanel";
import { MissionList } from "./missions/MissionList";
import { useVehiclesStore } from "@/store/useVehiclesStore";

export function VehicleDetailDrawer() {
  const t = useTranslations("VehicleDrawer");
  const selectedId = useVehiclesStore((s) => s.selectedVehicleId);
  const vehicle = useVehiclesStore((s) => (selectedId ? s.vehiclesById[selectedId] : undefined));
  const selectVehicle = useVehiclesStore((s) => s.selectVehicle);

  const open = Boolean(vehicle);
  const TypeIcon = vehicle?.type === "rover" ? Car : Plane;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && selectVehicle(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {vehicle && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="flex items-center gap-2">
                  <TypeIcon className="h-4 w-4 text-primary" />
                  {vehicle.name}
                </SheetTitle>
                <LinkStateBadge state={vehicle.linkState} />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {vehicle.companionId}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="p-4">
              <Tabs defaultValue="live">
                <TabsList className="w-full">
                  <TabsTrigger value="live" className="flex-1">
                    {t("liveTab")}
                  </TabsTrigger>
                  <TabsTrigger value="commands" className="flex-1">
                    {t("commandsTab")}
                  </TabsTrigger>
                  <TabsTrigger value="missions" className="flex-1">
                    {t("missionsTab")}
                  </TabsTrigger>
                  <TabsTrigger value="setup" className="flex-1">
                    {t("setupTab")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="live" className="space-y-4">
                  <VehicleLiveInfo state={vehicle.state} />
                </TabsContent>

                <TabsContent value="commands" className="space-y-4">
                  <VehicleCommandBar vehicle={vehicle} />
                  <VehicleCommandLog vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="missions" className="space-y-4">
                  <MissionList vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="setup" className="space-y-4">
                  <VehicleTokenPanel vehicle={vehicle} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
