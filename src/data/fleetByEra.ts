import { fleet } from "./store.ts";
import { experience } from "./profile/experience.ts";

/**
 * The fleet, joined against his own timeline (REC-7).
 *
 * Every fleet row's last Play update is banded into whichever `experience.ts`
 * period it falls in, never into who is credited for the update. A client
 * app can post a new build any day, whether or not he is anywhere near it;
 * the wording rule this file exists to enforce is that a bucket says WHEN,
 * never WHO. Copy reading this data says "last Play update fell in this
 * era", and must never say "shipped by": updates after his Dice exit are
 * not his work.
 *
 * A row the periods cannot place (predates every period, or lands in a gap
 * between two of them) renders as a grey "unmeasured" bucket rather than
 * being silently dropped, the same honesty rule kmp-toolkit's
 * `AiCapabilities` and Sangam rule 1 already carry elsewhere on this site.
 */

const MONTHS: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function parseMonthYear(s: string, boundary: "start" | "end"): Date {
  const [month, year] = s.trim().split(" ");
  const m = MONTHS[month];
  if (m === undefined || !year) throw new Error(`fleetByEra: unparseable period bound "${s}"`);
  // "end" wants the LAST day of that month (day 0 of the next month), or a
  // period like "June 2023 - September 2026" would cut Dice off at Sep 1
  // rather than covering the whole final month.
  return boundary === "start" ? new Date(Number(year), m, 1) : new Date(Number(year), m + 1, 0);
}

interface Era {
  key: string;
  label: string;
  period: string;
  start: Date;
  /** null = ongoing ("Present"): no upper bound. */
  end: Date | null;
}

const slug = (company: string) => company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Chronological, oldest first (opposite of experience.ts's own order). An
 *  overlap (Neev started as a side consulting engagement while Dice was
 *  still his full-time role) resolves to whichever era started EARLIER and
 *  is still open, i.e. the continuing primary role rather than the newer
 *  concurrent one. A fleet app's last update is a ride-hailing platform
 *  build; nothing ties it to Neev's ERP contract even by coincidence of
 *  date, so the era it shares real context with should win the overlap. */
const eras: Era[] = [...experience]
  .map((e) => {
    const [startStr, endStr] = e.period.split(" - ");
    const start = parseMonthYear(startStr, "start");
    const end = endStr === "Present" ? null : parseMonthYear(endStr, "end");
    return { key: slug(e.company), label: e.company, period: e.period, start, end };
  })
  .sort((a, b) => a.start.getTime() - b.start.getTime());

export interface FleetEraBucket {
  key: string;
  label: string;
  period: string | null;
  count: number;
  ids: string[];
}

function bucketFor(updated: string): Era | null {
  const d = new Date(updated);
  if (Number.isNaN(d.getTime())) return null;
  return eras.find((era) => d >= era.start && (era.end === null || d <= era.end)) ?? null;
}

const buckets = new Map<string, FleetEraBucket>();
for (const era of eras) buckets.set(era.key, { key: era.key, label: era.label, period: era.period, count: 0, ids: [] });
buckets.set("unmeasured", { key: "unmeasured", label: "Unmeasured", period: null, count: 0, ids: [] });

for (const app of fleet) {
  const era = bucketFor(app.updated);
  const bucket = buckets.get(era?.key ?? "unmeasured")!;
  bucket.count++;
  bucket.ids.push(app.id);
}

/** Chronological, oldest era first; "unmeasured" last. Buckets an era placed
 *  zero rows into are kept (a grey, empty niche is still an honest niche). */
export const fleetByEra: FleetEraBucket[] = [
  ...eras.map((e) => buckets.get(e.key)!),
  buckets.get("unmeasured")!,
];
