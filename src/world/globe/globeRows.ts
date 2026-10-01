// GLOBE's fact list (living-ledger-spec.md#6.3, task 5): the same claim
// sentences GlobePanel renders beside the 3D scene AND what an SSR/no-WebGL
// visitor gets as plain text - one list, read by both branches, so neither
// can drift from the other (the acceptance line: "WebGL disabled -> the fact
// list is visible with the reach sentences").
//
// Reads the exact same source files GRAMMAR's G15/G16/G17 rules read
// (src/data/store.ts, src/data/profile.ts, src/data/globeGeo.ts) directly,
// rather than through grammar.ts/ledger.ts/worldModel.ts: that chain pulls in
// every OTHER GRAMMAR rule's data too (chess, writing, timeline, weeb...) for
// two numbers this route has no other reason to load, and STREET already
// pays that cost for its own reasons. GLOBE is the one place G15-G17 are
// actually drawn (`altitudes: GLOBE_ONLY` in grammar.ts), so reading their
// inputs straight is not a second copy of a claim computed elsewhere - it is
// the same computation, done once, for the one surface that needs it.
import { fleetStats } from "../../data/store.ts";
import { upstreamMergedPRs, upstreamStars } from "../../data/profile.ts";
import { employerMarkers, employersUnresolved } from "../../data/globeGeo.ts";
import { ageDays } from "../../data/freshnessSla.ts";

export interface GlobeRow {
  id: string;
  label: string;
  /** EvidenceChip's `file` prop - every number beside a chip, per G8. */
  file: string;
  source: string;
}

// The exact claim sentences named in this lane's own task list - verbatim,
// so claim-audit and a human reading both specs side by side see one wording.
export const REACH_INSTALLS_CLAIM = `install floor across ${fleetStats.live} live listings (Play's own install bands, summed as floors)`;
export const REACH_UPSTREAM_CLAIM = `${upstreamMergedPRs} merged PRs in a repository starred ${upstreamStars} times`;

const employerTotal = employerMarkers.length + employersUnresolved.length;

/** data.md finding #6: `storeGeneratedAt` is already shown as an absolute
 *  "as of <date>" chip (GlobePanel.tsx's EvidenceChip), but a visitor has to
 *  do their own date math to know 54 days is nearly two months. This turns
 *  the stamp into the same "N weeks ago" qualifier every other snapshot on
 *  the page carries.
 *
 *  `now` has NO default here on purpose (task Z1 fix: it used to default to
 *  `new Date()`, evaluated once at whatever moment `globeFacts` below was
 *  first imported/module-evaluated - the server's copy of that instant and
 *  the browser bundle's copy are two different processes that can boot
 *  minutes or days apart, so the baked-in label drifted between SSR and
 *  client and produced a genuine hydration text mismatch (React error
 *  #418), not just the "rendered exactly across a week boundary" edge case
 *  this comment used to shrug off - reproduced with e2e/globe-C1.spec.ts's
 *  malformed-link test, which freezes the clock before navigating and made
 *  the drift deterministic instead of rare). Callers now pass `now`
 *  explicitly: GlobePanel.tsx via `useNow()` (null until mount, same
 *  SSR-safe pattern useSky.ts already uses - the label appears once
 *  mounted, not before), puneSelection.ts at its own client-only call site. */
export function weeksAgoLabel(stamp: string, now: Date): string {
  const weeks = Math.floor(ageDays(stamp, now) / 7);
  if (weeks <= 0) return "less than a week ago";
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

/** GLOBE's static facts (task 2, task 5): the two reach columns and the
 *  employer-marker resolution state. Static because every input is a
 *  committed data snapshot, not a live read - same "no clock, no fetch"
 *  discipline as the rest of src/world. */
export const globeFacts: readonly GlobeRow[] = [
  {
    // No "(N weeks ago)" baked in here on purpose — see weeksAgoLabel's own
    // comment. GlobePanel/puneSelection append it once a real clock exists.
    id: "reach-installs",
    label: `${fleetStats.installFloor.toLocaleString("en-IN")} ${REACH_INSTALLS_CLAIM}`,
    file: "store.ts",
    source: "Play Store listings",
  },
  {
    id: "reach-upstream",
    label: `${REACH_UPSTREAM_CLAIM} (the stars are the repo's, not his)`,
    file: "profile/openSource.ts",
    source: "career-ops-hq on GitHub",
  },
  {
    id: "employer-marker",
    label:
      employersUnresolved.length > 0
        ? `City markers: ${employerMarkers.length} of ${employerTotal} mapped (${employersUnresolved.join(", ")} listed, never geocoded)`
        : `City markers: ${employerMarkers.length} of ${employerTotal} mapped`,
    file: "profile/experience.ts",
    source: "experience.ts + a fixed city geocode table",
  },
];

/** "N here now, from K countries" (task 3's live-dots row), pure so it is
 *  unit-testable without playhtml or a browser. `counts` is country code ->
 *  how many presences published that code (S14, §9.1: counts per country
 *  only, never a position). */
export function liveDotsLabel(counts: Readonly<Record<string, number>>): string {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return "no one else here right now";
  const countries = Object.keys(counts).length;
  return `${total} here now, from ${countries} ${countries === 1 ? "country" : "countries"}`;
}
