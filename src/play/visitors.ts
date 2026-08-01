/**
 * The visitor ledger — pure rules, kept out of the component so the arithmetic
 * and the parts facing untrusted input can be tested without a socket, a DOM or
 * a clock.
 *
 * Three things get recorded, and deliberately only three:
 *
 *  - `shards`  how many distinct browsers have ever opened a room
 *  - `days`    how many visits landed on each calendar day
 *  - `zones`   which IANA time zones those browsers' clocks are set to
 *
 * No identifiers, no per-person rows, no IP, no cookie — there is no server
 * here to hold one. A time zone is the coarsest "where in the world" signal a
 * page can read without asking, it never leaves the aggregate, and it is the
 * one thing that makes a counter feel like a map instead of a number.
 *
 * ── Why `shards` and not a single integer ────────────────────────────────
 *
 * The shared document is a CRDT (Yjs). A number in it is a register, not a
 * counter: two visitors who both read 100 and both write 101 merge to 101, and
 * one of them is gone. Read-modify-write on shared state is lost-update, and
 * a CRDT does not exempt you from it — it just makes it look like it did.
 *
 * So this is the textbook grow-only counter: every writer touches its own
 * randomly chosen shard and the total is the sum of all of them. Two writers
 * now only collide if they pick the same shard inside the same sync window —
 * a 1-in-64 chance on top of an already-rare simultaneous arrival, and the
 * worst case is still just an undercount of one. The document stays a fixed
 * 64 numbers no matter how many people come through, which is the constraint
 * that ruled out the obvious alternative of one key per visitor.
 *
 * `days` and `zones` are deliberately NOT sharded. They are plain counters and
 * they carry exactly the lost-update flaw described above: two arrivals in the
 * same instant can cost one tick. That is a fair trade where the total is not —
 * sharding them would multiply the document by 64 per day and per zone, and a
 * bar chart that is occasionally one short says the same thing either way,
 * whereas "you are the 1,204th person here" has to be right.
 */

export interface VisitorLedger {
  /** G-Counter shards. Total unique browsers = the sum of these. */
  shards: Record<string, number>;
  /** ISO day (UTC) → visits that landed that day, one per browser per day. */
  days: Record<string, number>;
  /** IANA zone → browsers whose clock lives there, counted once each. */
  zones: Record<string, number>;
}

/** What this browser remembers about itself. The whole of it. */
export interface VisitorRecord {
  /** Which visitor this browser was — its place in the door count, kept for good. */
  n: number;
  /** ISO day it first arrived. */
  first: string;
  /** Distinct days it has shown up on. */
  days: number;
  /** The last day counted, which is what stops a refresh counting twice. */
  last: string;
}

export const EMPTY_LEDGER: VisitorLedger = { shards: {}, days: {}, zones: {} };

export const VISITOR_KEY = "cv:visitor";

/* 64 shards ≈ 1 kB of document at full spread, which every visitor downloads on
 * arrival — the same budget the guest wall's cap is protecting. */
export const SHARD_COUNT = 64;

/* Ceilings on what gets rendered out of a world-writable document. Nothing
 * stops a determined stranger writing ten thousand junk zone keys into the
 * room; these stop that turning into a ten-thousand-row render here. */
export const MAX_ZONES_SHOWN = 40;
export const MAX_ZONE_LENGTH = 40;

/* IANA zone names are `Area/Location`, sometimes `Area/Sub/Location`, plus a
 * few bare ones like `UTC`. Anything else did not come from a browser's own
 * `Intl` and does not get stored or shown. */
const ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

const DAY_MS = 86_400_000;

/** Every number read out of the shared document goes through here first: it is
 *  world-writable, so `NaN`, `-1` and `"lots"` are all things it might contain
 *  and none of them may reach a width style or a total. */
function safeCount(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The UTC calendar day, which is what the ledger keys on. One clock for
 *  everybody beats each visitor bucketing into their own local midnight and
 *  making the day counts unaddable. */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Pick this browser's shard. Random rather than derived from anything about
 *  the visitor — a hash of something identifying would make the shard a weak
 *  fingerprint, and there is nothing to gain from it being stable. */
export function pickShard(rng: () => number = Math.random): string {
  return `s${Math.min(SHARD_COUNT - 1, Math.floor(rng() * SHARD_COUNT))}`;
}

/** Unique browsers ever, as the sum of the shards. */
export function totalVisitors(ledger: VisitorLedger): number {
  let total = 0;
  for (const n of Object.values(ledger?.shards ?? {})) total += safeCount(n);
  return total;
}

export interface VisitPlan {
  /** The record to persist for this browser. */
  record: VisitorRecord;
  /** First time ever here — take a number, and a zone. */
  countPerson: boolean;
  /** First time today — count the visit against today's date. */
  countDay: boolean;
}

/**
 * The whole once-per-browser-per-day decision, in one pure function.
 *
 * A brand-new browser counts as a person and a visit. A returning one counts
 * as a visit, but only the first time it shows up on a given day — otherwise a
 * refresh, or a hop between two rooms, would read as traffic. The same rule
 * drives both the shared day chart and "your 4th day here", which is why the
 * two can never disagree.
 *
 * A new visitor's record comes back with `n: 0`, meaning "not numbered yet".
 * The number cannot be known here: it is whatever the shared counter reads
 * once this visitor's own increment is in it, and only the write knows that.
 */
export function planVisit(prev: VisitorRecord | null, today: string): VisitPlan {
  if (!prev) {
    return { record: { n: 0, first: today, days: 1, last: today }, countPerson: true, countDay: true };
  }
  if (prev.last === today) {
    return { record: prev, countPerson: false, countDay: false };
  }
  return { record: { ...prev, days: prev.days + 1, last: today }, countPerson: false, countDay: true };
}

/**
 * Stamp on the number a first-time visitor earned.
 *
 * This is separate from `planVisit` because of a race that is easy to get
 * wrong and impossible to see: React's copy of the shared document is a
 * snapshot from the last render, and on the very first render after the socket
 * connects that snapshot is still empty. Numbering from it hands every arrival
 * "№ 1" on a site that has already had hundreds. The count has to be read back
 * out of the live document, inside the same transaction that incremented it.
 *
 * Already-numbered visitors keep the number they were given, for good.
 */
export function withOrdinal(record: VisitorRecord, counted: number): VisitorRecord {
  return record.n > 0 ? record : { ...record, n: Math.max(1, Math.floor(counted)) };
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** Read this browser's record back, treating a missing, unparseable or
 *  half-written one as "never been here" — which costs at most one double
 *  count and beats throwing on the way into a render. */
export function readVisitor(storage: ReadableStorage): VisitorRecord | null {
  try {
    const raw = storage.getItem(VISITOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VisitorRecord> | null;
    if (typeof parsed?.n !== "number" || !Number.isFinite(parsed.n) || typeof parsed.last !== "string") return null;
    return {
      n: Math.max(0, Math.floor(parsed.n)),
      first: typeof parsed.first === "string" ? parsed.first : parsed.last,
      days: safeCount(parsed.days) || 1,
      last: parsed.last,
    };
  } catch {
    return null;
  }
}

/** Persist the record. False means storage refused (private mode, blocked site
 *  data) — the caller's cue to count nothing at all, because a browser that
 *  cannot remember being counted would otherwise be counted on every load. */
export function writeVisitor(storage: WritableStorage, record: VisitorRecord): boolean {
  try {
    storage.setItem(VISITOR_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function isPlausibleZone(zone: string): boolean {
  return zone.length <= MAX_ZONE_LENGTH && ZONE_PATTERN.test(zone);
}

/** This browser's own zone, or "" if it is unreadable or looks nothing like a
 *  zone — in which case nothing is recorded rather than something wrong. */
export function myZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return isPlausibleZone(zone) ? zone : "";
  } catch {
    return "";
  }
}

/** "Asia/Kolkata" → "Kolkata". The half anyone actually reads. */
export function zonePlace(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** "Asia/Kolkata" → "Asia". Continent-ish, and good enough to group by. */
export function zoneRegion(zone: string): string {
  const region = zone.split("/")[0] ?? zone;
  return region === "America" ? "Americas" : region;
}

export interface ZoneTally {
  zone: string;
  place: string;
  region: string;
  count: number;
}

/** Zones worth showing, busiest first, filtered and capped. */
export function topZones(ledger: VisitorLedger, limit = MAX_ZONES_SHOWN): ZoneTally[] {
  return Object.entries(ledger?.zones ?? {})
    .filter(([zone, n]) => isPlausibleZone(zone) && safeCount(n) > 0)
    .map(([zone, n]) => ({ zone, place: zonePlace(zone), region: zoneRegion(zone), count: safeCount(n) }))
    .sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone))
    .slice(0, limit);
}

export interface DayTally {
  day: string;
  count: number;
}

/**
 * The last `span` days ending today, including the empty ones.
 *
 * Filling the gaps is the point: a chart of only the days that happened is a
 * chart with no time axis, where a quiet fortnight and a busy one draw
 * identically. The zeroes are the honest part.
 */
export function recentDays(ledger: VisitorLedger, today: string, span = 30): DayTally[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end)) return [];
  const days: DayTally[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = new Date(end - i * DAY_MS).toISOString().slice(0, 10);
    days.push({ day, count: safeCount(ledger?.days?.[day]) });
  }
  return days;
}

/** Visits across the window a `recentDays` result covers. */
export function sumDays(days: DayTally[]): number {
  return days.reduce((total, d) => total + d.count, 0);
}

/** "1,204th". Because "you are visitor 1204" is a number and "you are the
 *  1,204th person through this door" is a sentence. */
export function ordinal(n: number): string {
  const rem100 = Math.abs(n) % 100;
  const rem10 = Math.abs(n) % 10;
  const suffix =
    rem100 >= 11 && rem100 <= 13 ? "th" : rem10 === 1 ? "st" : rem10 === 2 ? "nd" : rem10 === 3 ? "rd" : "th";
  return `${n.toLocaleString()}${suffix}`;
}
