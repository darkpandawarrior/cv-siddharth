/**
 * The Sangam's transfer functions (live-data-spec.md §2.2, binding table
 * rows 1-11 and 16-23; §2.3 tier rules; §2.0/master-plan.md#M4/#M19/#M20/#M21
 * amendments). Pure — no three/R3F import, same discipline as `sangamSky.ts`
 * and `valley.ts`. Every function is deliberately a small, independently
 * testable transfer function rather than one aggregate: `liveBinding.test.ts`
 * pins each one at its fixture value, below its lower clamp, above its upper
 * clamp, and at `null`.
 *
 * Rows 12-15 (moon, stars, ISS, festival) are P3-02b's (`src/world/v2/live/
 * nightSky.ts`). Rows 24-25 (upstream stars, APK downloads) are labels only,
 * already rendered elsewhere — not a transfer function.
 */
import { worldDir, DOWNSTREAM_BEARING_DEG } from "../skyFrame.ts";
import { sangamKeyframeAt, type SangamSkyFrame } from "./sangamSky.ts";
import type { River } from "../../../lib/sky.ts";
import type { DeviceTier } from "../../deviceTier.ts";
import type { SignalsResponse, CiState } from "../../../../api/_lib/signals-handler.ts";
import { normalMmForDate } from "../../../lib/skyText.ts";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export function sat(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** GLSL's own `smoothstep`, which handles `edge0 > edge1` (an intentionally
 *  reversed/inverting ramp, e.g. row 22's `ss(-2,-10,alpha)`) the same way a
 *  shader does: `t` is just the clamped, possibly-negative-slope fraction. */
export function ss(edge0: number, edge1: number, x: number): number {
  const t = sat((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ---------------------------------------------------------------------------
// Row 1 — Sun altitude/bearing -> uSunDir, sky rows, key light, GradeEffect
// ---------------------------------------------------------------------------

export interface SunBinding {
  uSunDir: readonly [number, number, number];
  sky: SangamSkyFrame;
  /** Key DirectionalLight intensity, cloud-dimmed (reuses P1 `applyWeather`'s
   *  own `sunI * (1 - 0.6 * cloudT)` formula — the two Keyframe shapes
   *  differ, so the one line is restated here rather than the function
   *  imported). */
  sunI: number;
}

/** Never fails (pure math) — `cloudPct: null` behaves as a clear sky (the
 *  honest "no live correction yet" fallback, same as row 2/3's `c = 0`). */
export function sunBinding(altDeg: number, bearingDeg: number, cloudPct: number | null): SunBinding {
  const sky = sangamKeyframeAt(altDeg);
  const c = cloudPct == null ? 0 : sat(cloudPct / 100);
  return { uSunDir: worldDir(bearingDeg, altDeg), sky, sunI: sky.sunI * (1 - 0.6 * c) };
}

/** The world's own downstream bearing (M4) — wind's "from" direction (row 6)
 *  and CommitDiyas' basin fallback both read the SAME compass this exports,
 *  never a second copy of `mutha.json`'s chord. */
export { DOWNSTREAM_BEARING_DEG };

// ---------------------------------------------------------------------------
// Row 2 — Volumetric shafts
// ---------------------------------------------------------------------------

/** `weather null -> c = 0`; `hazeN` null -> 0.5 (row 9's own design fallback,
 *  since haze feeds this row too). */
export function volStrength(altDeg: number, cloudPct: number | null, hazeN: number | null): number {
  const c = cloudPct == null ? 0 : sat(cloudPct / 100);
  const h = hazeN == null ? 0.5 : hazeN;
  return sat(ss(-2, 4, altDeg) * (1 - 0.85 * c) * (1 - 0.5 * h));
}

// ---------------------------------------------------------------------------
// Row 3 — cloud_cover -> uCloudCover (the mask itself is shader-side, fbm)
// ---------------------------------------------------------------------------

/** `null -> 0` — the ledger's Weather row says "unavailable, drawn clear",
 *  and a clear sky is exactly `uCloudCover = 0`. */
export function cloudCoverUniform(cloudPct: number | null): number {
  if (cloudPct == null) return 0;
  return sat(cloudPct / 100);
}

// ---------------------------------------------------------------------------
// Row 4 — weather_code -> uCloudShade multiplier (no lightning flash)
// ---------------------------------------------------------------------------

/** WMO ≥ 61 (rain) or ≥ 95 (thunder) dims the cirrus shade ×0.7; `null` (or
 *  any other code) is unchanged (×1). */
export function cloudShadeMultiplier(weatherCode: number | null): number {
  if (weatherCode == null) return 1;
  return weatherCode >= 61 ? 0.7 : 1;
}

// ---------------------------------------------------------------------------
// Row 5 — precipMmH -> rain streaks, water rings, marigold-fall suppression
// ---------------------------------------------------------------------------

const RAIN_TIER_MAX: Record<DeviceTier, number> = { 1: 1200, 2: 400, 3: 0 };
const DROPS_PER_MM = 400;

export interface RainBinding {
  count: number;
  ringsStrength: number;
  /** Multiplies marigold-fall rate; 1 = unsuppressed. */
  petalFallFactor: number;
}

/** `null -> no rain` (count 0, rings 0, petals unsuppressed) — the same
 *  "never guessed, renders dry" doctrine `streams.ts`'s `rain6h.failure`
 *  states, and the same drop-count formula reality-core's v1 `Rain.tsx`
 *  already ships (`min(tierMax, round(mmh*400))`). */
export function rainBinding(mmh: number | null, tier: DeviceTier): RainBinding {
  if (mmh == null || mmh <= 0) return { count: 0, ringsStrength: 0, petalFallFactor: 1 };
  const count = Math.min(RAIN_TIER_MAX[tier], Math.round(mmh * DROPS_PER_MM));
  return { count, ringsStrength: sat(mmh / 8), petalFallFactor: 1 - sat(mmh) };
}

// ---------------------------------------------------------------------------
// Row 6 — wind_speed_10m/wind_direction_10m -> uWind (M19: the only mapping)
// ---------------------------------------------------------------------------

export interface WindBinding {
  /** [x, z] — a unit-ish direction the wind blows TOWARD, on the true
   *  compass (M19: direction uses `skyFrame.worldDir`, not open-data's
   *  dropped `wind.ts`). */
  dirXZ: readonly [number, number];
  strength: number;
  petalDriftMps: number;
  kiteLeanDeg: number;
  rippleScroll: number;
}

/** `null -> strength 0.05 (near calm), dir = downstream` (the world's own
 *  +Z bearing, M4) — never a guessed direction. */
export function windBinding(kmh: number | null, fromDeg: number | null): WindBinding {
  const ws = kmh == null ? 0 : sat(kmh / 35);
  const strength = 0.05 + 0.95 * ws;
  const toDeg = fromDeg == null ? DOWNSTREAM_BEARING_DEG : fromDeg + 180;
  const [x, , z] = worldDir(toDeg, 0);
  return {
    dirXZ: [x, z],
    strength,
    petalDriftMps: 0.3 + 3 * ws,
    kiteLeanDeg: 10 + 25 * ws,
    rippleScroll: 0.02 + 0.1 * ws,
  };
}

// ---------------------------------------------------------------------------
// Row 7 — visibility -> uFogK
// ---------------------------------------------------------------------------

const FOG_K_BASE = 0.018;

/** `null -> 0.018` (v2's own design value). */
export function fogK(visibilityM: number | null): number {
  if (visibilityM == null) return FOG_K_BASE;
  return FOG_K_BASE * clamp(Math.sqrt(20_000 / visibilityM), 1, 2.5);
}

// ---------------------------------------------------------------------------
// Row 8 — relative_humidity_2m -> uMist
// ---------------------------------------------------------------------------

/** `null -> 0.35`. */
export function mist(rhPct: number | null): number {
  if (rhPct == null) return 0.35;
  return 0.35 + 0.65 * ss(60, 95, rhPct);
}

// ---------------------------------------------------------------------------
// Row 9 — pm2_5 -> uHaze intensity, GradeEffect sun veil, star limit
// ---------------------------------------------------------------------------

export interface HazeBinding {
  hazeN: number;
  /** Multiplies the sky dome's own `uHaze` colour term. */
  hazeMul: number;
  /** Star-visibility magnitude penalty (used by P3-02b's star limit). */
  starDeltaM: number;
}

/** `null -> hazeN 0.5` (design haze) — the ledger's Air row says
 *  "unavailable" for the reading itself, but the sky still needs an honest,
 *  non-guessed haze to render. */
export function hazeBinding(pm25: number | null): HazeBinding {
  const hazeN = pm25 == null ? 0.5 : clamp(pm25 / 60, 0.15, 1);
  return { hazeN, hazeMul: 0.6 + 0.8 * hazeN, starDeltaM: 1.5 * hazeN };
}

// ---------------------------------------------------------------------------
// Row 10 — river_discharge today (IST) -> uFlowSpeed, uFoam
// ---------------------------------------------------------------------------

const IST_OFFSET_MIN = 5.5 * 60;

/** Minutes since IST midnight for `now` (mirrors `WorldV2.tsx`'s own
 *  `previewAtToMinutes` — the one place this codebase already converts a
 *  UTC instant to an IST time-of-day). */
function istMinutesOfDay(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MIN) % 1440;
}

/**
 * The Flood API (`weather-handler.ts`'s `FLOOD_URL`) carries no
 * `timezone=Asia/Kolkata` — unlike the forecast/air calls — so its daily
 * values are UTC-anchored. IST is UTC+5:30, so IST's calendar day starts at
 * 05:30 into the SAME UTC day; before that (IST 00:00-05:30), the UTC day
 * that has actually started is still "yesterday" by IST's clock, and
 * `river.dischargeM3s` (the flood API's own forecast-day-0) describes THAT
 * UTC day, one short of "today (IST)". `river.next[0]` (forecast-day-1)
 * is the value that lines up with IST's already-current calendar day.
 * `null -> null` (row 10's own fallback: 0.35 m/s / foam 0, applied by the
 * callers below, not here — this function's contract is "the reading",
 * not "the fallback speed").
 */
export function riverDischargeIst(now: Date, river: River | null): number | null {
  if (!river) return null;
  if (istMinutesOfDay(now) < IST_OFFSET_MIN) return river.next[0] ?? river.dischargeM3s;
  return river.dischargeM3s;
}

export interface RiverBinding {
  flowSpeed: number;
  foam: number;
}

/** `null -> 0.35 m/s, foam 0`. Width is never bound (live-data-spec §6). */
export function riverBinding(dischargeM3s: number | null): RiverBinding {
  if (dischargeM3s == null) return { flowSpeed: 0.35, foam: 0 };
  const flowSpeed = clamp(0.35 + 0.25 * Math.log2(dischargeM3s / 15), 0.2, 1.6);
  const foam = sat(Math.log2(dischargeM3s / 20) / 3);
  return { flowSpeed, foam };
}

// ---------------------------------------------------------------------------
// Row 11 — season (trailing 30 d precip vs Pune normals) -> uGrassWet
// ---------------------------------------------------------------------------

/** The trailing-30-day sum of `skyText.ts`'s own per-day normal (reused,
 *  not re-derived — the same 2015-2025 calendar `normalMmForDate` already
 *  indexes). `days` defaults to `Season.days` (30, `src/lib/sky.ts`). */
export function trailing30NormalMm(date: Date, days = 30): number {
  let sum = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(date.getTime() - i * 86_400_000);
    sum += normalMmForDate(d);
  }
  return sum;
}

/** `sumMm`/`normalMm` are the caller's own trailing-30-day totals (this
 *  function is deliberately not the one that walks `puneNormals.ts` — that
 *  belongs to whichever writer builds the trailing window, so this stays a
 *  one-line, exhaustively-clamp-testable transfer function). `null -> 0`
 *  (v2's own monsoon-end look). */
export function seasonWet(sumMm: number | null, normalMm: number): number {
  if (sumMm == null || normalMm <= 0) return 0;
  const rho = sumMm / normalMm;
  return sat((rho - 0.5) / 1.5);
}

// ---------------------------------------------------------------------------
// Row 16 — lichess online/playing -> the chess-ridge lamp
// ---------------------------------------------------------------------------

export type ChessLampState = number | "unmeasured";

/** `null -> "unmeasured"` (the ledger says unavailable, never "not
 *  playing" — streams.ts's own `chess-presence.failure`). */
export function chessLampBinding(lichess: SignalsResponse["lichess"]): ChessLampState {
  if (!lichess) return "unmeasured";
  if (lichess.playing) return 1;
  if (lichess.online) return 0.3;
  return 0;
}

// ---------------------------------------------------------------------------
// Row 17 — dev.to reactions+comments per lesson -> lesson-kite altitude
// ---------------------------------------------------------------------------

export const KITE_FLOOR_M = 18;
const KITE_CEIL_M = 60;

export interface KiteAltitude {
  altitudeM: number;
  /** True when there is a live-measured reading; false means the grey
   *  tether ("not on dev.to" / "unavailable"). */
  measured: boolean;
}

/**
 * Altitude only (M21) — never count or position. `devto === null` (the
 * whole signal down) or no matching URL both render the floor with a grey
 * tether; the two are deliberately the same branch here (both are "no live
 * reading for this lesson right now").
 */
export function kiteAltitudeBinding(devto: SignalsResponse["devto"], lessonDevtoUrl: string | null | undefined): KiteAltitude {
  const article = devto && lessonDevtoUrl ? devto.find((a) => a.url === lessonDevtoUrl) : undefined;
  if (!article) return { altitudeM: KITE_FLOOR_M, measured: false };
  const e = article.reactions + article.comments;
  const altitudeM = clamp(KITE_FLOOR_M + 6 * Math.log2(1 + e), KITE_FLOOR_M, KITE_CEIL_M);
  return { altitudeM, measured: true };
}

// ---------------------------------------------------------------------------
// Rows 18/19 — family/site CI -> stream collars, keystone deck lamps
// ---------------------------------------------------------------------------

export type CollarState = "pass" | "fail" | "unmeasured";

/** `ci === null` (the whole signal down), no entry, or `state === "none"`
 *  all render the base grey "unmeasured" material (row 18's own fallback —
 *  never amber, per world-v2 rule 3). Candidai/kmp-app-template are always
 *  `"unmeasured"` by construction (`ci` never carries those slugs — R6's
 *  `CiRepoSlug`). */
export function collarState(slug: string, ci: SignalsResponse["ci"]): CollarState {
  if (!ci) return "unmeasured";
  const entry = (ci as Record<string, { state: CiState } | undefined>)[slug];
  if (!entry || entry.state === "none") return "unmeasured";
  return entry.state;
}

/** Both `kmp-toolkit` AND `kmp-build-logic` must pass (M2) — any other
 *  combination, including either missing, is unlit. */
export function keystoneLampLit(ci: SignalsResponse["ci"]): boolean {
  if (!ci) return false;
  return ci["kmp-toolkit"]?.state === "pass" && ci["kmp-build-logic"]?.state === "pass";
}

// ---------------------------------------------------------------------------
// Row 21 — pushes in 24h -> commit-diya count (position is CommitDiyas.tsx's)
// ---------------------------------------------------------------------------

/** The repo-name half of a GitHub Events `"owner/Repo"` string, lower-cased
 *  to match `valley.ts` tributary ids ("doori", "paymentslab-kmp", ...). */
export function repoSlugFromFullName(fullName: string): string {
  const idx = fullName.indexOf("/");
  return (idx === -1 ? fullName : fullName.slice(idx + 1)).toLowerCase();
}

// ---------------------------------------------------------------------------
// Row 22 — lantern emissive (night factor)
// ---------------------------------------------------------------------------

/** `ss(-2,-10,alpha)` — an intentionally reversed ramp (row 22's own
 *  notation): 0 above -2°, 1 at/below -10°. */
export function lanternEmissiveFactor(altDeg: number): number {
  return ss(-2, -10, altDeg);
}
