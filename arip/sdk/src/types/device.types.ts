export type DeviceType =
  | 'esp32'
  | 'arduino'
  | 'raspberry-pi'
  | 'jetson'
  | 'pixhawk'
  | 'drone'
  | 'robot'
  | 'agv'
  | 'camera'
  | 'sensor'
  | 'gateway'
  | 'plc'
  | 'generic';

export type DeviceStatus = 'online' | 'offline' | 'error' | 'maintenance';

export type DeviceHealth = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface DeviceTelemetry {
  deviceId: string;
  timestamp: Date;
  data: Record<string, number | string | boolean>;
}

export interface DeviceCommand {
  deviceId: string;
  command: string;
  params?: Record<string, unknown>;
  timeout?: number;
}

export interface DeviceCommandResult {
  commandId: string;
  deviceId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  executedAt: Date;
}
