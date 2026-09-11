import {
  CURRENT_ALARM_THRESHOLD,
  CURRENT_WARNING_THRESHOLD,
  DOOR_OPEN_ALARM_MS,
  HEARTBEAT_OFFLINE_MS,
} from "./constants";
import type { Machine, MachineEvent, Alert, MachineStatus } from "./types";
import { mulberry32 } from "./mockData";

const tickRand = mulberry32(Date.now() & 0xffffffff);

function nextTickId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(tickRand() * 1e6).toString(36)}`;
}

export interface TickResult {
  updatedMachines: Machine[];
  newEvents: MachineEvent[];
  newAlerts: Alert[];
}

function deriveStatus(machine: Machine, now: number): MachineStatus {
  const heartbeatAge = now - machine.heartbeatAt;
  if (heartbeatAge > HEARTBEAT_OFFLINE_MS) return "offline";
  if (machine.door === "open" && machine.doorOpenSince && now - machine.doorOpenSince > DOOR_OPEN_ALARM_MS) {
    return "alarm";
  }
  if (machine.current >= CURRENT_ALARM_THRESHOLD) return "alarm";
  if (machine.current >= CURRENT_WARNING_THRESHOLD) return "warning";
  return "online";
}

/** Pure per-tick simulation: advances one machine's telemetry by ~1s and
 * reports any newly-crossed thresholds as events/alerts. Never mutates input. */
export function tickMachine(machine: Machine, now: number): { machine: Machine; events: MachineEvent[]; alerts: Alert[] } {
  if (machine.status === "offline" && tickRand() > 0.03) {
    // Offline machines mostly stay put; rare chance to come back.
    return { machine, events: [], alerts: [] };
  }

  const jitter = (tickRand() - 0.5) * 0.6;
  const current = Math.max(0.1, machine.current + jitter);

  let door = machine.door;
  let doorOpenSince = machine.doorOpenSince;
  if (door === "closed" && tickRand() < 0.002) {
    door = "open";
    doorOpenSince = now;
  } else if (door === "open" && tickRand() < 0.15) {
    door = "closed";
    doorOpenSince = null;
  }

  const missedHeartbeat = tickRand() < 0.01;
  const heartbeatAt = missedHeartbeat ? machine.heartbeatAt : now;

  const rssiDrift = Math.round((tickRand() - 0.5) * 4);
  const rssi = Math.max(-98, Math.min(-30, machine.rssi + rssiDrift));

  const previousStatus = machine.status;
  const draft: Machine = {
    ...machine,
    current: Number(current.toFixed(2)),
    door,
    doorOpenSince,
    heartbeatAt,
    rssi,
    lastUpdate: now,
    currentHistory: [...machine.currentHistory.slice(-59), { t: now, value: Number(current.toFixed(2)) }],
  };
  const nextStatus = deriveStatus(draft, now);
  draft.status = nextStatus;

  const events: MachineEvent[] = [];
  const alerts: Alert[] = [];

  if (nextStatus !== previousStatus) {
    if (nextStatus === "offline") {
      events.push({
        id: nextTickId("evt"),
        machineId: machine.id,
        storeId: machine.storeId,
        type: "offline",
        message: `${machine.name} 已離線`,
        severity: "critical",
        timestamp: now,
      });
      alerts.push({
        id: nextTickId("alert"),
        machineId: machine.id,
        storeId: machine.storeId,
        type: "offline",
        message: `${machine.name} 已離線，請檢查網路連線`,
        severity: "critical",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    } else if (nextStatus === "alarm") {
      const reason = door === "open" ? "door_open" : "high_current";
      const message =
        reason === "door_open" ? `${machine.name} 門禁被開啟過久` : `${machine.name} 電流過高 (${draft.current}A)`;
      events.push({
        id: nextTickId("evt"),
        machineId: machine.id,
        storeId: machine.storeId,
        type: reason,
        message,
        severity: "critical",
        timestamp: now,
      });
      alerts.push({
        id: nextTickId("alert"),
        machineId: machine.id,
        storeId: machine.storeId,
        type: reason,
        message,
        severity: "critical",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    } else if (nextStatus === "warning") {
      events.push({
        id: nextTickId("evt"),
        machineId: machine.id,
        storeId: machine.storeId,
        type: "high_current",
        message: `${machine.name} 電流偏高 (${draft.current}A)`,
        severity: "warning",
        timestamp: now,
      });
    } else if (nextStatus === "online" && (previousStatus === "offline" || previousStatus === "alarm")) {
      events.push({
        id: nextTickId("evt"),
        machineId: machine.id,
        storeId: machine.storeId,
        type: "back_online",
        message: `${machine.name} 已恢復正常`,
        severity: "info",
        timestamp: now,
      });
    }
  }

  return { machine: draft, events, alerts };
}

export function tick(machines: Machine[], now: number = Date.now()): TickResult {
  const updatedMachines: Machine[] = [];
  const newEvents: MachineEvent[] = [];
  const newAlerts: Alert[] = [];

  for (const machine of machines) {
    const result = tickMachine(machine, now);
    updatedMachines.push(result.machine);
    newEvents.push(...result.events);
    newAlerts.push(...result.alerts);
  }

  return { updatedMachines, newEvents, newAlerts };
}
