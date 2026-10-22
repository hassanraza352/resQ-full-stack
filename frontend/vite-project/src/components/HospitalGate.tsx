import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "../api/client";
import { Banner, ErrorBox, Field, Loading } from "./ui";
import MapView from "./MapView";
import type { HospitalInfo } from "../api/types";

function Registration({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ hospitalName: "", registrationNumber: "", address: "", contactNumber: "", emergencyCapacity: "10" });
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post("/hospitals/register", { ...f, emergencyCapacity: Number(f.emergencyCapacity), ...(pos ? { latitude: pos[0], longitude: pos[1] } : {}) });
      onDone();
    } catch (er) { setErr(errorMessage(er)); } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={submit} style={{ maxWidth: 640 }}>
      <h3>🏥 Register your hospital</h3>
      <Banner kind="info">An admin must verify your hospital before it appears to patients or receives cases.</Banner>
      {err && <Banner kind="err">{err}</Banner>}
      <Field label="Hospital name *"><input required value={f.hospitalName} onChange={set("hospitalName")} /></Field>
      <Field label="Registration number *"><input required value={f.registrationNumber} onChange={set("registrationNumber")} /></Field>
      <Field label="Address *"><input required value={f.address} onChange={set("address")} /></Field>
      <Field label="Emergency contact number *"><input required type="tel" value={f.contactNumber} onChange={set("contactNumber")} /></Field>
      <Field label="Emergency capacity *"><input required type="number" min={0} value={f.emergencyCapacity} onChange={set("emergencyCapacity")} /></Field>
      <Field label="Location on map (click to place the hospital)">
        <MapView height={260} onPick={setPos} legendKinds={["hospital"]} markers={pos ? [{ id: "h", kind: "hospital", position: pos, draggable: true, onDragEnd: setPos, title: f.hospitalName || "Hospital" }] : []} emptyHint="Click the map to set the location" />
      </Field>
      <button className="btn p" disabled={busy}>Submit for verification</button>
    </form>
  );
}

export function HospitalGate({ loading, error, needsRegistration, hospital, reload, children, allowUnverified = false }: {
  loading: boolean; error: string | null; needsRegistration: boolean; hospital: HospitalInfo | null; reload: () => void; children: ReactNode; allowUnverified?: boolean;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (needsRegistration) return <Registration onDone={reload} />;
  if (hospital && hospital.verificationStatus !== "verified" && !allowUnverified) {
    return <Banner kind={hospital.verificationStatus === "rejected" ? "err" : "warn"}>
      {hospital.verificationStatus === "rejected" ? "Your hospital registration was rejected. Contact RESQ support." : "Your hospital is waiting for admin verification. Cases and capacity tools unlock once approved."}
    </Banner>;
  }
  return <>{children}</>;
}
