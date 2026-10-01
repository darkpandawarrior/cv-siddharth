// PulseLayer's pure event math (living-ledger-spec.md#6.3, GLOBE lens L4):
// diffing two consecutive polls of the site's own live streams into "new
// event" pulses, plus picking an intro replay from a single first poll. No
// three, no R3F, no React, no DOM -- same discipline as geoMath.ts. The
// render layer (PulseLayer.tsx) turns these into pooled meshes.
import type { GithubActivity } from "../../../../api/_lib/github-activity-handler.ts";
import type { Ops } from "../../../../api/_lib/ops-handler.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";

/** Colour keyed via readColor in the component: signal (pass), danger
 *  (fail), probe (push), alt (dev.to), warn (lichess/downloads). */
export type PulseKind = "push" | "ci-pass" | "ci-fail" | "devto" | "lichess" | "downloads";

export interface PulseEvent {
  /** Stable per distinct occurrence -- identical polls must reproduce the
   *  same id so a diff against an unchanged snapshot yields nothing. */
  id: string;
  kind: PulseKind;
  title: string;
  detail: string;
  /** Real ISO timestamp of the underlying event (or of the poll that
   *  observed a state change with no timestamp of its own, e.g. lichess) --
   *  never "now", so the inspector's "when" row is honest even during the
   *  staggered intro replay. */
  at: string;
  source: string;
}

export interface PulseSources {
  activity: GithubActivity | null;
  ops: Ops | null;
  signals: SignalsResponse | null;
}

export const EMPTY_PULSE_SOURCES: PulseSources = { activity: null, ops: null, signals: null };

function pushList(activity: GithubActivity | null): PulseEvent[] {
  if (!activity?.connected) return [];
  return activity.items
    .filter((i) => i.type === "push")
    .map((i) => ({
      id: `push:${i.url}:${i.at}`,
      kind: "push" as const,
      title: i.repo.replace(/^.*\//, ""),
      detail: i.message,
      at: i.at,
      source: "GitHub Events API via /api/github-activity",
    }));
}

function opsRunList(ops: Ops | null): PulseEvent[] {
  if (!ops?.connected) return [];
  return ops.runs.map((r) => ({
    id: `ci-site:${r.workflow}:${r.at}`,
    kind: (r.conclusion === "success" ? "ci-pass" : "ci-fail") as PulseKind,
    title: `${ops.repo} / ${r.workflow}`,
    detail: r.conclusion,
    at: r.at,
    source: "GitHub Actions via /api/ops",
  }));
}

function ciFamilyList(signals: SignalsResponse | null): PulseEvent[] {
  if (!signals?.ci) return [];
  return Object.entries(signals.ci)
    .filter(([, entry]) => entry.newestAt)
    .map(([slug, entry]) => ({
      id: `ci-family:${slug}:${entry.newestAt}`,
      kind: (entry.state === "fail" ? "ci-fail" : "ci-pass") as PulseKind,
      title: slug,
      detail: entry.state,
      at: entry.newestAt as string,
      source: "GitHub Actions (family repos) via /api/signals",
    }));
}

function downloadList(signals: SignalsResponse | null): PulseEvent[] {
  if (!signals?.downloads) return [];
  return Object.entries(signals.downloads).map(([slug, entry]) => ({
    id: `downloads:${slug}:${entry.tag}:${entry.apk}`,
    kind: "downloads" as const,
    title: slug,
    detail: `${entry.tag}, ${entry.apk} APK downloads`,
    at: signals.at,
    source: "GitHub Releases via /api/signals",
  }));
}

function devtoPostList(signals: SignalsResponse | null): PulseEvent[] {
  if (!signals?.devto) return [];
  return signals.devto.map((a) => ({
    id: `devto:post:${a.url}`,
    kind: "devto" as const,
    title: a.url.replace(/^https?:\/\//, ""),
    detail: `${a.reactions} reactions`,
    at: a.publishedAt,
    source: "dev.to via /api/signals",
  }));
}

/** Reaction/comment jumps on an already-known post -- there is no per-jump
 *  timestamp upstream, so this is stamped with the poll's own `at` (when we
 *  observed the jump), never a guessed one. */
function devtoReactionJumps(prev: SignalsResponse | null, curr: SignalsResponse | null): PulseEvent[] {
  if (!curr?.devto) return [];
  const before = new Map((prev?.devto ?? []).map((a) => [a.url, a] as const));
  const events: PulseEvent[] = [];
  for (const a of curr.devto) {
    const prior = before.get(a.url);
    if (prior && a.reactions > prior.reactions) {
      events.push({
        id: `devto:reactions:${a.url}:${a.reactions}`,
        kind: "devto",
        title: a.url.replace(/^https?:\/\//, ""),
        detail: `reactions +${a.reactions - prior.reactions}`,
        at: curr.at,
        source: "dev.to via /api/signals",
      });
    }
  }
  return events;
}

/** Online/playing are continuous states, not discrete events -- a pulse
 *  fires only on the false-to-true edge, stamped with the poll that
 *  observed the transition (lichess itself carries no timestamp). */
function lichessTransitions(prev: SignalsResponse | null, curr: SignalsResponse | null): PulseEvent[] {
  const c = curr?.lichess;
  if (!c) return [];
  const p = prev?.lichess;
  if (c.playing && !p?.playing) {
    return [{ id: `lichess:playing:${curr.at}`, kind: "lichess", title: "lichess.org", detail: "started a live game", at: curr!.at, source: "lichess.org via /api/signals" }];
  }
  if (c.online && !p?.online) {
    return [{ id: `lichess:online:${curr.at}`, kind: "lichess", title: "lichess.org", detail: "came online", at: curr!.at, source: "lichess.org via /api/signals" }];
  }
  return [];
}

/** New entries in `curr` whose id was not already present in `prev` --
 *  every id-stable list (push/ci/downloads/devto posts) diffs this way, so
 *  an unchanged value between two polls never re-fires. */
function diffById(prev: PulseEvent[], curr: PulseEvent[]): PulseEvent[] {
  const seen = new Set(prev.map((e) => e.id));
  return curr.filter((e) => !seen.has(e.id));
}

/** Every NEW event between two polls, oldest first. `prev === null` (no
 *  poll has landed yet) always yields nothing -- the very first poll feeds
 *  `pickIntroEvents` instead, never this. */
export function diffPulseEvents(prev: PulseSources | null, curr: PulseSources): PulseEvent[] {
  if (!prev) return [];
  const events = [
    ...diffById(pushList(prev.activity), pushList(curr.activity)),
    ...diffById(opsRunList(prev.ops), opsRunList(curr.ops)),
    ...diffById(ciFamilyList(prev.signals), ciFamilyList(curr.signals)),
    ...diffById(downloadList(prev.signals), downloadList(curr.signals)),
    ...diffById(devtoPostList(prev.signals), devtoPostList(curr.signals)),
    ...devtoReactionJumps(prev.signals, curr.signals),
    ...lichessTransitions(prev.signals, curr.signals),
  ];
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return events;
}

/** The latest `max` real events from a single first poll, oldest first --
 *  GLOBE's opening staggered replay ("the globe is alive immediately"),
 *  each one labelled with its own real time-ago, never "now". Excludes
 *  lichess/reaction-jump (continuous state, not discrete history). */
export function pickIntroEvents(curr: PulseSources, max = 6): PulseEvent[] {
  const all = [
    ...pushList(curr.activity),
    ...opsRunList(curr.ops),
    ...ciFamilyList(curr.signals),
    ...downloadList(curr.signals),
    ...devtoPostList(curr.signals),
  ];
  return all
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, max)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** "4 min ago" / "just now" -- the inspector's honest "when" row, and the
 *  status line's own "last event N ago". Whole minutes only: this is a
 *  status readout, not a stopwatch. */
export function formatTimeAgo(nowMs: number, atIso: string): string {
  const deltaMin = Math.max(0, Math.round((nowMs - Date.parse(atIso)) / 60_000));
  if (deltaMin < 1) return "just now";
  if (deltaMin === 1) return "1 min ago";
  if (deltaMin < 60) return `${deltaMin} min ago`;
  const hours = Math.round(deltaMin / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
