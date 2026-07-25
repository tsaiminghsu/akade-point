"use client";

import { useEffect, useState } from "react";
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

  function handleSubmit() {
    if (!name.trim() || !brandId) return;
    if (!brands.some((b) => b.id === brandId)) {
      toast.error("Please select a brand");
      return;
    }
    if (store) {
      updateStore(store.id, { name: name.trim(), address: address.trim(), brandId });
    } else {
      addStore({ name: name.trim(), address: address.trim(), brandId });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{store ? "Edit Store" : "Add Store"}</DialogTitle>
          <DialogDescription>Stores belong to a brand and contain machines.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 台北信義旗艦店" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Store address" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Brand</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a brand" />
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
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !brandId}>
            {store ? "Save Changes" : "Create Store"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
