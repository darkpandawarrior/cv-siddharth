// LANE S4 (sources-owner.md): pure logic split out of GuideLayer.tsx so that
// file keeps to "only exports a component" (react-refresh/only-export-
// components) — the same split every other layer with real math uses
// (quake.ts beside quakeGlyphs.tsx, replayWindow.ts beside HistoryLayer.tsx).
// No three.js, no React, no DOM: pure functions over plain data, each with
// its own colocated *.test.ts.
import { PUNE } from "../../../lib/sky.ts";

/** The fraction of a place's RECORDED active years (`years`, from
 *  mapsPlaces.ts) reached by `simYear`. `mapsByYear` only aggregates ACROSS
 *  every city (no per-city per-year split exists in the generated data —
 *  see sources-owner.md finding 1), so this is the honest computation the
 *  real data supports: how much of this place's known activity history has
 *  the scrubber reached, not an invented per-year magnitude for a single
 *  city. 0 before the place's first recorded year (nothing to show yet), 1
 *  once `simYear` reaches its last recorded year (the lifetime total
 *  again). */
export function cumulativeFraction(years: readonly number[], simYear: number): number {
  if (years.length === 0) return 0;
  const reached = years.filter((y) => y <= simYear).length;
  return reached / years.length;
}

/** Ring scale for a place AT `simYear`: the lifetime `scaleFor` result,
 *  scaled down by how much of the place's recorded history the Time Machine
 *  has reached. `scaleFor` is passed in rather than imported so this module
 *  stays free of GuideLayer.tsx's own MIN_SCALE/MAX_SCALE tuning constants —
 *  one direction of dependency, not two files agreeing on a magic number. */
// ponytail: active-year proxy; use per-city annual totals when the export supplies them.
export function scaleForYear(scaleFor: (reviews: number, photos: number) => number, reviews: number, photos: number, years: readonly number[], simYear: number): number {
  return scaleFor(reviews, photos) * cumulativeFraction(years, simYear);
}

// sources-owner.md finding 3's own honesty guard: below this many events the
// bar chart reads as "quiet week" noise, not a real shape — better to show
// nothing than a near-empty histogram dressed up as a pattern.
const ACTIVITY_MIN_EVENTS = 5;

/** Each item's `at` (UTC ISO) as an Asia/Kolkata hour, 0-23 — same
 *  `toLocaleString(..., { timeZone, hour: "2-digit", hour12: false })`
 *  idiom already established by TimeScrubber.tsx/skyMoon.tsx for this exact
 *  conversion, not a new one invented here. */
function istHour(at: string): number {
  return Number(new Date(at).toLocaleString("en-GB", { timeZone: PUNE.tz, hour: "2-digit", hour12: false })) % 24;
}

/** 24-bucket (IST hour of day) histogram of `items`, index 0..23 (hour of
 *  day has no real chronology across days, so "0..23" is the only reading
 *  that isn't an invented order — matches `Selection.spark`'s "oldest to
 *  newest" contract as closely as an hour-of-day series can). `null` below
 *  `ACTIVITY_MIN_EVENTS`: see this file's own honesty-guard comment above. */
export function hourHistogram(items: { at: string }[] | undefined): number[] | null {
  const valid = items?.filter((item) => Number.isFinite(Date.parse(item.at)));
  if (!valid || valid.length < ACTIVITY_MIN_EVENTS) return null;
  const buckets = new Array(24).fill(0);
  for (const item of valid) buckets[istHour(item.at)] += 1;
  return buckets;
}
