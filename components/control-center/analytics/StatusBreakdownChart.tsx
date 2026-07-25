"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { MachineStatus } from "@/lib/control-center/types";

interface StatusBreakdownChartProps {
  counts: Record<MachineStatus, number>;
}

const STATUS_META: { key: MachineStatus; label: string; color: string }[] = [
  { key: "online", label: "Online", color: "hsl(var(--status-online))" },
  { key: "warning", label: "Warning", color: "hsl(var(--status-warning))" },
  { key: "alarm", label: "Alarm", color: "hsl(var(--status-alarm))" },
  { key: "offline", label: "Offline", color: "hsl(var(--status-offline))" },
];

export function StatusBreakdownChart({ counts }: StatusBreakdownChartProps) {
  const data = STATUS_META.map((s) => ({ name: s.label, value: counts[s.key] ?? 0, color: s.color }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">No machines to display</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} strokeWidth={0}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Legend verticalAlign="bottom" height={24} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
