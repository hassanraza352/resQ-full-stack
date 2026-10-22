import { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "../components/AppLayout";
import MapView, { type MapMarker } from "../components/MapView";
import LocationGate from "../components/LocationGate";
import { Banner, Empty, ErrorBox, Loading } from "../components/ui";
import { useUserLocation } from "../hooks/useUserLocation";
import { api, errorMessage } from "../api/client";
import { timeAgo } from "../api/format";
import type { HospitalInfo } from "../api/types";

const Hospitals = () => {
  const { picked, setManual, geoState, requestGps } = useUserLocation();
  const [radiusKm, setRadiusKm] = useState(20);
  const [list, setList] = useState<HospitalInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!picked) return;
    setLoading(true); setError(null);
    try {
      const { data } = await api.get("/hospitals/nearby", { params: { lat: picked.latitude, lng: picked.longitude, radiusKm, limit: 15 } });
      setList(data.hospitals);
      setSearched(true);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [picked, radiusKm]);

  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => void search(), 400);
    return () => clearTimeout(t);
  }, [search, picked]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (picked) m.push({ id: "me", kind: "user", position: [picked.latitude, picked.longitude], title: "You", draggable: true, onDragEnd: setManual });
    list.forEach((h) => h.location && m.push({ id: h.id, kind: "hospital", position: [h.location.latitude, h.location.longitude], title: h.hospitalName, detail: h.address }));
    return m;
  }, [picked, list, setManual]);

  return (
    <AppLayout title="Nearby Hospitals">
      <Banner kind="info">Being close does <b>not</b> mean a hospital has accepted you. Capacity numbers are reported by each hospital and may be out of date — always confirm with dispatch or call ahead.</Banner>
      <LocationGate state={geoState} onRequest={requestGps} purpose="list hospitals near you" />
      <div className="two" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="box">
          <h3>Map</h3>
          <MapView markers={markers} height={420} onPick={setManual} legendKinds={["user", "hospital"]} emptyHint="Use your location or click the map" />
        </div>
        <div className="box">
          <h3>Hospitals</h3>
          <div className="fld">
            <label>Search radius</label>
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>{[5, 10, 20, 40].map((r) => <option key={r} value={r}>{r} km</option>)}</select>
          </div>
          {!picked && <Empty icon="📍" title="No location yet" hint="Share your location or click the map." />}
          {loading && !list.length && <Loading />}
          {error && <ErrorBox message={error} onRetry={search} />}
          {searched && !loading && !error && list.length === 0 && <Empty icon="🏥" title="No verified hospitals in this radius" hint="Try a bigger radius." />}
          {list.map((h) => (
            <div className="row" key={h.id}>
              <div className="ic">🏥</div>
              <div className="t">
                <b>{h.hospitalName} <span className={`badge ${h.emergencyAvailability === "accepting" ? "b-ok" : "b-warn"}`}>{h.emergencyAvailability === "accepting" ? "Accepting emergencies" : "Not accepting"}</span></b>
                <small>
                  {h.address} · {h.straightLineKm} km straight-line · {h.contactNumber}<br />
                  {h.beds.updatedAt
                    ? <>Beds {h.beds.availableBeds}/{h.beds.totalBeds} · ICU {h.beds.icuAvailable}/{h.beds.icuTotal} · updated {timeAgo(h.beds.updatedAt)}{h.beds.stale && <b style={{ color: "var(--warn)" }}> (may be outdated)</b>}</>
                    : "Bed information not provided by this hospital"}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Hospitals;
