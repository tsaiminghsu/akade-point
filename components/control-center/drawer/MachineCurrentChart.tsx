"use client";

import { memo, useMemo } from "react";
import { useLocale } from "next-intl";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface MachineCurrentChartProps {
  data: { t: number; value: number }[];
}

/** Memoised: Live Mode re-renders the drawer once a second, and formatting 60
 *  timestamps per render is the most expensive thing on that path. */
export const MachineCurrentChart = memo(function MachineCurrentChart({ data }: MachineCurrentChartProps) {
  const locale = useLocale();
  const chartData = useMemo(
    () => data.map((d) => ({ time: new Date(d.t).toLocaleTimeString(locale, { hour12: false }), value: d.value })),
    [data, locale]
  );

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={30} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={32} unit="A" />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#currentGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
