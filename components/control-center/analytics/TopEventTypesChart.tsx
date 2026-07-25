"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TopEventTypesChartProps {
  data: { type: string; count: number }[];
}

const BAR_COLOR = "hsl(var(--chart-1))";

export function TopEventTypesChart({ data }: TopEventTypesChartProps) {
  if (data.length === 0) {
    return <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">No events to display</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
          <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={110} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Bar dataKey="count" name="Count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
