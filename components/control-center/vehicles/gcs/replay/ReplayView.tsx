"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleMarker, Popup, useMap } from "react-leaflet";
import { ChevronDown, History, Pause, Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import { sampleAt, segmentFlights, type Flight } from "@/lib/control-center/vehicles/gcs/replay";
import type { TelemetryPoint, Vehicle } from "@/lib/control-center/vehicles/types";
import { GcsMap } from "../map/GcsMap";
import { VehicleMarker } from "../map/mapParts";
import { useCloudFiles } from "../logs/useCloudFiles";

const PAGE = 2000;
/** Flights listed on a phone before "show all". */
const PHONE_FLIGHTS = 4;
const SPEEDS = [1, 4, 16] as const;

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Fits the map to the selected flight once. */
function FitTrack({ points }: { points: TelemetryPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    let [s, w, n, e] = [90, 180, -90, -180];
    for (const p of points) {
      s = Math.min(s, p.lat);
      n = Math.max(n, p.lat);
      w = Math.min(w, p.lon);
      e = Math.max(e, p.lon);
    }
    map.fitBounds([[s, w], [n, e]], { padding: [30, 30], maxZoom: 18 });
  }, [map, points]);
  return null;
}

/**
 * Replays past flights from the cloud telemetry history (7 days): pick a
 * flight, see its track, scrub or play it back.
 */
export function ReplayView({ vehicle }: { vehicle: Vehicle }) {
  const t = useTranslations("Gcs.replay");
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const lastTick = useRef<number | null>(null);

  const load = useCallback(
    async (until?: number) => {
      setLoading(true);
      setError(false);
      const q = new URLSearchParams({ limit: String(PAGE), ...(until ? { until: String(until - 1) } : {}) });
      const res = await fetch(`/api/control-center/vehicles/${vehicle.id}/telemetry?${q}`).catch(() => null);
      setLoading(false);
      if (!res?.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { points: TelemetryPoint[] };
      setMore(body.points.length === PAGE);
      setPoints((prev) => {
        const seen = new Set(prev.map((p) => p.t));
        return [...body.points.filter((p) => !seen.has(p.t)), ...prev].sort((a, b) => a.t - b.t);
      });
    },
    [vehicle.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const flights = useMemo(() => segmentFlights(points), [points]);
  const flight: Flight | null = selected === null ? null : (flights.find((f) => f.start === selected) ?? null);
  const sample = flight ? sampleAt(flight.points, at) : null;
  const track = useMemo(() => (flight ? flight.points.map((p) => [p.lat, p.lon] as [number, number]) : []), [flight]);
  // Photos the companion uploaded during this flight (a minute either side for clock slack).
  const cloudPhotos = useCloudFiles(vehicle.id, "photo", 200).files;
  const photosIn = (f: Flight) => cloudPhotos.filter((p) => p.t >= f.start - 60_000 && p.t <= f.end + 60_000).length;
  const flightPhotos = useMemo(
    () => (flight ? cloudPhotos.filter((p) => p.geo && p.t >= flight.start - 60_000 && p.t <= flight.end + 60_000) : []),
    [flight, cloudPhotos]
  );

  function choose(f: Flight) {
    setSelected(f.start);
    setAt(f.start);
    setPlaying(false);
  }

  // Playback: advance the clock by real time × speed. A timer rather than
  // requestAnimationFrame, which stops entirely in a background tab.
  useEffect(() => {
    if (!playing || !flight) return;
    lastTick.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = now - (lastTick.current ?? now);
      lastTick.current = now;
      setAt((cur) => {
        const next = cur + dt * speed;
        if (next >= flight.end) {
          setPlaying(false);
          return flight.end;
        }
        return next;
      });
    }, 100);
    return () => {
      clearInterval(timer);
      lastTick.current = null;
    };
  }, [playing, flight, speed]);

  const oldest = points.length ? points[0].t : undefined;

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:flex-row">
      <div className="flex min-w-0 flex-col gap-2 lg:w-[340px] lg:shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{t("title")}</h3>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <Button size="icon-sm" variant="ghost" disabled={loading} onClick={() => { setPoints([]); void load(); }} aria-label={t("reload")} title={t("reload")}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {error && <p className="text-xs text-status-alarm">{t("loadFailed")}</p>}
        {!loading && flights.length === 0 && !error && <p className="text-xs text-muted-foreground">{t("none")}</p>}
        {/* Phones: the latest few in the page flow (no scroller squeezed above the map); the rest on request. */}
        <ul className="divide-y divide-border/50 rounded-md border border-border/60 text-xs lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {flights.map((f, i) => (
            <li key={f.start} className={!showAll && i >= PHONE_FLIGHTS && selected !== f.start ? "max-lg:hidden" : undefined}>
              <button
                className={`w-full space-y-0.5 px-3 py-2 text-left hover:bg-muted/40 ${selected === f.start ? "bg-primary/10" : ""}`}
                onClick={() => choose(f)}
              >
                <span className="block font-medium tabular-nums">{new Date(f.start).toLocaleString()}</span>
                <span className="block tabular-nums text-muted-foreground">
                  {duration(f.end - f.start)} · {formatDistance(f.distance)} · {t("maxAlt", { m: Math.round(f.maxRel) })}
                  {f.batStart !== null && f.batEnd !== null ? ` · ${t("battery", { used: Math.max(0, Math.round(f.batStart - f.batEnd)) })}` : ""}
                  {photosIn(f) > 0 ? ` · ${t("photos", { n: photosIn(f) })}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!showAll && flights.length > PHONE_FLIGHTS && (
          <Button size="sm" variant="ghost" className="gap-1.5 lg:hidden" onClick={() => setShowAll(true)}>
            <ChevronDown className="h-3.5 w-3.5" /> {t("showAll", { n: flights.length })}
          </Button>
        )}
        {more && oldest !== undefined && (
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={loading} onClick={() => void load(oldest)}>
            <History className="h-3.5 w-3.5" /> {t("older")}
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:min-h-0">
        <div className="h-[360px] lg:min-h-0 lg:flex-1">
          <GcsMap state={null} trail={track} target={null} canCommand={false} contextMenu={false} follow={false}>
            {flight && <FitTrack points={flight.points} />}
            {flightPhotos.map((p) => (
              <CircleMarker key={p.fileId} center={[p.geo!.lat, p.geo!.lon]} radius={5} pathOptions={{ color: "#fff", weight: 1, fillColor: "#a855f7", fillOpacity: 0.9 }}>
                <Popup>
                  <a href={p.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block w-48">
                    {/* eslint-disable-next-line @next/next/no-img-element -- presigned / authenticated URL */}
                    <img src={p.url ?? ""} alt={p.name} className="w-full rounded" />
                    <span className="mt-1 block text-[11px] tabular-nums">{new Date(p.t).toLocaleTimeString()}</span>
                  </a>
                </Popup>
              </CircleMarker>
            ))}
            {sample && <VehicleMarker lat={sample.lat} lon={sample.lon} heading={sample.hdg} cls={vehicle.type === "rover" ? "rover" : "copter"} label={vehicle.name} />}
          </GcsMap>
        </div>
        {flight && sample ? (
          <div className="space-y-2 rounded-md border border-border/60 p-2">
            <div className="flex items-center gap-2">
              <Button size="icon-sm" variant="secondary" onClick={() => { if (at >= flight.end) setAt(flight.start); setPlaying((p) => !p); }} aria-label={playing ? t("pause") : t("play")}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <input
                type="range"
                className="min-w-0 flex-1 accent-primary"
                min={flight.start}
                max={flight.end}
                step={100}
                value={at}
                onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }}
                aria-label={t("position")}
              />
              <div className="flex overflow-hidden rounded-md border border-border/60">
                {SPEEDS.map((s) => (
                  <button key={s} className={`px-1.5 text-[11px] ${speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums sm:grid-cols-6">
              <span><b className="block">{duration(at - flight.start)}</b>{t("elapsed")}</span>
              <span><b className="block">{new Date(at).toLocaleTimeString()}</b>{t("clock")}</span>
              <span><b className="block">{sample.mode ?? "—"}</b>{t("mode")}</span>
              <span><b className="block">{sample.rel.toFixed(1)} m</b>{t("alt")}</span>
              <span><b className="block">{sample.gs === null ? "—" : `${sample.gs.toFixed(1)} m/s`}</b>{t("speed")}</span>
              <span><b className="block">{sample.batPct === null ? "—" : `${Math.round(sample.batPct)}%`}</b>{t("bat")}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("pick")}</p>
        )}
      </div>
    </div>
  );
}
