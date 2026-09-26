/**
 * Base map layers for the ground station. All are Web Mercator (EPSG:3857)
 * XYZ tiles and all send CORS headers, which the tile service worker needs to
 * cache real (non-opaque) responses.
 *
 * `prefetch` marks layers whose terms allow downloading an area ahead of time
 * for offline use. OpenStreetMap's tile policy forbids bulk download and Esri
 * restricts it, so those are only cached as you browse.
 */

export interface TileLayerDef {
  id: string;
  /** i18n key under Gcs.map.layers */
  labelKey: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
  prefetch: boolean;
  satellite: boolean;
}

export const TILE_LAYERS: TileLayerDef[] = [
  {
    id: "nlsc-photo",
    labelKey: "nlscPhoto",
    url: "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>',
    maxZoom: 21,
    maxNativeZoom: 20,
    prefetch: true,
    satellite: true,
  },
  {
    id: "nlsc-emap",
    labelKey: "nlscEmap",
    url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>',
    maxZoom: 21,
    maxNativeZoom: 20,
    prefetch: true,
    satellite: false,
  },
  {
    id: "esri",
    labelKey: "esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 21,
    maxNativeZoom: 19,
    prefetch: false,
    satellite: true,
  },
  {
    id: "osm",
    labelKey: "osm",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 21,
    maxNativeZoom: 19,
    prefetch: false,
    satellite: false,
  },
];

/** Hosts the tile service worker caches (and nothing else). */
export const TILE_HOSTS = ["wmts.nlsc.gov.tw", "server.arcgisonline.com", "tile.openstreetmap.org"];

export const DEFAULT_LAYER_ID = "nlsc-photo";

export function layerById(id: string): TileLayerDef {
  return TILE_LAYERS.find((l) => l.id === id) ?? TILE_LAYERS[0];
}

/** Slippy-map tile x/y at zoom z for a lat/lon. */
export function tileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export const PREFETCH_MAX_TILES = 3000;

/**
 * Every tile URL covering the bounds from zoom `fromZ` to `toZ`, or null if
 * that exceeds PREFETCH_MAX_TILES (zoom in, or lower toZ).
 */
export function tilesForBounds(
  layer: TileLayerDef,
  bounds: { north: number; south: number; east: number; west: number },
  fromZ: number,
  toZ: number
): string[] | null {
  const urls: string[] = [];
  for (let z = fromZ; z <= Math.min(toZ, layer.maxNativeZoom); z++) {
    const a = tileXY(bounds.north, bounds.west, z);
    const b = tileXY(bounds.south, bounds.east, z);
    const count = (b.x - a.x + 1) * (b.y - a.y + 1);
    if (urls.length + count > PREFETCH_MAX_TILES) return null;
    for (let x = a.x; x <= b.x; x++) {
      for (let y = a.y; y <= b.y; y++) {
        urls.push(layer.url.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
      }
    }
  }
  return urls;
}
