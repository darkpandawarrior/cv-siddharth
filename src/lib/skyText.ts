// Pure row formatters for this lane's computed sky values (moon, stars,
// festival/meteor calendar, season) — the counterpart to ledgerText.ts
// (weather/air/river) and signalsText.ts (chess/CI/downloads). Every place
// that renders one of these reads the same sentence (master-plan.md#M17):
// /terminal's `sky` command, the v2 ledger and /ops all import this instead
// of restating the wording.
import type { MoonPhase } from "./moon.ts";
import { seasonRow as ledgerSeasonRow } from "./ledgerText.ts";
import type { Season } from "./sky.ts";
import { PUNE_NORMALS_MM } from "../data/generated/puneNormals.ts";
import { activeFestival, nextFestival, nextMeteorShower } from "../data/skyCalendar.ts";

function istTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

const PHASE_NAMES = [
  [22.5, "new"],
  [67.5, "waxing crescent"],
  [112.5, "first quarter"],
  [157.5, "waxing gibbous"],
  [202.5, "full"],
  [247.5, "waning gibbous"],
  [292.5, "last quarter"],
  [337.5, "waning crescent"],
] as const;

function phaseName(phaseAngleDeg: number): string {
  return PHASE_NAMES.find(([upTo]) => phaseAngleDeg < upTo)?.[1] ?? "new";
}

/** `rise` is the next moonrise (moonTimes(...).rise), if it falls today. */
export function moonRow(phase: MoonPhase, rise: Date | null): string {
  const pct = Math.round(phase.fraction * 100);
  const riseClause = rise ? `, rises ${istTime(rise)}` : "";
  return `Moon · ${phaseName(phase.phaseAngleDeg)} ${pct}%${riseClause} · computed`;
}

export function starsRow(count: number, magLimit = 5.0): string {
  return `Stars · ${count.toLocaleString("en-IN")} to magnitude ${magLimit.toFixed(1)} · HYG v41 CC BY-SA 4.0 · computed positions`;
}

/** The 2015-2025 mean for `date`'s calendar day — same fixed leap-year
 *  calendar gen-pune-normals.mjs indexes by, so a lookup lands on the same
 *  row whether or not `date`'s own year is a leap year. */
export function normalMmForDate(date: Date): number {
  const start = Date.UTC(2024, 0, 1);
  const idx = Math.round((Date.UTC(2024, date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000);
  return PUNE_NORMALS_MM[idx] ?? 0;
}

/** Thin wrapper over ledgerText's seasonRow (P1-00): this lane's only job for
 *  the season row is supplying the normal it was built without yet — the
 *  wording itself stays in one place. */
export function seasonRow(s: Season | null, date: Date): string {
  return ledgerSeasonRow(s, normalMmForDate(date));
}

export function festivalRow(date: Date): string {
  const active = activeFestival(date);
  const next = active ? null : nextFestival(date);
  const clause = active ? `${active.name} today` : next ? `none today, next ${next.row.name} in ${next.daysUntil} d` : "none upcoming";
  const source = (active ?? next?.row)?.source;
  const cite = source ? new URL(source).hostname : "calendar";
  return `Festival · ${clause} · calendar (${cite}) · ambient`;
}

/** Appended to the Moon row, matching the example in live-data-spec.md#1.3
 *  ("· Orionids peak in 3 nights"); null when nothing is within range. */
export function meteorClause(date: Date, withinNights = 14): string | null {
  const next = nextMeteorShower(date);
  if (!next || next.nightsUntil > withinNights) return null;
  return next.nightsUntil === 0 ? `${next.row.name} peaks tonight` : `${next.row.name} peaks in ${next.nightsUntil} nights`;
}
