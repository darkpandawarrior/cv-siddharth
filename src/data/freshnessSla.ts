/**
 * The freshness perimeter's rules, in ONE place.
 *
 * These lived inside freshness.test.ts, which was fine while the test was the
 * only thing that knew them. `/ops` draws the same perimeter as a board a
 * reader can look at, and a dashboard about silent drift that keeps its own
 * private copy of the SLA table would be the joke writing itself: the test
 * could go green on 21 days while the board rendered 45.
 *
 * So the test and the board import the same constants, and neither owns them.
 *
 * scripts/generators.mjs folds SLA_DAYS in as a `slaDays` field on the node
 * that owns each named file (a generator can be read alongside its own
 * deadline instead of a reader cross-referencing two files), reading FROM
 * this table rather than the other way round — this stays the one place the
 * deadlines are actually set.
 */

/** Anything not named below. Generous on purpose: it is not there to nag about
 *  a quiet week, it is there so a generator failing for a MONTH cannot keep
 *  passing for one that works. */
export const MAX_AGE_DAYS = 45;

/**
 * Per-file SLAs, because one blanket threshold is a licence to rot.
 *
 * chessDeep.ts sat 29 days stale under the flat 45-day rule with the suite
 * green and 16 more days of legal silence still to run. The deadline now
 * matches how fast the SOURCE actually moves: a file fed by a live external
 * API on a daily cron has no business being three weeks old, while the Play
 * Store fleet sweep is deliberately slow and rate-limited, so it gets room.
 */
export const SLA_DAYS: Record<string, number> = {
  "chess.ts": 21,
  "chessDeep.ts": 21,
  "weeb.ts": 21,
  "store.ts": 45,
  "history.ts": 21,
  // Live and external, refreshed by refresh-media.yml's weekly cron.
  "writing.ts": 21,
  "anthology.ts": 21,
  // Sibling-kind: only as fresh as refresh-media's Android/KMP checkouts,
  // which is a slower, more failure-prone path than a plain HTTP fetch.
  "systemGraph.ts": 30,
  "repoStats.ts": 30,
  // network but not wired into refresh.mjs's automatic cadence yet — see
  // generators.mjs's note on archive-text having no refresh stage. Generous
  // until it is.
  "archiveText.ts": 45,
  "projectStats.ts": 21,
  // Derived from timeline.ts's own commit date (see gen-lanes.mjs), not a
  // network cadence, so generous.
  "lanes.ts": 45,
};

export const slaFor = (file: string): number => SLA_DAYS[file] ?? MAX_AGE_DAYS;

/**
 * How stale a running `*-app` build's manifest.json may get before its panel
 * (DeviceWall, DeviceMorph, the project pages) renders DEGRADED.
 *
 * Ties to gen-app-manifests.mjs's own cadence: the twin's half runs inside
 * refresh-twin.yml's weekly cron (Monday), the other four are refreshed by
 * hand when their sibling repo is checked out. Three weekly cycles of slack,
 * not the blanket 45-day default — a build panel claiming to show "the commit
 * running in front of you" has less business being a month stale than a
 * hand-curated prose section does.
 */
export const APP_MANIFEST_SLA_DAYS = 21;

/**
 * Datasets whose source is live and external, so a stale file is a broken
 * generator rather than a quiet week.
 *
 * Named, not counted: `stamped.length >= 3` passed just as happily when a
 * generator DROPPED its stamp as when it kept it. A file that opts out by
 * accident is exactly the failure this exists to prevent.
 */
// timeline.ts is deliberately absent, same rule as freshness.test.ts documents
// on its own MUST_BE_STAMPED list: its generator recomputes lanes from files
// this list already watches separately (chess.ts, history.ts, writing.ts), so
// its own stamp would say "a build happened", not "data moved" — a member
// that can never go red on its own is padding, not cover.
// galleries.ts and compareSets.ts are deliberately also absent, alongside
// timeline.ts above: both sit in check-generated.mjs's byte-deterministic set
// and scan heavy/, which is gitignored — there is no committed input to date
// them against, and a wall-clock stamp there would fail that check every day
// regardless of whether a screenshot changed. See gen-galleries.mjs's and
// gen-compare-sets.mjs's own comments on the same point.
export const MUST_BE_STAMPED = [
  "chess.ts", "chessDeep.ts", "store.ts", "weeb.ts", "history.ts",
  "systemGraph.ts", "writing.ts", "anthology.ts", "archiveText.ts",
  "projectStats.ts", "repoStats.ts", "lanes.ts",
];

/**
 * The two stamp shapes generators actually emit.
 *
 * Most write the JSON-ish `"generatedAt": "…"`; store.ts writes a TypeScript
 * const, `export const storeGeneratedAt = "…"`. Knowing only the first hid the
 * largest generated file in the repo (5,150 lines) from the alarm entirely.
 */
export const STAMP_RE = /(?:"generatedAt":|[A-Za-z]*[Gg]eneratedAt\s*=)\s*"(\d{4}-\d{2}-\d{2})/;

/**
 * The rare files whose package.json alias does not follow the kebab-case
 * convention generatorFor derives below — package.json is not owned by this
 * file, so the exception lives here rather than as a rename this lane has no
 * business making. Checked mechanically by ops.test.ts's "names a generator
 * that is a real npm script" against the CURRENT package.json, so a script
 * rename shows up here as a failing test, not a silently dead link.
 */
const GENERATOR_ALIAS: Record<string, string> = {
  "compareSets.ts": "compare",
  "projectStats.ts": "stats",
  "writing.ts": "loopdown",
};

/** Which generator to run when one of these goes red. Derived from the file
 *  name rather than hand-mapped, so a new generated file is covered on arrival. */
export const generatorFor = (file: string): string =>
  `npm run gen:${GENERATOR_ALIAS[file] ?? file.replace(/\.ts$/, "").replace(/([A-Z])/g, (m) => "-" + m.toLowerCase())}`;

/** Whole days between a `YYYY-MM-DD` stamp and now. */
export function ageDays(stamp: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(stamp)) / 86_400_000);
}

/**
 * The three states, and why the middle one is the whole point.
 *
 * OK and BROKEN are what GitHub already gives you. DEGRADED — passing,
 * succeeding daily, and quietly aging toward its deadline — is the state every
 * failure this perimeter was built for actually lived in.
 */
export type OpsState = "OK" | "DEGRADED" | "BROKEN";

/** Aging is DEGRADED from two-thirds of the way to the deadline. */
export function stateForAge(age: number, sla: number): OpsState {
  if (age > sla) return "BROKEN";
  if (age >= Math.floor(sla * (2 / 3))) return "DEGRADED";
  return "OK";
}
