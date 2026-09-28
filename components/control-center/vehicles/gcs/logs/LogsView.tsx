"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Vehicle } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";
import { CloudFilesPanel } from "./CloudFilesPanel";
import { DataflashPanel } from "./DataflashPanel";

interface TlogFile {
  name: string;
  bytes: number;
  mtime: number;
  active: boolean;
}

const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

/**
 * Telemetry logs the companion records on the Pi (one .tlog per flight),
 * downloaded over the direct link. Log analysis is left to ArduPilot's own
 * browser tools rather than rebuilt here.
 */
export function LogsView({ vehicle, canCommand }: { vehicle: Vehicle; canCommand: boolean }) {
  const t = useTranslations("Gcs.logs");
  const fileFetch = useGcsStore((s) => s.fileFetch);
  const [files, setFiles] = useState<TlogFile[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "disabled">("idle");
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vehicle.directUrl) return;
    setState("loading");
    const res = await fileFetch("/files/tlogs");
    if (!res || !res.ok) {
      setState("error");
      return;
    }
    const body = (await res.json()) as { files: TlogFile[]; enabled: boolean };
    setFiles(body.files);
    setState(body.enabled ? "idle" : "disabled");
  }, [vehicle.directUrl, fileFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(f: TlogFile) {
    setDownloading(f.name);
    const res = await fileFetch(`/files/tlogs/${encodeURIComponent(f.name)}`);
    setDownloading(null);
    if (!res || !res.ok) {
      toast.error(t("downloadFailed"));
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
      <CloudFilesPanel vehicle={vehicle} />
      <section className="min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{t("tlogTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("tlogDescription")}</p>
          </div>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={!vehicle.directUrl || state === "loading"} onClick={() => void load()}>
            <RefreshCw className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} /> {t("refresh")}
          </Button>
        </div>
        {!vehicle.directUrl ? (
          <p className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground">{t("needDirect")}</p>
        ) : state === "error" ? (
          <p className="rounded-md border border-status-alarm/40 p-3 text-xs text-status-alarm">{t("listFailed")}</p>
        ) : state === "disabled" ? (
          <p className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground">{t("disabled")}</p>
        ) : files && files.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-md border border-border/60 text-xs">
            {(files ?? []).map((f) => (
              <li key={f.name} className="flex items-center gap-2 px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                {f.active && <span className="rounded bg-primary/15 px-1.5 text-[10px] text-primary">{t("recording")}</span>}
                <span className="tabular-nums text-muted-foreground">{size(f.bytes)}</span>
                <span className="hidden tabular-nums text-muted-foreground sm:inline">{new Date(f.mtime).toLocaleString()}</span>
                <Button size="icon-sm" variant="ghost" disabled={downloading !== null} onClick={() => void download(f)} aria-label={t("download", { name: f.name })}>
                  <Download className={`h-3.5 w-3.5 ${downloading === f.name ? "animate-pulse" : ""}`} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <DataflashPanel vehicle={vehicle} canCommand={canCommand} />
      </div>
      <aside className="space-y-3 text-xs">
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <h3 className="text-sm font-semibold">{t("analyseTitle")}</h3>
          <p className="text-muted-foreground">{t("analyseDescription")}</p>
          <a className="flex items-center gap-1.5 text-primary hover:underline" href="https://plot.ardupilot.org/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> UAV Log Viewer
          </a>
          <a className="flex items-center gap-1.5 text-primary hover:underline" href="https://firmware.ardupilot.org/Tools/WebTools/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> ArduPilot WebTools
          </a>
        </div>
      </aside>
    </div>
  );
}
