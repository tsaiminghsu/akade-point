"use client";

import { useRouter } from "next/navigation";
import {
  BarChart3,
  HardDrive,
  History as HistoryIcon,
  LayoutDashboard,
  MonitorSmartphone,
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
      <CommandInput placeholder="搜尋機台 ID / 名稱 / Device ID / 店家…" />
      <CommandList>
        <CommandEmpty>沒有找到相符的結果。</CommandEmpty>
        <CommandGroup heading="Machines">
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
        <CommandGroup heading="Navigate">
          <CommandItem value="dashboard" onSelect={() => go(ROOT)}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem value="control center editor" onSelect={() => go(`${ROOT}/editor`)}>
            <MonitorSmartphone className="h-4 w-4" /> Control Center
          </CommandItem>
          <CommandItem value="machines" onSelect={() => go(`${ROOT}/machines`)}>
            <HardDrive className="h-4 w-4" /> Machines
          </CommandItem>
          <CommandItem value="alerts" onSelect={() => go(`${ROOT}/alerts`)}>
            <ShieldAlert className="h-4 w-4" /> Alert Center
          </CommandItem>
          <CommandItem value="history" onSelect={() => go(`${ROOT}/history`)}>
            <HistoryIcon className="h-4 w-4" /> History
          </CommandItem>
          <CommandItem value="analytics" onSelect={() => go(`${ROOT}/analytics`)}>
            <BarChart3 className="h-4 w-4" /> Analytics
          </CommandItem>
          <CommandItem value="store management" onSelect={() => go(`${ROOT}/stores`)}>
            <StoreIcon className="h-4 w-4" /> Store Management
          </CommandItem>
          <CommandItem value="users" onSelect={() => go(`${ROOT}/users`)}>
            <UsersIcon className="h-4 w-4" /> Users
          </CommandItem>
          <CommandItem value="settings" onSelect={() => go(`${ROOT}/settings`)}>
            <SettingsIcon className="h-4 w-4" /> Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
