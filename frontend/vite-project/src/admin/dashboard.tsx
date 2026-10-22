import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import MapView, { type MapMarker } from "../components/MapView";
import { Empty, ErrorBox, Loading, PriorityBadge, Stat, StatusBadge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api } from "../api/client";
import { timeAgo, typeIcon } from "../api/format";
import type { EmergencyRequest } from "../api/types";

interface Stats {
  users: { total: number; byRole: Record<string, number> };
  units: { total: number; verified: number; pending: number; available: number; assigned: number; offline: number };
  hospitals: { total: number; verified: number; pending: number; accepting: number };
  emergencies: { total: number; pending: number; active: number; completed: number; cancelled: number };
  timings: { timeToArrival: { sampleSize: number; averageMinutes: number | null } };
  generatedAt: string;
}

const Dashboardadmin = () => {
  const { data, loading, error, reload } = useFetch(async () => {
    const [s, a] = await Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/emergencies", { params: { scope: "active", limit: 50, sort: "priority" } }),
    ]);
    return { stats: s.data.data as Stats, active: a.data.requests as EmergencyRequest[] };
  });
  useLive(["emergency:new", "emergency:updated", "resync"], () => void reload(true));

  const markers: MapMarker[] = (data?.active || []).map((r) => ({
    id: r.id, kind: "incident", position: [r.location.latitude, r.location.longitude],
    title: `${r.referenceId} (${r.status})`, detail: r.location.address,
  }));
  const s = data?.stats;
  const pendingList = data?.active.filter((r) => r.status === "pending") || [];

  return (
    <AppLayout title="Admin Dashboard">
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {s && (
        <>
          <div className="cards">
            <Stat label="Active incidents" value={s.emergencies.active} badge={`${s.emergencies.pending} awaiting dispatch`} kind={s.emergencies.pending ? "b-red" : "b-ok"} />
            <Stat label="Total requests" value={s.emergencies.total} badge={`${s.emergencies.completed} completed`} kind="b-info" />
            <Stat label="Units available" value={s.units.available} badge={`${s.units.assigned} assigned · ${s.units.offline} off duty`} kind={s.units.available ? "b-ok" : "b-warn"} />
            <Stat label="Verified hospitals" value={s.hospitals.verified} badge={`${s.hospitals.accepting} accepting`} kind="b-ok" />
            <Stat label="Pending verifications" value={s.units.pending + s.hospitals.pending} badge={`${s.units.pending} units · ${s.hospitals.pending} hospitals`} kind={s.units.pending + s.hospitals.pending ? "b-warn" : "b-ok"} />
            <Stat label="Avg. time to arrival" value={s.timings.timeToArrival.averageMinutes != null ? `${s.timings.timeToArrival.averageMinutes} min` : "—"} badge={s.timings.timeToArrival.sampleSize ? `n=${s.timings.timeToArrival.sampleSize}` : "not enough data"} />
          </div>

          <div className="two">
            <div className="box">
              <h3>Active incidents map</h3>
              <MapView markers={markers} height={380} legendKinds={["incident"]} emptyHint="No active incidents" />
            </div>
            <div className="box">
              <h3>Awaiting dispatch {pendingList.length > 0 && <span className="badge b-red">{pendingList.length}</span>}</h3>
              {pendingList.length === 0 && <Empty icon="✅" title="Queue is clear" />}
              {pendingList.slice(0, 8).map((r) => (
                <div className="row" key={r.id}>
                  <div className="ic">{typeIcon(r.emergencyType)}</div>
                  <div className="t"><b>{r.referenceId} <PriorityBadge priority={r.priority} /></b><small>{r.location.address} · {timeAgo(r.createdAt)}</small></div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
              <p style={{ marginTop: 10 }}><Link className="btn p sm" to="/admin/incident">Open dispatch workspace →</Link></p>
              <small style={{ color: "var(--mut)" }}>Figures computed from the database at {new Date(s.generatedAt).toLocaleTimeString()}.</small>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Dashboardadmin;
