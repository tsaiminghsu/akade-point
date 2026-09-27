"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { GcsSample } from "@/store/useGcsStore";

type SeriesKey = Exclude<keyof GcsSample, "at">;

const SERIES: { key: SeriesKey; unit: string; color: string }[] = [
  { key: "alt", unit: "m", color: "hsl(var(--primary))" },
  { key: "gs", unit: "m/s", color: "#22c55e" },
  { key: "vs", unit: "m/s", color: "#a855f7" },
  { key: "batV", unit: "V", color: "#eab308" },
  { key: "cellV", unit: "V", color: "#f97316" },
  { key: "cur", unit: "A", color: "#ef4444" },
  { key: "roll", unit: "°", color: "#06b6d4" },
  { key: "pitch", unit: "°", color: "#3b82f6" },
  { key: "vibe", unit: "m/s²", color: "#f43f5e" },
  { key: "ekf", unit: "", color: "#84cc16" },
  { key: "sats", unit: "", color: "#94a3b8" },
];

/** Live curves over the last few minutes, one small chart per chosen value
 *  (each keeps its own scale) — the web version of MP's tuning graph. */
export function GraphPanel({ samples, now }: { samples: GcsSample[]; now: number }) {
  const t = useTranslations("Gcs.graph");
  const [chosen, setChosen] = useState<SeriesKey[]>(["alt", "batV", "vibe"]);

  const data = useMemo(() => samples.map((s) => ({ ...s, ago: -Math.round((now - s.at) / 1000) })), [samples, now]);

  function toggle(k: SeriesKey) {
    setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k].slice(-4)));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {SERIES.map((s) => (
          <button
            key={s.key}
            onClick={() => toggle(s.key)}
            aria-pressed={chosen.includes(s.key)}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${
              chosen.includes(s.key) ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            {t(s.key)}
          </button>
        ))}
      </div>
      {samples.length < 2 ? (
        <p className="text-xs text-muted-foreground">{t("waiting")}</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {SERIES.filter((s) => chosen.includes(s.key)).map((s) => (
            <div key={s.key} className="h-28 w-full">
              <p className="text-[11px] text-muted-foreground">
                {t(s.key)} {s.unit && `(${s.unit})`}
              </p>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="ago" type="number" domain={["dataMin", 0]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} unit="s" />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={36} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(v) => `${v}s`}
                  />
                  <Line type="monotone" dataKey={s.key} stroke={s.color} dot={false} isAnimationActive={false} connectNulls={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
