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
};

export const slaFor = (file: string): number => SLA_DAYS[file] ?? MAX_AGE_DAYS;

/**
 * Datasets whose source is live and external, so a stale file is a broken
 * generator rather than a quiet week.
 *
 * Named, not counted: `stamped.length >= 3` passed just as happily when a
 * generator DROPPED its stamp as when it kept it. A file that opts out by
 * accident is exactly the failure this exists to prevent.
 */
export const MUST_BE_STAMPED = ["chess.ts", "chessDeep.ts", "store.ts", "weeb.ts"];

/**
 * The two stamp shapes generators actually emit.
 *
 * Most write the JSON-ish `"generatedAt": "…"`; store.ts writes a TypeScript
 * const, `export const storeGeneratedAt = "…"`. Knowing only the first hid the
 * largest generated file in the repo (5,150 lines) from the alarm entirely.
 */
export const STAMP_RE = /(?:"generatedAt":|[A-Za-z]*[Gg]eneratedAt\s*=)\s*"(\d{4}-\d{2}-\d{2})/;

/** Which generator to run when one of these goes red. Derived from the file
 *  name rather than hand-mapped, so a new generated file is covered on arrival. */
export const generatorFor = (file: string): string =>
  `npm run gen:${file.replace(/\.ts$/, "").replace(/([A-Z])/g, (m) => "-" + m.toLowerCase())}`;

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
