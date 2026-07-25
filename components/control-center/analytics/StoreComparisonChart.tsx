"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface StoreComparisonChartProps {
  data: { store: string; online: number; warning: number; alarm: number; offline: number }[];
}

export function StoreComparisonChart({ data }: StoreComparisonChartProps) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="store" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={28} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
          <Bar dataKey="online" name="Online" stackId="s" fill="hsl(var(--status-online))" />
          <Bar dataKey="warning" name="Warning" stackId="s" fill="hsl(var(--status-warning))" />
          <Bar dataKey="alarm" name="Alarm" stackId="s" fill="hsl(var(--status-alarm))" />
          <Bar dataKey="offline" name="Offline" stackId="s" fill="hsl(var(--status-offline))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
