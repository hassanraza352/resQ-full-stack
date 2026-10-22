import { useEffect, useState, type FormEvent } from "react";
import AppLayout from "../components/AppLayout";
import { HospitalGate } from "../components/HospitalGate";
import { Banner, Field } from "../components/ui";
import { useMyHospital } from "../hooks/useMyHospital";
import { api, errorMessage } from "../api/client";
import { timeAgo } from "../api/format";

const Beds = () => {
  const h = useMyHospital();
  const [f, setF] = useState({ totalBeds: "0", availableBeds: "0", icuTotal: "0", icuAvailable: "0" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (h.hospital) {
      const b = h.hospital.beds;
      setF({ totalBeds: String(b.totalBeds), availableBeds: String(b.availableBeds), icuTotal: String(b.icuTotal), icuAvailable: String(b.icuAvailable) });
    }
  }, [h.hospital]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
    if (n.availableBeds > n.totalBeds || n.icuAvailable > n.icuTotal) return setMsg({ kind: "err", text: "Available beds cannot exceed the total." });
    setBusy(true);
    try { await api.patch("/hospitals/beds", n); setMsg({ kind: "ok", text: "Capacity updated." }); void h.reload(); }
    catch (er) { setMsg({ kind: "err", text: errorMessage(er) }); } finally { setBusy(false); }
  };

  const b = h.hospital?.beds;
  return (
    <AppLayout title="Bed Management">
      <HospitalGate {...h}>
        <form className="box" onSubmit={save} style={{ maxWidth: 560 }}>
          <h3>🛏️ Capacity</h3>
          {b && <Banner kind={b.stale ? "warn" : "info"}>{b.updatedAt ? `Last updated ${timeAgo(b.updatedAt)}.` : "No capacity has been reported yet."} {b.stale && "Patients and dispatch see this as possibly outdated — please update."}</Banner>}
          {msg && <Banner kind={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</Banner>}
          <Field label="Total beds"><input type="number" min={0} value={f.totalBeds} onChange={set("totalBeds")} required /></Field>
          <Field label="Available beds"><input type="number" min={0} value={f.availableBeds} onChange={set("availableBeds")} required /></Field>
          <Field label="ICU beds (total)"><input type="number" min={0} value={f.icuTotal} onChange={set("icuTotal")} required /></Field>
          <Field label="ICU beds (available)"><input type="number" min={0} value={f.icuAvailable} onChange={set("icuAvailable")} required /></Field>
          <button className="btn p" disabled={busy}>Save capacity</button>
          <p style={{ color: "var(--mut)", fontSize: 12, marginTop: 10 }}>Numbers are self-reported by your hospital and shown with their last-updated time.</p>
        </form>
      </HospitalGate>
    </AppLayout>
  );
};

export default Beds;
