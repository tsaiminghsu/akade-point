import { describe, expect, it } from "vitest";

import { distanceM } from "../gcs/geo";
import { isEmpty, kmlFromKmz, parseKml } from "./geoImport";
import { ORBIT_MAX_ITEMS, orbitItems } from "./missionTools";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Field &amp; barn</name>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      120.6730,24.1470,0 120.6740,24.1470,0 120.6740,24.1480,0 120.6730,24.1480,0 120.6730,24.1470,0
    </coordinates></LinearRing></outerBoundaryIs>
    <innerBoundaryIs><LinearRing><coordinates>120.6734,24.1474 120.6736,24.1474 120.6735,24.1476</coordinates></LinearRing></innerBoundaryIs></Polygon>
  </Placemark>
  <Placemark><name><![CDATA[Route A]]></name><LineString><coordinates>120.6731,24.1471,35 120.6739,24.1479,40</coordinates></LineString></Placemark>
  <Placemark><kml:name>Landing</kml:name><kml:Point><kml:coordinates>120.6735,24.1475</kml:coordinates></kml:Point></Placemark>
</Document></kml>`;

/** A one-entry zip (deflated), as Google Earth writes KMZ files. */
async function kmz(name: string, text: string): Promise<ArrayBuffer> {
  const raw = new TextEncoder().encode(text);
  const deflated = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  const nameBytes = new TextEncoder().encode(name);
  const header = new DataView(new ArrayBuffer(30));
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(8, 8, true); // deflate
  header.setUint32(18, deflated.length, true);
  header.setUint32(22, raw.length, true);
  header.setUint16(26, nameBytes.length, true);
  const out = new Uint8Array(30 + nameBytes.length + deflated.length);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(nameBytes, 30);
  out.set(deflated, 30 + nameBytes.length);
  return out.buffer;
}

describe("KML import", () => {
  it("reads polygons (outer ring only), paths and points with names", () => {
    const f = parseKml(KML);
    expect(f.polygons).toHaveLength(1);
    expect(f.polygons[0].name).toBe("Field & barn");
    expect(f.polygons[0].points).toHaveLength(4); // closing point dropped
    expect(f.polygons[0].points[0]).toEqual([24.147, 120.673]);
    expect(f.paths[0]).toEqual({ name: "Route A", points: [[24.1471, 120.6731, 35], [24.1479, 120.6739, 40]] });
    expect(f.points[0]).toEqual({ name: "Landing", lat: 24.1475, lon: 120.6735, alt: null });
  });

  it("ignores junk", () => {
    expect(isEmpty(parseKml("<kml><Placemark><Point><coordinates>abc</coordinates></Point></Placemark></kml>"))).toBe(true);
    expect(isEmpty(parseKml("not xml at all"))).toBe(true);
  });

  it("unpacks the .kml inside a KMZ", async () => {
    const buf = await kmz("doc.kml", KML);
    const text = await kmlFromKmz(buf);
    expect(parseKml(text ?? "").paths).toHaveLength(1);
    expect(await kmlFromKmz(await kmz("readme.txt", "hi"))).toBeNull();
  });
});

describe("orbit generator", () => {
  const centre = { lat: 24.1477, lon: 120.6736 };

  it("rings the centre at the radius, closes the loop and wraps it in ROI", () => {
    const items = orbitItems({ ...centre, radius: 50, alt: 30, points: 12, turns: 2, ccw: false, roi: true, startBearing: 90 });
    expect(items[0].cmd).toBe(195);
    expect(items.at(-1)!.cmd).toBe(197);
    const ring = items.filter((i) => i.cmd === 16);
    expect(ring).toHaveLength(2 * 12 + 1);
    for (const w of ring) expect(distanceM(centre.lat, centre.lon, w.lat, w.lon)).toBeCloseTo(50, 0);
    expect(ring[0].lat).toBeCloseTo(ring.at(-1)!.lat, 9);
    // Starts east of the centre (bearing 90).
    expect(ring[0].lon).toBeGreaterThan(centre.lon);
    expect(ring.every((w) => w.alt === 30)).toBe(true);
  });

  it("goes the other way when counter-clockwise and caps the size", () => {
    const cw = orbitItems({ ...centre, radius: 50, alt: 0, points: 8, turns: 1, ccw: false, roi: false, startBearing: 0 });
    const ccw = orbitItems({ ...centre, radius: 50, alt: 0, points: 8, turns: 1, ccw: true, roi: false, startBearing: 0 });
    expect(cw[1].lon).toBeGreaterThan(centre.lon); // clockwise from north heads east
    expect(ccw[1].lon).toBeLessThan(centre.lon);
    expect(orbitItems({ ...centre, radius: 50, alt: 0, points: 72, turns: 20, ccw: false, roi: true })).toHaveLength(ORBIT_MAX_ITEMS);
  });
});
