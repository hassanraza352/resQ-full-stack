import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "../api/client";
import { Banner, ErrorBox, Field, Loading } from "./ui";
import type { OwnUnit } from "../hooks/useMyUnit";

/** Onboarding when a unit account has no vehicle profile yet. */
export function UnitRegistration({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ registrationNumber: "", vehicleModel: "", vehicleType: "basic", contactNumber: "", capacity: "2" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api.post("/units/register", { ...f, capacity: Number(f.capacity) }); onDone(); }
    catch (er) { setErr(errorMessage(er)); } finally { setBusy(false); }
  };
  return (
    <form className="box" onSubmit={submit} style={{ maxWidth: 560 }}>
      <h3>🚑 Register your ambulance</h3>
      <Banner kind="info">An admin must verify your vehicle before you can go on duty or receive assignments.</Banner>
      {err && <Banner kind="err">{err}</Banner>}
      <Field label="Vehicle registration number *"><input required value={f.registrationNumber} onChange={set("registrationNumber")} placeholder="LEA-1234" /></Field>
      <Field label="Vehicle model *"><input required value={f.vehicleModel} onChange={set("vehicleModel")} placeholder="Toyota HiAce" /></Field>
      <Field label="Vehicle type *">
        <select value={f.vehicleType} onChange={set("vehicleType")}>
          <option value="basic">Basic life support</option>
          <option value="advanced">Advanced life support</option>
          <option value="patient-transport">Patient transport</option>
        </select>
      </Field>
      <Field label="Contact number *"><input required type="tel" value={f.contactNumber} onChange={set("contactNumber")} placeholder="+92 300 1234567" /></Field>
      <Field label="Patient capacity *"><input required type="number" min={1} max={20} value={f.capacity} onChange={set("capacity")} /></Field>
      <button className="btn p" disabled={busy}>Submit for verification</button>
    </form>
  );
}

export function UnitGate({ loading, error, needsRegistration, unit, reload, children }: {
  loading: boolean; error: string | null; needsRegistration: boolean; unit: OwnUnit | null; reload: () => void; children: ReactNode;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (needsRegistration) return <UnitRegistration onDone={reload} />;
  if (unit && unit.verificationStatus !== "verified") {
    return (
      <Banner kind={unit.verificationStatus === "rejected" ? "err" : "warn"}>
        {unit.verificationStatus === "rejected"
          ? "Your unit registration was rejected. Please contact RESQ support."
          : "Your unit is waiting for admin verification. You can use the app once it is approved."}
      </Banner>
    );
  }
  return <>{children}</>;
}
