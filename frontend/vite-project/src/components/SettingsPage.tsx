import { useState, type FormEvent } from "react";
import AppLayout from "./AppLayout";
import { Banner, Field } from "./ui";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../api/client";

/** Account settings shared by all four roles (profile, password, optional emergency contact). */
export default function SettingsPage({ title = "Settings" }: { title?: string }) {
  const { user, refreshAuth } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [ecName, setEcName] = useState(user?.emergencyContact?.name || "");
  const [ecPhone, setEcPhone] = useState(user?.emergencyContact?.phone || "");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; scope: "p" | "w" } | null>(null);
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch("/auth/profile", {
        name, phone,
        ...(user?.role === "user" ? { emergencyContact: { name: ecName, phone: ecPhone } } : {}),
      });
      await refreshAuth();
      setMsg({ kind: "ok", text: "Profile saved.", scope: "p" });
    } catch (er) { setMsg({ kind: "err", text: errorMessage(er), scope: "p" }); } finally { setBusy(false); }
  };

  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch("/auth/password", { currentPassword: cur, newPassword: next });
      setCur(""); setNext("");
      setMsg({ kind: "ok", text: "Password changed.", scope: "w" });
    } catch (er) { setMsg({ kind: "err", text: errorMessage(er), scope: "w" }); } finally { setBusy(false); }
  };

  return (
    <AppLayout title={title}>
      <div className="two" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <form className="box" onSubmit={saveProfile}>
          <h3>Profile</h3>
          {msg?.scope === "p" && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
          <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
          <Field label="Email (cannot be changed)"><input value={user?.email} disabled /></Field>
          <Field label="Phone"><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
          <Field label="Role"><input value={user?.role} disabled /></Field>
          {user?.role === "user" && (
            <>
              <Field label="Emergency contact name"><input value={ecName} onChange={(e) => setEcName(e.target.value)} /></Field>
              <Field label="Emergency contact phone"><input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} /></Field>
            </>
          )}
          <button className="btn p" disabled={busy}>Save profile</button>
        </form>

        <form className="box" onSubmit={savePw}>
          <h3>Change password</h3>
          {msg?.scope === "w" && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
          <Field label="Current password"><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
          <Field label="New password (min 8 characters)"><input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
          <button className="btn p" disabled={busy}>Update password</button>
          <p style={{ color: "var(--mut)", fontSize: 12, marginTop: 14 }}>
            Location: RESQ only reads your position when you press a location button (users) or while a verified unit is on duty. It is never tracked in the background.
          </p>
        </form>
      </div>
    </AppLayout>
  );
}
