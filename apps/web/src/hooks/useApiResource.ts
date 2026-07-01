import { useState, useEffect, useCallback, useRef } from 'react';

export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  // ponytail: counter ref cancels stale results when refresh() called mid-flight
  const run = useCallback(async () => {
    const id = ++counter.current;
    setLoading(true); setError(null);
    try {
      const result = await fetcher();
      if (id === counter.current) setData(result);
    } catch (e: any) {
      if (id === counter.current) setError(e.message);
    } finally {
      if (id === counter.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refresh: run };
}
