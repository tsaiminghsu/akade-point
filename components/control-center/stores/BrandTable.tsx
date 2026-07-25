"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { BrandFormDialog } from "./BrandFormDialog";
import { useMachinesStore } from "@/store/useMachinesStore";
import type { Brand } from "@/lib/control-center/types";

export function BrandTable() {
  const brands = useMachinesStore((s) => s.brands);
  const stores = useMachinesStore((s) => s.stores);
  const removeBrand = useMachinesStore((s) => s.removeBrand);

  const [formOpen, setFormOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | undefined>(undefined);
  const [deletingBrand, setDeletingBrand] = useState<Brand | undefined>(undefined);

  function openCreate() {
    setEditingBrand(undefined);
    setFormOpen(true);
  }
  function openEdit(brand: Brand) {
    setEditingBrand(brand);
    setFormOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> Add Brand
        </Button>
      </div>

      {brands.length === 0 ? (
        <EmptyState title="No brands yet" description="Create a brand to start grouping stores under it." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Stores</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: brand.color }} />
                    {brand.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{brand.description || "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {stores.filter((s) => s.brandId === brand.id).length}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(brand)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-status-alarm"
                    onClick={() => setDeletingBrand(brand)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <BrandFormDialog open={formOpen} onOpenChange={setFormOpen} brand={editingBrand} />

      <ConfirmDialog
        open={Boolean(deletingBrand)}
        onOpenChange={(open) => !open && setDeletingBrand(undefined)}
        title={`Delete '${deletingBrand?.name}'?`}
        description="This cannot be undone. Stores must be reassigned or removed first."
        confirmLabel="Delete"
        onConfirm={() => deletingBrand && removeBrand(deletingBrand.id)}
      />
    </div>
  );
}
