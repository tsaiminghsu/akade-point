export type FleetStatus = 'active' | 'idle' | 'degraded' | 'offline';

export interface FleetSummary {
  fleetId: string;
  name: string;
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  status: FleetStatus;
}

export interface FleetMission {
  missionId: string;
  fleetId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  deviceIds: string[];
  startedAt?: Date;
  completedAt?: Date;
}
