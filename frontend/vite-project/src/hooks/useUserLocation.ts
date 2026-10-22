import { useCallback, useEffect, useState } from "react";
import { useGeolocation } from "./useGeolocation";

export interface Picked {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  source: "gps" | "manual" | "adjusted";
  at: number;
}

/** GPS (on explicit request) + manual placement / marker adjustment, one confirmed position. */
export function useUserLocation() {
  const geo = useGeolocation();
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    if (geo.state.status === "ok") {
      setPicked({ latitude: geo.state.latitude, longitude: geo.state.longitude, accuracy: geo.state.accuracy, source: "gps", at: geo.state.at });
    }
  }, [geo.state]);

  const setManual = useCallback(([latitude, longitude]: [number, number]) => {
    setPicked((p) => ({ latitude, longitude, accuracy: null, source: p?.source === "gps" ? "adjusted" : "manual", at: Date.now() }));
  }, []);

  return { picked, setManual, geoState: geo.state, requestGps: geo.request };
}
