import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { UnitGate } from "../components/UnitGate";
import { Banner, Empty, ErrorBox, Loading, Pager, PriorityBadge, StatusBadge } from "../components/ui";
import { useMyUnit } from "../hooks/useMyUnit";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, typeIcon } from "../api/format";
import type { EmergencyRequest, Meta } from "../api/types";

const Requests = () => {
  const u = useMyUnit();
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const active = useFetch(async () => (await api.get("/units/emergencies/assigned")).data.requests as EmergencyRequest[]);
  const history = useFetch(async () => (await api.get("/units/emergencies/history", { params: { page, limit: 8 } })).data as { requests: EmergencyRequest[]; meta: Meta }, [page]);
  useLive(["assignment:new", "emergency:updated", "resync"], () => { void active.reload(true); void history.reload(true); void u.reload(); });

  const act = async (r: EmergencyRequest, kind: "accept" | "reject") => {
    let reason = "";
    if (kind === "reject") {
      const input = window.prompt("Why are you rejecting this assignment? (optional)");
      if (input === null) return;
      reason = input;
    }
    setBusy(r.id); setMsg(null);
    try {
      if (kind === "accept") await api.patch(`/units/emergencies/${r.id}/status`, { status: "accepted" });
      else await api.patch(`/units/emergencies/${r.id}/reject`, { reason });
      setMsg({ kind: "ok", text: kind === "accept" ? "Assignment accepted." : "Assignment rejected; dispatch was notified." });
      void active.reload(true); void history.reload(true); void u.reload();
    } catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); } finally { setBusy(null); }
  };

  return (
    <AppLayout title="Requests">
      <UnitGate loading={u.loading} error={u.error} needsRegistration={u.needsRegistration} unit={u.unit} reload={() => void u.reload()}>
        {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
        <div className="box">
          <h3>Assigned to you</h3>
          {active.loading && <Loading />}
          {active.error && <ErrorBox message={active.error} onRetry={() => void active.reload()} />}
          {active.data?.length === 0 && <Empty icon="📥" title="Nothing assigned right now" hint="Stay on duty with location sharing on to receive assignments from dispatch." />}
          {active.data?.map((r) => (
            <div className="row" key={r.id} style={{ alignItems: "flex-start" }}>
              <div className="ic">{typeIcon(r.emergencyType)}</div>
              <div className="t">
                <b>{r.referenceId} · {r.emergencyType} <PriorityBadge priority={r.priority} /></b>
                <small>{r.location.address}<br />Patient contact: {r.requester?.name} · {r.contactNumber}<br />{r.description || "No description"}<br />Assigned {fmtDateTime(r.assignedAt)}</small>
              </div>
              <StatusBadge status={r.status} />
              {r.status === "assigned" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn p sm" disabled={busy === r.id} onClick={() => act(r, "accept")}>Accept</button>
                  <button className="btn sm" disabled={busy === r.id} onClick={() => act(r, "reject")}>Reject</button>
                </div>
              ) : <Link className="btn p sm" to="/unit/assignment">Open</Link>}
            </div>
          ))}
        </div>

        <div className="box">
          <h3>Previous assignments</h3>
          {history.loading && <Loading />}
          {history.data?.requests.length === 0 && <Empty icon="📁" title="No completed assignments yet" />}
          {history.data?.requests.map((r) => (
            <div className="row" key={r.id}>
              <div className="ic">{typeIcon(r.emergencyType)}</div>
              <div className="t"><b>{r.referenceId}</b><small>{r.location.address} · {fmtDateTime(r.updatedAt)}</small></div>
              <StatusBadge status={r.status} />
            </div>
          ))}
          {history.data && <Pager page={history.data.meta.page} pages={history.data.meta.pages} onPage={setPage} />}
        </div>
      </UnitGate>
    </AppLayout>
  );
};

export default Requests;
