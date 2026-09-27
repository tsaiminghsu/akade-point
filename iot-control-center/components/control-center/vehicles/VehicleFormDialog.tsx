"use client";

import { useEffect, useState } from "react";
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
import { useVehiclesStore } from "@/store/useVehiclesStore";
import type { Vehicle, VehicleType } from "@/lib/control-center/vehicles/types";

interface VehicleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle;
  /** After creating, open this vehicle's drawer on the Setup tab to issue a token. */
  onCreated?: (vehicle: Vehicle) => void;
}

export function VehicleFormDialog({ open, onOpenChange, vehicle, onCreated }: VehicleFormDialogProps) {
  const t = useTranslations("VehicleForm");
  const tCommon = useTranslations("Common");
  const tVeh = useTranslations("Vehicles");
  const addVehicle = useVehiclesStore((s) => s.addVehicle);
  const updateVehicle = useVehiclesStore((s) => s.updateVehicle);

  const [name, setName] = useState("");
  const [type, setType] = useState<VehicleType>("drone");
  const [companionId, setCompanionId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(vehicle?.name ?? "");
    setType(vehicle?.type ?? "drone");
    setCompanionId(vehicle?.companionId ?? "");
    setNotes(vehicle?.notes ?? "");
  }, [open, vehicle]);

  async function handleSubmit() {
    if (!name.trim() || !companionId.trim()) {
      toast.error(t("fillRequired"));
      return;
    }
    if (vehicle) {
      const ok = await updateVehicle(vehicle.id, { name, type, companionId, notes });
      if (ok) onOpenChange(false);
    } else {
      const created = await addVehicle({ name, type, companionId, notes });
      if (created) {
        onOpenChange(false);
        onCreated?.(created);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vehicle ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as VehicleType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drone">{tVeh("drone")}</SelectItem>
                <SelectItem value="rover">{tVeh("rover")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("companionIdLabel")}</Label>
            <Input value={companionId} onChange={(e) => setCompanionId(e.target.value)} placeholder={t("companionIdPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("notesLabel")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {!vehicle && <p className="text-xs text-muted-foreground">{t("tokenHint")}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit}>{vehicle ? t("saveChanges") : t("createVehicle")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
