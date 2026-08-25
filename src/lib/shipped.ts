import { recentGrowth, type GrowthItem } from "../data/profile.ts";

/**
 * `recentGrowth` is authored in the order things were written down, which is
 * not the order they shipped. Three renderers used to take a positional slice
 * off the end of it and call the result "newest first": the homepage's
 * Recently shipped grid (`.slice(-4).reverse()`), the terminal's `shipped`
 * command (`.slice(-6).reverse()`) and the hero ticker's "latest ship"
 * (`[length - 1]`). Between them they hid the June–August career-ops entry,
 * which by date is the newest thing on the list.
 *
 * Sorting once, here, is the fix — a slice cannot be made correct by
 * rewording the caption under it. Dates read like "Jul 2026" or "Jun–Aug
 * 2026", so an entry is keyed by the LAST month it names, the same rule
 * src/data/freshness.test.ts already uses to decide what "recent" means.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function monthKey(date: string): number {
  const year = /(\d{4})/.exec(date)?.[1];
  const months = [...date.toLowerCase().matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/g)].map((m) => MONTHS.indexOf(m[1]));
  if (!year || !months.length) return 0;
  return Number(year) * 12 + Math.max(...months);
}

/** Every shipped entry, newest first. Array.prototype.sort is stable, so
 *  entries sharing a month keep their authored order. */
export const shippedNewestFirst: GrowthItem[] = [...recentGrowth].sort((a, b) => monthKey(b.date) - monthKey(a.date));
