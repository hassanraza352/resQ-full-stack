import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";

/**
 * Loads data from an async function with loading / error / reload.
 * `deps` re-run the fetch. Stale responses are ignored.
 */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  const reload = useCallback(async (silent = false) => {
    const mine = ++seq.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (mine === seq.current) setData(result);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);

  return { data, loading, error, reload, setData };
}
