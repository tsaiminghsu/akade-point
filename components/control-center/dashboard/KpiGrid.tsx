"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("KpiGrid");
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
      <KPICard label={t("totalMachines")} value={total} icon={HardDrive} accent="primary" sub={t("totalMachinesSub")} />
      <KPICard
        label={t("online")}
        value={online}
        icon={Radio}
        accent="online"
        sub={t("onlineSub", { percent: Math.round((online / (total || 1)) * 100) })}
      />
      <KPICard label={t("offline")} value={offline} icon={WifiOff} accent="offline" sub={t("offlineSub")} />
      <KPICard label={t("abnormal")} value={abnormal} icon={AlertTriangle} accent="warning" sub={t("abnormalSub")} />
      <KPICard label={t("todaysAlerts")} value={todaysAlerts} icon={ShieldAlert} accent="alarm" sub={t("todaysAlertsSub")} />
      <KPICard label={t("todaysEvents")} value={todaysEvents} icon={Activity} accent="muted" sub={t("todaysEventsSub")} />
      <KPICard label={t("cpu")} value="38%" icon={Cpu} accent="muted" sub={t("cpuSub")} />
      <KPICard label={t("mqtt")} value={t("mqttConnected")} icon={Wifi} accent="online" sub={t("mqttSub")} />
      <KPICard label={t("api")} value={t("apiOk")} icon={ServerCog} accent="online" sub={t("apiSub")} />
    </div>
  );
}
