// Pure SGP4 math over the CelesTrak TLE set (/api/tle, P2-02b) — no React, no
// DOM, no fetch, same discipline as sky.ts. Shared by /globe's orbits,
// /terminal's sky and the valley's NightSky/Satellites (M10): one module, one
// SGP4 implementation, imported through satellite.js@7.1.0 rather than
// hand-rolled (open-data-spec.md §10 OD1). useSatellites.ts is the only
// caller, and only through a dynamic import() (M10, G-budget: this file's
// chunk must stay lazy and under 13 KB gzip).
//
// Imports only the eight named exports open-data-spec.md §3 A2 names —
// nothing else survives esbuild's tree-shake of satellite.js's WASM re-export
// (measured 10.6 KB gzip; see that spec for the figure).
import {
  degreesToRadians,
  eciToEcf,
  ecfToLookAngles,
  gstime,
  propagate,
  shadowFraction,
  sunPos,
  twoline2satrec,
} from "satellite.js";
import { sunPosition } from "./sky.ts";
import { SANGAM, type GeoPoint } from "./lookAngles.ts";
import type { TleObject } from "../../api/_lib/tle-handler.ts";

export type { TleObject };

export type SatLookAngles = { azDeg: number; elDeg: number; rangeKm: number };

export type SatelliteVisibility =
  | "eye" // above the horizon, sunlit, Pune dark — visible by eye
  | "daylight" // above the horizon and sunlit, but Pune's own sky is too bright
  | "shadow" // above the horizon, in Earth's shadow
  | "belowHorizon";

/** A TLE line's epoch (columns 19-32: 2-digit year + day-of-year fraction),
 *  the 1957/2000 pivot per the TLE spec — the same parse as
 *  api/_lib/tle-handler.ts's tleEpoch, kept local rather than imported so
 *  this client chunk never pulls in that server module's own imports. */
function tleEpoch(l1: string): Date {
  const yy = Number(l1.slice(18, 20));
  const fullYear = yy < 57 ? 2000 + yy : 1900 + yy;
  const dayOfYear = Number(l1.slice(20, 32));
  return new Date(Date.UTC(fullYear, 0, 1) + (dayOfYear - 1) * 86_400_000);
}

const MAX_EPOCH_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** SGP4 error grows with element age (open-data-spec.md §3 A2: "a 7-day-old
 *  LEO element set can be tens of km off"), so anything older than 7 days
 *  from the passed-in clock is dropped rather than propagated. */
function isFresh(object: TleObject, clock: Date): boolean {
  return clock.getTime() - tleEpoch(object.l1).getTime() <= MAX_EPOCH_AGE_MS;
}

/** Unix-epoch millis -> Julian date, the same one-line formula sky.ts uses
 *  internally — `sunPos` wants a Julian date and `jday` isn't in the allowed
 *  import list above. */
function julianDay(d: Date): number {
  return d.getTime() / 86_400_000 + 2440587.5;
}

const RAD_TO_DEG = 180 / Math.PI;

function toObserverGeodetic(observer: GeoPoint) {
  return {
    latitude: degreesToRadians(observer.lat),
    longitude: degreesToRadians(observer.lon),
    height: observer.altM / 1000,
  };
}

// Parsing a TLE (`twoline2satrec`) is the one non-trivial cost per object;
// callers (the hook's 10 s sweep and per-frame redraw alike) pass the same
// TleObject repeatedly, so this caches by line content. Never grows unbounded
// in practice — the whole catalogue is 158 objects (open-data-spec.md §1).
const satrecCache = new Map<string, ReturnType<typeof twoline2satrec>>();
function toSatRec(object: TleObject) {
  const key = `${object.l1}|${object.l2}`;
  let rec = satrecCache.get(key);
  if (!rec) {
    rec = twoline2satrec(object.l1, object.l2);
    satrecCache.set(key, rec);
  }
  return rec;
}

/** True az/el/range from `observer` (default the Sangam) to `object` at
 *  `date`, or `null` when SGP4 can't produce a position (decayed element,
 *  propagation error). */
export function lookAnglesFor(object: TleObject, date: Date, observer: GeoPoint = SANGAM): SatLookAngles | null {
  const rec = toSatRec(object);
  const pv = propagate(rec, date);
  if (!pv || !pv.position || typeof pv.position === "boolean") return null;
  const gmst = gstime(date);
  const ecf = eciToEcf(pv.position, gmst);
  const look = ecfToLookAngles(toObserverGeodetic(observer), ecf);
  if (Number.isNaN(look.elevation) || Number.isNaN(look.azimuth)) return null;
  return { azDeg: look.azimuth * RAD_TO_DEG, elDeg: look.elevation * RAD_TO_DEG, rangeKm: look.rangeSat };
}

/** Fraction of the Sun's disc showing (0 = fully eclipsed by Earth), so
 *  `> 0` — used as `< 1` below, i.e. "not fully in shadow" — is "sunlit". */
function isSunlitAt(object: TleObject, date: Date): boolean | null {
  const rec = toSatRec(object);
  const pv = propagate(rec, date);
  if (!pv || !pv.position || typeof pv.position === "boolean") return null;
  const sun = sunPos(julianDay(date));
  return shadowFraction(sun.rsun, pv.position) < 1;
}

/** Count of `objects` above the local horizon at `date` (open-data-spec.md
 *  §1: "7 are above the horizon"). */
export function visibleNow(objects: TleObject[], date: Date, observer: GeoPoint = SANGAM): number {
  let count = 0;
  for (const object of objects) {
    if (!isFresh(object, date)) continue;
    const look = lookAnglesFor(object, date, observer);
    if (look && look.elDeg > 0) count++;
  }
  return count;
}

/** Of the objects above the horizon at `date`, how many are sunlit
 *  (open-data-spec.md §1: "3 of them sunlit"). */
export function sunlit(objects: TleObject[], date: Date, observer: GeoPoint = SANGAM): number {
  let count = 0;
  for (const object of objects) {
    if (!isFresh(object, date)) continue;
    const look = lookAnglesFor(object, date, observer);
    if (!look || look.elDeg <= 0) continue;
    if (isSunlitAt(object, date)) count++;
  }
  return count;
}

/** Full three-way read for one object at `date`: below the horizon, in
 *  shadow, sunlit-but-daylight, or sunlit-and-eye-visible — the state the
 *  Survey lens paints (open-data-spec.md §3 A2 "Classification"). */
export function classify(object: TleObject, date: Date, observer: GeoPoint = SANGAM): SatelliteVisibility {
  const look = lookAnglesFor(object, date, observer);
  if (!look || look.elDeg <= 0) return "belowHorizon";
  if (!isSunlitAt(object, date)) return "shadow";
  const puneSunAltDeg = sunPosition(date, observer.lat, observer.lon).altitudeDeg;
  return puneSunAltDeg <= -6 ? "eye" : "daylight";
}

/** How many samples per second-of-window the horizon sweep below checks —
 *  the cadence the 158-object x 31-sample measurement in open-data-spec.md
 *  §1 was taken at (600 s / 20 s + 1 = 31 samples). */
const RISING_SAMPLE_STEP_S = 20;

/**
 * Count of `objects` above the horizon at `date` OR at any 20 s-sampled
 * instant within the next `seconds` (open-data-spec.md §1: "13 rise within
 * 10 minutes") — despite the name this is "above within the window", so it
 * includes everything `visibleNow` already counts plus whatever newly rises;
 * that is the measured semantic (`scratchpad/od/satprobe.mjs`'s `upSoon`).
 */
export function risingWithin(objects: TleObject[], date: Date, seconds: number, observer: GeoPoint = SANGAM): number {
  let count = 0;
  for (const object of objects) {
    if (!isFresh(object, date)) continue;
    let up = false;
    for (let t = 0; t <= seconds && !up; t += RISING_SAMPLE_STEP_S) {
      const look = lookAnglesFor(object, new Date(date.getTime() + t * 1000), observer);
      if (look && look.elDeg > 0) up = true;
    }
    if (up) count++;
  }
  return count;
}

function isVisiblePassInstant(object: TleObject, date: Date, observer: GeoPoint): number | null {
  const look = lookAnglesFor(object, date, observer);
  if (!look || look.elDeg < 10) return null;
  if (!isSunlitAt(object, date)) return null;
  if (sunPosition(date, observer.lat, observer.lon).altitudeDeg > -6) return null;
  return look.elDeg;
}

const PASS_SCAN_STEP_S = 30;
const PASS_SCAN_HORIZON_DAYS = 7;
/** Idle-time budget: how many 30 s steps run before yielding back to the
 *  browser (P2-09's task list: "idle chunks of 2,000 steps"). 2,000 steps at
 *  30 s apart is 16.7 h of scan per chunk, well inside one idle deadline. */
const IDLE_CHUNK_STEPS = 2_000;

function idleYield(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (typeof ric === "function") ric(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export type VisiblePass = { start: Date; maxElDeg: number };

/**
 * The next pass where `object` is above 10°, sunlit and Pune's own sky is
 * dark (sun ≤ −6°) — "a pass you could actually walk outside and see"
 * (open-data-spec.md §1, §3 A2). Scans up to `horizonDays` from `from` at
 * 30 s steps, yielding to the browser's idle time every 2,000 steps so a
 * 7-day sweep never blocks a frame. `null` when nothing qualifies in the
 * window, or when `object`'s element is already too old to trust.
 */
export async function nextVisiblePass(
  object: TleObject,
  from: Date,
  observer: GeoPoint = SANGAM,
  horizonDays: number = PASS_SCAN_HORIZON_DAYS,
): Promise<VisiblePass | null> {
  if (!isFresh(object, from)) return null;
  const totalSteps = Math.floor((horizonDays * 86_400) / PASS_SCAN_STEP_S);
  let start: Date | null = null;
  let maxElDeg = -90;
  for (let step = 0; step <= totalSteps; step++) {
    if (step > 0 && step % IDLE_CHUNK_STEPS === 0) await idleYield();
    const date = new Date(from.getTime() + step * PASS_SCAN_STEP_S * 1000);
    const elDeg = isVisiblePassInstant(object, date, observer);
    if (elDeg !== null) {
      if (!start) start = date;
      if (elDeg > maxElDeg) maxElDeg = elDeg;
    } else if (start) {
      return { start, maxElDeg };
    }
  }
  return start ? { start, maxElDeg } : null;
}
