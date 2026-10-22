import { useState, type FormEvent } from "react";
import AppLayout from "../components/AppLayout";
import { UnitGate } from "../components/UnitGate";
import { Banner, Field } from "../components/ui";
import { useMyUnit } from "../hooks/useMyUnit";
import { api, errorMessage } from "../api/client";
import { timeAgo } from "../api/format";

const Profile = () => {
  const u = useMyUnit();
  const [phone, setPhone] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const unit = u.unit;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.patch("/units/me", { contactNumber: phone ?? unit?.contactNumber });
      setMsg({ kind: "ok", text: "Saved." });
      void u.reload();
    } catch (er) { setMsg({ kind: "err", text: errorMessage(er) }); }
  };

  return (
    <AppLayout title="Unit Profile">
      {/* the profile is shown even while pending so the unit can see its verification state */}
      {u.loading || u.error || u.needsRegistration ? (
        <UnitGate loading={u.loading} error={u.error} needsRegistration={u.needsRegistration} unit={unit} reload={() => void u.reload()}><></></UnitGate>
      ) : unit && (
        <div className="box" style={{ maxWidth: 640 }}>
          <h3>🚑 {unit.label}
            <span className={`badge ${unit.verificationStatus === "verified" ? "b-ok" : unit.verificationStatus === "rejected" ? "b-red" : "b-warn"}`}>{unit.verificationStatus}</span>
          </h3>
          {unit.verificationStatus === "pending" && <Banner kind="warn">Awaiting admin verification. You cannot go on duty until approved.</Banner>}
          {unit.verificationStatus === "rejected" && <Banner kind="err">Your registration was rejected. Contact RESQ support.</Banner>}
          {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
          <form onSubmit={save}>
            <Field label="Registration number"><input value={unit.registrationNumber} disabled /></Field>
            <Field label="Vehicle"><input value={`${unit.vehicleModel} (${unit.vehicleType})`} disabled /></Field>
            <Field label="Capacity"><input value={unit.capacity} disabled /></Field>
            <Field label="Contact number"><input type="tel" value={phone ?? unit.contactNumber ?? ""} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Duty status"><input value={unit.availability} disabled /></Field>
            <Field label="Last shared position"><input value={unit.location ? timeAgo(unit.location.updatedAt) : "never"} disabled /></Field>
            <button className="btn p">Save contact number</button>
            <p style={{ color: "var(--mut)", fontSize: 12, marginTop: 10 }}>Identity fields are verified by an admin and cannot be edited here.</p>
          </form>
        </div>
      )}
    </AppLayout>
  );
};

export default Profile;
