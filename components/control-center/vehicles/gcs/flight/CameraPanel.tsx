"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, ImageOff, RefreshCw, Square, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

interface PhotoRow {
  idx: number;
  name: string;
  t: number;
  lat: number | null;
  lon: number | null;
  rel: number | null;
  trigger: string;
}

const SHOWN = 12;

/**
 * The companion's MAVLink camera: shoot now, shoot every N seconds, and the
 * latest geotagged photos (fetched from the Pi over the direct link). Photos
 * triggered by the autopilot (survey missions, CAM1_TYPE = 6) show up here too.
 */
export function CameraPanel({ state, canCommand }: { state: VehicleStateV2 | null; canCommand: boolean }) {
  const t = useTranslations("Gcs.camera");
  const send = useGcsStore((s) => s.send);
  const sendAndWait = useGcsStore((s) => s.sendAndWait);
  const fileFetch = useGcsStore((s) => s.fileFetch);
  const hasDirect = useGcsStore((s) => Boolean(s.vehicle?.directUrl));
  const cam = state?.camera ?? null;

  const [interval, setIntervalS] = useState("2");
  const [count, setCount] = useState("0");
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!hasDirect) return;
    const res = await fileFetch("/files/photos");
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const body = (await res.json()) as { photos: PhotoRow[] };
    setPhotos(body.photos);
    // Photo positions for the map.
    useGcsStore.setState({
      photoPoints: body.photos.filter((p) => p.lat !== null && p.lon !== null).map((p) => ({ idx: p.idx, lat: p.lat!, lon: p.lon! })),
    });
  }, [hasDirect, fileFetch]);

  // Reload when a new photo is reported in the state.
  useEffect(() => {
    void load();
  }, [load, cam?.n]);

  // Thumbnails: the newest few, as blob URLs (the files need the ticket header).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const p of photos.slice(0, SHOWN)) {
        if (thumbs[p.name] || cancelled) continue;
        const res = await fileFetch(`/files/photos/${encodeURIComponent(p.name)}`);
        if (!res?.ok || cancelled) continue;
        const url = URL.createObjectURL(await res.blob());
        urls.current.push(url);
        setThumbs((m) => ({ ...m, [p.name]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photos, fileFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      useGcsStore.setState({ photoPoints: [] });
    },
    []
  );

  async function shoot() {
    const c = await sendAndWait({ type: "camera_capture" }, { timeoutMs: 35_000 });
    if (c?.status !== "acked") toast.error(t("failed", { reason: c?.msg || c?.code || "—" }));
  }

  const intervalNum = Number(interval);
  const countNum = Number(count);
  const dis = !canCommand;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
        <div className="rounded-md border border-border/60 bg-muted/30 py-1.5">
          <p className="text-[10px] text-muted-foreground">{t("photos")}</p>
          <p className="text-lg font-semibold">{cam ? cam.n : "—"}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/30 py-1.5">
          <p className="text-[10px] text-muted-foreground">{t("status")}</p>
          <p className="text-sm font-semibold">{!cam ? "—" : cam.busy ? t("busy") : cam.interval ? t("intervalOn", { s: cam.interval }) : t("idle")}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/30 py-1.5">
          <p className="text-[10px] text-muted-foreground">{t("last")}</p>
          <p className="text-sm font-semibold">{cam?.last ? new Date(cam.last.t).toLocaleTimeString() : "—"}</p>
        </div>
      </div>
      {cam?.error && <p className="text-xs text-status-alarm">{t("sourceError", { error: cam.error })}</p>}

      <Button className="w-full gap-1.5" disabled={dis || cam?.busy} onClick={() => void shoot()}>
        <Camera className="h-4 w-4" /> {t("shoot")}
      </Button>

      <div className="flex items-end gap-2">
        <label className="flex-1 space-y-1 text-xs">
          <span className="text-muted-foreground">{t("interval")}</span>
          <Input className="h-8" inputMode="decimal" value={interval} onChange={(e) => setIntervalS(e.target.value)} />
        </label>
        <label className="flex-1 space-y-1 text-xs">
          <span className="text-muted-foreground">{t("count")}</span>
          <Input className="h-8" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        {cam?.interval ? (
          <Button size="sm" variant="destructive" className="gap-1.5" disabled={dis} onClick={() => void send({ type: "camera_stop" })}>
            <Square className="h-3.5 w-3.5" /> {t("stop")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={dis || !(intervalNum >= 0.5) || !(countNum >= 0)}
            onClick={() => void send({ type: "camera_capture", interval: intervalNum, count: Math.floor(countNum) })}
          >
            <Timer className="h-3.5 w-3.5" /> {t("start")}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("countHint")}</p>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{t("recent")}</p>
        <Button size="icon-sm" variant="ghost" disabled={!hasDirect} onClick={() => void load()} aria-label={t("reload")}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {!hasDirect ? (
        <p className="text-xs text-muted-foreground">{t("needDirect")}</p>
      ) : loadError ? (
        <p className="text-xs text-status-alarm">{t("listFailed")}</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.slice(0, SHOWN).map((p) => (
            <a
              key={p.name}
              href={thumbs[p.name]}
              target="_blank"
              rel="noopener noreferrer"
              download={p.name}
              className="group relative block aspect-[4/3] overflow-hidden rounded border border-border/60 bg-muted/40"
              title={`#${p.idx} · ${new Date(p.t).toLocaleString()}${p.lat !== null ? ` · ${p.lat.toFixed(6)}, ${p.lon!.toFixed(6)}` : ""}`}
            >
              {thumbs[p.name] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[p.name]} alt={`#${p.idx}`} className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="m-auto h-4 w-4 text-muted-foreground" />
              )}
              <span className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1 text-[10px] text-white">
                #{p.idx}
                {p.trigger === "autopilot" ? " ✈" : ""}
              </span>
            </a>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
