"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plane, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehiclesTable } from "./VehiclesTable";
import { VehicleFormDialog } from "./VehicleFormDialog";

// Leaflet touches window on import.
const FleetMap = dynamic(() => import("./gcs/map/FleetMap").then((m) => m.FleetMap), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-lg bg-muted/40" />,
});
import { useVehiclesStore } from "@/store/useVehiclesStore";
import type { VehicleLinkState, VehicleType } from "@/lib/control-center/vehicles/types";
import { useCan } from "@/store/useAccessStore";

const LINK_TABS: (VehicleLinkState | "all")[] = ["all", "online", "stale", "offline"];

export default function VehiclesPageContent() {
  const mayManage = useCan("vehicle.manage");
  const t = useTranslations("Vehicles");
  const tCommon = useTranslations("Common");
  const tType = useTranslations("Vehicles");
  const tLink = useTranslations("VehicleLink");
  const vehicles = useVehiclesStore((s) => s.vehicles);
  const hydrate = useVehiclesStore((s) => s.hydrate);
  const startPolling = useVehiclesStore((s) => s.startPolling);
  const stopPolling = useVehiclesStore((s) => s.stopPolling);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<VehicleType | "all">("all");
  const [linkFilter, setLinkFilter] = useState<VehicleLinkState | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    void hydrate();
    startPolling();
    return () => stopPolling();
  }, [hydrate, startPolling, stopPolling]);

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (typeFilter !== "all" && v.type !== typeFilter) return false;
      if (linkFilter !== "all" && v.linkState !== linkFilter) return false;
      if (query && !`${v.name} ${v.companionId}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [vehicles, typeFilter, linkFilter, query]);

  const linkCounts = useMemo(() => {
    const c: Record<string, number> = { all: vehicles.length };
    for (const s of ["online", "stale", "offline"]) c[s] = vehicles.filter((v) => v.linkState === s).length;
    return c;
  }, [vehicles]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6 lg:overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Plane className="h-5 w-5 text-primary" /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 w-56" />
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as VehicleType | "all")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTypes")}</SelectItem>
              <SelectItem value="drone">{tType("drone")}</SelectItem>
              <SelectItem value="rover">{tType("rover")}</SelectItem>
            </SelectContent>
          </Select>
          {mayManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> {t("addVehicle")}
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {LINK_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            variant={linkFilter === tab ? "secondary" : "ghost"}
            onClick={() => setLinkFilter(tab)}
            className="gap-1.5"
          >
            {tab === "all" ? tCommon("all") : tLink(tab)}
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{linkCounts[tab] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="h-64 shrink-0 lg:h-auto lg:w-[42%]">
          <FleetMap vehicles={filtered} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <VehiclesTable vehicles={filtered} />
        </div>
      </div>

      <VehicleFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(v) => router.push(`/iot-control-center/vehicles/${v.id}`)}
      />
    </div>
  );
}
