// ISS/station visible-pass detail (LANE W4): builds on src/lib/satellites.ts's
// own nextVisiblePass (which returns only a pass's start instant and peak
// elevation, open-data-spec.md §1/§3 A2) to add the fields a "when should I
// go outside and look up" row set needs — end time, duration, start/end
// compass direction — plus the small always-visible-pass claim
// ("sunlit + observer dark") that makes it a real naked-eye pass, not just
// an above-the-horizon one. No React, no DOM, no three.
import { isSunlitAt, lookAnglesFor, nextVisiblePass, type TleObject } from "../../../lib/satellites.ts";
import { sunPosition } from "../../../lib/sky.ts";
import { SANGAM, type GeoPoint } from "../../../lib/lookAngles.ts";

// Both thresholds restated from satellites.ts's own private
// isVisiblePassInstant (not imported: that function isn't exported, and a
// sibling lane's file this lane may not edit) — the same "a pass you could
// actually walk outside and see" floor/twilight bar that function itself
// documents.
const VISIBLE_MIN_EL_DEG = 10;
const OBSERVER_DARK_SUN_ALT_DEG = -6;
const SCAN_STEP_S = 15;
const MAX_END_SCAN_STEPS = 80; // 20 minutes at 15s/step — comfortably longer than any real ISS pass (a handful of minutes)

interface VisibleInstant {
  elDeg: number;
  azDeg: number;
}

function isVisibleInstant(object: TleObject, date: Date, observer: GeoPoint): VisibleInstant | null {
  const look = lookAnglesFor(object, date, observer);
  if (!look || look.elDeg < VISIBLE_MIN_EL_DEG) return null;
  if (!isSunlitAt(object, date)) return null;
  if (sunPosition(date, observer.lat, observer.lon).altitudeDeg > OBSERVER_DARK_SUN_ALT_DEG) return null;
  return { elDeg: look.elDeg, azDeg: look.azDeg };
}

const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** 16-point compass reading for a true azimuth (0=N, clockwise). */
export function azimuthToCompass(azDeg: number): string {
  const idx = Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[idx];
}

export interface VisiblePassDetail {
  start: Date;
  end: Date;
  maxElDeg: number;
  startAzDeg: number;
  endAzDeg: number;
  durationMin: number;
}

/**
 * The next pass an observer could actually walk outside and see — full
 * detail, not just the start instant `nextVisiblePass` alone returns.
 * `null` when nothing qualifies within its own 7-day scan window, or the
 * element is already too stale to trust (isFresh, checked inside
 * nextVisiblePass itself).
 */
export async function nextVisiblePassDetail(object: TleObject, from: Date, observer: GeoPoint = SANGAM): Promise<VisiblePassDetail | null> {
  const pass = await nextVisiblePass(object, from, observer);
  if (!pass) return null;

  const startLook = lookAnglesFor(object, pass.start, observer);
  const startAzDeg = startLook?.azDeg ?? 0;

  // Walk forward from the pass's own start (15s steps, not nextVisiblePass's
  // coarser 30s sweep) until visibility drops — a single pass runs a
  // handful of minutes, so this never approaches the idle-yield budget the
  // 7-day sweep above needs.
  let end = pass.start;
  let endAzDeg = startAzDeg;
  for (let step = 1; step <= MAX_END_SCAN_STEPS; step++) {
    const date = new Date(pass.start.getTime() + step * SCAN_STEP_S * 1000);
    const instant = isVisibleInstant(object, date, observer);
    if (!instant) break;
    end = date;
    endAzDeg = instant.azDeg;
  }

  return {
    start: pass.start,
    end,
    maxElDeg: pass.maxElDeg,
    startAzDeg,
    endAzDeg,
    durationMin: (end.getTime() - pass.start.getTime()) / 60_000,
  };
}

/** "19:42" — IST wall-clock, the same convention skyMoon.tsx's own istClock
 *  row uses (restated, not imported: that helper isn't exported and lives
 *  in a sibling lane's file). */
export function formatPuneClock(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

/** "4:12" — minutes:seconds, the inspector row's own duration format. */
export function formatDurationMin(durationMin: number): string {
  const totalSec = Math.round(durationMin * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "ISS visible tonight at 19:42 from Pune" — only when a qualifying pass
 *  starts within the next 24 hours; `null` otherwise (never fake a claim
 *  about a pass a week out). "Tonight" reads right for the overwhelming
 *  case a same-day evening pass is the next one, since a visible pass by
 *  definition requires the observer's own sky to already be dark
 *  (OBSERVER_DARK_SUN_ALT_DEG); a pass in the pre-dawn hours of a night
 *  that started "yesterday" by the calendar still reads naturally as
 *  "tonight" to someone checking before bed.
 *  ponytail: no "tomorrow morning" branch for a pass past local midnight —
 *  add one if this copy is ever read literally rather than as a status
 *  line. */
export function tonightLine(pass: VisiblePassDetail | null, now: Date, name: string): string | null {
  if (!pass) return null;
  const hoursUntil = (pass.start.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil < 0 || hoursUntil > 24) return null;
  return `${name} visible tonight at ${formatPuneClock(pass.start)} from Pune`;
}
