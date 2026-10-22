import { useState } from "react";
import AppLayout from "../components/AppLayout";
import { Banner, Empty, ErrorBox, Loading, Pager } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { timeAgo } from "../api/format";
import type { HospitalInfo, Meta } from "../api/types";

const Hospitals1 = () => {
  const [verification, setVerification] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { data, loading, error, reload } = useFetch(
    async () => (await api.get("/admin/hospitals", { params: { page, limit: 15, ...(verification && { verification }) } })).data as { hospitals: HospitalInfo[]; meta: Meta },
    [page, verification]
  );
  useLive(["notification:new", "resync"], () => void reload(true));

  const review = async (h: HospitalInfo, status: "verified" | "rejected") => {
    if (!window.confirm(`${status === "verified" ? "Verify" : "Reject"} ${h.hospitalName}?`)) return;
    try { await api.patch(`/admin/hospitals/${h.id}/review`, { status }); setMsg({ kind: "ok", text: `Hospital ${status}.` }); void reload(true); }
    catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  return (
    <AppLayout title="Hospitals">
      <div className="tabs">
        <select value={verification} onChange={(e) => { setPage(1); setVerification(e.target.value); }}>
          <option value="">All</option><option value="pending">Pending verification</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
        </select>
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data?.hospitals.length === 0 && <div className="box"><Empty icon="🏥" title="No hospitals match" /></div>}
      {data && data.hospitals.length > 0 && (
        <div className="box">
          <div className="tw"><table>
            <thead><tr><th>Hospital</th><th>Account</th><th>Verification</th><th>Intake</th><th>Beds (self-reported)</th><th>Location</th><th /></tr></thead>
            <tbody>
              {data.hospitals.map((h) => (
                <tr key={h.id}>
                  <td><b>{h.hospitalName}</b><br /><small>{h.registrationNumber} · {h.address}</small></td>
                  <td>{h.user?.name}<br /><small>{h.user?.email}<br />{h.contactNumber}</small></td>
                  <td><span className={`badge ${h.verificationStatus === "verified" ? "b-ok" : h.verificationStatus === "rejected" ? "b-red" : "b-warn"}`}>{h.verificationStatus}</span></td>
                  <td><span className={`badge ${h.emergencyAvailability === "accepting" ? "b-ok" : "b-info"}`}>{h.emergencyAvailability}</span></td>
                  <td>{h.beds.updatedAt ? <>{h.beds.availableBeds}/{h.beds.totalBeds} · ICU {h.beds.icuAvailable}/{h.beds.icuTotal}<br /><small>{timeAgo(h.beds.updatedAt)}{h.beds.stale && " (outdated)"}</small></> : "not reported"}</td>
                  <td>{h.location ? "set" : <span className="badge b-warn">missing</span>}</td>
                  <td>{h.verificationStatus === "pending" && <div style={{ display: "flex", gap: 6 }}><button className="btn p sm" onClick={() => review(h, "verified")}>Verify</button><button className="btn sm" onClick={() => review(h, "rejected")}>Reject</button></div>}</td>
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

export default Hospitals1;
