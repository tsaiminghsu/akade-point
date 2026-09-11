export const ARIP_EVENTS = {
  DEVICE: {
    CONNECTED: 'device.connected',
    DISCONNECTED: 'device.disconnected',
    TELEMETRY: 'device.telemetry',
    STATUS_CHANGED: 'device.status.changed',
    HEALTH_CHANGED: 'device.health.changed',
    COMMAND_SENT: 'device.command.sent',
    COMMAND_ACK: 'device.command.ack',
    OTA_STARTED: 'device.ota.started',
    OTA_COMPLETED: 'device.ota.completed',
  },
  FLEET: {
    DEVICE_ASSIGNED: 'fleet.device.assigned',
    DEVICE_REMOVED: 'fleet.device.removed',
    STATUS_CHANGED: 'fleet.status.changed',
    MISSION_STARTED: 'fleet.mission.started',
    MISSION_COMPLETED: 'fleet.mission.completed',
  },
  WORKFLOW: {
    CREATED: 'workflow.created',
    UPDATED: 'workflow.updated',
    DELETED: 'workflow.deleted',
    EXECUTED: 'workflow.executed',
    COMPLETED: 'workflow.completed',
    FAILED: 'workflow.failed',
    PAUSED: 'workflow.paused',
    RESUMED: 'workflow.resumed',
    STOPPED: 'workflow.stopped',
  },
  AI: {
    INFERENCE_REQUESTED: 'ai.inference.requested',
    INFERENCE_COMPLETED: 'ai.inference.completed',
    INFERENCE_FAILED: 'ai.inference.failed',
  },
  VISION: {
    DETECTION: 'vision.detection',
    STREAM_STARTED: 'vision.stream.started',
    STREAM_STOPPED: 'vision.stream.stopped',
    ALERT: 'vision.alert',
  },
  PLUGIN: {
    LOADED: 'plugin.loaded',
    UNLOADED: 'plugin.unloaded',
    ERROR: 'plugin.error',
  },
} as const;

export type ARIPEventType =
  | (typeof ARIP_EVENTS.DEVICE)[keyof typeof ARIP_EVENTS.DEVICE]
  | (typeof ARIP_EVENTS.FLEET)[keyof typeof ARIP_EVENTS.FLEET]
  | (typeof ARIP_EVENTS.WORKFLOW)[keyof typeof ARIP_EVENTS.WORKFLOW]
  | (typeof ARIP_EVENTS.AI)[keyof typeof ARIP_EVENTS.AI]
  | (typeof ARIP_EVENTS.VISION)[keyof typeof ARIP_EVENTS.VISION]
  | (typeof ARIP_EVENTS.PLUGIN)[keyof typeof ARIP_EVENTS.PLUGIN];
