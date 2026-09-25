// The real Moon over Pune, computed rather than fetched (Meeus, Astronomical
// Algorithms ch. 47, truncated to its dominant periodic terms — the same
// truncation every lightweight Moon library, suncalc included, carries;
// adopted as code rather than as a dependency, M41/M12/G6). USNO is used
// only as a recorded test oracle in moon.test.ts, never called at runtime.
// Pure math only: no React, no DOM, no fetch.
import { PUNE } from "./sky.ts";
import { raDecToAltAz } from "./stars.ts";

const RAD = Math.PI / 180;

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function julianCenturiesJ2000(d: Date): number {
  const jd = d.getTime() / 86_400_000 + 2440587.5;
  return (jd - 2451545) / 36525;
}

// Table 47.A (longitude), top terms by amplitude: [D, M, M', F, coeffL in
// 1e-6 deg]. M-bearing terms are scaled by the Earth-orbit eccentricity
// correction E (or E^2) below. Distance (Table 47.A's r column) is dropped:
// nothing here needs the Moon's distance, only its direction.
const L_TERMS: readonly [number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774],
  [2, 0, -1, 0, 1274027],
  [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116],
  [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793],
  [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758],
  [0, 1, -1, 0, -40923],
  [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383],
  [2, 0, 0, -2, 15327],
  [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980],
];

// Table 47.B (ecliptic latitude), top terms: [D, M, M', F, coeffB in 1e-6 deg].
const B_TERMS: readonly [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
];

interface EclipticPos {
  lonDeg: number;
  latDeg: number;
}

function eccentricityFactor(mCoeff: number, E: number): number {
  const n = Math.abs(mCoeff);
  return n === 0 ? 1 : n === 1 ? E : E * E;
}

/** Geocentric ecliptic longitude/latitude of the Moon at `d`. */
function moonEcliptic(T: number): EclipticPos {
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T ** 2 + T ** 3 / 538841 - T ** 4 / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T ** 2 + T ** 3 / 545868 - T ** 4 / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T ** 2 + T ** 3 / 69699 - T ** 4 / 14712000);
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T ** 2 - T ** 3 / 3526000 + T ** 4 / 863310000);
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2;

  let sumL = 0;
  for (const [d_, m_, mp_, f_, cl] of L_TERMS) {
    const arg = (d_ * D + m_ * M + mp_ * Mp + f_ * F) * RAD;
    sumL += cl * eccentricityFactor(m_, E) * Math.sin(arg);
  }
  let sumB = 0;
  for (const [d_, m_, mp_, f_, cb] of B_TERMS) {
    const arg = (d_ * D + m_ * M + mp_ * Mp + f_ * F) * RAD;
    sumB += cb * eccentricityFactor(m_, E) * Math.sin(arg);
  }

  return { lonDeg: norm360(Lp + sumL / 1_000_000), latDeg: sumB / 1_000_000 };
}

/** Low-precision apparent solar ecliptic longitude (Meeus ch. 25, same
 *  truncation sky.ts's solarFrame uses for the sun's own light — kept as a
 *  private few-line copy here rather than an import, because sky.ts does not
 *  export it and this file's only use for it is the Moon's phase angle, not
 *  anything that draws the sun (M41: sky.ts stays the one place that does). */
function sunEclipticLongitude(T: number): number {
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T ** 2) * RAD;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T ** 2);
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T ** 2) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  return norm360(L0 + C);
}

function eclipticToEquatorial(lonDeg: number, latDeg: number): { raHours: number; decDeg: number } {
  const eps = 23.4392911 * RAD; // mean obliquity of the ecliptic, J2000-epoch
  const lon = lonDeg * RAD;
  const lat = latDeg * RAD;
  const raRad = Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon));
  const decRad = Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon));
  return { raHours: norm360(raRad / RAD) / 15, decDeg: decRad / RAD };
}

export interface MoonPhase {
  /** Illuminated fraction, 0 (new) to 1 (full). */
  fraction: number;
  waxing: boolean;
  /** 0 = new, 90 = first quarter, 180 = full, 270 = last quarter. */
  phaseAngleDeg: number;
}

/** Illuminated fraction from elongation psi (Sun-Earth-Moon angle): since the
 *  Sun sits ~390x farther away than the Moon, its parallax from geocentric is
 *  negligible and phase angle i = 180 - psi, so fraction k = (1-cos psi)/2 —
 *  the same simplification suncalc's getMoonIllumination uses. */
export function moonPhase(d: Date): MoonPhase {
  const T = julianCenturiesJ2000(d);
  const moon = moonEcliptic(T);
  const sunLon = sunEclipticLongitude(T);
  const cosPsi = Math.cos(moon.latDeg * RAD) * Math.cos((moon.lonDeg - sunLon) * RAD);
  const fraction = (1 - cosPsi) / 2;
  const phaseAngleDeg = norm360(moon.lonDeg - sunLon);
  return { fraction, waxing: phaseAngleDeg < 180, phaseAngleDeg };
}

export interface MoonPosition {
  altitudeDeg: number;
  azimuthDeg: number;
  raHours: number;
  decDeg: number;
}

export function moonPosition(d: Date, lat: number = PUNE.lat, lon: number = PUNE.lon): MoonPosition {
  const T = julianCenturiesJ2000(d);
  const moon = moonEcliptic(T);
  const { raHours, decDeg } = eclipticToEquatorial(moon.lonDeg, moon.latDeg);
  const { altitudeDeg, azimuthDeg } = raDecToAltAz(raHours, decDeg, d, lat, lon);
  return { altitudeDeg, azimuthDeg, raHours, decDeg };
}

export interface MoonTimes {
  rise: Date | null;
  set: Date | null;
}

/** Coarse sign-crossing search (10-minute steps, linearly interpolated) over
 *  the IST calendar day containing `d`. Good to a couple of minutes, which is
 *  all a "rises HH:MM" ledger row (skyText.ts) needs — a bisection refinement
 *  would cost more code than the display ever uses.
 *  ponytail: fixed 10-min step, tighten if a caller ever needs sub-minute. */
export function moonTimes(d: Date, lat: number = PUNE.lat, lon: number = PUNE.lon): MoonTimes {
  const IST_OFFSET_MS = 5.5 * 3600_000;
  const istMidnightUtcMs = Math.floor((d.getTime() + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS;
  const STEP_MS = 10 * 60_000;
  const steps = (24 * 3600_000) / STEP_MS;

  let rise: Date | null = null;
  let set: Date | null = null;
  let prevAlt = moonPosition(new Date(istMidnightUtcMs), lat, lon).altitudeDeg;
  for (let i = 1; i <= steps; i++) {
    const t = istMidnightUtcMs + i * STEP_MS;
    const alt = moonPosition(new Date(t), lat, lon).altitudeDeg;
    if (prevAlt < 0 && alt >= 0 && !rise) {
      const frac = -prevAlt / (alt - prevAlt);
      rise = new Date(t - STEP_MS + frac * STEP_MS);
    }
    if (prevAlt >= 0 && alt < 0 && !set) {
      const frac = prevAlt / (prevAlt - alt);
      set = new Date(t - STEP_MS + frac * STEP_MS);
    }
    prevAlt = alt;
  }
  return { rise, set };
}
