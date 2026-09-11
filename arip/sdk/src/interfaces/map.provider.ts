export interface GeoPoint {
  lat: number;
  lng: number;
  alt?: number;
}

export interface MapAsset {
  id: string;
  type: 'device' | 'robot' | 'vehicle' | 'drone' | 'poi';
  position: GeoPoint;
  heading?: number;
  speed?: number;
  status: 'active' | 'idle' | 'offline';
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface MapRoute {
  id: string;
  name: string;
  waypoints: GeoPoint[];
  metadata?: Record<string, unknown>;
}

export interface MapGeofence {
  id: string;
  name: string;
  polygon: GeoPoint[];
  onEnter?: string;
  onExit?: string;
  metadata?: Record<string, unknown>;
}

export interface MapBounds {
  sw: GeoPoint;
  ne: GeoPoint;
}

export interface MapProvider {
  readonly name: string;

  updateAsset(asset: MapAsset): Promise<void>;
  removeAsset(assetId: string): Promise<void>;
  getAssetsInBounds(bounds: MapBounds): Promise<MapAsset[]>;
  createGeofence(fence: Omit<MapGeofence, 'id'>): Promise<MapGeofence>;
  deleteGeofence(fenceId: string): Promise<void>;
  checkGeofences(point: GeoPoint): Promise<MapGeofence[]>;
  createRoute(route: Omit<MapRoute, 'id'>): Promise<MapRoute>;
  deleteRoute(routeId: string): Promise<void>;
}
