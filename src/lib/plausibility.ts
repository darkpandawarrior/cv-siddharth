/**
 * Bounds a live reading must clear before EvidenceChip may show it as
 * trustworthy. Outside these, the caller flags the chip SUSPECT (a hollow
 * amber ring — idea-atlas SYS-3's "confidently wrong receiver", applied to
 * the site's own inputs): the value arrived, but it looks wrong, which is a
 * different failure from a missing value and gets a different shape, never
 * a fourth colour.
 *
 * Pure and standalone on purpose: any lane with a live reading (weather,
 * a push timestamp, a future signal) can call these without importing
 * EvidenceChip or React.
 */

/** Pune's real range is nowhere near this wide — 5..45 C is the generous
 *  outer bound a genuinely broken upstream reading falls outside of. */
export function isPlausibleTempC(tempC: number): boolean {
  return tempC >= 5 && tempC <= 45;
}

/** Cloud cover is a percentage; anything outside it is a malformed reading. */
export function isPlausibleCloudPct(cloudPct: number): boolean {
  return cloudPct >= 0 && cloudPct <= 100;
}

/** A reading timestamped after `now` (default the real clock) is wrong, not
 *  just late — a push or a sensor sample cannot come from the future. */
export function isPlausibleTimestamp(iso: string, now: Date = new Date()): boolean {
  return Date.parse(iso) <= now.getTime();
}
