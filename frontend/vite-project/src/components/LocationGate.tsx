import type { GeoState } from "../hooks/useGeolocation";

/** Explains BEFORE asking, then shows a precise message for every failure mode. */
export default function LocationGate({
  state, onRequest, purpose = "show nearby emergency units and tell dispatch where you are",
}: { state: GeoState; onRequest: () => void; purpose?: string }) {
  const busy = state.status === "loading";
  return (
    <div className="box" style={{ marginBottom: 14 }}>
      <h3>📍 Your location</h3>
      {state.status === "idle" && (
        <p style={{ color: "var(--mut)", margin: "6px 0 12px" }}>
          RESQ will ask your browser for your location once, only to {purpose}. It is not tracked in the background and is
          shared only with the people handling your request. You can also place the marker manually on the map.
        </p>
      )}
      {state.status === "denied" && (
        <p role="alert" style={{ color: "var(--red)", margin: "6px 0 12px" }}>
          Location permission was denied. Click on the map to place the marker manually, or allow location for this site in your browser settings and retry.
        </p>
      )}
      {state.status === "timeout" && <p role="alert" style={{ color: "var(--warn)", margin: "6px 0 12px" }}>Getting your position took too long (weak GPS?). Retry, or place the marker manually.</p>}
      {state.status === "unavailable" && <p role="alert" style={{ color: "var(--warn)", margin: "6px 0 12px" }}>Your position is unavailable ({state.reason}). Place the marker manually on the map.</p>}
      {state.status === "insecure" && (
        <p role="alert" style={{ color: "var(--warn)", margin: "6px 0 12px" }}>
          Browsers only allow GPS on secure pages (HTTPS or localhost). Open RESQ over HTTPS, or place the marker manually.
        </p>
      )}
      {state.status === "ok" && (
        <p style={{ color: "var(--mut)", margin: "6px 0 12px" }}>
          Position found (accuracy about {Math.round(state.accuracy)} m).{" "}
          {state.accuracy > 100 && <b style={{ color: "var(--warn)" }}>Accuracy is poor — please drag the marker to the exact spot.</b>}
        </p>
      )}
      <button className="btn p" disabled={busy} onClick={onRequest}>
        {busy ? "Locating…" : state.status === "ok" ? "↻ Update my location" : "📍 Use my current location"}
      </button>
    </div>
  );
}
