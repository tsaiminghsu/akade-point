import {
  LAYER_GROUP_Z_BASE,
  MACHINE_WIDGET_SIZE_PX,
  WIDGET_DEFAULT_LAYER,
} from "./constants";
import type {
  Alert,
  Brand,
  MachineEvent,
  MachineGroup,
  Machine,
  MachineWidgetData,
  MaintenanceRecord,
  Store,
  Widget,
  WidgetLayerGroup,
} from "./types";

/** Deterministic PRNG (mulberry32) so dev reloads & "Reset Mock Data" stay reproducible. */
export function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260125);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}`;
}

export function generateBrands(): Brand[] {
  return [
    { id: "brand-1", name: "AKADE 娛樂集團", description: "北中部旗艦品牌", color: "#38bdf8" },
    { id: "brand-2", name: "歡樂城市娛樂", description: "南部與新竹地區品牌", color: "#f59e0b" },
  ];
}

export function generateStores(brands: Brand[]): Store[] {
  return [
    { id: "store-1", name: "台北信義旗艦店", address: "台北市信義區松高路 11 號", brandId: brands[0].id },
    { id: "store-2", name: "台中大遠百店", address: "台中市西屯區台灣大道三段 251 號", brandId: brands[0].id },
    { id: "store-3", name: "高雄夢時代店", address: "高雄市前鎮區中華五路 789 號", brandId: brands[1].id },
    { id: "store-4", name: "新竹巨城店", address: "新竹市東區中央路 229 號", brandId: brands[1].id },
  ];
}

export function generateGroups(stores: Store[]): MachineGroup[] {
  return stores.flatMap((store) => [
    { id: `${store.id}-arcade`, name: "Arcade Zone", storeId: store.id },
    { id: `${store.id}-claw`, name: "Claw Machines", storeId: store.id },
    { id: `${store.id}-vending`, name: "Vending", storeId: store.id },
  ]);
}

const MACHINE_NAME_POOL = [
  "夾娃娃機",
  "扭蛋機",
  "拍貼機",
  "賽車機台",
  "投籃機",
  "麻將機",
  "太鼓達人",
  "音樂遊戲機",
  "自動販賣機",
  "冰淇淋機",
  "按摩椅",
  "打卡機",
];

const FIRMWARE_VERSIONS = ["v2.4.1", "v2.4.2", "v2.5.0", "v2.5.0-rc1", "v2.3.9"];

const STATUS_WEIGHTS: { status: Machine["status"]; weight: number }[] = [
  { status: "online", weight: 72 },
  { status: "warning", weight: 14 },
  { status: "offline", weight: 9 },
  { status: "alarm", weight: 5 },
];

function pickWeightedStatus(): Machine["status"] {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = rand() * total;
  for (const w of STATUS_WEIGHTS) {
    if (r < w.weight) return w.status;
    r -= w.weight;
  }
  return "online";
}

function buildCurrentHistory(base: number, points = 30): { t: number; value: number }[] {
  const now = Date.now();
  const out: { t: number; value: number }[] = [];
  let v = base;
  for (let i = points - 1; i >= 0; i -= 1) {
    v = Math.max(0.2, v + randRange(-0.4, 0.4));
    out.push({ t: now - i * 60_000, value: Number(v.toFixed(2)) });
  }
  return out;
}

function createMachine(store: Store, group: MachineGroup, index: number): Machine {
  const status = pickWeightedStatus();
  const now = Date.now();
  const baseCurrent = status === "alarm" ? randRange(10.5, 13) : status === "warning" ? randRange(8.6, 10.4) : randRange(2, 7.5);
  const doorOpen = status === "alarm" && rand() < 0.4;
  return {
    id: nextId("mach"),
    name: `${pick(MACHINE_NAME_POOL)} #${index + 1}`,
    deviceId: `DEV-${store.id.slice(-1)}${group.name.slice(0, 1)}${(1000 + index).toString()}`,
    storeId: store.id,
    groupId: group.id,
    status,
    current: Number(baseCurrent.toFixed(2)),
    door: doorOpen ? "open" : "closed",
    doorOpenSince: doorOpen ? now - randRange(5_000, 60_000) : null,
    heartbeatAt: status === "offline" ? now - randRange(20_000, 600_000) : now - randRange(0, 3_000),
    rssi: status === "offline" ? -95 : Math.round(randRange(-85, -35)),
    firmware: pick(FIRMWARE_VERSIONS),
    restartCount: Math.floor(randRange(0, 6)),
    lastUpdate: now,
    currentHistory: buildCurrentHistory(baseCurrent),
  };
}

export function generateMachines(stores: Store[], groups: MachineGroup[]): Machine[] {
  const machines: Machine[] = [];
  stores.forEach((store) => {
    const storeGroups = groups.filter((g) => g.storeId === store.id);
    storeGroups.forEach((group, gi) => {
      const count = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i += 1) {
        machines.push(createMachine(store, group, gi * 10 + i));
      }
    });
  });
  return machines;
}

const EVENT_TYPES: { type: string; severity: MachineEvent["severity"]; message: (m: Machine) => string }[] = [
  { type: "heartbeat_missed", severity: "warning", message: (m) => `${m.name} 心跳逾時` },
  { type: "door_open", severity: "critical", message: (m) => `${m.name} 門禁被開啟` },
  { type: "high_current", severity: "warning", message: (m) => `${m.name} 電流異常偏高` },
  { type: "restart", severity: "info", message: (m) => `${m.name} 已重新啟動` },
  { type: "firmware_update", severity: "info", message: (m) => `${m.name} 韌體已更新` },
  { type: "offline", severity: "critical", message: (m) => `${m.name} 已離線` },
  { type: "back_online", severity: "info", message: (m) => `${m.name} 恢復連線` },
];

export function generateEvents(machines: Machine[], count = 120): MachineEvent[] {
  const now = Date.now();
  const events: MachineEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const machine = pick(machines);
    const template = pick(EVENT_TYPES);
    events.push({
      id: nextId("evt"),
      machineId: machine.id,
      storeId: machine.storeId,
      type: template.type,
      message: template.message(machine),
      severity: template.severity,
      timestamp: now - Math.floor(randRange(0, 30 * 24 * 60 * 60 * 1000)),
    });
  }
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

export function generateAlerts(machines: Machine[], count = 18): Alert[] {
  const now = Date.now();
  const statuses: Alert["status"][] = ["active", "active", "acknowledged", "resolved", "ignored"];
  const alerts: Alert[] = [];
  for (let i = 0; i < count; i += 1) {
    const machine = pick(machines);
    const template = pick(EVENT_TYPES.filter((e) => e.severity !== "info"));
    const createdAt = now - Math.floor(randRange(0, 10 * 24 * 60 * 60 * 1000));
    alerts.push({
      id: nextId("alert"),
      machineId: machine.id,
      storeId: machine.storeId,
      type: template.type,
      message: template.message(machine),
      severity: template.severity,
      status: pick(statuses),
      createdAt,
      updatedAt: createdAt + Math.floor(randRange(0, 60 * 60 * 1000)),
    });
  }
  return alerts.sort((a, b) => b.createdAt - a.createdAt);
}

export function generateMaintenanceRecords(machines: Machine[], count = 25): MaintenanceRecord[] {
  const now = Date.now();
  const descriptions = [
    "更換零件並清潔內部機構",
    "韌體升級與系統校正",
    "感應器校準",
    "門禁鎖具更換",
    "例行保養檢查",
    "電源供應器檢修",
  ];
  const technicians = ["王工程師", "李技師", "陳維修員", "外包廠商 - 昱升"];
  return Array.from({ length: count }, () => {
    const machine = pick(machines);
    return {
      id: nextId("maint"),
      machineId: machine.id,
      date: now - Math.floor(randRange(0, 180 * 24 * 60 * 60 * 1000)),
      description: pick(descriptions),
      technician: pick(technicians),
    };
  }).sort((a, b) => b.date - a.date);
}

function makeBaseWidget(
  type: Widget["type"],
  layerGroup: WidgetLayerGroup,
  x: number,
  y: number,
  width: number,
  height: number,
  z: number
) {
  return {
    id: nextId("widget"),
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: LAYER_GROUP_Z_BASE[layerGroup] + z,
    locked: false,
    hidden: false,
    layerGroup,
  };
}

/** Seeds a floor-plan layout: a background zone plus a grid of machine widgets. */
export function generateInitialWidgets(machines: Machine[], storeId: string): Widget[] {
  const storeMachines = machines.filter((m) => m.storeId === storeId);
  const cols = 6;
  const cellW = 180;
  const cellH = 150;
  const marginX = 120;
  const marginY = 140;

  const widgets: Widget[] = [];

  widgets.push({
    ...makeBaseWidget("zone", "zones", marginX + (cols * cellW) / 2 - cellW / 2, marginY + 60, cols * cellW + 40, 320, 0),
    type: "zone",
    fill: "hsl(199 89% 48% / 0.06)",
    label: "1F 展示區",
    name: "1F 展示區",
  } as Widget);

  widgets.push({
    ...makeBaseWidget("text", "texts", marginX + (cols * cellW) / 2 - cellW / 2, marginY - 40, 240, 32, 0),
    type: "text",
    text: "1F 展示區",
    fontSize: 18,
    color: "#7dd3fc",
    name: "Zone Label",
  } as Widget);

  storeMachines.forEach((machine, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = MACHINE_WIDGET_SIZE_PX.medium;
    const widget: MachineWidgetData = {
      ...makeBaseWidget(
        "machine",
        WIDGET_DEFAULT_LAYER.machine,
        marginX + col * cellW,
        marginY + 80 + row * cellH,
        size.width,
        size.height,
        i
      ),
      type: "machine",
      size: "medium",
      machineId: machine.id,
      name: machine.name,
    };
    widgets.push(widget);
  });

  widgets.push({
    ...makeBaseWidget("divider", "overlays", marginX + (cols * cellW) / 2 - cellW / 2, marginY + 420, cols * cellW + 40, 4, 0),
    type: "divider",
    orientation: "horizontal",
    name: "Divider",
  } as Widget);

  widgets.push({
    ...makeBaseWidget("counter", "overlays", marginX - 60, marginY + 420, 140, 70, 1),
    type: "counter",
    label: "今日人流",
    value: Math.floor(randRange(120, 980)),
    name: "今日人流計數",
  } as Widget);

  return widgets;
}
