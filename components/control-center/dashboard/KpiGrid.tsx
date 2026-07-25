"use client";

import { Activity, AlertTriangle, Cpu, HardDrive, Radio, ServerCog, ShieldAlert, Wifi, WifiOff } from "lucide-react";

import { KPICard } from "@/components/control-center/shared/KPICard";
import { useAlertStore } from "@/store/useAlertStore";
import { useMachinesStore } from "@/store/useMachinesStore";

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function KpiGrid() {
  const machines = useMachinesStore((s) => s.machines);
  const events = useMachinesStore((s) => s.events);
  const alerts = useAlertStore((s) => s.alerts);

  const total = machines.length;
  const online = machines.filter((m) => m.status === "online").length;
  const offline = machines.filter((m) => m.status === "offline").length;
  const abnormal = machines.filter((m) => m.status === "warning" || m.status === "alarm").length;
  const todaysAlerts = alerts.filter((a) => isToday(a.createdAt)).length;
  const todaysEvents = events.filter((e) => isToday(e.timestamp)).length;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
      <KPICard label="Total Machines" value={total} icon={HardDrive} accent="primary" sub="All connected devices" />
      <KPICard label="Online" value={online} icon={Radio} accent="online" sub={`${Math.round((online / (total || 1)) * 100)}% of fleet`} />
      <KPICard label="Offline" value={offline} icon={WifiOff} accent="offline" sub="No heartbeat" />
      <KPICard label="Abnormal" value={abnormal} icon={AlertTriangle} accent="warning" sub="Warning + Alarm" />
      <KPICard label="Today's Alerts" value={todaysAlerts} icon={ShieldAlert} accent="alarm" sub="Since midnight" />
      <KPICard label="Today's Events" value={todaysEvents} icon={Activity} accent="muted" sub="All event types" />
      <KPICard label="CPU" value="38%" icon={Cpu} accent="muted" sub="Edge gateway (placeholder)" />
      <KPICard label="MQTT" value="Connected" icon={Wifi} accent="online" sub="broker.iot.local (placeholder)" />
      <KPICard label="API" value="200 OK" icon={ServerCog} accent="online" sub="p95 42ms (placeholder)" />
    </div>
  );
}
