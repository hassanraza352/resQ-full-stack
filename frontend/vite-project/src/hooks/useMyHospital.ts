import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, statusOf } from "../api/client";
import type { HospitalInfo } from "../api/types";

export function useMyHospital() {
  const [hospital, setHospital] = useState<HospitalInfo | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/hospitals/me");
      setHospital(data.hospital);
      setNeedsRegistration(false);
      setError(null);
    } catch (e) {
      if (statusOf(e) === 404) { setNeedsRegistration(true); setHospital(null); }
      else setError(errorMessage(e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { hospital, needsRegistration, loading, error, reload };
}
