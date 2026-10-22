import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, statusOf } from "../api/client";
import { useGeolocation } from "./useGeolocation";
import type { UnitInfo } from "../api/types";

export interface OwnUnit extends UnitInfo {
  locationUpdatedAt?: string | null;
  locationAccuracy?: number | null;
  createdAt?: string;
}

/**
 * The signed-in unit's own profile + opt-in location sharing.
 * Sharing runs only while the unit chooses "on duty" (or is busy with an assignment);
 * it stops on unmount, and only the latest point is stored on the server.
 */
export function useMyUnit() {
  const [unit, setUnit] = useState<OwnUnit | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const geo = useGeolocation();
  const lastPost = useRef(0);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/units/me");
      setUnit(data.unit);
      setNeedsRegistration(false);
      setError(null);
    } catch (e) {
      if (statusOf(e) === 404) { setNeedsRegistration(true); setUnit(null); }
      else setError(errorMessage(e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  // push every GPS fix, but at most once per 5 s (server also rate-limits)
  useEffect(() => {
    const s = geo.state;
    if (!sharing || s.status !== "ok") return;
    if (Date.now() - lastPost.current < 5000) return;
    lastPost.current = Date.now();
    api.patch("/units/location", { latitude: s.latitude, longitude: s.longitude, accuracy: s.accuracy })
      .then(() => { setLastSent(Date.now()); setShareError(null); void reload(); })
      .catch((e) => setShareError(errorMessage(e)));
  }, [geo.state, sharing, reload]);

  const startSharing = useCallback(() => { setSharing(true); geo.startWatch(); }, [geo]);
  const stopSharing = useCallback(() => { setSharing(false); geo.stopWatch(); }, [geo]);

  return { unit, needsRegistration, loading, error, reload, sharing, startSharing, stopSharing, geoState: geo.state, lastSent, shareError };
}
