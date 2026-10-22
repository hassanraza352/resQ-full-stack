import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { Banner, Empty, ErrorBox, Loading, Pager, StatusBadge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, typeIcon } from "../api/format";
import type { EmergencyRequest, Meta } from "../api/types";

const MyReports = () => {
  const [scope, setScope] = useState<"all" | "active" | "history">("all");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data, loading, error, reload } = useFetch(
    async () => (await api.get("/emergencies/my", { params: { scope, page, limit: 10 } })).data as { requests: EmergencyRequest[]; meta: Meta },
    [scope, page]
  );
  useLive(["emergency:updated", "resync"], () => void reload(true));

  const cancel = async (r: EmergencyRequest) => {
    if (!window.confirm(`Cancel request ${r.referenceId}? This cannot be undone.`)) return;
    try {
      await api.patch(`/emergencies/${r.id}/cancel`, { reason: "Cancelled by requester" });
      setMsg({ kind: "ok", text: `${r.referenceId} cancelled.` });
      void reload(true);
    } catch (e) {
      setMsg({ kind: "err", text: errorMessage(e) });
    }
  };

  return (
    <AppLayout title="My Reports">
      <div className="tabs">
        {(["all", "active", "history"] as const).map((s) => (
          <span key={s} className={`chip ${scope === s ? "on" : ""}`} onClick={() => { setScope(s); setPage(1); }}>
            {s === "all" ? "All" : s === "active" ? "Active" : "Previous"}
          </span>
        ))}
      </div>
      {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && data.requests.length === 0 && (
        <div className="box"><Empty icon="📄" title="No reports here" hint="Your emergency reports will appear here." action={<Link className="btn p" to="/user/report">Report an incident</Link>} /></div>
      )}
      {data && data.requests.length > 0 && (
        <div className="box">
          {data.requests.map((r) => (
            <div className="row" key={r.id}>
              <div className="ic">{typeIcon(r.emergencyType)}</div>
              <div className="t">
                <b>{r.referenceId} · {r.emergencyType}</b>
                <small>{r.location.address} · {fmtDateTime(r.createdAt)}</small>
              </div>
              <StatusBadge status={r.status} />
              <Link className="btn sm" to={`/user/report-details?id=${r.id}`}>Details</Link>
              {["pending", "assigned"].includes(r.status) && <button className="btn sm" onClick={() => cancel(r)}>Cancel</button>}
            </div>
          ))}
          <Pager page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
        </div>
      )}
    </AppLayout>
  );
};

export default MyReports;
