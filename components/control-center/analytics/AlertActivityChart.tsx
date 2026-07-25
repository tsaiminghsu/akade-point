"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface AlertActivityChartProps {
  data: { date: string; info: number; warning: number; critical: number }[];
}

export function AlertActivityChart({ data }: AlertActivityChartProps) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={28} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
          <Bar dataKey="info" name="Info" stackId="a" fill="hsl(var(--primary))" />
          <Bar dataKey="warning" name="Warning" stackId="a" fill="hsl(var(--status-warning))" />
          <Bar dataKey="critical" name="Critical" stackId="a" fill="hsl(var(--status-alarm))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
