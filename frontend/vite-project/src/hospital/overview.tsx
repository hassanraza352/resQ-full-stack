import { useState } from "react";
import AppLayout from "../components/AppLayout";
import { HospitalGate } from "../components/HospitalGate";
import MapView from "../components/MapView";
import { Banner, Stat } from "../components/ui";
import { useMyHospital } from "../hooks/useMyHospital";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { timeAgo } from "../api/format";

const Overview = () => {
  const h = useMyHospital();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const cases = useFetch(async () => (await api.get("/hospitals/emergencies/incoming")).data.requests as unknown[], []);
  useLive(["emergency:updated", "notification:new", "resync"], () => void cases.reload(true));
  const hos = h.hospital;

  const toggle = async () => {
    if (!hos) return;
    try {
      await api.patch("/hospitals/availability", { emergencyAvailability: hos.emergencyAvailability === "accepting" ? "not-accepting" : "accepting" });
      setMsg(null); void h.reload();
    } catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  const setLocation = async (p: [number, number]) => {
    try { await api.patch("/hospitals/me", { latitude: p[0], longitude: p[1] }); void h.reload(); setMsg({ kind: "ok", text: "Location saved." }); }
    catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  return (
    <AppLayout title="Hospital Overview">
      <HospitalGate {...h} allowUnverified={false}>
        {hos && (
          <>
            <h2>{hos.hospitalName} <span className="badge b-ok">verified</span></h2>
            <p className="sub">{hos.address} · {hos.contactNumber}</p>
            {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
            <div className="cards">
              <Stat label="Emergency intake" value={hos.emergencyAvailability === "accepting" ? "Accepting" : "Not accepting"} badge="You control this" kind={hos.emergencyAvailability === "accepting" ? "b-ok" : "b-warn"} />
              <Stat label="Beds available" value={`${hos.beds.availableBeds}/${hos.beds.totalBeds}`} badge={hos.beds.updatedAt ? `updated ${timeAgo(hos.beds.updatedAt)}` : "not reported"} kind={hos.beds.stale ? "b-warn" : "b-ok"} />
              <Stat label="ICU available" value={`${hos.beds.icuAvailable}/${hos.beds.icuTotal}`} badge="Self-reported" />
              <Stat label="Incoming cases" value={cases.data?.length ?? "—"} badge="Open" kind="b-info" />
            </div>
            <div className="two">
              <div className="box">
                <h3>Hospital location</h3>
                <MapView height={300} legendKinds={["hospital"]} onPick={setLocation}
                  markers={hos.location ? [{ id: "h", kind: "hospital", position: [hos.location.latitude, hos.location.longitude], title: hos.hospitalName, draggable: true, onDragEnd: setLocation }] : []}
                  emptyHint="No location set — click the map to place your hospital" />
                <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 6 }}>Patients can only discover your hospital once a location is set. Click the map or drag the marker to correct it.</p>
              </div>
              <div className="box">
                <h3>Emergency intake</h3>
                <p style={{ color: "var(--mut)", marginBottom: 12 }}>Dispatch only proposes cases to hospitals marked as accepting. Even then, a case is yours only after you accept it on the Cases page.</p>
                <button className="btn p" onClick={toggle}>{hos.emergencyAvailability === "accepting" ? "Stop accepting emergencies" : "Start accepting emergencies"}</button>
              </div>
            </div>
          </>
        )}
      </HospitalGate>
    </AppLayout>
  );
};

export default Overview;
