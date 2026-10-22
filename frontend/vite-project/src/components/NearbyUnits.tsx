import { useCallback, useEffect, useMemo, useState } from "react";
import MapView, { type MapMarker } from "./MapView";
import LocationGate from "./LocationGate";
import { Banner, Empty, ErrorBox, Loading } from "./ui";
import { useUserLocation } from "../hooks/useUserLocation";
import { api, errorMessage } from "../api/client";
import { fmtDistance, fmtDuration, timeAgo } from "../api/format";
import type { NearbyUnit } from "../api/types";

/**
 * INFORMATIONAL view of verified, available units around the user's confirmed position.
 * Seeing a unit here never reserves or assigns it - only RESQ dispatch can assign.
 */
export default function NearbyUnits({ mapHeight = 420 }: { mapHeight?: number }) {
  const { picked, setManual, geoState, requestGps } = useUserLocation();
  const [radiusKm, setRadiusKm] = useState(10);
  const [units, setUnits] = useState<NearbyUnit[]>([]);
  const [meta, setMeta] = useState<{ hasMore: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [routingOk, setRoutingOk] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!picked) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/emergencies/nearby-units", {
        params: { lat: picked.latitude, lng: picked.longitude, radiusKm, page, limit: 10 },
      });
      setUnits(data.units);
      setMeta(data.meta);
      setNotice(data.notice);
      setRoutingOk(data.routing?.available ?? false);
      setSearched(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [picked, radiusKm, page]);

  // debounce: searching again on every drag pixel would hammer the routing service
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => void search(), 500);
    return () => clearTimeout(t);
  }, [search, picked]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (picked) {
      out.push({
        id: "me", kind: "user", position: [picked.latitude, picked.longitude], title: "Your location",
        detail: picked.source === "gps" ? "From GPS" : "Placed manually", draggable: true,
        onDragEnd: (p) => { setPage(1); setManual(p); },
      });
    }
    units.forEach((u) => u.location && out.push({
      id: u.id, kind: "unit", position: [u.location.latitude, u.location.longitude], title: u.label,
      detail: `${u.vehicleType} · ${u.straightLineKm} km straight-line${u.road ? ` · ~${fmtDuration(u.road.durationSeconds)} by road` : ""} · approximate position`,
    }));
    return out;
  }, [picked, units, setManual]);

  return (
    <>
      <LocationGate state={geoState} onRequest={requestGps} />
      <div className="two" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="box">
          <h3>Map</h3>
          <MapView
            markers={markers}
            height={mapHeight}
            onPick={(p) => { setPage(1); setManual(p); }}
            accuracy={picked?.source === "gps" && picked.accuracy ? { center: [picked.latitude, picked.longitude], radius: picked.accuracy } : null}
            legendKinds={["user", "unit"]}
            emptyHint="Use your location or click the map to set a point"
          />
          {picked && <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 6 }}>Drag your marker or click the map to correct the position.</p>}
        </div>

        <div className="box">
          <h3>Nearby units</h3>
          <div className="fld">
            <label>Search radius</label>
            <select value={radiusKm} onChange={(e) => { setPage(1); setRadiusKm(Number(e.target.value)); }}>
              {[3, 5, 10, 20, 30].map((r) => <option key={r} value={r}>{r} km</option>)}
            </select>
          </div>
          <Banner kind="info">{notice || "Units shown are for information only. A unit is assigned to you only after RESQ dispatch confirms it."}</Banner>
          {routingOk === false && searched && units.length > 0 && <Banner kind="warn">Road ETA is unavailable right now; only straight-line distances are shown.</Banner>}

          {!picked && <Empty icon="📍" title="No location yet" hint="Share your location or click the map to see units near you." />}
          {picked && loading && !units.length && <Loading text="Looking for units…" />}
          {error && <ErrorBox message={error} onRetry={search} />}
          {picked && searched && !loading && !error && units.length === 0 && (
            <Empty icon="🚑" title="No available units in this area" hint="Try a larger radius. If this is an emergency, still submit your report and call your local emergency number (1122 in Pakistan)." />
          )}
          {units.map((u) => (
            <div className="row" key={u.id}>
              <div className="ic">🚑</div>
              <div className="t">
                <b>{u.label} <span className="badge b-ok">Available</span></b>
                <small>
                  {u.vehicleType} · {u.straightLineKm} km straight-line
                  {u.road ? ` · road ${fmtDistance(u.road.distanceMeters)} · ~${fmtDuration(u.road.durationSeconds)} (estimate, no live traffic)` : " · road ETA unavailable"}
                  {u.location && ` · position ${timeAgo(u.location.updatedAt)}`}
                </small>
              </div>
            </div>
          ))}
          {meta && (page > 1 || meta.hasMore) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
              <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <button className="btn sm" disabled={!meta.hasMore} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
