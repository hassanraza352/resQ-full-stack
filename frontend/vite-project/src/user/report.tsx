import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import MapView, { type MapMarker } from "../components/MapView";
import LocationGate from "../components/LocationGate";
import { Banner } from "../components/ui";
import { useUserLocation } from "../hooks/useUserLocation";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage, statusOf } from "../api/client";
import type { EmergencyRequest } from "../api/types";

const incidentTypes = [
  { value: "medical", name: "Medical", icon: "🚑" },
  { value: "accident", name: "Accident", icon: "🚗" },
  { value: "cardiac", name: "Cardiac", icon: "❤️" },
  { value: "pregnancy", name: "Pregnancy", icon: "🤰" },
  { value: "fire", name: "Fire", icon: "🔥" },
  { value: "other", name: "Other", icon: "➕" },
];

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const Report = () => {
  const { user } = useAuth();
  const { picked, setManual, geoState, requestGps } = useUserLocation();
  const [incidentType, setIncidentType] = useState("medical");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState(user?.phone && /\d{7}/.test(user.phone) ? user.phone : "");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<EmergencyRequest | null>(null);
  const [done, setDone] = useState<EmergencyRequest | null>(null);
  // One key per form: a retry after a network error or a double click maps to the SAME request.
  const idemKey = useRef(newKey());

  const markers = useMemo<MapMarker[]>(
    () => picked ? [{
      id: "incident", kind: "incident", position: [picked.latitude, picked.longitude], title: "Incident location",
      detail: "Drag to correct the position", draggable: true, onDragEnd: (p) => { setConfirmed(false); setManual(p); },
    }] : [],
    [picked, setManual]
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setExisting(null);
    if (!picked) return setError("Please set the incident location first (use GPS or click on the map).");
    if (!confirmed) return setError("Please confirm that the marker shows the incident location.");
    if (address.trim().length < 3) return setError("Please describe the address or a landmark.");
    if (!window.confirm("Send this emergency report to RESQ dispatch now?")) return;

    setSubmitting(true);
    try {
      const { data } = await api.post(
        "/emergencies",
        {
          emergencyType: incidentType,
          description,
          contactNumber: contact,
          address,
          latitude: picked.latitude,
          longitude: picked.longitude,
          accuracy: picked.accuracy ?? undefined,
          locationSource: picked.source,
        },
        { headers: { "Idempotency-Key": idemKey.current } }
      );
      setDone(data.request);
    } catch (err) {
      if (statusOf(err) === 409) {
        const ex = (err as { response?: { data?: { request?: EmergencyRequest } } }).response?.data?.request;
        if (ex) setExisting(ex);
      }
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AppLayout title="Report Incident">
        <div className="box" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>✅</div>
          <h3 style={{ justifyContent: "center" }}>Report received</h3>
          <p style={{ color: "var(--mut)" }}>Your reference ID</p>
          <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1, margin: "8px 0" }}>{done.referenceId}</p>
          <Banner kind="info">
            Your request is <b>pending</b>: a dispatcher will review it and assign a unit. No ambulance is on its way until you see an assigned unit on the status page.
            If someone is in immediate danger, also call your local emergency number (1122 in Pakistan).
          </Banner>
          <Link className="btn p" to={`/user/report-details?id=${done.id}`}>📡 Track this request</Link>{" "}
          <Link className="btn" to="/user/my-reports">My reports</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Report Incident">
      <Banner kind="warn">
        RESQ is a university demonstration platform, <b>not</b> an official emergency service. In a real emergency call your local emergency number (1122 in Pakistan).
      </Banner>

      <form className="box" onSubmit={submit} noValidate>
        <h3>Report an Incident</h3>
        <p style={{ color: "var(--mut)", marginBottom: 16 }}>Select the incident type, confirm the location on the map and describe what happened.</p>

        <div className="tabs" role="radiogroup" aria-label="Incident type">
          {incidentTypes.map((t) => (
            <span
              key={t.value}
              role="radio"
              aria-checked={incidentType === t.value}
              tabIndex={0}
              className={`chip ${incidentType === t.value ? "on" : ""}`}
              onClick={() => setIncidentType(t.value)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setIncidentType(t.value)}
            >
              {t.icon} {t.name}
            </span>
          ))}
        </div>

        <LocationGate state={geoState} onRequest={() => { setConfirmed(false); requestGps(); }} purpose="tell dispatch exactly where the incident is" />
        <MapView
          markers={markers}
          height={340}
          onPick={(p) => { setConfirmed(false); setManual(p); }}
          accuracy={picked?.source === "gps" && picked.accuracy ? { center: [picked.latitude, picked.longitude], radius: picked.accuracy } : null}
          legendKinds={["incident"]}
          emptyHint="Click the map to place the incident marker"
        />
        {picked && (
          <p style={{ fontSize: 13, color: "var(--mut)", margin: "8px 0" }}>
            Marker at {picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)} ·{" "}
            {picked.source === "gps" ? `GPS (±${Math.round(picked.accuracy || 0)} m)` : picked.source === "adjusted" ? "GPS, adjusted by you" : "placed manually"}
          </p>
        )}

        <div className="fld">
          <label htmlFor="addr">Address / landmark *</label>
          <input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="e.g. House 12, Street 4, Gulberg III — near Liberty Market" required />
        </div>
        <div className="fld">
          <label htmlFor="ph">Contact number *</label>
          <input id="ph" type="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+92 300 1234567" required />
        </div>
        <div className="fld">
          <label htmlFor="desc">Description</label>
          <textarea id="desc" maxLength={1000} placeholder="Describe the emergency clearly (number of patients, condition, hazards)…" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="fld">
          <label>Incident media (photos / video)</label>
          <p style={{ color: "var(--mut)", fontSize: 13 }}>📸 Media upload is not available yet in this version. Describe the scene in the text box above.</p>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!picked} />
          I confirm the marker shows where help is needed.
        </label>

        {error && <Banner kind="err">{error}{existing && <> — <Link to={`/user/report-details?id=${existing.id}`}>open your active request ({existing.referenceId})</Link></>}</Banner>}

        <button type="submit" className="btn p w" style={{ padding: 14, fontSize: 16 }} disabled={submitting}>
          {submitting ? "Sending…" : "🚨 Send Emergency Report Now"}
        </button>
      </form>
    </AppLayout>
  );
};

export default Report;
