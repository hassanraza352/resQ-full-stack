import { useState } from "react";
import { Link } from "react-router-dom";
import CommercialOverlay from "../components/CommercialOverlay";
import AppLayout from "../components/AppLayout";
import MapView from "../components/MapView";
import { Empty, ErrorBox, Loading, Stat, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api } from "../api/client";
import { fmtDateTime, typeIcon } from "../api/format";
import type { EmergencyRequest, Meta } from "../api/types";

const Dashboard = () => {
  const { user } = useAuth();
  const [showCommercial, setShowCommercial] = useState(true);
  const [commercialKey, setCommercialKey] = useState(0);
  const openCommercial = () => { setCommercialKey((p) => p + 1); setShowCommercial(true); };

  const { data, loading, error, reload } = useFetch(async () => {
    const [recent, active, done] = await Promise.all([
      api.get("/emergencies/my", { params: { limit: 5 } }),
      api.get("/emergencies/my", { params: { scope: "active", limit: 1 } }),
      api.get("/emergencies/my", { params: { status: "completed", limit: 1 } }),
    ]);
    return {
      recent: recent.data.requests as EmergencyRequest[],
      total: (recent.data.meta as Meta).total,
      active: active.data.requests[0] as EmergencyRequest | undefined,
      activeCount: (active.data.meta as Meta).total,
      completed: (done.data.meta as Meta).total,
    };
  });
  useLive(["emergency:updated", "resync"], () => void reload(true));

  return (
    <>
      {showCommercial && <CommercialOverlay key={commercialKey} onFinish={() => setShowCommercial(false)} />}
      <AppLayout title="Dashboard" actions={<button className="btn sm p" onClick={openCommercial}>▶ Commercial</button>}>
        <h2>Welcome back, {user?.name.split(" ")[0]} 👋</h2>
        <p className="sub">We're ready when you need us.</p>

        {loading && <Loading />}
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}

        {data && (
          <>
            <div className="cards">
              <Stat label="Active Requests" value={data.activeCount} badge={data.activeCount ? "In progress" : "None"} kind={data.activeCount ? "b-red" : "b-ok"} />
              <Stat label="Total Reports" value={data.total} badge="All time" />
              <Stat label="Completed" value={data.completed} badge="Resolved" kind="b-ok" />
              <Stat label="Latest Status" value={data.recent[0] ? data.recent[0].status : "—"} badge={data.recent[0]?.referenceId || "No reports"} />
            </div>

            <div className="two">
              <div className="box">
                <h3>Your active request</h3>
                {data.active ? (
                  <>
                    <MapView
                      height={260}
                      markers={[{ id: "i", kind: "incident", position: [data.active.location.latitude, data.active.location.longitude], title: data.active.referenceId, detail: data.active.location.address }]}
                      legendKinds={["incident"]}
                    />
                    <p style={{ marginTop: 10 }}>
                      <StatusBadge status={data.active.status} />{" "}
                      <Link to={`/user/report-details?id=${data.active.id}`}>Open live status →</Link>
                    </p>
                  </>
                ) : (
                  <Empty icon="🛟" title="No active request" hint="If you need help, report an incident." action={<Link className="btn p" to="/user/report">Request Help</Link>} />
                )}
              </div>

              <div className="box">
                <h3>Recent Activity</h3>
                {data.recent.length === 0 && <Empty icon="📄" title="No reports yet" />}
                {data.recent.map((r) => (
                  <div className="row" key={r.id}>
                    <div className="ic">{typeIcon(r.emergencyType)}</div>
                    <div className="t"><b>{r.referenceId}</b><small>{r.emergencyType} · {fmtDateTime(r.createdAt)}</small></div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="video-hero-container">
          <div className="video-hero-header">
            <div>
              <div className="video-tag">RESQ RESPONSE NETWORK</div>
              <h3>Emergency Response Network</h3>
            </div>
          </div>
          <div className="video-hero-wrapper">
            <div className="video-placeholder-overlay">
              <div className="video-play-btn" onClick={openCommercial} role="button" aria-label="Play commercial">▶</div>
              <div className="video-placeholder-text">
                <h3>Help is closer than you think.</h3>
                <p>Find nearby emergency units and hospitals, and report an incident in seconds.</p>
                <Link className="btn p" to="/user/report">Request Help</Link>{" "}
                <Link className="btn" to="/user/map">See nearby units</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="media-placeholder-box">
          <div className="media-placeholder-icon">🏥</div>
          <h4>RESQ Network</h4>
          <p>Stay connected with your emergency response network.</p>
          <button className="btn sky" onClick={openCommercial}>▶ Watch RESQ Commercial</button>
        </div>
      </AppLayout>
    </>
  );
};

export default Dashboard;
