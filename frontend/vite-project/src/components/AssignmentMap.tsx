import { useCallback, useEffect, useMemo, useState } from "react";
import MapView, { type MapMarker } from "./MapView";
import { Banner } from "./ui";
import { api, errorMessage } from "../api/client";
import { fmtDistance, fmtDuration, timeAgo, toLeaflet } from "../api/format";
import type { EmergencyRequest, RouteResult } from "../api/types";
import { useSocket } from "../context/SocketContext";

/** Incident + unit position + road route + route-based ETA for one request (unit view). */
export default function AssignmentMap({ request, height = 380 }: { request: EmergencyRequest; height?: number }) {
  const { socket } = useSocket();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRoute((await api.get(`/emergencies/${request.id}/route`)).data);
      setErr(null);
    } catch (e) { setErr(errorMessage(e)); } finally { setLoading(false); }
  }, [request.id]);

  useEffect(() => { void load(); }, [load, request.status]);
  useEffect(() => { const t = setInterval(() => void load(), 30000); return () => clearInterval(t); }, [load]); // re-route sensibly, not per GPS tick
  useEffect(() => {
    if (!socket) return;
    socket.emit("request:join", { requestId: request.id }, () => {});
    return () => { socket.emit("request:leave", { requestId: request.id }); };
  }, [socket, request.id]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [{ id: "inc", kind: "incident", position: [request.location.latitude, request.location.longitude], title: request.referenceId, detail: request.location.address }];
    const u = route?.unit?.location;
    if (u) m.push({ id: "me", kind: "unit-selected", position: toLeaflet(u), title: "Your unit", detail: `Updated ${timeAgo(u.updatedAt)}` });
    return m;
  }, [request, route]);

  const { latitude: la, longitude: lo } = request.location;
  const u = route?.unit?.location;

  return (
    <div>
      <MapView markers={markers} route={route?.route?.geometry} height={height} legendKinds={["incident", "unit-selected"]} />
      <div style={{ marginTop: 10 }}>
        {loading && <p style={{ color: "var(--mut)" }}>Calculating route…</p>}
        {err && <Banner kind="err">{err}</Banner>}
        {route?.route && (
          <p><b>Road route:</b> {fmtDistance(route.route.distanceMeters)} · ~{fmtDuration(route.route.durationSeconds)} <small style={{ color: "var(--mut)" }}>(estimate from your last position, no live traffic)</small></p>
        )}
        {route && !route.route && <Banner kind="warn">{route.reason || "Route unavailable"}{route.straightLineKm != null && ` · straight-line ${route.straightLineKm} km`}. Use the navigation link below.</Banner>}
        {u?.stale && <Banner kind="warn">Your last position sent to RESQ is {timeAgo(u.updatedAt)}. Keep location sharing on so the route and the requester's tracking stay accurate.</Banner>}
        <a className="btn p" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${la},${lo}&travelmode=driving`}>🧭 Open in Google Maps</a>{" "}
        <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${la}%2C${lo}`}>OpenStreetMap</a>
      </div>
    </div>
  );
}
