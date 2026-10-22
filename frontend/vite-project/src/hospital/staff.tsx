import { useState, type FormEvent } from "react";
import AppLayout from "../components/AppLayout";
import { HospitalGate } from "../components/HospitalGate";
import { Banner, Empty, ErrorBox, Field, Loading } from "../components/ui";
import { useMyHospital } from "../hooks/useMyHospital";
import { useFetch } from "../hooks/useFetch";
import { api, errorMessage } from "../api/client";

interface Staff { _id: string; name: string; staffRole: string; department: string; phone: string; shift: string; onDuty: boolean }
const ROLES = ["doctor", "nurse", "paramedic", "receptionist", "admin-staff", "other"];

const StaffPage = () => {
  const h = useMyHospital();
  const { data, loading, error, reload } = useFetch(async () => (await api.get("/hospitals/staff")).data.staff as Staff[], [h.hospital?.id]);
  const [f, setF] = useState({ name: "", staffRole: "doctor", department: "", phone: "", shift: "morning" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.post("/hospitals/staff", f); setF({ name: "", staffRole: "doctor", department: "", phone: "", shift: "morning" }); setMsg({ kind: "ok", text: "Staff member added." }); void reload(true); }
    catch (er) { setMsg({ kind: "err", text: errorMessage(er) }); }
  };
  const toggle = async (s: Staff) => { try { await api.patch(`/hospitals/staff/${s._id}`, { onDuty: !s.onDuty }); void reload(true); } catch (er) { setMsg({ kind: "err", text: errorMessage(er) }); } };
  const remove = async (s: Staff) => {
    if (!window.confirm(`Remove ${s.name} from the staff list?`)) return;
    try { await api.delete(`/hospitals/staff/${s._id}`); void reload(true); } catch (er) { setMsg({ kind: "err", text: errorMessage(er) }); }
  };

  return (
    <AppLayout title="Staff">
      <HospitalGate {...h} allowUnverified>
        {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
        <div className="two" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
          <div className="box">
            <h3>Staff directory</h3>
            {loading && <Loading />}
            {error && <ErrorBox message={error} onRetry={() => void reload()} />}
            {data?.length === 0 && <Empty icon="👩‍⚕️" title="No staff added" hint="Add your emergency department team." />}
            {data?.map((s) => (
              <div className="row" key={s._id}>
                <div className="ic">{s.staffRole === "doctor" ? "🩺" : s.staffRole === "nurse" ? "💉" : "👤"}</div>
                <div className="t"><b>{s.name}</b><small>{s.staffRole}{s.department && ` · ${s.department}`} · {s.shift} shift{s.phone && ` · ${s.phone}`}</small></div>
                <button className={`badge ${s.onDuty ? "b-ok" : "b-info"}`} style={{ cursor: "pointer", border: 0 }} onClick={() => toggle(s)} aria-label="Toggle on duty">{s.onDuty ? "On duty" : "Off duty"}</button>
                <button className="btn sm" onClick={() => remove(s)}>Remove</button>
              </div>
            ))}
          </div>
          <form className="box" onSubmit={add}>
            <h3>Add staff</h3>
            <Field label="Name *"><input required value={f.name} onChange={set("name")} /></Field>
            <Field label="Role *"><select value={f.staffRole} onChange={set("staffRole")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Department"><input value={f.department} onChange={set("department")} /></Field>
            <Field label="Phone"><input type="tel" value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Shift"><select value={f.shift} onChange={set("shift")}><option>morning</option><option>evening</option><option>night</option></select></Field>
            <button className="btn p">Add</button>
            <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 8 }}>Staff entries are a directory managed by your hospital account; they do not have separate logins.</p>
          </form>
        </div>
      </HospitalGate>
    </AppLayout>
  );
};

export default StaffPage;
