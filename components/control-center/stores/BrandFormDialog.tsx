"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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
import { Textarea } from "@/components/ui/textarea";
import { useMachinesStore } from "@/store/useMachinesStore";
import type { Brand } from "@/lib/control-center/types";

const SWATCHES = ["#38bdf8", "#f59e0b", "#22c55e", "#ef4444", "#a855f7", "#ec4899"];

interface BrandFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand;
}

export function BrandFormDialog({ open, onOpenChange, brand }: BrandFormDialogProps) {
  const t = useTranslations("BrandForm");
  const tCommon = useTranslations("Common");
  const addBrand = useMachinesStore((s) => s.addBrand);
  const updateBrand = useMachinesStore((s) => s.updateBrand);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? "");
      setDescription(brand?.description ?? "");
      setColor(brand?.color ?? SWATCHES[0]);
    }
  }, [open, brand]);

  async function handleSubmit() {
    if (!name.trim()) return;
    const ok = brand
      ? await updateBrand(brand.id, { name: name.trim(), description: description.trim(), color })
      : (await addBrand({ name: name.trim(), description: description.trim(), color })) !== null;
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{brand ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("descriptionLabel")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("colorLabel")}</Label>
            <div className="flex gap-2">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className="h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-all"
                  style={{ background: swatch, boxShadow: color === swatch ? `0 0 0 2px ${swatch}` : undefined }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {brand ? t("saveChanges") : t("createBrand")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
