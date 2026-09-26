"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, Circle, Loader2, RotateCw, Square, VideoOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { playWhep, videoUrlProblem, type WhepSession, type WhepStatus } from "@/lib/control-center/vehicles/video/whep";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

/**
 * Live video from MediaMTX on the Pi (WebRTC/WHEP). Snapshot saves the current
 * frame as PNG in the browser; Record asks the companion to switch MediaMTX
 * recording on the Pi. `overlay` draws on top (e.g. the HUD) and `onClickAim`
 * receives normalised click positions (-1..1) for aiming the gimbal.
 */
export function VideoPanel({
  url,
  state,
  canCommand,
  compact,
  overlay,
  onClickAim,
}: {
  url: string;
  state: VehicleStateV2 | null;
  canCommand: boolean;
  compact?: boolean;
  overlay?: React.ReactNode;
  onClickAim?: (nx: number, ny: number) => void;
}) {
  const t = useTranslations("Gcs.video");
  const send = useGcsStore((s) => s.send);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<WhepSession | null>(null);
  const [status, setStatus] = useState<WhepStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);

  const problem = url ? videoUrlProblem(url, typeof window !== "undefined" ? window.location.protocol : "https:") : null;

  useEffect(() => {
    if (!url || problem || !videoRef.current) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    void playWhep(url, videoRef.current, (s, d) => {
      if (cancelled) return;
      setStatus(s);
      setDetail(d);
      // Reconnect after a drop (4G handover, Pi restart).
      if (s === "error") retry = setTimeout(() => setAttempt((a) => a + 1), 3000);
    }).then((session) => {
      if (cancelled) session.stop();
      else sessionRef.current = session;
    });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [url, problem, attempt]);

  function snapshot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const pos = state?.pos ? `_${state.pos.lat.toFixed(6)}_${state.pos.lon.toFixed(6)}` : "";
      a.download = `snapshot_${new Date().toISOString().replace(/[:.]/g, "-")}${pos}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t("snapshotSaved"));
    }, "image/png");
  }

  const recording = state?.video?.rec === true;

  if (!url) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md bg-black/80 p-4 text-center text-xs text-muted-foreground">
        <VideoOff className="h-6 w-6" />
        {t("noUrl")}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay
        muted
        playsInline
        onClick={(e) => {
          if (!onClickAim) return;
          const r = e.currentTarget.getBoundingClientRect();
          onClickAim(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
        }}
        style={{ cursor: onClickAim ? "crosshair" : undefined }}
      />
      {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
      {status !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center text-xs text-white">
          {problem ? (
            <>
              <VideoOff className="h-5 w-5" />
              {t(`problem_${problem}`)}
            </>
          ) : status === "error" ? (
            <>
              <VideoOff className="h-5 w-5" />
              {t("error", { detail: detail ?? "" })}
              <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => setAttempt((a) => a + 1)}>
                <RotateCw className="h-3.5 w-3.5" /> {t("retry")}
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("connecting")}
            </>
          )}
        </div>
      )}
      <div className={`absolute ${compact ? "bottom-1 right-1" : "bottom-2 right-2"} flex items-center gap-1.5`}>
        {recording && (
          <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            <Circle className="h-2.5 w-2.5 fill-current" /> REC
          </span>
        )}
        {!compact && (
          <>
            <Button size="icon-sm" variant="secondary" className="bg-black/60 text-white hover:bg-black/80" disabled={status !== "playing"} onClick={snapshot} aria-label={t("snapshot")} title={t("snapshot")}>
              <Camera className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              className="bg-black/60 text-white hover:bg-black/80"
              disabled={!canCommand || state?.video == null}
              onClick={() => void send({ type: "video_record", on: !recording })}
              aria-label={recording ? t("stopRecord") : t("record")}
              title={state?.video == null ? t("recordUnavailable") : recording ? t("stopRecord") : t("record")}
            >
              {recording ? <Square className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5 text-red-400" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
