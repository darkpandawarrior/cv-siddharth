import { useCallback, useSyncExternalStore } from "react";

/**
 * Fetches `url` and parses the JSON body, or throws. Extracted so it's
 * testable with a plain function call — no `@testing-library/react`
 * dependency, no `renderHook`, same coverage.
 */
export async function fetchLiveSignal<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/** `nextPollAt` is the store's next scheduled tick, `null` while no timer is
 *  running (no subscriber, or the tab is hidden) — EvidenceChip's retry
 *  reading uses it to say "next try at HH:MM" instead of a bare spinner. */
export type LiveSignalSnapshot<T> = { data: T | null; error: boolean; nextPollAt: number | null };

const EMPTY_SNAPSHOT: LiveSignalSnapshot<unknown> = { data: null, error: false, nextPollAt: null };

/**
 * P4 — the live-event bus. One store per URL (not per caller): the footer,
 * the world's lamps, `/lanes`, `/time-machine`, `/project/$slug` and the
 * terminal used to each open their own `setInterval` against the same
 * `/api/github-activity`, so one route could fire the same fetch two or
 * three times. A module-scope `Map<url, ...>` shared through
 * `useSyncExternalStore` means N mounted callers of the same URL cost one
 * fetch, on the smallest interval any of them asked for — the bus the brief
 * asked for, and it cuts requests instead of adding them.
 */
type StoreEntry<T> = {
  snapshot: LiveSignalSnapshot<T>;
  /** Every subscribed listener's own requested interval — the store polls
   *  at the smallest of these. */
  intervals: Map<() => void, number>;
  timer: ReturnType<typeof setInterval> | null;
  timerIntervalMs: number | null;
  onVisibility: (() => void) | null;
  fetchImpl: typeof fetch;
};

const stores = new Map<string, StoreEntry<unknown>>();

function getOrCreateStore<T>(url: string, fetchImpl: typeof fetch): StoreEntry<T> {
  let store = stores.get(url) as StoreEntry<T> | undefined;
  if (!store) {
    store = {
      snapshot: { data: null, error: false, nextPollAt: null },
      intervals: new Map(),
      timer: null,
      timerIntervalMs: null,
      onVisibility: null,
      fetchImpl,
    };
    stores.set(url, store as StoreEntry<unknown>);
  }
  return store;
}

/** No `document` in SSR or in the plain-node vitest environment — treated
 *  as "visible" there, same as the old per-caller effect always ran. */
function isHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

async function tick<T>(url: string, store: StoreEntry<T>): Promise<void> {
  if (isHidden()) return;
  // The interval this fetch is being made at, captured before the await —
  // a subscriber's own interval, or the store's current running interval if
  // one is already set (both agree once restartTimer has run).
  const intervalMs = store.timerIntervalMs ?? Math.min(...store.intervals.values());
  try {
    const data = await fetchLiveSignal<T>(url, store.fetchImpl);
    store.snapshot = { data, error: false, nextPollAt: Date.now() + intervalMs };
  } catch {
    store.snapshot = { data: store.snapshot.data, error: true, nextPollAt: Date.now() + intervalMs };
  }
  for (const onChange of store.intervals.keys()) onChange();
}

function stopTimer<T>(store: StoreEntry<T>): void {
  if (store.timer) clearInterval(store.timer);
  store.timer = null;
  store.timerIntervalMs = null;
  store.snapshot = { ...store.snapshot, nextPollAt: null };
}

function restartTimer<T>(url: string, store: StoreEntry<T>): void {
  if (store.intervals.size === 0 || isHidden()) return;
  const minInterval = Math.min(...store.intervals.values());
  if (store.timer && store.timerIntervalMs === minInterval) return;
  stopTimer(store);
  store.timerIntervalMs = minInterval;
  store.timer = setInterval(() => void tick(url, store), minInterval);
  store.snapshot = { ...store.snapshot, nextPollAt: Date.now() + minInterval };
}

function ensureVisibilityHandling<T>(url: string, store: StoreEntry<T>): void {
  if (store.onVisibility || typeof document === "undefined") return;
  store.onVisibility = () => {
    if (document.hidden) {
      stopTimer(store);
    } else {
      void tick(url, store);
      restartTimer(url, store);
    }
  };
  document.addEventListener("visibilitychange", store.onVisibility);
}

/** Non-React subscription primitive, exported so the "one fetch per
 *  interval, however many subscribers" contract is testable without
 *  `renderHook` (same reasoning as `fetchLiveSignal` above). */
export function subscribeLiveSignal<T>(
  url: string,
  intervalMs: number,
  onChange: () => void,
  fetchImpl: typeof fetch = fetch,
): () => void {
  const store = getOrCreateStore<T>(url, fetchImpl);
  const isFirstSubscriber = store.intervals.size === 0;
  store.intervals.set(onChange, intervalMs);
  ensureVisibilityHandling(url, store);
  if (isFirstSubscriber) void tick(url, store);
  restartTimer(url, store);

  return () => {
    store.intervals.delete(onChange);
    if (store.intervals.size === 0) {
      stopTimer(store);
      if (store.onVisibility && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", store.onVisibility);
      }
      store.onVisibility = null;
      // The cached snapshot is kept (not deleted): a caller that remounts
      // moments later — a route revisit, a fast-refresh — sees last-good
      // data immediately instead of flashing back to null.
    } else {
      restartTimer(url, store);
    }
  };
}

export function getLiveSignalSnapshot<T>(url: string): LiveSignalSnapshot<T> {
  const store = stores.get(url) as StoreEntry<T> | undefined;
  return store ? store.snapshot : (EMPTY_SNAPSHOT as LiveSignalSnapshot<T>);
}

/** Fetches `url` once immediately, then every `intervalMs`, sharing one
 * store (and one fetch) per URL across every mounted caller (P4). Same
 * public signature as before this edit — no call-site changes. */
export function useLiveSignal<T>(url: string, intervalMs = 20000): LiveSignalSnapshot<T> {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeLiveSignal<T>(url, intervalMs, onChange),
    [url, intervalMs],
  );
  const getSnapshot = useCallback(() => getLiveSignalSnapshot<T>(url), [url]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
