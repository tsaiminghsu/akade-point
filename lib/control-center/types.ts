export type MachineStatus = "online" | "warning" | "alarm" | "offline";

export type DoorState = "closed" | "open";

export interface Brand {
  id: string;
  name: string;
  description: string;
  color: string; // hex swatch, prototype-level visual variety only
}

export interface Store {
  id: string;
  name: string;
  address: string;
  brandId: string;
}

export interface MachineGroup {
  id: string;
  name: string;
  storeId: string;
}

export interface Machine {
  id: string;
  name: string;
  deviceId: string;
  storeId: string;
  groupId: string;
  status: MachineStatus;
  current: number; // amps
  door: DoorState;
  doorOpenSince: number | null; // epoch ms
  heartbeatAt: number; // epoch ms of last heartbeat
  rssi: number; // dBm, typically -30 (great) to -95 (bad)
  firmware: string;
  restartCount: number;
  lastUpdate: number; // epoch ms
  currentHistory: { t: number; value: number }[];
}

export type EventSeverity = "info" | "warning" | "critical";

export interface MachineEvent {
  id: string;
  machineId: string;
  storeId: string;
  type: string;
  message: string;
  severity: EventSeverity;
  timestamp: number;
}

export type AlertStatus = "active" | "acknowledged" | "resolved" | "ignored";

export interface Alert {
  id: string;
  machineId: string;
  storeId: string;
  type: string;
  message: string;
  severity: EventSeverity;
  status: AlertStatus;
  createdAt: number;
  updatedAt: number;
}

export interface MaintenanceRecord {
  id: string;
  machineId: string;
  date: number;
  description: string;
  technician: string;
}

export type WidgetLayerGroup = "background" | "zones" | "machines" | "texts" | "overlays";

export type MachineWidgetSize = "small" | "medium" | "large";

interface WidgetBase {
  id: string;
  x: number; // canvas-space center x
  y: number; // canvas-space center y
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  layerGroup: WidgetLayerGroup;
  name: string;
}

export interface MachineWidgetData extends WidgetBase {
  type: "machine";
  size: MachineWidgetSize;
  machineId: string;
}

export interface TextWidgetData extends WidgetBase {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
}

export interface RectangleWidgetData extends WidgetBase {
  type: "rectangle";
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface CircleWidgetData extends WidgetBase {
  type: "circle";
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface ArrowWidgetData extends WidgetBase {
  type: "arrow";
  stroke: string;
  strokeWidth: number;
}

export interface LineWidgetData extends WidgetBase {
  type: "line";
  stroke: string;
  strokeWidth: number;
}

export interface ZoneWidgetData extends WidgetBase {
  type: "zone";
  fill: string;
  label: string;
}

export interface CameraWidgetData extends WidgetBase {
  type: "camera";
  label: string;
}

export interface ImageWidgetData extends WidgetBase {
  type: "image";
  src: string | null;
}

export interface CounterWidgetData extends WidgetBase {
  type: "counter";
  label: string;
  value: number;
}

export interface MapWidgetData extends WidgetBase {
  type: "map";
  label: string;
}

export interface DividerWidgetData extends WidgetBase {
  type: "divider";
  orientation: "horizontal" | "vertical";
}

export type Widget =
  | MachineWidgetData
  | TextWidgetData
  | RectangleWidgetData
  | CircleWidgetData
  | ArrowWidgetData
  | LineWidgetData
  | ZoneWidgetData
  | CameraWidgetData
  | ImageWidgetData
  | CounterWidgetData
  | MapWidgetData
  | DividerWidgetData;

export type WidgetType = Widget["type"];

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number; // pan offset (canvas space translation, in screen px at zoom=1)
  y: number;
  zoom: number;
}

export type EditorMode = "edit" | "live";

export type ResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export interface LayoutExport {
  version: 1;
  exportedAt: number;
  widgets: Widget[];
}

/** Preferences that are scoped to a single Store, not global to the app. */
export interface StoreSettings {
  gridSize: number;
  snapEnabled: boolean;
  gridVisible: boolean;
  animationEnabled: boolean;

  toastAlerts: boolean;
  emailDigest: boolean;
  criticalOnly: boolean;
  sound: boolean;

  mqttBroker: string;
  mqttTopic: string;
  mqttClientId: string;

  apiEndpoint: string;
  apiKey: string;

  defaultWidgetSize: MachineWidgetSize;
  defaultMode: EditorMode;
}
