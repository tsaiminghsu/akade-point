"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { StoreFormDialog } from "./StoreFormDialog";
import { StoreMembersDialog } from "./StoreMembersDialog";
import { useMachinesStore } from "@/store/useMachinesStore";
import type { Store } from "@/lib/control-center/types";
import { useCan, useCanAt } from "@/store/useAccessStore";

export function StoreTable() {
  // Creating and deleting stores is for global store-admins; a store's own admins may edit it.
  const mayManage = useCan("store.manage");
  const mayManageAt = useCanAt("store.manage");
  const mayMembersAt = useCanAt("store.members");
  const t = useTranslations("StoreTable");
  const tCommon = useTranslations("Common");
  const stores = useMachinesStore((s) => s.stores);
  const brands = useMachinesStore((s) => s.brands);
  const machines = useMachinesStore((s) => s.machines);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const setActiveStore = useMachinesStore((s) => s.setActiveStore);
  const removeStore = useMachinesStore((s) => s.removeStore);

  const [formOpen, setFormOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | undefined>(undefined);
  const [deletingStore, setDeletingStore] = useState<Store | undefined>(undefined);
  const [membersOf, setMembersOf] = useState<Store | null>(null);

  function openCreate() {
    setEditingStore(undefined);
    setFormOpen(true);
  }
  function openEdit(store: Store) {
    setEditingStore(store);
    setFormOpen(true);
  }

  const rowActions = (store: Store) => (
    <>
      {store.id !== activeStoreId && (
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveStore(store.id)}>
          {t("switchTo")}
        </Button>
      )}
      {mayMembersAt(store.id) && (
        <Button variant="ghost" size="icon-sm" onClick={() => setMembersOf(store)} aria-label={t("members", { name: store.name })} title={t("members", { name: store.name })}>
          <Users className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" disabled={!mayManageAt(store.id)} onClick={() => openEdit(store)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-status-alarm"
        disabled={!mayManage}
        onClick={() => setDeletingStore(store)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate} disabled={brands.length === 0 || !mayManage}>
          <Plus className="h-3.5 w-3.5" /> {t("addStore")}
        </Button>
      </div>

      {stores.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
        {/* Phones: one card per store instead of a table wider than the screen. */}
        <ul className="space-y-2 md:hidden">
          {stores.map((store) => {
            const brand = brands.find((b) => b.id === store.brandId);
            return (
              <li key={store.id} className="rounded-lg border border-border bg-card/60 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 break-words font-medium text-foreground">
                      {store.name}
                      {store.id === activeStoreId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {store.address || "—"} · {brand?.name ?? "—"} · {t("machines")} {machines.filter((m) => m.storeId === store.id).length}
                    </p>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-end gap-0.5">{rowActions(store)}</div>
              </li>
            );
          })}
        </ul>
        <Table className="min-w-[640px] [&_th]:whitespace-nowrap" wrapperClassName="hidden md:block">
          <TableHeader>
            <TableRow>
              <TableHead>{t("store")}</TableHead>
              <TableHead>{t("address")}</TableHead>
              <TableHead>{t("brand")}</TableHead>
              <TableHead>{t("machines")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((store) => {
              const brand = brands.find((b) => b.id === store.brandId);
              return (
                <TableRow key={store.id}>
                  <TableCell>
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {store.name}
                      {store.id === activeStoreId && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{store.address || "—"}</TableCell>
                  <TableCell>
                    {brand ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: brand.color }} />
                        {brand.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {machines.filter((m) => m.storeId === store.id).length}
                  </TableCell>
                  <TableCell className="text-right">{rowActions(store)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </>
      )}

      <StoreFormDialog open={formOpen} onOpenChange={setFormOpen} store={editingStore} />
      <StoreMembersDialog
        storeId={membersOf?.id ?? ""}
        storeName={membersOf?.name ?? ""}
        open={membersOf !== null}
        onOpenChange={(o) => !o && setMembersOf(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingStore)}
        onOpenChange={(open) => !open && setDeletingStore(undefined)}
        title={t("deleteTitle", { name: deletingStore?.name ?? "" })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => deletingStore && removeStore(deletingStore.id)}
      />
    </div>
  );
}
