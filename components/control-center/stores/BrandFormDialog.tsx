"use client";

import { useEffect, useState } from "react";

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

  function handleSubmit() {
    if (!name.trim()) return;
    if (brand) {
      updateBrand(brand.id, { name: name.trim(), description: description.trim(), color });
    } else {
      addBrand({ name: name.trim(), description: description.trim(), color });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{brand ? "Edit Brand" : "Add Brand"}</DialogTitle>
          <DialogDescription>Brands group one or more stores together.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AKADE 娛樂集團" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Color</Label>
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
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {brand ? "Save Changes" : "Create Brand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
