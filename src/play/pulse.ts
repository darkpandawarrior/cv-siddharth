import { useCallback } from "react";
import { usePageData } from "@playhtml/react";
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

/** `const bump = usePulse(); bump("room:lab")`. Safe to call before the socket
 *  has synced (and when it never does) — playhtml's setter no-ops until then,
 *  so a dead backend costs the visitor nothing. */
export function usePulse(): (event: PulseEvent) => void {
  const [, setCounts] = usePageData<PulseCounts>(CHANNEL, {});
  return useCallback(
    (event: PulseEvent) => {
      if (!dedupeOncePerSecond(event, lastBump)) return;
      setCounts((draft) => {
        draft[event] = (draft[event] ?? 0) + 1;
      });
    },
    [setCounts],
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
