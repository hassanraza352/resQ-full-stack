import { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "../components/AppLayout";
import MapView, { type MapMarker } from "../components/MapView";
import Chat from "../components/Chat";
import { Banner, Empty, ErrorBox, Loading, Pager, PriorityBadge, StatusBadge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, fmtDistance, fmtDuration, statusLabel, timeAgo, toLeaflet, typeIcon } from "../api/format";
import type { Candidate, EmergencyRequest, HospitalInfo, Meta, RouteResult } from "../api/types";

const STATUS_FILTERS = ["pending", "assigned", "accepted", "en-route", "arrived", "in-progress", "completed", "cancelled", "rejected"];
const TYPES = ["medical", "accident", "cardiac", "pregnancy", "fire", "other"];

const Incidents = () => {
  const [f, setF] = useState({ scope: "active", status: "", emergencyType: "", priority: "", from: "", to: "", q: "", sort: "priority" });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);

  const list = useFetch(async () => {
    const params: Record<string, string | number> = { page, limit: 12, sort: f.sort };
    if (f.status) params.status = f.status; else if (f.scope === "active") params.scope = "active";
    (["emergencyType", "priority", "from", "to", "q"] as const).forEach((k) => { if (f[k]) params[k] = f[k]; });
    if (f.to) params.to = new Date(`${f.to}T23:59:59`).toISOString();
    if (f.from) params.from = new Date(`${f.from}T00:00:00`).toISOString();
    return (await api.get("/admin/emergencies", { params })).data as { requests: EmergencyRequest[]; meta: Meta };
  }, [page, f]);

  const detail = useFetch<EmergencyRequest | null>(async () => selectedId ? (await api.get(`/admin/emergencies/${selectedId}`)).data.request : null, [selectedId]);

  const refresh = useCallback(() => { void list.reload(true); void detail.reload(true); }, [list, detail]);
  useLive(["emergency:new", "emergency:updated", "resync"], () => refresh());

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setPage(1); setF((p) => ({ ...p, [k]: e.target.value })); };
  const r = detail.data;

  return (
    <AppLayout title="Incidents & Dispatch">
      <div className="box" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          <div className="fld"><label>Search</label><input placeholder="Reference / address" value={f.q} onChange={set("q")} /></div>
          <div className="fld"><label>Status</label>
            <select value={f.status || f.scope} onChange={(e) => { setPage(1); const v = e.target.value; setF((p) => ({ ...p, status: ["active", "all"].includes(v) ? "" : v, scope: v === "all" ? "all" : "active" })); }}>
              <option value="active">Active (open)</option><option value="all">All</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select></div>
          <div className="fld"><label>Category</label><select value={f.emergencyType} onChange={set("emergencyType")}><option value="">All</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="fld"><label>Priority</label><select value={f.priority} onChange={set("priority")}><option value="">All</option>{["critical", "high", "normal", "low"].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="fld"><label>From</label><input type="date" value={f.from} onChange={set("from")} /></div>
          <div className="fld"><label>To</label><input type="date" value={f.to} onChange={set("to")} /></div>
          <div className="fld"><label>Sort</label><select value={f.sort} onChange={set("sort")}><option value="priority">Priority, oldest first</option><option value="date">Newest first</option></select></div>
        </div>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <div className="two" style={{ gridTemplateColumns: "1fr 1.7fr", alignItems: "start" }}>
        <div className="box">
          <h3>Requests {list.data && <span className="badge b-info">{list.data.meta.total}</span>}</h3>
          {list.loading && <Loading />}
          {list.error && <ErrorBox message={list.error} onRetry={() => void list.reload()} />}
          {list.data?.requests.length === 0 && <Empty icon="✅" title="No requests match" hint="Try changing the filters." />}
          {list.data?.requests.map((x) => (
            <div className="row" key={x.id} onClick={() => { setSelectedId(x.id); setMsg(null); }} style={{ cursor: "pointer", background: selectedId === x.id ? "rgba(56,189,248,.14)" : undefined }}>
              <div className="ic">{typeIcon(x.emergencyType)}</div>
              <div className="t"><b>{x.referenceId} <PriorityBadge priority={x.priority} /></b><small>{x.location.address} · {timeAgo(x.createdAt)}</small></div>
              <StatusBadge status={x.status} />
            </div>
          ))}
          {list.data && <Pager page={list.data.meta.page} pages={list.data.meta.pages} onPage={setPage} />}
        </div>

        <div>
          {!selectedId && <div className="box"><Empty icon="👈" title="Select a request" hint="Pick an incident to see its location, nearby units and dispatch options." /></div>}
          {selectedId && detail.loading && !r && <Loading />}
          {detail.error && <ErrorBox message={detail.error} onRetry={() => void detail.reload()} />}
          {r && <Detail key={r.id} r={r} onChanged={refresh} setMsg={setMsg} />}
        </div>
      </div>
    </AppLayout>
  );
};

function Detail({ r, onChanged, setMsg }: { r: EmergencyRequest; onChanged: () => void; setMsg: (m: { kind: "ok" | "err" | "warn"; text: string } | null) => void }) {
  const open = !["completed", "cancelled", "rejected"].includes(r.status);
  const dispatchable = ["pending", "assigned"].includes(r.status);
  const [radius, setRadius] = useState(15);
  const [busy, setBusy] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [hospPick, setHospPick] = useState("");

  const cands = useFetch<{ candidates: Candidate[]; warning: string | null; routing: { available: boolean } } | null>(
    async () => dispatchable ? (await api.get(`/admin/emergencies/${r.id}/candidates`, { params: { radiusKm: radius } })).data : null,
    [r.id, r.status, radius]
  );
  const hospitals = useFetch(async () => open ? (await api.get("/admin/hospitals/available")).data.hospitals as HospitalInfo[] : [], [r.id]);
  const route = useFetch<RouteResult | null>(async () => r.assignedUnit?.id && open && r.status !== "pending" ? (await api.get(`/emergencies/${r.id}/route`)).data : null, [r.id, r.status, r.updatedAt]);

  useEffect(() => { if (!dispatchable) return; const t = setInterval(() => void cands.reload(true), 30000); return () => clearInterval(t); }, [dispatchable, cands]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: ok }); onChanged(); void cands.reload(true); }
    catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); void cands.reload(true); } finally { setBusy(false); }
  };

  const assign = (c: Candidate) => {
    const verb = r.status === "assigned" ? "Reassign this request to" : "Assign this request to";
    if (!window.confirm(`${verb} ${c.label}${c.road ? ` (~${fmtDuration(c.road.durationSeconds)} by road)` : ""}?`)) return;
    void act(() => api.patch(`/admin/emergencies/${r.id}/${r.status === "assigned" ? "reassign" : "assign"}`, { unitId: c.id }), `${c.label} ${r.status === "assigned" ? "reassigned" : "assigned"}. Waiting for the unit to accept.`);
  };
  const cancel = () => { const reason = window.prompt("Reason for cancelling this request (required):"); if (reason && reason.trim().length >= 3) void act(() => api.patch(`/admin/emergencies/${r.id}/cancel`, { reason }), "Request cancelled."); };
  const reject = () => { const reason = window.prompt("Reason for rejecting this request (required):"); if (reason && reason.trim().length >= 3) void act(() => api.patch(`/admin/emergencies/${r.id}/reject`, { reason }), "Request rejected."); };
  const setPriority = (priority: string) => void act(() => api.patch(`/admin/emergencies/${r.id}/priority`, { priority }), `Priority set to ${priority}.`);
  const assignHospital = () => hospPick && void act(() => api.patch(`/admin/emergencies/${r.id}/assign-hospital`, { hospitalId: hospPick }), "Hospital proposed. Waiting for it to accept.");

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [{ id: "inc", kind: "incident", position: [r.location.latitude, r.location.longitude], title: r.referenceId, detail: r.location.address }];
    if (r.status === "pending" || r.status === "assigned") {
      cands.data?.candidates.forEach((c) => c.location && m.push({
        id: c.id, kind: c.isCurrentlyAssignedToThisRequest ? "unit-selected" : c.eligible ? "unit" : "unit-busy", position: toLeaflet(c.location),
        title: c.label, detail: `${c.vehicleType} · ${c.straightLineKm} km straight-line${c.road ? ` · ${fmtDistance(c.road.distanceMeters)} / ~${fmtDuration(c.road.durationSeconds)} by road` : ""}${c.eligible ? "" : ` · ${c.ineligibleReason}`}`,
      }));
    } else if (route.data?.unit?.location) {
      m.push({ id: "u", kind: "unit-selected", position: toLeaflet(route.data.unit.location), title: route.data.unit.label, detail: `Updated ${timeAgo(route.data.unit.location.updatedAt)}` });
    }
    return m;
  }, [r, cands.data, route.data]);

  const eligible = cands.data?.candidates.filter((c) => c.eligible) ?? [];

  return (
    <>
      <div className="box">
        <h3>{typeIcon(r.emergencyType)} {r.referenceId} <StatusBadge status={r.status} /> <PriorityBadge priority={r.priority} /></h3>
        <MapView markers={markers} route={route.data?.route?.geometry} height={340} legendKinds={["incident", "unit", "unit-busy", "unit-selected"]} />
        {route.data?.route && <p style={{ marginTop: 8 }}><b>Assigned unit route:</b> {fmtDistance(route.data.route.distanceMeters)} · ~{fmtDuration(route.data.route.durationSeconds)} <small style={{ color: "var(--mut)" }}>(route estimate, no live traffic; unit position {timeAgo(route.data.unit?.location?.updatedAt)}{route.data.unit?.location?.stale ? ", STALE" : ""})</small></p>}
        {route.data && !route.data.route && r.assignedUnit?.id && <Banner kind="warn">{route.data.reason || "Route unavailable"}{route.data.straightLineKm != null && ` · straight-line ${route.data.straightLineKm} km`}</Banner>}
        <p style={{ marginTop: 8 }}><b>Location:</b> {r.location.address} <small>({r.location.latitude.toFixed(5)}, {r.location.longitude.toFixed(5)} · {r.location.source}{r.location.accuracy ? ` ±${r.location.accuracy} m` : ""})</small></p>
        <p><b>Requester:</b> {r.requester?.name} · {r.requester?.phone} · contact {r.contactNumber}</p>
        <p><b>Description:</b> {r.description || "—"}</p>
        <p><b>Created:</b> {fmtDateTime(r.createdAt)}</p>
        {r.assignedUnit?.id && <p><b>Unit:</b> {r.assignedUnit.label} ({r.assignedUnit.vehicleType}) {r.assignedUnit.registrationNumber && `· ${r.assignedUnit.registrationNumber}`} {r.assignedUnit.contactNumber && `· ${r.assignedUnit.contactNumber}`}</p>}
        {r.assignedHospital?.hospitalName && <p><b>Hospital:</b> {r.assignedHospital.hospitalName} · <span className={`badge ${r.hospitalResponse.status === "accepted" ? "b-ok" : r.hospitalResponse.status === "declined" ? "b-red" : "b-warn"}`}>{r.hospitalResponse.status}</span></p>}

        {open && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            <label style={{ fontSize: 13 }}>Priority{" "}
              <select value={r.priority} disabled={busy} onChange={(e) => setPriority(e.target.value)}>{["low", "normal", "high", "critical"].map((p) => <option key={p}>{p}</option>)}</select>
            </label>
            {r.priority !== "critical" && <button className="btn sm" disabled={busy} onClick={() => setPriority("critical")}>⬆ Escalate to critical</button>}
            {r.status === "pending" && <button className="btn sm" disabled={busy} onClick={reject}>Reject</button>}
            <button className="btn sm" disabled={busy} onClick={cancel}>Cancel request</button>
            <button className="btn sm" onClick={() => setShowChat((s) => !s)}>💬 Messages</button>
          </div>
        )}
        {showChat && <div style={{ marginTop: 12 }}><Chat requestId={r.id} /></div>}
      </div>

      {dispatchable && (
        <div className="box">
          <h3>🚑 {r.status === "assigned" ? "Reassign unit (before the unit accepts)" : "Assign a unit"}</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontSize: 13 }}>Search radius{" "}<select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[5, 10, 15, 25, 40].map((x) => <option key={x} value={x}>{x} km</option>)}</select></label>
            <button className="btn sm" onClick={() => void cands.reload()}>↻ Refresh</button>
          </div>
          <Banner kind="info">Straight-line distance is only used to find candidates. Road distance and ETA come from a routing service (no live traffic) when available — they are estimates, not guarantees.</Banner>
          {cands.loading && <Loading text="Finding units…" />}
          {cands.error && <ErrorBox message={cands.error} onRetry={() => void cands.reload()} />}
          {cands.data?.warning && <Banner kind="warn">⚠ {cands.data.warning}</Banner>}
          {cands.data && !cands.data.routing.available && cands.data.candidates.length > 0 && <Banner kind="warn">Road routing is unavailable right now — only straight-line distances are shown.</Banner>}
          {cands.data && cands.data.candidates.length > 0 && (
            <div className="tw"><table>
              <thead><tr><th>Unit</th><th>Type</th><th>Status</th><th>Straight-line</th><th>Road / ETA</th><th>Position</th><th /></tr></thead>
              <tbody>
                {cands.data.candidates.map((c) => (
                  <tr key={c.id} style={{ opacity: c.eligible ? 1 : 0.65 }}>
                    <td><b>{c.label}</b><br /><small>{c.registrationNumber}</small>{c.previouslyRejected && <><br /><span className="badge b-warn">rejected before</span></>}</td>
                    <td>{c.vehicleType}</td>
                    <td>{c.isCurrentlyAssignedToThisRequest ? <span className="badge b-info">current</span> : c.eligible ? <span className="badge b-ok">available</span> : <span className="badge b-warn">{c.ineligibleReason}</span>}
                      {c.currentAssignment && <><br /><small>{c.currentAssignment.referenceId} ({c.currentAssignment.status})</small></>}</td>
                    <td>{c.straightLineKm} km</td>
                    <td>{c.road ? <>{fmtDistance(c.road.distanceMeters)}<br /><b>~{fmtDuration(c.road.durationSeconds)}</b></> : "n/a"}</td>
                    <td>{timeAgo(c.location?.updatedAt)}{c.location?.stale && <><br /><span className="badge b-warn">stale</span></>}</td>
                    <td>{c.eligible && !c.isCurrentlyAssignedToThisRequest && <button className="btn p sm" disabled={busy} onClick={() => assign(c)}>{r.status === "assigned" ? "Reassign" : "Assign"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {cands.data && cands.data.candidates.length === 0 && !cands.data.warning && <Empty icon="🚑" title="No units found in range" />}
          {cands.data && eligible.length === 0 && <p style={{ color: "var(--mut)", marginTop: 8 }}>Escalation: widen the radius, contact units by phone, or follow your emergency escalation procedure.</p>}
        </div>
      )}

      {open && (
        <div className="box">
          <h3>🏥 Destination hospital</h3>
          <p style={{ color: "var(--mut)", marginBottom: 8 }}>Proposing a hospital does not mean it has accepted the patient — the hospital must confirm.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={hospPick} onChange={(e) => setHospPick(e.target.value)}>
              <option value="">Select a verified, accepting hospital…</option>
              {hospitals.data?.map((h) => <option key={h.id} value={h.id}>{h.hospitalName} — beds {h.beds.availableBeds}/{h.beds.totalBeds}{h.beds.stale ? " (outdated)" : ""}</option>)}
            </select>
            <button className="btn p sm" disabled={!hospPick || busy} onClick={assignHospital}>Propose hospital</button>
          </div>
        </div>
      )}

      <div className="box">
        <h3>History</h3>
        <div className="tl">
          {r.statusHistory.map((h, i) => (
            <div key={i}><b>{statusLabel(h.status)}</b> <small>· {h.byRole} · {fmtDateTime(h.at)}</small>{h.note && <small style={{ display: "block" }}>{h.note}</small>}</div>
          ))}
        </div>
        {r.assignmentHistory && r.assignmentHistory.length > 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>Assignment history</h3>
            {r.assignmentHistory.map((a, i) => <p key={i} style={{ fontSize: 13 }}>{fmtDateTime(a.at)} — unit …{a.unit.slice(-4).toUpperCase()} <b>{a.action}</b> by {a.byRole}{a.note && ` (${a.note})`}</p>)}
          </>
        )}
      </div>
    </>
  );
}

export default Incidents;
