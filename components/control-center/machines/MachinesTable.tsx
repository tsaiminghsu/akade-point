"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Pencil, Trash2 } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { StatusBadge } from "@/components/control-center/shared/StatusBadge";
import { PaginationBar, usePagination } from "@/components/control-center/shared/Pagination";
import { MachineFormDialog } from "./MachineFormDialog";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useUIStore } from "@/store/useUIStore";
import type { Machine } from "@/lib/control-center/types";

export function MachinesTable({ machines }: { machines: Machine[] }) {
  const t = useTranslations("MachinesTable");
  const tCommon = useTranslations("Common");
  const stores = useMachinesStore((s) => s.stores);
  const groups = useMachinesStore((s) => s.groups);
  const removeMachine = useMachinesStore((s) => s.removeMachine);
  const openMachineDrawer = useUIStore((s) => s.openMachineDrawer);

  const [editingMachine, setEditingMachine] = useState<Machine | undefined>(undefined);
  const [deletingMachine, setDeletingMachine] = useState<Machine | undefined>(undefined);

  const pagination = usePagination(machines);

  // Maps, not `find` per row: with a store list of any size the linear lookups
  // made rendering a page O(rows × stores + rows × groups).
  const storeNameById = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  if (machines.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>{tCommon("status")}</TableHead>
              <TableHead>{tCommon("name")}</TableHead>
              <TableHead>{t("deviceId")}</TableHead>
              <TableHead>{t("store")}</TableHead>
              <TableHead>{t("group")}</TableHead>
              <TableHead>{t("current")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((m) => {
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.deviceId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{storeNameById.get(m.storeId) ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{groupNameById.get(m.groupId) ?? "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{m.current.toFixed(1)}A</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("viewMachine", { name: m.name })}
                      onClick={() => openMachineDrawer(m.id)}
                    >
                      <Eye aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("editMachine", { name: m.name })}
                      onClick={() => setEditingMachine(m)}
                    >
                      <Pencil aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-status-alarm"
                      aria-label={t("deleteMachine", { name: m.name })}
                      onClick={() => setDeletingMachine(m)}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <PaginationBar pagination={pagination} />

      <MachineFormDialog open={Boolean(editingMachine)} onOpenChange={(o) => !o && setEditingMachine(undefined)} machine={editingMachine} />

      <ConfirmDialog
        open={Boolean(deletingMachine)}
        onOpenChange={(open) => !open && setDeletingMachine(undefined)}
        title={t("deleteTitle", { name: deletingMachine?.name ?? "" })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => deletingMachine && removeMachine(deletingMachine.id)}
      />
    </div>
  );
}
