/**
 * Sangam's sky keyframes (live-data-spec.md §2.1; master-plan.md#M3/#M4/#M48;
 * living-ledger-spec.md §5.2-5.3). Pure — no three/R3F import, same
 * discipline as `valley.ts`/`skyFrame.ts`.
 *
 * `sangamKeyframeAt(altDeg)` lerps between four rows keyed by the real sun
 * altitude, in v2's OWN uniform vocabulary (`uSkyZen`/`uSkyUp`/
 * `uHorizonGlow`/`uHaze`/`uSunCol` — `skyChunk.glsl.ts`'s `SKY_UNIFORM_NAMES`,
 * `liveContract.ts`'s design-value shape) rather than v1's hex-keyed
 * `Keyframe` (`src/lib/sky.ts`): the golden row alone needs five distinct
 * colours, which v1's two-hex-plus-one-rgb shape cannot hold without losing
 * one, and "golden = the v2 §7 literals exactly" rules out any lossy
 * hex-round-trip of those five floats.
 *
 * The night row is Night Survey "byte for byte" (M48): every one of its five
 * colours is decoded from `src/lib/nightSurvey.ts`'s own hex/RGB constants,
 * never a restated literal, so `sangamKeyframeAt(-30)` traces back to the
 * exact same bytes `NIGHT_SURVEY` (v1's `Keyframe`) already carries.
 */
import {
  NIGHT_ZENITH_HEX,
  NIGHT_HORIZON_HEX,
  NIGHT_HEMI_SKY_HEX,
  NIGHT_HEMI_GROUND_HEX,
  NIGHT_SURVEY,
} from "../../../lib/nightSurvey.ts";

export type Vec3 = readonly [number, number, number];

export interface SangamSkyFrame {
  uSkyZen: Vec3;
  uSkyUp: Vec3;
  uHorizonGlow: Vec3;
  uHaze: Vec3;
  uSunCol: Vec3;
  /** Key DirectionalLight intensity before weather dims it (row 1). */
  sunI: number;
  /** Deck/window lamp ambient strength at this altitude (row 1's "the lamp
   *  strength ride[s] the same rows"). */
  lamp: number;
}

function hexToRgb01(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** ≤ -12°: Night Survey, byte for byte (M48) — every colour decoded from
 *  nightSurvey.ts's own constants, none restated. `uSkyUp`/`uHaze` reuse
 *  Night Survey's hemi sky/ground colours (v1's own "second and third
 *  ambient colour" slots), the only two Night Survey colours besides
 *  zenith/horizon/sun. */
export const SANGAM_NIGHT_ROW: SangamSkyFrame = {
  uSkyZen: hexToRgb01(NIGHT_ZENITH_HEX),
  uSkyUp: hexToRgb01(NIGHT_HEMI_SKY_HEX),
  uHorizonGlow: hexToRgb01(NIGHT_HORIZON_HEX),
  uHaze: hexToRgb01(NIGHT_HEMI_GROUND_HEX),
  uSunCol: NIGHT_SURVEY.sun,
  sunI: NIGHT_SURVEY.sunI,
  lamp: NIGHT_SURVEY.lamp,
};

/** -3°: the blend row. "The lane authors it; the owner judges it from the
 *  crawl frames" (live-data-spec §2.1) — a cool pre-dawn/dusk blue, this
 *  lane's own art-direction pick (same "no numeric literal given" doctrine
 *  Grade.ts's GOLDEN_LOOK comment already states for its own baseline). */
export const SANGAM_BLUE_ROW: SangamSkyFrame = {
  uSkyZen: [0.05, 0.09, 0.16],
  uSkyUp: [0.14, 0.2, 0.26],
  uHorizonGlow: [0.35, 0.3, 0.34],
  uHaze: [0.3, 0.28, 0.3],
  uSunCol: [0.55, 0.55, 0.62],
  sunI: 1.0,
  lamp: 0.5,
};

/** +8°: the v2 §7 literals, exactly as given — no hex detour, so these stay
 *  the precise decimals live-data-spec.md §2.1 states. */
export const SANGAM_GOLDEN_ROW: SangamSkyFrame = {
  uSkyZen: [0.1, 0.17, 0.29],
  uSkyUp: [0.3, 0.38, 0.44],
  uHorizonGlow: [1.0, 0.58, 0.26],
  uHaze: [0.86, 0.62, 0.38],
  uSunCol: [1.0, 0.74, 0.46],
  // Mirrors v1 KEYFRAMES' own golden sunI/lamp (src/lib/sky.ts) — no v2
  // literal is given for either, and reusing v1's already-tuned golden
  // values is a smaller leap than inventing new ones from nothing.
  sunI: 2.3,
  lamp: 0.2,
};

/** ≥ +30°: "starting values" (live-data-spec §2.1) — no `uHaze` literal is
 *  given for day; a light, near-neutral haze is this lane's own pick (the
 *  owner judges the rest from the frames, same as every other unlisted
 *  day-row number here). */
export const SANGAM_DAY_ROW: SangamSkyFrame = {
  uSkyZen: [0.22, 0.42, 0.66],
  uSkyUp: [0.55, 0.66, 0.76],
  uHorizonGlow: [0.92, 0.86, 0.74],
  uHaze: [0.9, 0.9, 0.9],
  uSunCol: [1.0, 0.96, 0.9],
  sunI: 2.6,
  lamp: 0,
};

/** Altitude (deg) each row is pinned at — night ≤ -12, blue @ -3, golden @
 *  +8, day ≥ +30 (live-data-spec §2.1), not v1's `sky.ts` breakpoints. */
const ALT_BREAKS = [-12, -3, 8, 30] as const;
const ROWS: readonly SangamSkyFrame[] = [SANGAM_NIGHT_ROW, SANGAM_BLUE_ROW, SANGAM_GOLDEN_ROW, SANGAM_DAY_ROW];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function lerpFrame(a: SangamSkyFrame, b: SangamSkyFrame, t: number): SangamSkyFrame {
  return {
    uSkyZen: lerpVec3(a.uSkyZen, b.uSkyZen, t),
    uSkyUp: lerpVec3(a.uSkyUp, b.uSkyUp, t),
    uHorizonGlow: lerpVec3(a.uHorizonGlow, b.uHorizonGlow, t),
    uHaze: lerpVec3(a.uHaze, b.uHaze, t),
    uSunCol: lerpVec3(a.uSunCol, b.uSunCol, t),
    sunI: lerp(a.sunI, b.sunI, t),
    lamp: lerp(a.lamp, b.lamp, t),
  };
}

/**
 * Lerps between the four rows by real sun altitude. Clamped, never
 * extrapolated: at or below the first breakpoint, or at or above the last,
 * the edge row comes back untouched (not run through lerp at t=0/1) — the
 * same discipline `src/lib/sky.ts`'s `keyframeAt` uses, and what makes
 * `sangamKeyframeAt(-12)` an exact `toEqual(SANGAM_NIGHT_ROW)`, not a
 * floating-point near miss.
 */
export function sangamKeyframeAt(altDeg: number): SangamSkyFrame {
  if (altDeg <= ALT_BREAKS[0]) return ROWS[0];
  const last = ALT_BREAKS.length - 1;
  if (altDeg >= ALT_BREAKS[last]) return ROWS[last];
  // An exact breakpoint hits its own row untouched — `lerp(a, b, 1)` is not
  // always bit-identical to `b` (float subtraction/addition order), and
  // "golden = the v2 §7 literals exactly" means `sangamKeyframeAt(8)` must
  // never run the golden row through a lerp at all.
  const exact = ALT_BREAKS.indexOf(altDeg as (typeof ALT_BREAKS)[number]);
  if (exact !== -1) return ROWS[exact];
  for (let i = 0; i < last; i++) {
    const lo = ALT_BREAKS[i];
    const hi = ALT_BREAKS[i + 1];
    if (altDeg >= lo && altDeg <= hi) {
      const t = (altDeg - lo) / (hi - lo);
      return lerpFrame(ROWS[i], ROWS[i + 1], t);
    }
  }
  /* c8 ignore next -- unreachable: ALT_BREAKS is sorted and altDeg is bounded above */
  return ROWS[last];
}
