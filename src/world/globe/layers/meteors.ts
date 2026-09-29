// LANE P10C (wave 10): which of meteorShowerData.ts's showers is active on a
// given date, and when its radiant next rises for an observer -- pure math,
// no React, no three, the same "render layer wraps pure math" split every
// other globe layer here follows (marine.ts, hoverReadout.ts).
import { localTime } from "../exploreMath.ts";
import { raDecToAltAz } from "../../../lib/stars.ts";
import { MAJOR_SHOWERS, type MeteorShower } from "./meteorShowerData.ts";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** True when (month, day) falls inside [start, end], wrapping the Dec/Jan
 *  boundary automatically when start > end (the Quadrantids' own window) --
 *  no separate cross-year branch needed, the same packed-integer compare
 *  handles both shapes. */
export function monthDayInRange(month: number, day: number, startMonth: number, startDay: number, endMonth: number, endDay: number): boolean {
  const value = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  return start <= end ? value >= start && value <= end : value >= start || value <= end;
}

/** Real calendars overlap: return every active window, never first-match. */
export function activeShowers(d: Date, showers: readonly MeteorShower[] = MAJOR_SHOWERS): MeteorShower[] {
  return showers.filter((shower) => monthDayInRange(d.getUTCMonth() + 1, d.getUTCDate(), shower.startMonth, shower.startDay, shower.endMonth, shower.endDay));
}

const SCAN_STEP_MIN = 5;
const SCAN_HORIZON_MIN = 24 * 60;

/** The next instant at or after `from` when the radiant (RA/Dec) crosses
 *  the horizon rising (altitude 0, going up) for an observer at
 *  (latDeg, lonDeg) -- a coarse fixed-step scan over raDecToAltAz
 *  (stars.ts's own horizon transform, shared with the Moon/planets), not a
 *  closed-form solver. `null` means it stays below (or above, for a
 *  circumpolar radiant at this latitude) the whole scanned day.
 *  ponytail: brute-force 5-minute scan, not moon.ts's closed-form
 *  moonTimes -- a hover readout needs the right minute, not the right
 *  second; upgrade to a bisection search if finer precision is ever asked
 *  for. */
export function radiantRiseTime(raHours: number, decDeg: number, latDeg: number, lonDeg: number, from: Date): Date | null {
  let prevAlt = raDecToAltAz(raHours, decDeg, from, latDeg, lonDeg).altitudeDeg;
  for (let i = 1; i * SCAN_STEP_MIN <= SCAN_HORIZON_MIN; i++) {
    const t = new Date(from.getTime() + i * SCAN_STEP_MIN * 60_000);
    const alt = raDecToAltAz(raHours, decDeg, t, latDeg, lonDeg).altitudeDeg;
    if (prevAlt <= 0 && alt > 0) return t;
    prevAlt = alt;
  }
  return null;
}

/** "Meteor shower active: Geminids, peak Dec 14, radiant rising at 22:14" --
 *  `riseTime` already carries the observer's instant; formatted with the
 *  browser's own locale/timezone, the same choice HoverReadout.tsx's other
 *  rows (wind, quake) make by not hand-rolling a timezone. */
export function meteorShowerLine(shower: MeteorShower, riseTime: Date | null, observerLon?: number): string {
  const peak = `${MONTH_NAMES[shower.peakMonth - 1]} ${shower.peakDay}`;
  const rising = riseTime ? `${observerLon === undefined ? riseTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (your time zone)" : localTime(riseTime, observerLon)} (next 24h, 5 min scan)` : "no horizon crossing in next 24h";
  return `Meteor shower active: ${shower.name}, peak around ${peak} (2026 baseline), radiant rising at ${rising} · IMO, approximate peak radiant`;
}
