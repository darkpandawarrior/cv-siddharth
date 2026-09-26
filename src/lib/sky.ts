// The real sky over Pune, computed rather than fetched — and the one part of
// it that IS fetched (weather). Pure math and data only: no React, no DOM,
// no fetch. P2's hooks call these on a timer; P8/skyBinding.ts (R3/R4) turn
// the result into light. Every consumer, including the world, reads the same
// `skyState()` — there is no second clock and no second weather anywhere in
// the site (design doc §2/§3).

import { NIGHT_SURVEY } from "./nightSurvey.ts";

export const PUNE = { lat: 18.5204, lon: 73.8567, tz: "Asia/Kolkata" } as const;

export type Daypart = "night" | "dawn" | "golden" | "day" | "dusk";

export interface SunPosition {
  altitudeDeg: number;
  azimuthDeg: number;
}

export interface SunTimes {
  sunrise: Date;
  solarNoon: Date;
  sunset: Date;
}

export interface SubsolarPoint {
  lat: number;
  lon: number;
}

// Widened by P1-00 (M7): three Open-Meteo upstreams instead of one, each
// independently nullable in the /api/weather response. precipMmH replaces
// precipMm — see applyWeather's comment on the unit conversion.
export interface Weather {
  at: string;
  intervalSec: number;
  tempC: number;
  code: number;
  cloudPct: number;
  precipMmH: number;
  windKmh: number;
  windFromDeg: number;
  humidityPct: number;
  visibilityM: number;
}

export interface Air {
  at: string;
  pm25: number;
  pm10: number;
  usAqi: number;
  euAqi: number;
  aod: number;
}

/** `next` is today's remaining forecast days ahead (2, from `forecast_days=3`
 *  including today); `range7d` is the [min, max] of the trailing 7 days. */
export interface River {
  date: string;
  dischargeM3s: number;
  next: number[];
  range7d: [number, number];
}

/** Trailing 30 days of daily rainfall, from `past_days=30`. */
export interface Season {
  days: 30;
  sumMm: number;
}

export interface Keyframe {
  u: number;
  sun: [number, number, number];
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  zenith: string;
  horizon: string;
  fogNear: number;
  fogFar: number;
  lamp: number;
  ghost: number;
}

export interface SkyState {
  now: Date;
  sun: SunPosition;
  times: SunTimes;
  daypart: Daypart;
  /** 0 at sunrise, 1 at sunset, <0 or >1 at night. */
  progress: number;
  k: Keyframe;
  weather: Weather | null;
  preview: boolean;
}

// ---------------------------------------------------------------------------
// NOAA solar position equations (public domain — the same ~15 KB of algebra
// every "compute the sun" library including suncalc carries; adopted as code
// rather than as a dependency, verified against a live Open-Meteo read within
// 1 minute on 2026-09-24, see scratchpad/sun-probe.mjs and design-brief §2).
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;
/** Standard atmospheric-refraction sunrise/sunset zenith, not 90°. */
const SUNRISE_ZENITH_DEG = 90.833;

function julianDay(d: Date): number {
  return d.getTime() / 86_400_000 + 2440587.5;
}

/** Shared core: everything both sunPosition and sunTimes need from the date
 *  alone, computed once so the two never drift against each other. */
function solarFrame(d: Date) {
  const jd = julianDay(d);
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * RAD);
  const eps =
    23 +
    (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 +
    0.00256 * Math.cos((125.04 - 1934.136 * T) * RAD);
  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD));
  return { L0, dec, eot };
}

export function sunPosition(d: Date, lat: number = PUNE.lat, lon: number = PUNE.lon): SunPosition {
  const { dec, eot } = solarFrame(d);
  const utcMin = (d.getTime() / 60_000) % 1440;
  const tst = (utcMin + eot + 4 * lon + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZ =
    Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(ha * RAD);
  const altitudeDeg = 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) / RAD;
  const azimuthDeg =
    (Math.atan2(
      Math.sin(ha * RAD),
      Math.cos(ha * RAD) * Math.sin(lat * RAD) - Math.tan(dec * RAD) * Math.cos(lat * RAD),
    ) /
      RAD +
      180) %
    360;
  return { altitudeDeg, azimuthDeg };
}

export function sunTimes(d: Date, lat: number = PUNE.lat, lon: number = PUNE.lon): SunTimes {
  const { dec, eot } = solarFrame(d);
  const noonUtcMin = 720 - 4 * lon - eot;
  const haRise =
    Math.acos(
      Math.cos(SUNRISE_ZENITH_DEG * RAD) / (Math.cos(lat * RAD) * Math.cos(dec * RAD)) -
        Math.tan(lat * RAD) * Math.tan(dec * RAD),
    ) / RAD;
  // Anchor every time to the same UTC midnight as `d` so a local-noon-minus
  // offset never rolls into the wrong calendar day near midnight IST.
  const dayStartMs = Math.floor(d.getTime() / 86_400_000) * 86_400_000;
  const at = (utcMin: number) => new Date(dayStartMs + utcMin * 60_000);
  return {
    sunrise: at(noonUtcMin - 4 * haRise),
    solarNoon: at(noonUtcMin),
    sunset: at(noonUtcMin + 4 * haRise),
  };
}

/**
 * The point on Earth directly under the sun right now — GLOBE's marker
 * (M41: moon itself stays out of this file, in src/lib/moon.ts). Solar noon
 * at longitude L happens when the true-solar-time formula sunPosition already
 * uses (`utcMin + eot + 4*lon`) equals 720 (12:00); solving that for `lon`
 * gives the subsolar meridian. Latitude is the sun's declination.
 */
export function subsolarPoint(d: Date): SubsolarPoint {
  const { dec, eot } = solarFrame(d);
  const utcMin = (d.getTime() / 60_000) % 1440;
  const lon = (((720 - utcMin - eot) / 4 + 180) % 360 + 360) % 360 - 180;
  return { lat: dec, lon };
}

/** Civil twilight at -6deg splits night from the below-horizon dawn/dusk
 *  glow; golden hour is the low-but-risen band up to +6deg (`morning`
 *  disambiguates the two below-horizon twilights, which look different —
 *  cooling toward night vs warming toward day — but are symmetric in
 *  altitude alone). */
export function daypartFor(altDeg: number, morning: boolean): Daypart {
  if (altDeg < -6) return "night";
  if (altDeg < 0) return morning ? "dawn" : "dusk";
  if (altDeg < 6) return "golden";
  return "day";
}

// ---------------------------------------------------------------------------
// Keyframes — his reference scene's technique (a table keyed by one scalar),
// fed by real sun altitude instead of a slider (design-brief §2, spec §5).
// The night row IS src/lib/nightSurvey.ts's NIGHT_SURVEY (M48): Sky.tsx and
// World.tsx import the same constants, so the three can never drift apart.
// ---------------------------------------------------------------------------

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Altitude (deg) each row is pinned at. `keyframeAt` lerps between
 *  neighbours and clamps outside the ends — it never extrapolates. */
const ALT_BREAKS = [-18, -6, 6, 45] as const;

export const KEYFRAMES: readonly Keyframe[] = [
  // night — imported from nightSurvey.ts (M48), not a local literal.
  NIGHT_SURVEY,
  // dawn/dusk — same cool hue family, value lifted toward the horizon glow.
  {
    u: 1 / 3,
    sun: hexToRgb01("#cfe9e4"),
    sunI: 2.0,
    hemiSky: "#b8cec7",
    hemiGround: "#333f34",
    hemiI: 1.4,
    zenith: "#142224",
    horizon: "#274240",
    fogNear: 20,
    fogFar: 150,
    lamp: 0.6,
    ghost: 0.6,
  },
  // golden — the one warm row: calibration amber, the brand's own tint.
  {
    u: 2 / 3,
    sun: hexToRgb01("#f2a13d"),
    sunI: 2.3,
    hemiSky: "#e7c9a0",
    hemiGround: "#3a2f22",
    hemiI: 1.6,
    zenith: "#274a49",
    horizon: "#f0b26a",
    fogNear: 24,
    fogFar: 180,
    lamp: 0.2,
    ghost: 0.3,
  },
  // day — cool family again, lifted to full value.
  {
    u: 1,
    sun: hexToRgb01("#eaf7f4"),
    sunI: 2.6,
    hemiSky: "#d7e8e2",
    hemiGround: "#4c5c4f",
    hemiI: 1.8,
    zenith: "#3f5a58",
    horizon: "#7fa9a2",
    fogNear: 28,
    fogFar: 220,
    lamp: 0,
    ghost: 0.1,
  },
] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb01(a);
  const [br, bg, bb] = hexToRgb01(b);
  const c = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${c(lerp(ar, br, t))}${c(lerp(ag, bg, t))}${c(lerp(ab, bb, t))}`;
}

function lerpKeyframe(a: Keyframe, b: Keyframe, t: number): Keyframe {
  return {
    u: lerp(a.u, b.u, t),
    sun: [lerp(a.sun[0], b.sun[0], t), lerp(a.sun[1], b.sun[1], t), lerp(a.sun[2], b.sun[2], t)],
    sunI: lerp(a.sunI, b.sunI, t),
    hemiSky: lerpHex(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpHex(a.hemiGround, b.hemiGround, t),
    hemiI: lerp(a.hemiI, b.hemiI, t),
    zenith: lerpHex(a.zenith, b.zenith, t),
    horizon: lerpHex(a.horizon, b.horizon, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    lamp: lerp(a.lamp, b.lamp, t),
    ghost: lerp(a.ghost, b.ghost, t),
  };
}

/** Lerps between the four KEYFRAMES rows by sun altitude. Clamped, never
 *  extrapolated: below the first breakpoint or above the last, the edge
 *  row comes back untouched (not run through lerp at t=0/1), which is what
 *  makes `keyframeAt(-30) deep-equals KEYFRAMES[0]` an exact guard rather
 *  than a floating-point-near-miss. */
export function keyframeAt(altDeg: number): Keyframe {
  if (altDeg <= ALT_BREAKS[0]) return KEYFRAMES[0];
  const last = ALT_BREAKS.length - 1;
  if (altDeg >= ALT_BREAKS[last]) return KEYFRAMES[last];
  for (let i = 0; i < last; i++) {
    const lo = ALT_BREAKS[i];
    const hi = ALT_BREAKS[i + 1];
    if (altDeg >= lo && altDeg <= hi) {
      const t = (altDeg - lo) / (hi - lo);
      return lerpKeyframe(KEYFRAMES[i], KEYFRAMES[i + 1], t);
    }
  }
  /* c8 ignore next -- unreachable: ALT_BREAKS is sorted and altDeg is bounded above */
  return KEYFRAMES[last];
}

function grey(hex: string): string {
  const [r, g, b] = hexToRgb01(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const c = Math.round(l * 255).toString(16).padStart(2, "0");
  return `#${c}${c}${c}`;
}

/**
 * Cloud dims the sun by up to 60% and greys the zenith toward a neutral sky;
 * rain (precipMm > 0) pulls fogFar in by 30%, the same figure the world's
 * reduced-motion fallback uses (design table §4.2). `null` weather is the
 * identity — same object back, not a copy, so callers can `===` it cheaply
 * and a fetch failure never nudges the sky's own math.
 */
export function applyWeather(k: Keyframe, w: Weather | null): Keyframe {
  if (!w) return k;
  const cloudT = Math.max(0, Math.min(100, w.cloudPct)) / 100;
  const sunI = k.sunI * (1 - 0.6 * cloudT);
  const zenith = lerpHex(k.zenith, grey(k.zenith), cloudT * 0.5);
  const raining = w.precipMmH > 0;
  const fogFar = raining ? k.fogFar * 0.7 : k.fogFar;
  return { ...k, sunI, zenith, fogFar };
}

/** The WMO 4677 subset Open-Meteo's `current.weather_code` actually emits. */
export const WMO_LABEL: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snow",
  73: "moderate snow",
  75: "heavy snow",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  83: "slight snow showers",
  85: "moderate snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm, slight hail",
  99: "thunderstorm, heavy hail",
};

export function skyState(now: Date, weather: Weather | null, preview = false): SkyState {
  const sun = sunPosition(now);
  const times = sunTimes(now);
  const morning = now.getTime() < times.solarNoon.getTime();
  const daypart = daypartFor(sun.altitudeDeg, morning);
  const span = times.sunset.getTime() - times.sunrise.getTime();
  const progress = span > 0 ? (now.getTime() - times.sunrise.getTime()) / span : 0;
  const k = applyWeather(keyframeAt(sun.altitudeDeg), weather);
  return { now, sun, times, daypart, progress, k, weather, preview };
}
