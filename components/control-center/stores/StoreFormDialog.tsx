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
import { useMachinesStore } from "@/store/useMachinesStore";
import type { Store } from "@/lib/control-center/types";

interface StoreFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store?: Store;
}

export function StoreFormDialog({ open, onOpenChange, store }: StoreFormDialogProps) {
  const t = useTranslations("StoreForm");
  const tCommon = useTranslations("Common");
  const brands = useMachinesStore((s) => s.brands);
  const addStore = useMachinesStore((s) => s.addStore);
  const updateStore = useMachinesStore((s) => s.updateStore);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [brandId, setBrandId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setName(store?.name ?? "");
      setAddress(store?.address ?? "");
      setBrandId(store?.brandId ?? brands[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store]);

  async function handleSubmit() {
    if (!name.trim() || !brandId) return;
    if (!brands.some((b) => b.id === brandId)) {
      toast.error(t("selectBrandError"));
      return;
    }
    const ok = store
      ? await updateStore(store.id, { name: name.trim(), address: address.trim(), brandId })
      : (await addStore({ name: name.trim(), address: address.trim(), brandId })) !== null;
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{store ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("addressLabel")}</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("addressPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("brandLabel")}</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectBrand")} />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
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
          <Button onClick={handleSubmit} disabled={!name.trim() || !brandId}>
            {store ? t("saveChanges") : t("createStore")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
