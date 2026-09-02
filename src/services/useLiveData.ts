'use client';

/**
 * Thin reactive wrapper around Dexie's `liveQuery`.
 * SSR-safe: the query only starts on the client, so prerendering never touches IndexedDB.
 */

import { useEffect, useRef, useState } from 'react';
import { liveQuery, type Subscription } from 'dexie';

export interface LiveDataState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

export function useLiveData<T>(
  querier: () => Promise<T> | T,
  deps: unknown[] = [],
  default_value?: T,
): LiveDataState<T> {
  const [state, setState] = useState<LiveDataState<T>>({
    data: default_value,
    loading: true,
    error: null,
  });
  const querierRef = useRef(querier);
  querierRef.current = querier;

  useEffect(() => {
    let subscription: Subscription | null = null;
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      subscription = liveQuery(() => querierRef.current()).subscribe({
        next: (value) => {
          if (!cancelled) setState({ data: value as T, loading: false, error: null });
        },
        error: (error: unknown) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : String(error);
          setState((data) => ({
            data: data.data,
            loading: false,
            error: message || 'خطای ناشناخته در خواندن داده‌ها',
          }));
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState((s) => ({ ...s, loading: false, error: message }));
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
