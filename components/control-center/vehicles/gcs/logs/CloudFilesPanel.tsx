"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Cloud, CloudUpload, Download, FileText, History, MapPin, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { formatBytes, type VehicleFileKind, type VehicleFileView } from "@/lib/control-center/vehicles/files";
import type { Vehicle } from "@/lib/control-center/vehicles/types";
import { useCan } from "@/store/useAccessStore";
import { useGcsStore } from "@/store/useGcsStore";
import { useCloudFiles } from "./useCloudFiles";

const KINDS: VehicleFileKind[] = ["photo", "dataflash", "tlog"];

/**
 * What the companion uploaded ([upload] in its config): photos with their
 * geotags, DataFlash logs and flight tlogs. Unlike the files on the Pi these
 * stay reachable when the vehicle is off or out of range.
 */
export function CloudFilesPanel({ vehicle }: { vehicle: Vehicle }) {
  const t = useTranslations("Gcs.cloud");
  const [kind, setKind] = useState<VehicleFileKind>("photo");
  const upload = useGcsStore((s) => s.state?.upload ?? null);
  const mayDelete = useCan("store.manage", vehicle.storeId);
  const list = useCloudFiles(vehicle.id, kind);
  const [deleting, setDeleting] = useState<VehicleFileView | null>(null);

  // A photo or log finished uploading: show it without a manual refresh.
  const sent = upload?.sent ?? 0;
  const lastSent = useRef(sent);
  const { reload } = list;
  useEffect(() => {
    if (sent > lastSent.current) void reload();
    lastSent.current = sent;
  }, [sent, reload]);

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Cloud className="h-4 w-4 text-primary" /> {t("title")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={list.loading} onClick={() => void list.reload()}>
          <RefreshCw className={`h-3.5 w-3.5 ${list.loading ? "animate-spin" : ""}`} /> {t("refresh")}
        </Button>
      </div>

      {upload && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <CloudUpload className="h-3.5 w-3.5 text-primary" />
          {upload.cur ? (
            <span>{t("uploading", { name: upload.cur.name, pct: Math.round(upload.cur.pct) })}</span>
          ) : upload.queue ? (
            <span>{t("queued", { n: upload.queue, size: formatBytes(upload.queueBytes) })}</span>
          ) : (
            <span className="text-muted-foreground">{t("upToDate")}</span>
          )}
          {upload.cur && upload.queue > 1 && <span className="text-muted-foreground">{t("more", { n: upload.queue - 1 })}</span>}
          {upload.error && <span className="text-status-warning">{t(upload.error === "NO_STORAGE" ? "errNoStorage" : "errRetrying", { code: upload.error })}</span>}
        </p>
      )}

      <div className="flex gap-1" role="tablist">
        {KINDS.map((k) => (
          <Button key={k} size="sm" variant={k === kind ? "secondary" : "ghost"} className="h-7 text-xs" role="tab" aria-selected={k === kind} onClick={() => setKind(k)}>
            {t(`kind_${k}`)}
          </Button>
        ))}
      </div>

      {list.storage === null ? (
        <p className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground">{t("noStorage")}</p>
      ) : list.error ? (
        <p className="rounded-md border border-status-alarm/40 p-3 text-xs text-status-alarm">{t("loadFailed")}</p>
      ) : !list.loading && list.files.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t(`none_${kind}`)}</p>
      ) : kind === "photo" ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {list.files.map((f) => (
            <li key={f.fileId} className="group overflow-hidden rounded-md border border-border/60 bg-muted/20 text-[11px]">
              <a href={f.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned / authenticated URLs, not static assets */}
                <img src={f.url ?? ""} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
              </a>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate tabular-nums">{new Date(f.t).toLocaleString()}</p>
                  <p className="flex items-center gap-1 truncate tabular-nums text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {f.geo ? `${f.geo.lat.toFixed(5)}, ${f.geo.lon.toFixed(5)}${f.geo.rel != null ? ` · ${f.geo.rel.toFixed(0)} m` : ""}` : t("noGeo")}
                  </p>
                </div>
                <FileActions f={f} mayDelete={mayDelete} onDelete={() => setDeleting(f)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60 text-xs">
          {list.files.map((f) => (
            <li key={f.fileId} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
              <span className="tabular-nums text-muted-foreground">{formatBytes(f.bytes)}</span>
              <span className="hidden tabular-nums text-muted-foreground sm:inline">{new Date(f.t).toLocaleString()}</span>
              <FileActions f={f} mayDelete={mayDelete} onDelete={() => setDeleting(f)} />
            </li>
          ))}
        </ul>
      )}
      {list.more && (
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={list.loading} onClick={() => void list.loadMore()}>
          <History className="h-3.5 w-3.5" /> {t("older")}
        </Button>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: deleting?.name ?? "" })}
        destructive
        onConfirm={() => {
          const f = deleting;
          setDeleting(null);
          if (f) void list.remove(f.fileId).then((ok) => (ok ? toast.success(t("deleted")) : toast.error(t("deleteFailed"))));
        }}
      />
    </section>
  );
}

function FileActions({ f, mayDelete, onDelete }: { f: VehicleFileView; mayDelete: boolean; onDelete: () => void }) {
  const t = useTranslations("Gcs.cloud");
  return (
    <span className="flex shrink-0 items-center">
      <Button size="icon-sm" variant="ghost" asChild aria-label={t("download", { name: f.name })}>
        <a href={f.downloadUrl ?? "#"} download={f.name}>
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
      {mayDelete && (
        <Button size="icon-sm" variant="ghost" className="text-status-alarm" onClick={onDelete} aria-label={t("delete", { name: f.name })}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </span>
  );
}
