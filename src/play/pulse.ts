import { useCallback } from "react";
import { usePageData } from "@playhtml/react";

/**
 * The interaction counter — how often each part of this site actually gets
 * poked, aggregated across every visitor and surfaced on /pulse.
 *
 * Storage lives behind this module on purpose. Today it is one shared playhtml
 * page-data channel: no infrastructure, but client-writable, so the numbers are
 * a toy and /pulse says so. Moving to a server-authoritative counter later is a
 * change to `usePulseCounts` and `usePulse` alone — no caller touches storage.
 */

/* The closed set of things worth counting. A registry rather than free-form
 * strings so /pulse can label and group without a second lookup table, and so a
 * typo is a type error instead of a section that silently counts into nowhere. */
export const PULSE_EVENTS = {
  "room:compose": { label: "Compose Playground", group: "Rooms entered" },
  "room:lab": { label: "The Lab Bench", group: "Rooms entered" },
  "room:blueprint": { label: "The Blueprint Room", group: "Rooms entered" },
  "room:map": { label: "The 3D Storyboard", group: "Rooms entered" },
  "room:forge": { label: "The Particle Forge", group: "Rooms entered" },
  "room:terminal": { label: "The Terminal", group: "Rooms entered" },
  "blueprint:fly": { label: "Flew through it in 3D", group: "In the Blueprint Room" },
  "blueprint:ascii": { label: "Switched to the ASCII render", group: "In the Blueprint Room" },
  "blueprint:sketch": { label: "Opened the whiteboard", group: "In the Blueprint Room" },
  "blueprint:tour": { label: "Took the guided tour", group: "In the Blueprint Room" },
  "blueprint:reset": { label: "Reset the view", group: "In the Blueprint Room" },
  "playground:move": { label: "Rearranged the room tiles", group: "In the Playground" },
  "playground:tidy": { label: "Tidied the tiles back up", group: "In the Playground" },
  "wall:note": { label: "Left a note on the wall", group: "In the Playground" },
} as const;

export type PulseEvent = keyof typeof PULSE_EVENTS;
export type PulseCounts = Partial<Record<PulseEvent, number>>;

const CHANNEL = "pulse-v1";

/* One visitor holding a key down, or a mode toggle that fires on every render,
 * shouldn't read as a hundred people. Counting at most one of each event per
 * second per browser keeps a count meaning "someone did this" rather than "an
 * event loop ran". Module-level: shared by every hook instance on the page. */
const DEDUPE_MS = 1000;
const lastBump = new Map<PulseEvent, number>();

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
      const now = Date.now();
      if (now - (lastBump.get(event) ?? 0) < DEDUPE_MS) return;
      lastBump.set(event, now);
      setCounts((draft) => {
        draft[event] = (draft[event] ?? 0) + 1;
      });
    },
    [setCounts],
  );
}

/** Total across every counted event — the one headline number on /pulse. */
export function totalInteractions(counts: PulseCounts): number {
  return Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0);
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
