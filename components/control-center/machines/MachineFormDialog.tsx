"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { useCanAt } from "@/store/useAccessStore";
import type { Machine, MachineStatus } from "@/lib/control-center/types";

interface MachineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine?: Machine;
}

const STATUS_OPTIONS: MachineStatus[] = ["online", "warning", "alarm", "offline"];

export function MachineFormDialog({ open, onOpenChange, machine }: MachineFormDialogProps) {
  const t = useTranslations("MachineForm");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const mayManageAt = useCanAt("store.manage");
  const allStores = useMachinesStore((s) => s.stores);
  // Only stores this user manages (per-store roles); the API refuses the rest.
  const stores = useMemo(() => allStores.filter((s) => mayManageAt(s.id)), [allStores, mayManageAt]);
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
    const initialStoreId = machine?.storeId ?? (stores.some((s) => s.id === activeStoreId) ? activeStoreId : stores[0]?.id) ?? "";
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

  async function handleSubmit() {
    if (!name.trim() || !deviceId.trim() || !storeId || !groupId) {
      toast.error(t("fillAllFields"));
      return;
    }
    const ok = machine
      ? await updateMachine(machine.id, { name: name.trim(), deviceId: deviceId.trim(), storeId, groupId, status })
      : (await addMachine({ name: name.trim(), deviceId: deviceId.trim(), storeId, groupId, status })) !== null;
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{machine ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("deviceIdLabel")}</Label>
            <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder={t("deviceIdPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("storeLabel")}</Label>
              <Select value={storeId} onValueChange={handleStoreChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectStore")} />
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
              <Label className="text-xs text-muted-foreground">{t("groupLabel")}</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectGroup")} />
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
            <Label className="text-xs text-muted-foreground">{t("statusLabel")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as MachineStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit}>{machine ? t("saveChanges") : t("createMachine")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
