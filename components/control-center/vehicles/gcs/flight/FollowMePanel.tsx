"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Footprints, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { FOLLOW_LIMITS, followStartBlock, followStep, leadFix, type Fix, type FollowSettings } from "@/lib/control-center/vehicles/gcs/followMe";
import { distanceM, formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

/**
 * Follow me: the browser's position (phone GPS) drives repeated GUIDED gotos
 * to a station next to the operator. Stops by itself when the fix goes stale,
 * the link or control is lost, or this panel is closed.
 */
export function FollowMePanel({ state, canCommand, rover }: { state: VehicleStateV2 | null; canCommand: boolean; rover: boolean }) {
  const t = useTranslations("Gcs.follow");
  const send = useGcsStore((s) => s.send);
  const stale = useGcsStore((s) => s.stale);

  const [settings, setSettings] = useState<FollowSettings>({ distance: 10, bearing: 180, alt: 15 });
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [active, setActive] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const fixRef = useRef<Fix | null>(null);
  const prevFixRef = useRef<Fix | null>(null);
  const lastSent = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  function startWatch() {
    if (!("geolocation" in navigator)) {
      setGeoError(t("noGeolocation"));
      return;
    }
    setGeoError(null);
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
        prevFixRef.current = fixRef.current;
        fixRef.current = f;
        setFix(f);
        useGcsStore.setState({ me: { lat: f.lat, lon: f.lon, accuracy: f.accuracy } });
      },
      (e) => setGeoError(e.code === e.PERMISSION_DENIED ? t("geoDenied") : e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  }

  function stopAll() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setWatching(false);
    setActive(false);
    lastSent.current = null;
    useGcsStore.setState({ me: null });
  }

  // Closing the panel (or the page) always stops following.
  useEffect(() => stopAll, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Losing control or the link stops following; the vehicle holds its last target.
  useEffect(() => {
    if (active && (!canCommand || stale)) {
      setActive(false);
      toast.warning(t(stale ? "stoppedLink" : "stoppedControl"));
    }
  }, [active, canCommand, stale, t]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const fx = fixRef.current;
      const d = followStep(fx ? leadFix(fx, prevFixRef.current) : null, Date.now(), settingsRef.current, lastSent.current);
      if (d.kind === "stale") {
        setActive(false);
        toast.warning(t("stoppedFix"));
      } else if (d.kind === "send") {
        lastSent.current = { lat: d.lat, lon: d.lon, at: Date.now() };
        setSentCount((n) => n + 1);
        void send({ type: "goto", lat: d.lat, lon: d.lon, alt: rover ? 0 : settingsRef.current.alt });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [active, rover, send, t]);

  const pos = state?.pos ?? null;
  const block = followStartBlock(fix, pos, Date.now());
  const toVehicle = fix && pos ? distanceM(fix.lat, fix.lon, pos.lat, pos.lon) : null;
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== "" ? Number(v) : fallback);

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Footprints className="h-3.5 w-3.5" /> {t("title")}
        {active && <span className="ml-auto rounded bg-primary/15 px-1.5 text-[10px] text-primary">{t("activeBadge", { n: sentCount })}</span>}
      </p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">{t("distance")}</span>
          <Input className="h-7 px-1.5 text-xs" inputMode="decimal" defaultValue={settings.distance} onChange={(e) => setSettings((s) => ({ ...s, distance: Math.max(0, num(e.target.value, s.distance)) }))} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t("bearing")}</span>
          <Input className="h-7 px-1.5 text-xs" inputMode="numeric" defaultValue={settings.bearing} onChange={(e) => setSettings((s) => ({ ...s, bearing: num(e.target.value, s.bearing) }))} />
        </label>
        {!rover && (
          <label className="space-y-1">
            <span className="text-muted-foreground">{t("alt")}</span>
            <Input className="h-7 px-1.5 text-xs" inputMode="decimal" defaultValue={settings.alt} onChange={(e) => setSettings((s) => ({ ...s, alt: Math.max(2, num(e.target.value, s.alt)) }))} />
          </label>
        )}
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {!watching
          ? t("idle")
          : fix
            ? t("fix", { acc: Math.round(fix.accuracy), dist: toVehicle === null ? "—" : formatDistance(toVehicle) })
            : t("waitingFix")}
      </p>
      {geoError && <p className="text-[11px] text-status-alarm">{geoError}</p>}
      {watching && !active && block && block !== "noFix" && <p className="text-[11px] text-status-warning">{t(`block_${block}`, { max: FOLLOW_LIMITS.maxStartDistanceM, acc: FOLLOW_LIMITS.maxAccuracyM })}</p>}
      <div className="flex gap-2">
        {!watching ? (
          <Button size="sm" variant="outline" className="flex-1" disabled={!canCommand} onClick={startWatch}>
            {t("locate")}
          </Button>
        ) : !active ? (
          <Button size="sm" className="flex-1" disabled={!canCommand || stale || block !== null} onClick={() => setConfirm(true)}>
            {t("start")}
          </Button>
        ) : (
          <Button size="sm" variant="destructive" className="flex-1 gap-1.5" onClick={() => setActive(false)}>
            <Square className="h-3.5 w-3.5" /> {t("stop")}
          </Button>
        )}
        {watching && (
          <Button size="sm" variant="ghost" onClick={stopAll}>
            {t("close")}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("confirmTitle")}
        description={t("confirmDescription", { distance: settings.distance, bearing: settings.bearing })}
        destructive={false}
        onConfirm={() => {
          lastSent.current = null;
          setSentCount(0);
          setActive(true);
          setConfirm(false);
        }}
      />
    </div>
  );
}
