"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Pencil, Trash2 } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { StatusBadge } from "@/components/control-center/shared/StatusBadge";
import { MachineFormDialog } from "./MachineFormDialog";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";
import type { Machine } from "@/lib/control-center/types";

const PAGE_SIZE = 20;

export function MachinesTable({ machines }: { machines: Machine[] }) {
  const [page, setPage] = useState(0);
  const stores = useMachinesStore((s) => s.stores);
  const groups = useMachinesStore((s) => s.groups);
  const removeMachine = useMachinesStore((s) => s.removeMachine);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  const [editingMachine, setEditingMachine] = useState<Machine | undefined>(undefined);
  const [deletingMachine, setDeletingMachine] = useState<Machine | undefined>(undefined);

  const totalPages = Math.max(1, Math.ceil(machines.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageMachines = machines.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE);

  if (machines.length === 0) {
    return <EmptyState title="No machines found" description="Try adjusting your filters, or add a new machine." />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Device ID</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Current</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageMachines.map((m) => {
              const store = stores.find((s) => s.id === m.storeId);
              const group = groups.find((g) => g.id === m.groupId);
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.deviceId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{store?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{group?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{m.current.toFixed(1)}A</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openMachineDrawer(m.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditingMachine(m)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-status-alarm"
                      onClick={() => setDeletingMachine(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {pageClamped * PAGE_SIZE + 1}–{Math.min(machines.length, (pageClamped + 1) * PAGE_SIZE)} of{" "}
          {machines.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={pageClamped === 0}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            Page {pageClamped + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageClamped >= totalPages - 1}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <MachineFormDialog open={Boolean(editingMachine)} onOpenChange={(o) => !o && setEditingMachine(undefined)} machine={editingMachine} />

      <ConfirmDialog
        open={Boolean(deletingMachine)}
        onOpenChange={(open) => !open && setDeletingMachine(undefined)}
        title={`Delete '${deletingMachine?.name}'?`}
        description="This cannot be undone. Any canvas widgets bound to it will show as unbound."
        confirmLabel="Delete"
        onConfirm={() => deletingMachine && removeMachine(deletingMachine.id)}
      />
    </div>
  );
}
