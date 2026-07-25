"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMachinesStore } from "@/store/useMachinesStore";
import type { Machine, MachineStatus } from "@/lib/control-center/types";

interface MachineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine?: Machine;
}

const STATUS_OPTIONS: MachineStatus[] = ["online", "warning", "alarm", "offline"];

export function MachineFormDialog({ open, onOpenChange, machine }: MachineFormDialogProps) {
  const stores = useMachinesStore((s) => s.stores);
  const groups = useMachinesStore((s) => s.groups);
  const addMachine = useMachinesStore((s) => s.addMachine);
  const updateMachine = useMachinesStore((s) => s.updateMachine);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);

  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState<MachineStatus>("online");

  const groupsForStore = useMemo(() => groups.filter((g) => g.storeId === storeId), [groups, storeId]);

  useEffect(() => {
    if (!open) return;
    const initialStoreId = machine?.storeId ?? activeStoreId ?? stores[0]?.id ?? "";
    setName(machine?.name ?? "");
    setDeviceId(machine?.deviceId ?? "");
    setStoreId(initialStoreId);
    setGroupId(machine?.groupId ?? groups.find((g) => g.storeId === initialStoreId)?.id ?? "");
    setStatus(machine?.status ?? "online");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, machine]);

  function handleStoreChange(nextStoreId: string) {
    setStoreId(nextStoreId);
    const firstGroup = groups.find((g) => g.storeId === nextStoreId);
    setGroupId(firstGroup?.id ?? "");
  }

  function handleSubmit() {
    if (!name.trim() || !deviceId.trim() || !storeId || !groupId) {
      toast.error("Please fill in all fields");
      return;
    }
    if (machine) {
      updateMachine(machine.id, { name: name.trim(), deviceId: deviceId.trim(), storeId, groupId, status });
    } else {
      addMachine({ name: name.trim(), deviceId: deviceId.trim(), storeId, groupId, status });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{machine ? "Edit Machine" : "Add Machine"}</DialogTitle>
          <DialogDescription>Machines belong to a group within a store.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Machine Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 夾娃娃機 #99" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Device ID</Label>
            <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="e.g. DEV-1A9999" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Store</Label>
              <Select value={storeId} onValueChange={handleStoreChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groupsForStore.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Initial Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as MachineStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{machine ? "Save Changes" : "Create Machine"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
