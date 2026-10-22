import { useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MarkerKind = "incident" | "user" | "unit" | "unit-selected" | "unit-busy" | "hospital";

export interface MapMarker {
  id: string;
  position: [number, number]; // [latitude, longitude]  (Leaflet order)
  kind: MarkerKind;
  title?: string;
  detail?: string;
  draggable?: boolean;
  onDragEnd?: (pos: [number, number]) => void;
  onClick?: () => void;
}

export const LEGEND: { kind: MarkerKind; icon: string; label: string; color: string }[] = [
  { kind: "incident", icon: "📍", label: "Incident location", color: "#e5202e" },
  { kind: "user", icon: "🧍", label: "You", color: "#2563eb" },
  { kind: "unit", icon: "🚑", label: "Available unit", color: "#10b981" },
  { kind: "unit-busy", icon: "🚑", label: "Unit already assigned", color: "#94a3b8" },
  { kind: "unit-selected", icon: "🚑", label: "Assigned / selected unit", color: "#f59e0b" },
  { kind: "hospital", icon: "🏥", label: "Hospital", color: "#7c3aed" },
];

const icons = new Map<MarkerKind, L.DivIcon>();
const iconFor = (kind: MarkerKind) => {
  let ic = icons.get(kind);
  if (!ic) {
    const l = LEGEND.find((x) => x.kind === kind)!;
    ic = L.divIcon({
      className: "",
      html: `<div style="width:36px;height:36px;border-radius:50%;background:#fff;border:3px solid ${l.color};display:grid;place-items:center;font-size:18px;box-shadow:0 3px 8px rgba(0,0,0,.35)">${l.icon}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });
    icons.set(kind, ic);
  }
  return ic;
};

function Fit({ points, enabled }: { points: [number, number][]; enabled: boolean }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (!enabled || !points.length) return;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15));
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return null;
}

function Clicks({ onPick }: { onPick: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

interface Props {
  markers: MapMarker[];
  route?: [number, number][] | null;
  accuracy?: { center: [number, number]; radius: number } | null;
  onPick?: (pos: [number, number]) => void; // click-to-place (manual location)
  height?: number | string;
  fit?: boolean;
  showLegend?: boolean;
  legendKinds?: MarkerKind[];
  emptyHint?: string;
}

export default function MapView({
  markers, route, accuracy, onPick, height = 420, fit = true, showLegend = true, legendKinds, emptyHint,
}: Props) {
  const [tileError, setTileError] = useState(false);
  const points = useMemo<[number, number][]>(
    () => [...markers.map((m) => m.position), ...(route && route.length > 1 ? [route[0], route[route.length - 1]] : [])],
    [markers, route]
  );
  const center: [number, number] = points[0] || [30.3753, 69.3451]; // Pakistan overview when nothing is known yet
  const legend = LEGEND.filter((l) => !legendKinds || legendKinds.includes(l.kind));

  return (
    <div>
      <div style={{ position: "relative", height, borderRadius: 16, overflow: "hidden", border: "1px solid var(--bd)" }}>
        <MapContainer center={center} zoom={points.length ? 14 : 5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            eventHandlers={{ tileerror: () => setTileError(true), tileload: () => tileError && setTileError(false) }}
          />
          <Fit points={points} enabled={fit} />
          {onPick && <Clicks onPick={onPick} />}
          {accuracy && accuracy.radius > 0 && (
            <Circle center={accuracy.center} radius={accuracy.radius} pathOptions={{ color: "#2563eb", fillOpacity: 0.12, weight: 1 }} />
          )}
          {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }} />}
          {markers.map((m) => (
            <Marker
              key={m.id}
              position={m.position}
              icon={iconFor(m.kind)}
              draggable={!!m.draggable}
              eventHandlers={{
                click: () => m.onClick?.(),
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  m.onDragEnd?.([ll.lat, ll.lng]);
                },
              }}
            >
              {(m.title || m.detail) && (
                <Popup>
                  <b>{m.title}</b>
                  {m.detail && <div style={{ marginTop: 4 }}>{m.detail}</div>}
                </Popup>
              )}
            </Marker>
          ))}
        </MapContainer>
        {!markers.length && emptyHint && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 500 }}>
            <span className="badge b-info" style={{ background: "var(--card)", padding: "10px 14px" }}>{emptyHint}</span>
          </div>
        )}
        {tileError && (
          <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, zIndex: 600 }} role="alert">
            <span className="badge b-warn">Map tiles could not be loaded. Check your connection; markers and lists still work.</span>
          </div>
        )}
      </div>
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 12, color: "var(--mut)" }} aria-label="Map legend">
          {legend.map((l) => (
            <span key={l.kind} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", border: `3px solid ${l.color}`, display: "inline-block" }} />
              {l.label}
            </span>
          ))}
          {route && route.length > 1 && <span><span style={{ display: "inline-block", width: 18, height: 4, background: "#2563eb", verticalAlign: "middle", marginRight: 5 }} />Road route</span>}
        </div>
      )}
    </div>
  );
}
