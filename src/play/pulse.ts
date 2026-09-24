import { useCallback, useEffect, useRef } from "react";
import { usePageData, usePlayContext } from "@playhtml/react";
import { PULSE_EVENTS, type PulseCounts, type PulseEvent } from "./pulseEvents.ts";

/**
 * The interaction counter — how often each part of this site actually gets
 * poked, aggregated across every visitor and surfaced on /pulse.
 *
 * Storage lives behind this module on purpose. Today it is one shared playhtml
 * page-data channel: no infrastructure, but client-writable, so the numbers are
 * a toy and /pulse says so. Moving to a server-authoritative counter later is a
 * change to `usePulseCounts` and `usePulse` alone — no caller touches storage.
 */

/* The registry and the pure arithmetic over it live in pulseEvents.ts, which
 * imports nothing — see that file for why. Re-exported here so every existing
 * `from "./pulse.ts"` import keeps working. */
export { PULSE_EVENTS, totalInteractions, touchedCount } from "./pulseEvents.ts";
export type { PulseCounts, PulseEvent } from "./pulseEvents.ts";

const CHANNEL = "pulse-v1";

/* One visitor holding a key down, or a mode toggle that fires on every render,
 * shouldn't read as a hundred people. Counting at most one of each event per
 * second per browser keeps a count meaning "someone did this" rather than "an
 * event loop ran". Module-level: shared by every hook instance on the page. */
export const DEDUPE_MS = 1000;
const lastBump = new Map<PulseEvent, number>();

/**
 * `true` at most once per `windowMs` for a given key — a held finger or a
 * mode toggle that fires on every render collapses to one count instead of
 * forty. Exported so any other module-level counter (reactions.ts) shares the
 * exact same rule instead of re-deriving it.
 */
export function dedupeOncePerSecond<K>(key: K, seen: Map<K, number>, windowMs = DEDUPE_MS): boolean {
  const now = Date.now();
  if (now - (seen.get(key) ?? 0) < windowMs) return false;
  seen.set(key, now);
  return true;
}

/** Read the shared counts — for /pulse, and for the per-room tallies. */
export function usePulseCounts(): PulseCounts {
  const [counts] = usePageData<PulseCounts>(CHANNEL, {});
  return counts;
}

/**
 * `const bump = usePulse(); bump("room:lab")`. Safe to call before the socket
 * has synced (and when it never does).
 *
 * playhtml's own `usePageData` setter does NOT silently no-op before init —
 * it calls through and logs `[@playhtml/react] ... setData called before
 * init — ignored.` to the console on every dropped write. A visitor who pokes
 * a room in its first second (the common case: the room mounts, they click,
 * the socket is still connecting) produced one of those on every click, which
 * is a real console error e2e/home-console.spec.ts and friends assert against
 * — and the interaction itself is lost, not just logged.
 *
 * So the write is queued here instead of attempted early: while
 * `usePlayContext().isLoading` is true, a bump goes into a ref-held queue
 * rather than calling `setCounts` at all. One effect drains that queue in a
 * single write the instant loading flips false, so a burst of early clicks
 * costs one page-data write, not one dropped write per click.
 */
export function usePulse(): (event: PulseEvent) => void {
  const { isLoading } = usePlayContext();
  const [, setCounts] = usePageData<PulseCounts>(CHANNEL, {});
  const queued = useRef<PulseEvent[]>([]);

  // Drains whatever queued up before init resolved, in the one write below —
  // never call setCounts while isLoading is still true, or playhtml logs and
  // drops it exactly as if this queue didn't exist.
  useEffect(() => {
    if (isLoading || queued.current.length === 0) return;
    const events = queued.current;
    queued.current = [];
    setCounts((draft) => {
      for (const event of events) draft[event] = (draft[event] ?? 0) + 1;
    });
  }, [isLoading, setCounts]);

  return useCallback(
    (event: PulseEvent) => {
      if (!dedupeOncePerSecond(event, lastBump)) return;
      if (isLoading) {
        queued.current.push(event);
        return;
      }
      setCounts((draft) => {
        draft[event] = (draft[event] ?? 0) + 1;
      });
    },
    [isLoading, setCounts],
  );
}

/** Counts folded into the registry's display groups, ordered by the registry so
 *  the dashboard is stable between renders and between visitors. */
export function groupPulse(counts: PulseCounts): { group: string; rows: { event: PulseEvent; label: string; count: number }[] }[] {
  const groups: { group: string; rows: { event: PulseEvent; label: string; count: number }[] }[] = [];
  for (const [event, meta] of Object.entries(PULSE_EVENTS) as [PulseEvent, { label: string; group: string }][]) {
    let bucket = groups.find((g) => g.group === meta.group);
    if (!bucket) groups.push((bucket = { group: meta.group, rows: [] }));
    bucket.rows.push({ event, label: meta.label, count: counts[event] ?? 0 });
  }
  return groups;
}
