import { useEffect, useRef, useState } from "react";

/**
 * Fetches `url` and parses the JSON body, or throws. Extracted from the hook
 * below so it's testable with a plain function call — no `@testing-library/react`
 * dependency, no `renderHook`, same coverage.
 */
export async function fetchLiveSignal<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/** Fetches `url` once immediately, then every `intervalMs`. One shared
 * implementation for every Live Signal surface (footer, terminal, blueprint) —
 * same "one implementation, reused everywhere" pattern as chatClient.ts. */
export function useLiveSignal<T>(url: string, intervalMs = 20000): { data: T | null; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;

    async function tick() {
      try {
        const json = await fetchLiveSignal<T>(url);
        if (liveRef.current) {
          setData(json);
          setError(false);
        }
      } catch {
        if (liveRef.current) setError(true);
      }
    }

    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      liveRef.current = false;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return { data, error };
}
