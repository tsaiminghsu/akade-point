"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  HardDrive,
  History as HistoryIcon,
  LayoutDashboard,
  MonitorSmartphone,
  Plane,
  Settings as SettingsIcon,
  ShieldAlert,
  Store as StoreIcon,
  Users as UsersIcon,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { StatusDot } from "@/components/control-center/shared/StatusDot";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";

const ROOT = "/iot-control-center";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional override — the Editor's search-to-locate bar passes its own
   * pan/zoom handler instead of navigating routes. */
  onSelectMachine?: (machineId: string) => void;
}

export function SearchCommand({ open, onOpenChange, onSelectMachine }: SearchCommandProps) {
  const t = useTranslations("SearchCommand");
  const tSidebar = useTranslations("Sidebar");
  const router = useRouter();
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  const storeName = (storeId: string) => stores.find((s) => s.id === storeId)?.name ?? storeId;

  function selectMachine(machineId: string) {
    onOpenChange(false);
    if (onSelectMachine) {
      onSelectMachine(machineId);
    } else {
      openMachineDrawer(machineId);
    }
  }

  function go(path: string) {
    onOpenChange(false);
    router.push(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>
        <CommandGroup heading={t("machinesGroup")}>
          {machines.slice(0, 50).map((m) => (
            <CommandItem
              key={m.id}
              value={`${m.name} ${m.deviceId} ${m.id} ${storeName(m.storeId)}`}
              onSelect={() => selectMachine(m.id)}
            >
              <StatusDot status={m.status} />
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-xs text-muted-foreground">{m.deviceId}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("navigateGroup")}>
          <CommandItem value="dashboard" onSelect={() => go(ROOT)}>
            <LayoutDashboard className="h-4 w-4" /> {tSidebar("dashboard")}
          </CommandItem>
          <CommandItem value="control center editor" onSelect={() => go(`${ROOT}/editor`)}>
            <MonitorSmartphone className="h-4 w-4" /> {tSidebar("controlCenter")}
          </CommandItem>
          <CommandItem value="machines" onSelect={() => go(`${ROOT}/machines`)}>
            <HardDrive className="h-4 w-4" /> {tSidebar("machines")}
          </CommandItem>
          <CommandItem value="vehicles" onSelect={() => go(`${ROOT}/vehicles`)}>
            <Plane className="h-4 w-4" /> {tSidebar("vehicles")}
          </CommandItem>
          <CommandItem value="alerts" onSelect={() => go(`${ROOT}/alerts`)}>
            <ShieldAlert className="h-4 w-4" /> {tSidebar("alerts")}
          </CommandItem>
          <CommandItem value="history" onSelect={() => go(`${ROOT}/history`)}>
            <HistoryIcon className="h-4 w-4" /> {tSidebar("history")}
          </CommandItem>
          <CommandItem value="analytics" onSelect={() => go(`${ROOT}/analytics`)}>
            <BarChart3 className="h-4 w-4" /> {tSidebar("analytics")}
          </CommandItem>
          <CommandItem value="store management" onSelect={() => go(`${ROOT}/stores`)}>
            <StoreIcon className="h-4 w-4" /> {tSidebar("storeManagement")}
          </CommandItem>
          <CommandItem value="users" onSelect={() => go(`${ROOT}/users`)}>
            <UsersIcon className="h-4 w-4" /> {tSidebar("users")}
          </CommandItem>
          <CommandItem value="settings" onSelect={() => go(`${ROOT}/settings`)}>
            <SettingsIcon className="h-4 w-4" /> {tSidebar("settings")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
