// §4.3 — THE REALITY LEDGER'S ROWS, and the two small pure helpers Lamps.tsx
// and Monuments.tsx also need off the same live sources (M17: "Row text
// comes from pure formatters owned by their source lanes ... so no surface
// restates a sentence" — this file is P1-05's one such formatter module,
// the v1 world's ledger-only sibling to src/lib/ledgerText.ts).
import { airRow, riverRow, sunRow, weatherRow } from "../lib/ledgerText.ts";
import type { Air, River, SkyState } from "../lib/sky.ts";
import type { GithubActivityItem } from "../../api/_lib/github-activity-handler.ts";
import type { Ops, OpsRun } from "../../api/_lib/ops-handler.ts";

export interface LedgerRow {
  key: "sun" | "weather" | "air" | "river" | "lamps" | "visitors" | "ci" | "you";
  text: string;
}

const CI_WORKFLOWS = ["ci.yml", "refresh-media.yml"] as const;

/** How many hours of `/api/github-activity` a push counts as "recent" for
 *  — Lamps' own light count and the ledger's Lamps row (reality-spec §4.2:
 *  "the last 24 h"). The handler already caps the feed at 20 events before
 *  this ever sees it, so "last 20 events, filtered to 24h" is what this
 *  filter actually enforces, not a second cap. */
const LAMP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Which of `items` light a lamp / count toward the Lamps row: his own
 *  pushes (never an upstream PR/branch-create, never someone else's repo),
 *  inside the trailing 24h of `nowMs`. Exported so Lamps.tsx and this
 *  file's own `buildRealityRows` read one filter, never two. `nowMs` is a
 *  parameter rather than `Date.now()` read internally so a Playwright
 *  fixed clock (`page.clock.setFixedTime`, which only patches the global
 *  `Date`) still drives this deterministically from the caller's own
 *  `Date.now()`. */
export function recentPushes(items: readonly GithubActivityItem[], nowMs: number): GithubActivityItem[] {
  const cutoff = nowMs - LAMP_WINDOW_MS;
  return items.filter((i) => {
    if (i.type !== "push" || i.upstream) return false;
    const at = Date.parse(i.at);
    return at >= cutoff && at <= nowMs;
  });
}

/** istTime, restated rather than imported: src/lib/ledgerText.ts (P1-00)
 *  keeps this private, and it is six lines — cheaper to duplicate than to
 *  ask a sibling lane's file to grow an export for one caller. */
function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

export type CiGlow = "ok" | "degraded" | "base";

/** M2's own rule: the site's own two workflows light the portfolio
 *  monument, never the KMP keystone. `base` (the tower's ordinary tint)
 *  covers every reading that isn't a clean, live double-pass — stale,
 *  disconnected, or either workflow simply never having run — so a
 *  reader never mistakes "we don't know" for "it's failing" or "it's
 *  fine." Exported for Monuments.tsx (the tower's colour) and reused below
 *  for the ledger's CI row, so the two can never disagree about what
 *  counts as green. */
export function siteCiGlow(ops: Ops | null): CiGlow {
  if (!ops || !ops.connected || ops.stale) return "base";
  const runs = CI_WORKFLOWS.map((w) => ops.runs.find((r) => r.workflow === w));
  if (runs.some((r) => !r)) return "base";
  return runs.every((r) => r!.conclusion === "success") ? "ok" : "degraded";
}

function ciRow(ops: Ops | null): string {
  if (!ops || !ops.connected) return "CI (this site) · unavailable right now · GitHub Actions";
  const byWorkflow = new Map(ops.runs.map((r) => [r.workflow, r] as const));
  // "unmeasured", not an em dash glyph — src/lib/signalsText.ts's own
  // ciRepoLabel convention for "this slot has no run at all" (its own test:
  // "kmp-build-logic unmeasured"), and G8 forbids "—" in rendered copy.
  const mark = (r: OpsRun | undefined) => (r ? (r.conclusion === "success" ? "✓" : "✕") : "unmeasured");
  const newest = CI_WORKFLOWS.map((w) => byWorkflow.get(w)).filter((r): r is OpsRun => !!r);
  const at = newest.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]?.at;
  const freshness = ops.stale ? "last good" : "live";
  const parts = CI_WORKFLOWS.map((w) => `${w.replace(".yml", "")} ${mark(byWorkflow.get(w))}`).join(" ");
  return `CI (this site) · ${parts} · GitHub Actions · ${freshness}${at ? ` ${istTime(at)} IST` : ""}`;
}

export interface RealityRowsInput {
  sky: SkyState | null;
  air: Air | null;
  river: River | null;
  /** Already filtered by `recentPushes` — this function only counts and
   *  formats, so the one filter above stays the one place the 24h window
   *  is applied. */
  lampPushes: readonly GithubActivityItem[];
  visitorCount: number;
  ops: Ops | null;
  /** `sessionRipple.ts`'s `getTouched()`/`useTouched()` — most recent last. */
  touched: readonly string[];
}

/** The Reality ledger's rows (reality-spec §4.3, master-plan.md#M17): pure,
 *  so Hud.tsx only has to gather the live values and hand them here — every
 *  sentence is built in one place rather than inlined into JSX. */
export function buildRealityRows(input: RealityRowsInput): LedgerRow[] {
  const { sky, air, river, lampPushes, visitorCount, ops, touched } = input;

  const sun = sky ? sunRow(sky.sun.altitudeDeg, sky.times.sunrise, sky.times.sunset) : "Sun · unavailable right now · computed";
  // ledgerText.ts's own weatherRow (P1-00) has no rain clause — the Rain
  // instanced mesh's own "measurable as" contract (reality-spec §4.2)
  // wants "Rain 2.4 mm/h" in the ledger and there is no separate Rain row
  // in the eight this lane owns, so it appends to Weather rather than
  // asking a sibling lane's formatter to grow a field only this lane uses.
  const w = sky?.weather ?? null;
  const weather = w && w.precipMmH > 0 ? `${weatherRow(w)} · Rain ${w.precipMmH.toFixed(1)} mm/h` : weatherRow(w);
  const you =
    touched.length > 0
      ? `You · ${[...touched].reverse().join(", ")} · this session only`
      : "You · nowhere yet, drive up to a project or case study · this session only";

  return [
    { key: "sun", text: sun },
    { key: "weather", text: weather },
    { key: "air", text: airRow(air) },
    { key: "river", text: riverRow(river) },
    { key: "lamps", text: `Lamps · ${lampPushes.length} pushes in 24 h · GitHub public events (last 20)` },
    { key: "visitors", text: `Visitors · ${visitorCount} here now · playhtml` },
    { key: "ci", text: ciRow(ops) },
    { key: "you", text: you },
  ];
}
