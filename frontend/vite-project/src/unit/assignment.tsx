import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import AssignmentMap from "../components/AssignmentMap";
import Chat from "../components/Chat";
import { UnitGate } from "../components/UnitGate";
import { Banner, Empty, ErrorBox, Loading, PriorityBadge, StatusBadge } from "../components/ui";
import { useMyUnit } from "../hooks/useMyUnit";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, statusLabel, typeIcon } from "../api/format";
import type { EmergencyRequest } from "../api/types";

const ActiveAssignment = () => {
  const u = useMyUnit();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useFetch(async () => (await api.get("/units/emergencies/assigned")).data.requests as EmergencyRequest[]);
  useLive(["assignment:new", "emergency:updated", "resync"], () => void reload(true));

  const r = data?.find((x) => x.status !== "assigned") || null;
  const pendingAccept = data?.find((x) => x.status === "assigned");

  // keep sharing the position while an assignment is active so the requester can follow
  const needSharing = !!r && !u.sharing;

  const move = async (status: string) => {
    if (!r) return;
    if (status === "completed" && !window.confirm("Mark this assignment as completed? This releases your unit.")) return;
    setBusy(true); setMsg(null);
    try {
      await api.patch(`/units/emergencies/${r.id}/status`, { status });
      setMsg({ kind: "ok", text: `Status updated: ${statusLabel(status)}` });
      void reload(true); void u.reload();
      if (status === "completed") u.stopSharing();
    } catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); } finally { setBusy(false); }
  };

  return (
    <AppLayout title="Active Assignment">
      <UnitGate loading={u.loading} error={u.error} needsRegistration={u.needsRegistration} unit={u.unit} reload={() => void u.reload()}>
        {loading && <Loading />}
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
        {pendingAccept && !r && <Banner kind="warn">You have an assignment waiting for your response. <Link to="/unit/request">Accept or reject it</Link>.</Banner>}
        {data && !r && !pendingAccept && <div className="box"><Empty icon="🚑" title="No active assignment" hint="When dispatch assigns you and you accept, the route appears here." /></div>}
        {needSharing && <Banner kind="warn">Location sharing is off. <button className="btn sm" onClick={u.startSharing}>Start sharing</button> so the requester and dispatch can follow your unit.</Banner>}
        {u.sharing && <Banner kind="info">Sharing your position with dispatch and the requester for this assignment.</Banner>}

        {r && (
          <div className="two" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
            <div className="box">
              <h3>{typeIcon(r.emergencyType)} {r.referenceId} <StatusBadge status={r.status} /> <PriorityBadge priority={r.priority} /></h3>
              <AssignmentMap request={r} />
            </div>
            <div>
              <div className="box">
                <h3>Update status</h3>
                {r.allowedNext.length === 0 && <p style={{ color: "var(--mut)" }}>No further actions.</p>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {r.allowedNext.map((s) => (
                    <button key={s} className={`btn ${s === "completed" ? "p" : ""}`} disabled={busy} onClick={() => move(s)}>
                      {s === "en-route" ? "🚦 Start travelling" : s === "arrived" ? "📍 I have arrived" : s === "in-progress" ? "🩺 Treatment in progress" : s === "completed" ? "✅ Complete" : statusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="box">
                <h3>Patient & incident</h3>
                <p><b>{r.requester?.name}</b> · {r.contactNumber}</p>
                <p>{r.location.address}</p>
                <p style={{ color: "var(--mut)" }}>{r.description || "No description"}</p>
                <small>Assigned {fmtDateTime(r.assignedAt)}</small>
                {r.assignedHospital?.hospitalName && <p style={{ marginTop: 8 }}>🏥 <b>{r.assignedHospital.hospitalName}</b> — {r.hospitalResponse.status === "accepted" ? "accepted the case" : r.hospitalResponse.status === "declined" ? "declined" : "awaiting confirmation"}</p>}
              </div>
              <div className="box"><h3>Messages</h3><Chat requestId={r.id} /></div>
            </div>
          </div>
        )}
      </UnitGate>
    </AppLayout>
  );
};

export default ActiveAssignment;
