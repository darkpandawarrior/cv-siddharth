// Committed festival and meteor-shower table (live-data-spec.md#1.3, #4 R6:
// this spec asserts no dates, this lane fills them in from the cited
// sources). Every row cites where its date came from; validUntil marks when
// the whole table needs its annual refresh. Pure data plus small pure
// lookups - src/lib/skyText.ts formats these into ledger rows.

export type CalendarKind = "festival" | "meteor";

export interface CalendarRow {
  id: string;
  kind: CalendarKind;
  name: string;
  /** ISO date (YYYY-MM-DD), inclusive. Equal to `end` for a single-day row. */
  start: string;
  end: string;
  source: string;
  /** Meteor rows only: zenithal hourly rate at peak, from the cited source. */
  zhr?: number;
}

const GAD_2026 = "https://www.angelone.in/news/economy/maharashtra-government-announces-2026-public-holiday-calendar";
const PANCHANG = "https://www.drikpanchang.com/";
const AMS_CALENDAR = "https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/";

/** 4 festivals x 2 years (2026-2027) + 8 major annual meteor showers, each
 *  given its next peak after this table's authoring date (2026-09-24) so the
 *  set spans late 2026 into 2027 rather than duplicating a full year. IMO's
 *  own calendar (imo.net) was down for a rebuild at authoring time, so AMS is
 *  the cited source instead (live-data-spec.md#1.3). */
export const SKY_CALENDAR: readonly CalendarRow[] = [
  // Festivals - Maharashtra GAD notification where the date is an official
  // holiday, a named Panchang otherwise (Makar Sankranti is not a GAD
  // holiday) and for the multi-day spans (Ganeshotsav, Diwali).
  { id: "makar-sankranti-2026", kind: "festival", name: "Makar Sankranti", start: "2026-01-14", end: "2026-01-14", source: PANCHANG },
  { id: "gudi-padwa-2026", kind: "festival", name: "Gudi Padwa", start: "2026-03-19", end: "2026-03-19", source: GAD_2026 },
  { id: "ganeshotsav-2026", kind: "festival", name: "Ganeshotsav", start: "2026-09-14", end: "2026-09-25", source: GAD_2026 },
  { id: "diwali-2026", kind: "festival", name: "Diwali", start: "2026-11-06", end: "2026-11-11", source: GAD_2026 },
  { id: "makar-sankranti-2027", kind: "festival", name: "Makar Sankranti", start: "2027-01-15", end: "2027-01-15", source: PANCHANG },
  { id: "gudi-padwa-2027", kind: "festival", name: "Gudi Padwa", start: "2027-04-07", end: "2027-04-07", source: PANCHANG },
  { id: "ganeshotsav-2027", kind: "festival", name: "Ganeshotsav", start: "2027-09-04", end: "2027-09-14", source: PANCHANG },
  { id: "diwali-2027", kind: "festival", name: "Diwali", start: "2027-10-27", end: "2027-10-31", source: PANCHANG },

  // Meteor showers - each row is this table's next occurrence of that annual
  // shower after 2026-09-24, so the four that already peaked earlier in 2026
  // carry a 2027 date instead of a stale one.
  { id: "draconids-2026", kind: "meteor", name: "Draconids", start: "2026-10-08", end: "2026-10-08", source: AMS_CALENDAR, zhr: 10 },
  { id: "orionids-2026", kind: "meteor", name: "Orionids", start: "2026-10-21", end: "2026-10-21", source: AMS_CALENDAR, zhr: 20 },
  { id: "leonids-2026", kind: "meteor", name: "Leonids", start: "2026-11-17", end: "2026-11-17", source: AMS_CALENDAR, zhr: 15 },
  { id: "geminids-2026", kind: "meteor", name: "Geminids", start: "2026-12-14", end: "2026-12-14", source: AMS_CALENDAR, zhr: 150 },
  { id: "quadrantids-2027", kind: "meteor", name: "Quadrantids", start: "2027-01-03", end: "2027-01-03", source: AMS_CALENDAR, zhr: 120 },
  { id: "lyrids-2027", kind: "meteor", name: "Lyrids", start: "2027-04-22", end: "2027-04-22", source: AMS_CALENDAR, zhr: 18 },
  { id: "eta-aquariids-2027", kind: "meteor", name: "Eta Aquariids", start: "2027-05-06", end: "2027-05-06", source: AMS_CALENDAR, zhr: 50 },
  { id: "perseids-2027", kind: "meteor", name: "Perseids", start: "2027-08-12", end: "2027-08-12", source: AMS_CALENDAR, zhr: 100 },
];

/** After this date the table needs its annual refresh - the `annual` SLA
 *  live-data-spec.md#1.3 names for both the festival and meteor rows. R7's
 *  /ops "calendar" row reads this to go DEGRADED. */
export const validUntil = "2027-12-31";

function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** The festival row containing `date`, or null before/after every span and
 *  past `validUntil` (a stale table asserts nothing rather than a wrong
 *  festival). */
export function activeFestival(date: Date): CalendarRow | null {
  const isoYear = date.getUTCFullYear();
  if (isoYear > Number(validUntil.slice(0, 4))) return null;
  const t = date.getTime();
  return (
    SKY_CALENDAR.find(
      (row) => row.kind === "festival" && t >= toUtcDate(row.start).getTime() && t <= toUtcDate(row.end).getTime() + 86_399_999,
    ) ?? null
  );
}

/** The next festival on or after `date` (inclusive of one already active),
 *  with how many whole days until it starts - skyText's "next Diwali in
 *  45 d" reads this. */
export function nextFestival(date: Date): { row: CalendarRow; daysUntil: number } | null {
  const t = date.getTime();
  let best: CalendarRow | null = null;
  for (const row of SKY_CALENDAR) {
    if (row.kind !== "festival") continue;
    if (toUtcDate(row.end).getTime() + 86_399_999 < t) continue;
    if (!best || toUtcDate(row.start).getTime() < toUtcDate(best.start).getTime()) best = row;
  }
  if (!best) return null;
  const daysUntil = Math.max(0, Math.ceil((toUtcDate(best.start).getTime() - t) / 86_400_000));
  return { row: best, daysUntil };
}

/** The next meteor shower peak on or after `date`, with whole nights until
 *  it - skyText's "Orionids peak in 3 nights" reads this. */
export function nextMeteorShower(date: Date): { row: CalendarRow; nightsUntil: number } | null {
  const t = date.getTime();
  let best: CalendarRow | null = null;
  for (const row of SKY_CALENDAR) {
    if (row.kind !== "meteor") continue;
    if (toUtcDate(row.start).getTime() + 86_399_999 < t) continue;
    if (!best || toUtcDate(row.start).getTime() < toUtcDate(best.start).getTime()) best = row;
  }
  if (!best) return null;
  const nightsUntil = Math.max(0, Math.ceil((toUtcDate(best.start).getTime() - t) / 86_400_000));
  return { row: best, nightsUntil };
}
