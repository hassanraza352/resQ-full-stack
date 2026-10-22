import { useState } from "react";
import AppLayout from "../components/AppLayout";
import { HospitalGate } from "../components/HospitalGate";
import Chat from "../components/Chat";
import { Banner, Empty, ErrorBox, Loading, Pager, PriorityBadge, StatusBadge } from "../components/ui";
import { useMyHospital } from "../hooks/useMyHospital";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, typeIcon } from "../api/format";
import type { EmergencyRequest, Meta } from "../api/types";

const Cases = () => {
  const h = useMyHospital();
  const [tab, setTab] = useState<"incoming" | "history">("incoming");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const incoming = useFetch(async () => (await api.get("/hospitals/emergencies/incoming")).data.requests as EmergencyRequest[]);
  const history = useFetch(async () => (await api.get("/hospitals/cases/history", { params: { page, limit: 10 } })).data as { requests: EmergencyRequest[]; meta: Meta }, [page]);
  useLive(["emergency:updated", "resync"], () => { void incoming.reload(true); void history.reload(true); });

  const respond = async (r: EmergencyRequest, response: "accepted" | "declined") => {
    const note = window.prompt(response === "accepted" ? "Optional note for the crew (e.g. ER bay)" : "Reason for declining (optional)") ;
    if (note === null) return;
    try {
      await api.patch(`/hospitals/cases/${r.id}/respond`, { response, note });
      setMsg({ kind: "ok", text: `Case ${response}.` });
      void incoming.reload(true);
    } catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  return (
    <AppLayout title="Cases">
      <HospitalGate {...h}>
        <div className="tabs">
          <span className={`chip ${tab === "incoming" ? "on" : ""}`} onClick={() => setTab("incoming")}>Incoming ({incoming.data?.length ?? 0})</span>
          <span className={`chip ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}>History</span>
        </div>
        {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}

        {tab === "incoming" && (
          <div className="box">
            {incoming.loading && <Loading />}
            {incoming.error && <ErrorBox message={incoming.error} onRetry={() => void incoming.reload()} />}
            {incoming.data?.length === 0 && <Empty icon="📋" title="No incoming cases" hint="Dispatch will propose cases here. Nothing is yours until you accept it." />}
            {incoming.data?.map((r) => (
              <div key={r.id}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="ic">{typeIcon(r.emergencyType)}</div>
                  <div className="t">
                    <b>{r.referenceId} · {r.emergencyType} <PriorityBadge priority={r.priority} /></b>
                    <small>
                      Patient: {r.requester?.name} · {r.contactNumber}<br />
                      From: {r.location.address}<br />
                      {r.description || "No description"}<br />
                      Unit: {r.assignedUnit?.label ? `${r.assignedUnit.label} (${r.assignedUnit.vehicleType})` : "not assigned yet"} · created {fmtDateTime(r.createdAt)}
                    </small>
                  </div>
                  <StatusBadge status={r.status} />
                  {r.hospitalResponse.status === "pending" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn p sm" onClick={() => respond(r, "accepted")}>Accept</button>
                      <button className="btn sm" onClick={() => respond(r, "declined")}>Decline</button>
                    </div>
                  ) : <span className={`badge ${r.hospitalResponse.status === "accepted" ? "b-ok" : "b-red"}`}>{r.hospitalResponse.status}</span>}
                  <button className="btn sm" onClick={() => setOpen(open === r.id ? null : r.id)}>💬</button>
                </div>
                {open === r.id && <div style={{ padding: "0 0 14px 58px" }}><Chat requestId={r.id} /></div>}
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="box">
            {history.loading && <Loading />}
            {history.data?.requests.length === 0 && <Empty icon="📁" title="No past cases" />}
            {history.data?.requests.map((r) => (
              <div className="row" key={r.id}>
                <div className="ic">{typeIcon(r.emergencyType)}</div>
                <div className="t"><b>{r.referenceId}</b><small>{r.location.address} · {fmtDateTime(r.updatedAt)} · hospital: {r.hospitalResponse.status}</small></div>
                <StatusBadge status={r.status} />
              </div>
            ))}
            {history.data && <Pager page={history.data.meta.page} pages={history.data.meta.pages} onPage={setPage} />}
          </div>
        )}
      </HospitalGate>
    </AppLayout>
  );
};

export default Cases;
