/**
 * KML / KMZ import for the flight plan (Google Earth, My Maps, most mapping
 * apps export these). Pulls out polygons, paths and points with their names;
 * the plan view decides what they become (survey area, fence, waypoints,
 * rally points).
 *
 * KML is parsed with a small tolerant scanner instead of DOMParser so the same
 * code runs in tests. KMZ is a zip whose first .kml entry is the document;
 * entries are inflated with the platform's DecompressionStream.
 */

export interface GeoFeatures {
  polygons: { name: string | null; points: [number, number][] }[];
  paths: { name: string | null; points: [number, number, number | null][] }[];
  points: { name: string | null; lat: number; lon: number; alt: number | null }[];
}

const EMPTY = (): GeoFeatures => ({ polygons: [], paths: [], points: [] });

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** "lon,lat[,alt] lon,lat[,alt] …" → [lat, lon, alt|null][] */
function coords(text: string): [number, number, number | null][] {
  const out: [number, number, number | null][] = [];
  for (const tuple of text.trim().split(/\s+/)) {
    const [lon, lat, alt] = tuple.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      out.push([lat, lon, alt !== undefined && Number.isFinite(alt) ? alt : null]);
    }
  }
  return out;
}

// Tags may carry a namespace prefix (kml:Polygon); match the local name.
const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "gi");
const first = (name: string, s: string): string | null => {
  const m = tag(name).exec(s);
  return m ? m[1] : null;
};

export function parseKml(text: string): GeoFeatures {
  const out = EMPTY();
  const placemarks = [...text.matchAll(tag("Placemark"))].map((m) => m[1]);
  for (const pm of placemarks) {
    const nameRaw = first("name", pm);
    const name = nameRaw ? decodeEntities(nameRaw) || null : null;
    for (const poly of pm.matchAll(tag("Polygon"))) {
      const outer = first("outerBoundaryIs", poly[1]) ?? poly[1];
      const c = first("coordinates", outer);
      if (!c) continue;
      const pts = coords(c).map(([lat, lon]) => [lat, lon] as [number, number]);
      // Rings repeat the first point at the end.
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      if (pts.length >= 3) out.polygons.push({ name, points: pts });
    }
    for (const line of pm.matchAll(tag("LineString"))) {
      const c = first("coordinates", line[1]);
      const pts = c ? coords(c) : [];
      if (pts.length >= 2) out.paths.push({ name, points: pts });
    }
    for (const pt of pm.matchAll(tag("Point"))) {
      const c = first("coordinates", pt[1]);
      const p = c ? coords(c)[0] : undefined;
      if (p) out.points.push({ name, lat: p[0], lon: p[1], alt: p[2] });
    }
  }
  return out;
}

/** The first .kml document inside a KMZ (zip) archive. */
export async function kmlFromKmz(buf: ArrayBuffer): Promise<string | null> {
  const view = new DataView(buf);
  let ofs = 0;
  // Walk the local file headers (PK\x03\x04).
  while (ofs + 30 <= buf.byteLength && view.getUint32(ofs, true) === 0x04034b50) {
    const flags = view.getUint16(ofs + 6, true);
    const method = view.getUint16(ofs + 8, true);
    let compSize = view.getUint32(ofs + 18, true);
    const nameLen = view.getUint16(ofs + 26, true);
    const extraLen = view.getUint16(ofs + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, ofs + 30, nameLen));
    const dataStart = ofs + 30 + nameLen + extraLen;
    if (flags & 0x08 && compSize === 0) {
      // Sizes follow the data (streamed zip): find them in the central directory.
      compSize = centralSize(view, name) ?? 0;
    }
    if (/\.kml$/i.test(name)) {
      const data = new Uint8Array(buf, dataStart, compSize);
      if (method === 0) return new TextDecoder().decode(data);
      if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
      }
      return null;
    }
    ofs = dataStart + compSize + (flags & 0x08 ? 16 : 0);
  }
  return null;
}

function centralSize(view: DataView, wanted: string): number | null {
  for (let i = view.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    let p = view.getUint32(i + 16, true);
    const count = view.getUint16(i + 10, true);
    for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extra = view.getUint16(p + 30, true);
      const comment = view.getUint16(p + 32, true);
      const name = new TextDecoder().decode(new Uint8Array(view.buffer, p + 46, nameLen));
      if (name === wanted) return compSize;
      p += 46 + nameLen + extra + comment;
    }
    return null;
  }
  return null;
}

export function isEmpty(f: GeoFeatures): boolean {
  return f.polygons.length === 0 && f.paths.length === 0 && f.points.length === 0;
}
