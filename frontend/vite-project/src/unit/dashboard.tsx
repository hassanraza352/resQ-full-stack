import AppLayout from "../components/AppLayout";
import { UnitGate } from "../components/UnitGate";
import MapView from "../components/MapView";
import { Banner, Empty, Stat, StatusBadge } from "../components/ui";
import { Link } from "react-router-dom";
import { useMyUnit } from "../hooks/useMyUnit";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api, errorMessage } from "../api/client";
import { timeAgo, toLeaflet, typeIcon } from "../api/format";
import type { EmergencyRequest } from "../api/types";
import { useState } from "react";

const UnitDashboard = () => {
  const u = useMyUnit();
  const [msg, setMsg] = useState<string | null>(null);
  const assigned = useFetch(async () => (await api.get("/units/emergencies/assigned")).data.requests as EmergencyRequest[]);
  useLive(["assignment:new", "emergency:updated", "resync"], () => { void assigned.reload(true); void u.reload(); });

  const setAvail = async (availability: "available" | "offline") => {
    setMsg(null);
    try {
      if (availability === "available") {
        // a position must exist before going on duty: start sharing first
        if (!u.sharing) u.startSharing();
        await new Promise((r) => setTimeout(r, 2500));
      }
      await api.patch("/units/availability", { availability });
      if (availability === "offline") u.stopSharing();
      await u.reload();
    } catch (e) { setMsg(errorMessage(e)); }
  };

  const unit = u.unit;
  const active = assigned.data?.[0];
  const pos = unit?.location;

  return (
    <AppLayout title="Unit Dashboard">
      <UnitGate loading={u.loading} error={u.error} needsRegistration={u.needsRegistration} unit={unit} reload={() => void u.reload()}>
        {unit && (
          <>
            <h2>{unit.label} {unit.availability === "busy" ? <span className="badge b-warn">On assignment</span> : unit.availability === "available" ? <span className="badge b-ok">On duty · available</span> : <span className="badge b-info">Off duty</span>}</h2>
            <p className="sub">{unit.vehicleModel} · {unit.vehicleType} · {unit.registrationNumber}</p>
            {msg && <Banner kind="err">{msg}</Banner>}
            {u.shareError && <Banner kind="warn">Location sharing problem: {u.shareError}</Banner>}
            {u.geoState.status === "denied" && <Banner kind="err">Location permission denied — dispatch cannot find you. Allow location for this site and retry.</Banner>}
            {u.geoState.status === "insecure" && <Banner kind="err">GPS needs HTTPS (or localhost).</Banner>}

            <div className="cards">
              <Stat label="Status" value={unit.availability} badge={unit.verificationStatus} kind="b-ok" />
              <Stat label="Active assignment" value={active ? 1 : 0} badge={active ? active.status : "None"} kind={active ? "b-red" : "b-ok"} />
              <Stat label="Location sharing" value={u.sharing ? "On" : "Off"} badge={u.lastSent ? `sent ${timeAgo(new Date(u.lastSent).toISOString())}` : "—"} kind={u.sharing ? "b-ok" : "b-warn"} />
              <Stat label="Last position on server" value={pos ? timeAgo(pos.updatedAt) : "never"} badge={pos?.stale ? "stale" : pos ? "fresh" : "none"} kind={pos?.stale || !pos ? "b-warn" : "b-ok"} />
            </div>

            <div className="two">
              <div className="box">
                <h3>Duty & location</h3>
                <p style={{ color: "var(--mut)", marginBottom: 12 }}>
                  While on duty your device position is sent to RESQ so dispatch can find the nearest unit. Only your latest position is stored. Going off duty stops sharing
                  {unit.availability === "busy" ? " (not possible during an active assignment)" : ""}.
                </p>
                {unit.availability === "offline" && <button className="btn p" onClick={() => setAvail("available")}>🟢 Go on duty & share location</button>}
                {unit.availability === "available" && <button className="btn" onClick={() => setAvail("offline")}>⚪ Go off duty</button>}
                {unit.availability === "busy" && <p>Finish or hand back the active assignment to change duty status.</p>}
                {unit.availability === "busy" && !u.sharing && <button className="btn sm" style={{ marginLeft: 8 }} onClick={u.startSharing}>Resume location sharing</button>}
                <div style={{ marginTop: 14 }}>
                  <MapView height={240} legendKinds={["unit-selected"]} markers={pos ? [{ id: "me", kind: "unit-selected", position: toLeaflet(pos), title: "Your last known position", detail: `Updated ${timeAgo(pos.updatedAt)}` }] : []} emptyHint="No position shared yet" />
                </div>
              </div>

              <div className="box">
                <h3>Current assignment</h3>
                {!active && <Empty icon="🕒" title="No active assignment" hint="New assignments appear instantly on the Requests page." />}
                {active && (
                  <div className="row">
                    <div className="ic">{typeIcon(active.emergencyType)}</div>
                    <div className="t"><b>{active.referenceId}</b><small>{active.location.address}</small></div>
                    <StatusBadge status={active.status} />
                  </div>
                )}
                {active && <Link className="btn p" to={active.status === "assigned" ? "/unit/request" : "/unit/assignment"}>{active.status === "assigned" ? "Respond now" : "Open assignment"}</Link>}
              </div>
            </div>
          </>
        )}
      </UnitGate>
    </AppLayout>
  );
};

export default UnitDashboard;
