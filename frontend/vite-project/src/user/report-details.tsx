import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import MapView, { type MapMarker } from "../components/MapView";
import { Banner, Empty, ErrorBox, Loading, StatusBadge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive, useSocket } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, fmtDistance, fmtDuration, statusLabel, timeAgo, toLeaflet, typeIcon } from "../api/format";
import type { EmergencyRequest, RouteResult } from "../api/types";

const FLOW = ["pending", "assigned", "accepted", "en-route", "arrived", "in-progress", "completed"];

const ReportDetails = () => {
  const [params] = useSearchParams();
  const wanted = params.get("id");
  const { socket } = useSocket();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeErr, setRouteErr] = useState<string | null>(null);

  // No id -> show the user's current active request, else the most recent one
  const { data: req, loading, error, reload } = useFetch<EmergencyRequest | null>(async () => {
    if (wanted) return (await api.get(`/emergencies/${wanted}`)).data.request;
    const { data } = await api.get("/emergencies/my", { params: { limit: 1, scope: "active" } });
    if (data.requests[0]) return (await api.get(`/emergencies/${data.requests[0].id}`)).data.request;
    const last = await api.get("/emergencies/my", { params: { limit: 1 } });
    return last.data.requests[0] ? (await api.get(`/emergencies/${last.data.requests[0].id}`)).data.request : null;
  }, [wanted]);

  const loadRoute = useCallback(async () => {
    if (!req || !req.assignedUnit?.id || ["completed", "cancelled", "rejected", "pending"].includes(req.status)) { setRoute(null); return; }
    try {
      setRoute((await api.get(`/emergencies/${req.id}/route`)).data);
      setRouteErr(null);
    } catch (e) { setRouteErr(errorMessage(e)); }
  }, [req]);
  useEffect(() => { void loadRoute(); }, [loadRoute]);

  // Join this request's private room (server verifies access) and refresh on events
  useEffect(() => {
    if (!socket || !req) return;
    socket.emit("request:join", { requestId: req.id }, () => {});
    const onLoc = () => void loadRoute();
    socket.on("unit:location", onLoc);
    return () => { socket.off("unit:location", onLoc); socket.emit("request:leave", { requestId: req.id }); };
  }, [socket, req, loadRoute]);
  useLive(["emergency:updated", "resync"], () => { void reload(true); });
  // light polling as a safety net while a unit is moving
  useEffect(() => {
    if (!req?.assignedUnit?.id || ["completed", "cancelled", "rejected"].includes(req.status)) return;
    const t = setInterval(() => void loadRoute(), 20000);
    return () => clearInterval(t);
  }, [req, loadRoute]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!req) return [];
    const out: MapMarker[] = [{ id: "inc", kind: "incident", position: [req.location.latitude, req.location.longitude], title: "Incident", detail: req.location.address }];
    const u = route?.unit?.location;
    if (u) out.push({ id: "unit", kind: "unit-selected", position: toLeaflet(u), title: route?.unit?.label, detail: `Last update ${timeAgo(u.updatedAt)}${u.stale ? " (stale)" : ""}` });
    return out;
  }, [req, route]);

  const cancel = async () => {
    if (!req || !window.confirm(`Cancel request ${req.referenceId}?`)) return;
    try {
      await api.patch(`/emergencies/${req.id}/cancel`, { reason: "Cancelled by requester" });
      setMsg({ kind: "ok", text: "Request cancelled." });
      void reload(true);
    } catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  if (loading) return <AppLayout title="Live Status"><Loading /></AppLayout>;
  if (error) return <AppLayout title="Live Status"><ErrorBox message={error} onRetry={() => void reload()} /></AppLayout>;
  if (!req) return <AppLayout title="Live Status"><div className="box"><Empty icon="📡" title="No requests yet" hint="When you report an incident you can follow it here." action={<Link className="btn p" to="/user/report">Report an incident</Link>} /></div></AppLayout>;

  const reached = new Set<string>(req.statusHistory.map((h) => h.status));
  const closed = ["completed", "cancelled", "rejected"].includes(req.status);
  const unit = req.assignedUnit;
  const loc = route?.unit?.location;

  return (
    <AppLayout title="Live Status">
      {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
      <div className="two" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="box">
          <h3>{typeIcon(req.emergencyType)} {req.referenceId} <StatusBadge status={req.status} /></h3>
          <MapView markers={markers} route={route?.route?.geometry} height={360} legendKinds={["incident", "unit-selected"]} />
          {unit?.id && !closed && (
            <div style={{ marginTop: 10 }}>
              {route?.route ? (
                <p><b>Route-based estimate:</b> {fmtDistance(route.route.distanceMeters)} · ~{fmtDuration(route.route.durationSeconds)} <small style={{ color: "var(--mut)" }}>(road route, no live traffic — not a guaranteed arrival time)</small></p>
              ) : (
                <Banner kind="warn">{routeErr || route?.reason || "Route and ETA are unavailable right now."}{route?.straightLineKm != null && ` Straight-line distance: ${route.straightLineKm} km.`}</Banner>
              )}
              {loc && <p style={{ fontSize: 13, color: "var(--mut)" }}>Unit position updated {timeAgo(loc.updatedAt)} {loc.stale && <b style={{ color: "var(--warn)" }}>· stale, may not reflect where the unit is now</b>}</p>}
            </div>
          )}
          {req.status === "pending" && <Banner kind="info">Waiting for a dispatcher to assign a unit. This can take a few minutes — if it is urgent, call your local emergency number (1122 in Pakistan).</Banner>}
          {req.status === "assigned" && <Banner kind="info">A unit has been assigned and has not accepted yet. Dispatch will reassign if it does not respond.</Banner>}
        </div>

        <div className="box">
          <h3>Status</h3>
          <div className="tl">
            {FLOW.filter((s) => s !== "in-progress" || reached.has("in-progress")).map((s) => {
              const h = req.statusHistory.filter((x) => x.status === s).pop();
              return (
                <div key={s} className={req.status === s ? "cur" : ""} style={{ opacity: reached.has(s) ? 1 : 0.4 }}>
                  <b>{statusLabel(s)}</b>
                  <small style={{ display: "block" }}>{h ? fmtDateTime(h.at) : "—"}</small>
                </div>
              );
            })}
            {(req.status === "cancelled" || req.status === "rejected") && (
              <div className="cur"><b>{statusLabel(req.status)}</b><small style={{ display: "block" }}>{req.cancelReason || ""}</small></div>
            )}
          </div>

          <h3 style={{ marginTop: 18 }}>Assigned unit</h3>
          {unit?.id ? (
            <div className="row">
              <div className="ic">🚑</div>
              <div className="t"><b>{unit.label}</b><small>{unit.vehicleType}{unit.contactNumber && ` · ${unit.contactNumber}`}</small></div>
            </div>
          ) : <p style={{ color: "var(--mut)" }}>No unit assigned yet.</p>}

          {req.assignedHospital?.hospitalName && (
            <>
              <h3 style={{ marginTop: 18 }}>Hospital</h3>
              <div className="row">
                <div className="ic">🏥</div>
                <div className="t"><b>{req.assignedHospital.hospitalName}</b><small>{req.assignedHospital.address} · {req.hospitalResponse.status === "accepted" ? "Accepted the case" : req.hospitalResponse.status === "declined" ? "Declined — dispatch will redirect" : "Awaiting hospital confirmation"}</small></div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {!closed && <Link className="btn sm" to="/user/messages">💬 Message</Link>}
            {["pending", "assigned"].includes(req.status) && <button className="btn sm" onClick={cancel}>Cancel request</button>}
          </div>
          {!closed && !["pending", "assigned"].includes(req.status) && <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 8 }}>The unit has accepted, so it can no longer be cancelled here. Contact the unit or dispatch.</p>}
        </div>
      </div>

      <div className="box">
        <h3>Details</h3>
        <p><b>Location:</b> {req.location.address}</p>
        <p><b>Contact:</b> {req.contactNumber}</p>
        <p><b>Description:</b> {req.description || "—"}</p>
        <p><b>Submitted:</b> {fmtDateTime(req.createdAt)}</p>
      </div>
    </AppLayout>
  );
};

export default ReportDetails;
