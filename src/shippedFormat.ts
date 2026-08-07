/**
 * Formatting helpers for the shelf, in their own module.
 *
 * Not co-located with ShippedTile: a file that exports both components and
 * plain functions breaks React Fast Refresh, and the tile is rendered in three
 * places, so losing hot reload on it is a real cost during a redesign.
 */

/** "20211215" → "Dec 2021". Archive timestamps, trimmed to what's meaningful. */
export function archiveMonth(ts: string): string {
  const d = new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** 2920170 → "2.9M". Install counts are Play's buckets, so any total is a floor. */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
