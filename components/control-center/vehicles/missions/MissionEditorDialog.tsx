"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAV_CMD_LABELS, MAV_FRAME_LABELS } from "@/lib/control-center/vehicles/constants";
import { missionItemSchema } from "@/lib/control-center/vehicles/schemas";
import type { MissionItem, VehicleMission } from "@/lib/control-center/vehicles/types";
import { useVehiclesStore } from "@/store/useVehiclesStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  mission?: VehicleMission;
  /** Pre-seeded items (e.g. from an import) when creating a new mission. */
  seedItems?: MissionItem[];
  seedName?: string;
}

const CMD_OPTIONS = Object.entries(MAV_CMD_LABELS).map(([n, label]) => ({ value: Number(n), label }));
const FRAME_OPTIONS = Object.entries(MAV_FRAME_LABELS).map(([n, label]) => ({ value: Number(n), label }));

function blankItem(seq: number): MissionItem {
  return { seq, cur: 0, frame: 3, cmd: 16, p1: 0, p2: 0, p3: 0, p4: 0, lat: 0, lon: 0, alt: 0, ac: 1 };
}

export function MissionEditorDialog({ open, onOpenChange, vehicleId, mission, seedItems, seedName }: Props) {
  const t = useTranslations("VehicleMissions");
  const tCommon = useTranslations("Common");
  const createMission = useVehiclesStore((s) => s.createMission);
  const updateMission = useVehiclesStore((s) => s.updateMission);

  const [name, setName] = useState("");
  const [items, setItems] = useState<MissionItem[]>([]);

  useEffect(() => {
    if (!open) return;
    if (mission) {
      setName(mission.name);
      setItems(mission.items);
    } else {
      setName(seedName ?? "Mission");
      setItems(seedItems && seedItems.length > 0 ? seedItems : [{ ...blankItem(0), cur: 1, frame: 0 }]);
    }
  }, [open, mission, seedItems, seedName]);

  function reseq(list: MissionItem[]): MissionItem[] {
    return list.map((it, i) => ({ ...it, seq: i }));
  }
  function patchRow(i: number, patch: Partial<MissionItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addRow() {
    setItems((prev) => reseq([...prev, blankItem(prev.length)]));
  }
  function removeRow(i: number) {
    setItems((prev) => reseq(prev.filter((_, idx) => idx !== i)));
  }
  function move(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return reseq(next);
    });
  }

  async function save() {
    for (const it of items) {
      if (!missionItemSchema.safeParse(it).success) {
        toast.error(`Invalid item at seq ${it.seq}`);
        return;
      }
    }
    const ok = mission ? await updateMission(vehicleId, mission.id, { name, items }) : Boolean(await createMission(vehicleId, name, items, "editor"));
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("editorTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>{t("nameLabel")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1.5">{t("seq")}</th>
                <th className="px-2 py-1.5">{t("command")}</th>
                <th className="px-2 py-1.5">{t("frame")}</th>
                <th className="px-2 py-1.5">{t("lat")}</th>
                <th className="px-2 py-1.5">{t("lon")}</th>
                <th className="px-2 py-1.5">{t("alt")}</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-2 py-1 text-muted-foreground">{it.seq === 0 ? t("home") : it.seq}</td>
                  <td className="px-2 py-1">
                    <Select value={String(it.cmd)} onValueChange={(v) => patchRow(i, { cmd: Number(v) })}>
                      <SelectTrigger className="h-7 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CMD_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={String(o.value)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <Select value={String(it.frame)} onValueChange={(v) => patchRow(i, { frame: Number(v) })}>
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FRAME_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={String(o.value)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <Input className="h-7 w-24 text-xs" value={it.lat} onChange={(e) => patchRow(i, { lat: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <Input className="h-7 w-24 text-xs" value={it.lon} onChange={(e) => patchRow(i, { lon: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <Input className="h-7 w-16 text-xs" value={it.alt} onChange={(e) => patchRow(i, { alt: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-0.5">
                      <Button size="icon-sm" variant="ghost" aria-label={t("moveUp")} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("moveDown")} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-status-alarm"
                        aria-label={t("removeRow")}
                        disabled={it.seq === 0}
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> {t("addRow")}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={save}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
