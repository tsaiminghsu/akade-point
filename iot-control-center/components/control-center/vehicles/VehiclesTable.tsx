"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Pencil, Plane, Car, Trash2 } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { PaginationBar, usePagination } from "@/components/control-center/shared/Pagination";
import { LinkStateBadge } from "./LinkStateBadge";
import { VehicleFormDialog } from "./VehicleFormDialog";
import { useVehiclesStore } from "@/store/useVehiclesStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { fixLabel, summarize } from "@/lib/control-center/vehicles/summary";
import type { Vehicle } from "@/lib/control-center/vehicles/types";

function relativeTime(ts: number | null, locale: string, never: string): string {
  if (!ts) return never;
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`;
  return new Date(ts).toLocaleString(locale);
}

export function VehiclesTable({ vehicles }: { vehicles: Vehicle[] }) {
  const t = useTranslations("VehiclesTable");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const removeVehicle = useVehiclesStore((s) => s.removeVehicle);
  const stores = useMachinesStore((s) => s.stores);
  const storeNames = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  const [editing, setEditing] = useState<Vehicle | undefined>(undefined);
  const [deleting, setDeleting] = useState<Vehicle | undefined>(undefined);

  const pagination = usePagination(vehicles);

  if (vehicles.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>{t("link")}</TableHead>
              <TableHead>{tCommon("name")}</TableHead>
              <TableHead>{t("companionId")}</TableHead>
              <TableHead>{t("store")}</TableHead>
              <TableHead>{t("armed")}</TableHead>
              <TableHead>{t("mode")}</TableHead>
              <TableHead>{t("battery")}</TableHead>
              <TableHead>{t("gps")}</TableHead>
              <TableHead>{t("position")}</TableHead>
              <TableHead>{t("lastSeen")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((v) => {
              const s = summarize(v.state);
              const TypeIcon = v.type === "drone" ? Plane : Car;
              return (
                <TableRow key={v.id}>
                  <TableCell>
                    <LinkStateBadge state={v.linkState} />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/iot-control-center/vehicles/${v.id}`} className="flex items-center gap-1.5 hover:text-primary hover:underline">
                      <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" /> {v.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.companionId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{(v.storeId && storeNames.get(v.storeId)) || "—"}</TableCell>
                  <TableCell className="text-xs">{s?.armed == null ? "—" : s.armed ? t("armedYes") : t("armedNo")}</TableCell>
                  <TableCell className="text-xs">{s?.mode ?? "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums">{s?.batPct == null ? "—" : `${Math.round(s.batPct)}%`}</TableCell>
                  <TableCell className="text-xs tabular-nums">{s?.fix == null ? "—" : `${fixLabel(s.fix)} · ${s.sats ?? "—"}`}</TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {s?.pos ? `${s.pos.lat.toFixed(5)}, ${s.pos.lon.toFixed(5)}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{relativeTime(v.lastSeenAt, locale, t("never"))}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon-sm" aria-label={t("view", { name: v.name })}>
                      <Link href={`/iot-control-center/vehicles/${v.id}`}>
                        <Eye aria-hidden className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("edit", { name: v.name })} onClick={() => setEditing(v)}>
                      <Pencil aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-status-alarm"
                      aria-label={t("remove", { name: v.name })}
                      onClick={() => setDeleting(v)}
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

      <VehicleFormDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(undefined)} vehicle={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => deleting && removeVehicle(deleting.id)}
      />
    </div>
  );
}
