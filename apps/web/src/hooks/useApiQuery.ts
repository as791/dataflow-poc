import { useEffect, useRef, useState } from 'react';

// Generic data-fetching hook for api.ts calls: fires the fetcher on mount and
// whenever `key` changes, exposes a shared { data, error, loading } shape (see
// ApiError for how errors render), and cancels stale in-flight requests via
// AbortController so a fast key change or unmount can never clobber state with
// an out-of-date response.
//
// ponytail: cancellation here is "soft" — most api.ts calls don't forward an
// AbortSignal to fetch yet, so aborting mainly means "ignore this result if it
// lands late," not "cut the network request." The fetcher still receives the
// signal so it can pass it through once api.ts supports that.
export interface ApiQueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: unknown[],
): ApiQueryState<T> & { refresh: () => void } {
  const [state, setState] = useState<ApiQueryState<T>>({ data: null, error: null, loading: true });
  const controllerRef = useRef<AbortController | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState(s => ({ data: s.data, error: null, loading: true }));
    fetcherRef.current(controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data, error: null, loading: false }); })
      .catch((e: any) => { if (!controller.signal.aborted) setState({ data: null, error: e.message, loading: false }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...key, tick]);

  return { ...state, refresh: () => setTick(t => t + 1) };
}
