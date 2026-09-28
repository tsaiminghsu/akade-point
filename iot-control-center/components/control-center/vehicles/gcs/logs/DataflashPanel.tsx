"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CloudDownload, Download, HardDriveDownload, ListRestart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Vehicle } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

interface LogEntry {
  id: number;
  size: number;
  utc: number;
  name: string;
  onPi: boolean;
}

const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

function eta(left: number, bps: number): string {
  if (bps <= 0) return "—";
  const s = Math.round(left / bps);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/**
 * DataFlash logs on the autopilot's SD card, copied over MAVLink to the
 * companion (log_download) and from there to the browser over the direct
 * link. Only while disarmed: ArduPilot refuses otherwise.
 */
export function DataflashPanel({ vehicle, canCommand }: { vehicle: Vehicle; canCommand: boolean }) {
  const t = useTranslations("Gcs.logs");
  const sendAndWait = useGcsStore((s) => s.sendAndWait);
  const send = useGcsStore((s) => s.send);
  const fileFetch = useGcsStore((s) => s.fileFetch);
  const armed = useGcsStore((s) => s.state?.armed === true);
  const progress = useGcsStore((s) => s.state?.logdl ?? null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [listing, setListing] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);
  const [onPi, setOnPi] = useState<Set<string>>(new Set());

  const loadPi = useCallback(async () => {
    if (!vehicle.directUrl) return;
    const res = await fileFetch("/files/logs");
    if (res?.ok) {
      const body = (await res.json()) as { files: { name: string }[] };
      setOnPi(new Set(body.files.map((f) => f.name)));
    }
  }, [vehicle.directUrl, fileFetch]);

  useEffect(() => {
    void loadPi();
  }, [loadPi]);

  async function list() {
    setListing(true);
    const c = await sendAndWait({ type: "log_list" }, { timeoutMs: 35_000 });
    setListing(false);
    if (c?.status !== "acked") {
      toast.error(t("dfListFailed", { reason: c?.msg || c?.code || "—" }));
      return;
    }
    setLogs(((c.result as { logs?: LogEntry[] } | undefined)?.logs ?? []).slice().reverse());
  }

  async function copy(e: LogEntry) {
    setCopying(e.id);
    const c = await sendAndWait({ type: "log_download", id: e.id, size: e.size, utc: e.utc }, { timeoutMs: 3 * 60 * 60_000 });
    setCopying(null);
    if (c?.status === "acked") {
      toast.success(t("dfCopied", { name: e.name }));
      await loadPi();
    } else if (c?.code !== "CANCELLED") {
      toast.error(t("dfCopyFailed", { reason: c?.msg || c?.code || "—" }));
    }
  }

  async function save(name: string) {
    const res = await fileFetch(`/files/logs/${encodeURIComponent(name)}`);
    if (!res?.ok) {
      toast.error(t("downloadFailed"));
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const busy = copying !== null || Boolean(progress && !progress.done && !progress.error);
  const blocked = !canCommand || armed;

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("dataflashTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("dfDescription")}</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={blocked || listing || busy} onClick={() => void list()}>
          <ListRestart className={`h-3.5 w-3.5 ${listing ? "animate-spin" : ""}`} /> {t("dfList")}
        </Button>
      </div>
      {armed && <p className="rounded-md border border-status-warning/40 p-2 text-xs text-status-warning">{t("dfArmed")}</p>}
      {!canCommand && !armed && <p className="text-xs text-muted-foreground">{t("dfNeedControl")}</p>}
      {logs && logs.length === 0 && <p className="text-xs text-muted-foreground">{t("dfNone")}</p>}
      {logs && logs.length > 0 && (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60 text-xs">
          {logs.map((e) => {
            const here = onPi.has(e.name);
            // From the companion's state, so it survives leaving this tab and coming back.
            const active = progress && progress.id === e.id && !progress.done && !progress.error;
            return (
              <li key={e.id} className="space-y-1.5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 font-mono text-muted-foreground">#{e.id}</span>
                  <span className="min-w-0 flex-1 truncate tabular-nums">{e.utc > 0 ? new Date(e.utc * 1000).toLocaleString() : "—"}</span>
                  <span className="tabular-nums text-muted-foreground">{size(e.size)}</span>
                  {here ? (
                    <Button size="icon-sm" variant="ghost" disabled={!vehicle.directUrl} onClick={() => void save(e.name)} aria-label={t("download", { name: e.name })} title={t("download", { name: e.name })}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button size="icon-sm" variant="ghost" disabled={blocked || busy} onClick={() => void copy(e)} aria-label={t("dfCopy", { id: e.id })} title={t("dfCopy", { id: e.id })}>
                      <HardDriveDownload className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {active && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.pct}%` }} />
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {progress.pct.toFixed(0)}% · {size(progress.bps)}/s · {eta(progress.size - progress.got, progress.bps)}
                    </span>
                    <Button size="icon-sm" variant="ghost" onClick={() => void send({ type: "log_cancel" })} aria-label={t("dfCancel")} title={t("dfCancel")}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <CloudDownload className="mt-0.5 h-3 w-3 shrink-0" /> {t("dfHint")}
      </p>
    </section>
  );
}
