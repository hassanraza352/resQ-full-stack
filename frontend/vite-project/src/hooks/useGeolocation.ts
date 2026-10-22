import { useCallback, useEffect, useRef, useState } from "react";

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; latitude: number; longitude: number; accuracy: number; at: number }
  | { status: "denied" }
  | { status: "unavailable"; reason: string }
  | { status: "timeout" }
  | { status: "insecure" };

/**
 * One-shot (or opt-in watching) browser geolocation. Nothing is requested until
 * `request()` is called - callers show an explanation first. Never tracks by default.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });
  const watchId = useRef<number | null>(null);

  const onOk = (p: GeolocationPosition) =>
    setState({
      status: "ok",
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      accuracy: p.coords.accuracy,
      at: p.timestamp,
    });

  const onErr = (e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) setState({ status: "denied" });
    else if (e.code === e.TIMEOUT) setState({ status: "timeout" });
    else setState({ status: "unavailable", reason: e.message || "Position unavailable" });
  };

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) return setState({ status: "unavailable", reason: "Geolocation is not supported by this browser" });
    if (!window.isSecureContext) return setState({ status: "insecure" });
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }, []);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  /** Continuous updates (units on duty only). Always paired with stopWatch / unmount cleanup. */
  const startWatch = useCallback(() => {
    if (!("geolocation" in navigator) || !window.isSecureContext) return request();
    stopWatch();
    setState({ status: "loading" });
    watchId.current = navigator.geolocation.watchPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
  }, [request, stopWatch]);

  useEffect(() => stopWatch, [stopWatch]);

  return { state, request, startWatch, stopWatch };
}
