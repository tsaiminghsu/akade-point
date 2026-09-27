import type { ControlCenterLocale, MachineStatus, MachineWidgetSize, WidgetLayerGroup, WidgetType } from "./types";

export const SUPPORTED_LOCALES: ControlCenterLocale[] = ["zh-TW", "en-US", "ja-JP"];
export const DEFAULT_LOCALE: ControlCenterLocale = "zh-TW";
export const LOCALE_COOKIE_NAME = "cc-locale";

// Endonyms — always shown in their own language regardless of the active locale.
export const LOCALE_NATIVE_LABEL: Record<ControlCenterLocale, string> = {
  "zh-TW": "繁體中文",
  "en-US": "English",
  "ja-JP": "日本語",
};

export const STATUS_LABEL: Record<MachineStatus, string> = {
  online: "Online",
  warning: "Warning",
  alarm: "Alarm",
  offline: "Offline",
};

export const STATUS_TEXT_CLASS: Record<MachineStatus, string> = {
  online: "text-status-online",
  warning: "text-status-warning",
  alarm: "text-status-alarm",
  offline: "text-status-offline",
};

export const STATUS_BG_CLASS: Record<MachineStatus, string> = {
  online: "bg-status-online",
  warning: "bg-status-warning",
  alarm: "bg-status-alarm",
  offline: "bg-status-offline",
};

export const STATUS_BORDER_CLASS: Record<MachineStatus, string> = {
  online: "border-status-online",
  warning: "border-status-warning",
  alarm: "border-status-alarm",
  offline: "border-status-offline",
};

export const MACHINE_WIDGET_SIZE_PX: Record<MachineWidgetSize, { width: number; height: number }> = {
  small: { width: 64, height: 64 },
  medium: { width: 140, height: 96 },
  large: { width: 220, height: 168 },
};

// z-index bands so layer groups never visually interleave regardless of
// per-widget z within a group; LayersPanel reordering only shuffles within a band.
export const LAYER_GROUP_Z_BASE: Record<WidgetLayerGroup, number> = {
  background: 0,
  zones: 1000,
  texts: 2000,
  machines: 3000,
  overlays: 4000,
};

export const LAYER_GROUP_LABEL: Record<WidgetLayerGroup, string> = {
  background: "Background",
  zones: "Zones",
  machines: "Machines",
  texts: "Texts",
  overlays: "Overlays",
};

export const WIDGET_DEFAULT_LAYER: Record<WidgetType, WidgetLayerGroup> = {
  machine: "machines",
  text: "texts",
  rectangle: "zones",
  circle: "zones",
  arrow: "overlays",
  line: "overlays",
  zone: "zones",
  camera: "overlays",
  image: "background",
  counter: "overlays",
  map: "overlays",
  divider: "overlays",
};

export const WIDGET_LIBRARY: { type: WidgetType; label: string }[] = [
  { type: "machine", label: "Machine" },
  { type: "text", label: "Text" },
  { type: "rectangle", label: "Rectangle" },
  { type: "circle", label: "Circle" },
  { type: "arrow", label: "Arrow" },
  { type: "zone", label: "Zone" },
  { type: "camera", label: "Camera" },
  { type: "image", label: "Image" },
  { type: "counter", label: "Counter" },
  { type: "map", label: "Map" },
  { type: "divider", label: "Divider" },
  { type: "line", label: "Line" },
];

export const DEFAULT_GRID_SIZE = 20;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 1.2;
export const UNDO_HISTORY_LIMIT = 50;
export const MAX_LAYOUT_VERSIONS_PER_STORE = 20;
export const LIVE_TICK_MS = 1000;

export const CURRENT_WARNING_THRESHOLD = 8.5; // amps
export const CURRENT_ALARM_THRESHOLD = 11; // amps
export const DOOR_OPEN_ALARM_MS = 30_000;
export const HEARTBEAT_OFFLINE_MS = 15_000;

/** How many recent events/alerts the shell pulls on hydration. The stores cap
 *  their in-memory history at the same size, so asking for more would only
 *  transfer rows that get dropped on arrival. */
export const HYDRATE_EVENT_LIMIT = 500;
