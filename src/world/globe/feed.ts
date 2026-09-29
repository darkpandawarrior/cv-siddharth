// WAVE 6 LANE X1 (live world feed): one situation-room timeline of
// everything happening on /globe right now. Every other layer (hazards,
// pulses, satellites, presence, together) calls `publish()` with a small,
// self-describing item; this file only owns the ring buffer and the pure
// formatting helpers FeedRail.tsx renders with. No three, no React beyond
// zustand's own hook — same "render layer wraps pure state" split as
// globeStore.ts itself.
import { create } from "zustand";
import type { Focus } from "./globeStore.ts";

export type FeedKind =
  | "quake"
  | "wildfire"
  | "storm"
  | "volcano"
  | "gdacs"
  | "launch"
  | "aurora"
  | "ci-pass"
  | "ci-fail"
  | "push"
  | "devto"
  | "lichess"
  | "satellite"
  | "presence"
  | "together"
  | "flare"; // LANE S2 (wave 9, space weather): M/X-class X-ray flares

export type FeedSeverity = "info" | "warn" | "danger";

export interface FeedItem {
  /** Stable per distinct occurrence — a publisher re-announcing the same
   *  occurrence (a poll that still sees the same quake) must reproduce the
   *  same id, so the ring buffer's own de-dup absorbs the repeat instead of
   *  the publisher having to track "have I already sent this" itself. */
  id: string;
  kind: FeedKind;
  title: string;
  detail: string;
  /** Real event time in ms — never "now", same honesty rule pulseEvents.ts
   *  already carries for its own `at` field. */
  whenMs: number;
  source: string;
  /** false means observed while the time scrubber was wound back, or a
   *  snapshot otherwise — never dressed as live (globeStore's own rule). */
  live: boolean;
  focus?: Focus;
  severity: FeedSeverity;
}

const CAP = 200;

interface FeedState {
  /** Newest first. */
  items: FeedItem[];
  publish: (item: FeedItem) => void;
  clear: () => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  items: [],
  publish: (item) =>
    set((s) => {
      if (s.items.some((i) => i.id === item.id)) return s; // de-dup by id, first announcement wins
      const items = [item, ...s.items];
      if (items.length > CAP) items.length = CAP; // ring buffer: oldest falls off the end
      return { items };
    }),
  clear: () => set({ items: [] }),
}));

/** Module-level publish for layer effects (they run outside a component's
 *  own render, same "read/write the store from a plain function" pattern
 *  globeStore's own `entityPositions`/`sceneHandles` module bindings use).
 *  A publisher calls this every time its condition still holds — the store's
 *  own de-dup above is what turns "still true" into "announced once". */
export function publish(item: FeedItem): void {
  useFeedStore.getState().publish(item);
}

/** "just now" / "3s ago" / "5m ago" / "2h ago" / "3d ago" — matches
 *  quake.ts's own `formatTimeAgo` register but at second granularity, since
 *  a feed row is read within seconds of an item arriving. Every publisher
 *  here is retrospective (a quake, a push, a pass computed after the fact)
 *  except one: an upcoming launch's `whenMs` is its NET time, still in the
 *  future when it first qualifies (inside 24h). Visual QA caught the
 *  original version of this function clamping that negative delta to zero,
 *  so every upcoming launch read as "just now" -- honest for a past event,
 *  a fabricated timestamp for a future one. `magnitude()` shares the exact
 *  bucket thresholds across both directions so "in 5m" and "5m ago" round
 *  the same way. */
function magnitude(deltaS: number): string {
  if (deltaS < 5) return "now";
  if (deltaS < 60) return `${deltaS}s`;
  const deltaM = Math.round(deltaS / 60);
  if (deltaM < 60) return `${deltaM}m`;
  const deltaH = Math.round(deltaM / 60);
  if (deltaH < 24) return `${deltaH}h`;
  return `${Math.round(deltaH / 24)}d`;
}

export function formatRelative(whenMs: number, nowMs: number): string {
  const deltaS = Math.round((nowMs - whenMs) / 1000);
  if (deltaS >= 0) {
    const mag = magnitude(deltaS);
    return mag === "now" ? "just now" : `${mag} ago`;
  }
  const mag = magnitude(-deltaS);
  return mag === "now" ? "just now" : `in ${mag}`;
}

/** One bucket per minute of `whenMs` — two items in the same minute share a
 *  group header in the rail. */
export function minuteBucket(whenMs: number): number {
  return Math.floor(whenMs / 60_000);
}

/** The group header's own label: a plain local clock reading, not a
 *  relative one (a relative label would have to keep re-deriving which
 *  bucket a row belongs to as time passes; a clock reading never moves).
 *  A bare clock reading is ambiguous once the feed spans more than a day
 *  (a replayed 105-day-old EONET entry next to a launch "in 23h" can print
 *  the same "05:30 AM" twice) and can misread as time going backwards, so
 *  a bucket whose calendar day differs from `nowMs`'s gets a short date
 *  prefix. `nowMs` defaults to `Date.now()` for callers that don't scrub. */
export function bucketLabel(whenMs: number, nowMs: number = Date.now()): string {
  const time = new Date(whenMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = new Date(whenMs).toDateString() === new Date(nowMs).toDateString();
  if (sameDay) return time;
  const date = new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} ${time}`;
}
