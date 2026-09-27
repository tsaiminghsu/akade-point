"use client";

import { useMemo } from "react";
import L from "leaflet";
import { Circle, Marker, Polygon, Polyline } from "react-leaflet";

import { hasLocation, isNav } from "@/lib/control-center/vehicles/plan/mavCmdMeta";
import { blankItem } from "@/lib/control-center/vehicles/plan/planModel";
import { usePlanStore } from "@/store/usePlanStore";

const iconCache = new Map<string, L.DivIcon>();

function badge(label: string, bg: string, border: string, size = 24): L.DivIcon {
  const k = `${label}|${bg}|${border}|${size}`;
  let icon = iconCache.get(k);
  if (!icon) {
    const safe = label.replace(/</g, "&lt;");
    icon = L.divIcon({
      className: "gcs-wp-icon",
      html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:2px solid ${border};color:#fff;font:600 11px/1 sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.6)">${safe}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    iconCache.set(k, icon);
  }
  return icon;
}

const WP_BG = "#2563eb";
const DO_BG = "#7c3aed";
const SEL = "#facc15";
const plusIcon = () => badge("+", "rgba(255,255,255,0.25)", "rgba(255,255,255,0.8)", 16);
const vertexIcon = (inclusion: boolean) => badge("", inclusion ? "#16a34a" : "#dc2626", "#fff", 12);

/** Everything the flight-plan editor draws on the map, for the active plan kind. */
export function PlanOverlay({ editable }: { editable: boolean }) {
  const kind = usePlanStore((s) => s.kind);
  const mission = usePlanStore((s) => s.mission);
  const fence = usePlanStore((s) => s.fence);
  const rally = usePlanStore((s) => s.rally);
  const selected = usePlanStore((s) => s.selected);
  const draw = usePlanStore((s) => s.draw);
  const drawPoints = usePlanStore((s) => s.drawPoints);
  const select = usePlanStore((s) => s.select);
  const updateItem = usePlanStore((s) => s.updateItem);
  const insertAfter = usePlanStore((s) => s.insertAfter);
  const setHome = usePlanStore((s) => s.setHome);
  const updateFence = usePlanStore((s) => s.updateFence);
  const updateRally = usePlanStore((s) => s.updateRally);

  const homeOk = !(mission.home.lat === 0 && mission.home.lon === 0);

  // Located items in order, with their editor number (1-based).
  const located = useMemo(
    () =>
      mission.items
        .map((it, i) => ({ it, n: i + 1, i }))
        .filter(({ it }) => hasLocation(it.cmd) && !(it.lat === 0 && it.lon === 0)),
    [mission.items]
  );
  const path = useMemo(() => {
    const pts: { lat: number; lon: number; i: number; alt: number }[] = homeOk ? [{ lat: mission.home.lat, lon: mission.home.lon, i: -1, alt: 0 }] : [];
    for (const { it, i } of located) if (isNav(it.cmd)) pts.push({ lat: it.lat, lon: it.lon, i, alt: it.alt });
    return pts;
  }, [located, mission.home, homeOk]);

  const showMission = kind === "mission";
  const fenceOpacity = kind === "fence" ? 1 : 0.35;

  return (
    <>
      {/* Fence (always shown; faint outside the fence editor) */}
      {fence.polygons.map((p) => (
        <Polygon
          key={p.key}
          positions={p.points}
          pathOptions={{ color: p.inclusion ? "#16a34a" : "#dc2626", weight: 2, opacity: fenceOpacity, fillOpacity: 0.08 * fenceOpacity }}
        />
      ))}
      {fence.circles.map((c) => (
        <Circle
          key={c.key}
          center={[c.lat, c.lon]}
          radius={c.radius}
          pathOptions={{ color: c.inclusion ? "#16a34a" : "#dc2626", weight: 2, opacity: fenceOpacity, fillOpacity: 0.08 * fenceOpacity }}
        />
      ))}
      {kind === "fence" &&
        editable &&
        fence.polygons.map((p) =>
          p.points.map((pt, vi) => (
            <Marker
              key={`${p.key}-${vi}`}
              position={pt}
              icon={vertexIcon(p.inclusion)}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  updateFence((f) => ({
                    ...f,
                    polygons: f.polygons.map((q) => (q.key === p.key ? { ...q, points: q.points.map((x, j) => (j === vi ? [ll.lat, ll.lng] : x)) } : q)),
                  }));
                },
              }}
            />
          ))
        )}
      {fence.returnPoint && <Marker position={[fence.returnPoint.lat, fence.returnPoint.lon]} icon={badge("F", "#0f766e", "#fff", 20)} />}

      {/* Rally points */}
      {rally.map((r, i) => (
        <Marker
          key={r.key}
          position={[r.lat, r.lon]}
          icon={badge(`R${i + 1}`, "#b45309", kind === "rally" ? "#fff" : "rgba(255,255,255,.4)", 26)}
          draggable={kind === "rally" && editable}
          opacity={kind === "rally" ? 1 : 0.5}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              updateRally(r.key, { lat: ll.lat, lon: ll.lng });
            },
          }}
        />
      ))}

      {/* Mission */}
      {path.length > 1 && <Polyline positions={path.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: "#facc15", weight: 3, opacity: showMission ? 0.95 : 0.4 }} />}
      {showMission && homeOk && (
        <Marker
          position={[mission.home.lat, mission.home.lon]}
          icon={badge("H", "#16a34a", "#fff", 24)}
          draggable={editable}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              setHome(ll.lat, ll.lng);
            },
          }}
        />
      )}
      {showMission &&
        located.map(({ it, n }) => (
          <Marker
            key={it.key}
            position={[it.lat, it.lon]}
            icon={badge(String(n), isNav(it.cmd) ? WP_BG : DO_BG, it.key === selected ? SEL : "#fff", it.key === selected ? 28 : 24)}
            draggable={editable}
            zIndexOffset={it.key === selected ? 500 : 0}
            eventHandlers={{
              click: () => select(it.key),
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                updateItem(it.key, { lat: ll.lat, lon: ll.lng });
              },
            }}
          />
        ))}
      {showMission &&
        editable &&
        draw === "none" &&
        path.slice(1).map((b, k) => {
          const a = path[k];
          return (
            <Marker
              key={`mid-${b.i}`}
              position={[(a.lat + b.lat) / 2, (a.lon + b.lon) / 2]}
              icon={plusIcon()}
              eventHandlers={{
                click: () => {
                  const alt = a.i < 0 ? b.alt : (a.alt + b.alt) / 2;
                  // Insert just before b, i.e. after the item preceding b.
                  insertAfter(b.i - 1, blankItem(16, (a.lat + b.lat) / 2, (a.lon + b.lon) / 2, Math.round(alt), mission.items[b.i]?.frame ?? 3));
                },
              }}
            />
          );
        })}

      {/* Drawing preview */}
      {drawPoints.length > 0 && (
        <>
          <Polyline
            positions={drawPoints.length > 2 ? [...drawPoints, drawPoints[0]] : drawPoints}
            pathOptions={{ color: draw === "polygonOut" ? "#dc2626" : draw === "survey" ? "#38bdf8" : "#16a34a", weight: 2, dashArray: "6 4" }}
          />
          {drawPoints.map((p, i) => (
            <Marker key={`d-${i}`} position={p} icon={badge(String(i + 1), "#0ea5e9", "#fff", 18)} />
          ))}
        </>
      )}
    </>
  );
}
