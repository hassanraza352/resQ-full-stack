import { useState } from "react";
import AppLayout from "../components/AppLayout";
import { Banner, Empty, ErrorBox, Loading, Pager } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { fmtDateTime, timeAgo } from "../api/format";
import type { Meta, UnitInfo } from "../api/types";

type AdminUnit = UnitInfo & { user?: { name: string; email: string; phone: string }; createdAt: string };

const Units = () => {
  const [verification, setVerification] = useState("");
  const [availability, setAvailability] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { data, loading, error, reload } = useFetch(
    async () => (await api.get("/admin/units", { params: { page, limit: 15, ...(verification && { verification }), ...(availability && { availability }) } })).data as { units: AdminUnit[]; meta: Meta },
    [page, verification, availability]
  );
  useLive(["notification:new", "resync"], () => void reload(true));

  const review = async (u: AdminUnit, status: "verified" | "rejected") => {
    if (!window.confirm(`${status === "verified" ? "Verify" : "Reject"} unit ${u.registrationNumber}?`)) return;
    try { await api.patch(`/admin/units/${u.id}/review`, { status }); setMsg({ kind: "ok", text: `Unit ${status}.` }); void reload(true); }
    catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  return (
    <AppLayout title="Service Units">
      <div className="tabs">
        <select value={verification} onChange={(e) => { setPage(1); setVerification(e.target.value); }}>
          <option value="">All verification states</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
        </select>
        <select value={availability} onChange={(e) => { setPage(1); setAvailability(e.target.value); }}>
          <option value="">All availability</option><option value="available">Available</option><option value="busy">Assigned</option><option value="offline">Off duty</option>
        </select>
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data?.units.length === 0 && <div className="box"><Empty icon="🚑" title="No units match" /></div>}
      {data && data.units.length > 0 && (
        <div className="box">
          <div className="tw"><table>
            <thead><tr><th>Unit</th><th>Crew account</th><th>Vehicle</th><th>Verification</th><th>Availability</th><th>Position</th><th>Registered</th><th /></tr></thead>
            <tbody>
              {data.units.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.label}</b><br /><small>{u.registrationNumber}</small></td>
                  <td>{u.user?.name}<br /><small>{u.user?.email}<br />{u.contactNumber}</small></td>
                  <td>{u.vehicleModel}<br /><small>{u.vehicleType} · cap {u.capacity}</small></td>
                  <td><span className={`badge ${u.verificationStatus === "verified" ? "b-ok" : u.verificationStatus === "rejected" ? "b-red" : "b-warn"}`}>{u.verificationStatus}</span></td>
                  <td><span className={`badge ${u.availability === "available" ? "b-ok" : u.availability === "busy" ? "b-warn" : "b-info"}`}>{u.availability}</span></td>
                  <td>{u.location ? <>{timeAgo(u.location.updatedAt)}{u.location.stale && <><br /><span className="badge b-warn">stale</span></>}</> : "never"}</td>
                  <td>{fmtDateTime(u.createdAt)}</td>
                  <td>{u.verificationStatus === "pending" && <div style={{ display: "flex", gap: 6 }}><button className="btn p sm" onClick={() => review(u, "verified")}>Verify</button><button className="btn sm" onClick={() => review(u, "rejected")}>Reject</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pager page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
        </div>
      )}
    </AppLayout>
  );
};

export default Units;
