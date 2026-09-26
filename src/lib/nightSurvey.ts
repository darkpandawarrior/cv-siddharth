// The Night Survey's own night-row constants. sky.ts's KEYFRAMES[0], Sky.tsx's
// dome shader and World.tsx's two scene lights all used to carry these same
// numbers as three separate literals (M48, critic fix 7); this file is now
// the one place they live, so a value changed once can never drift out of
// sync between the three. Mechanical move only: nothing here changes what
// renders, only where the numbers live.
import type { Keyframe } from "./sky.ts";

export const NIGHT_ZENITH_HEX = "#0a0f10";
/** Sky.tsx re-exports this as HORIZON_HEX — World.tsx's fog matches it so
 *  distant terrain fades toward the same colour the dome itself ends on. */
export const NIGHT_HORIZON_HEX = "#16292b";
export const NIGHT_SUN_HEX = "#bfe8e0";
export const NIGHT_SUN_INTENSITY = 1.8;
export const NIGHT_HEMI_SKY_HEX = "#9dbbb3";
export const NIGHT_HEMI_GROUND_HEX = "#26362b";
export const NIGHT_HEMI_INTENSITY = 1.2;
/** Night Survey's own fog range, desktop tier (World.tsx §4 comment). */
const NIGHT_FOG: readonly [number, number] = [18, 130];

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The night Keyframe row every consumer reads. sky.ts's `KEYFRAMES[0]` IS
 *  this object, not a copy, so `keyframeAt(-30)` deep-equals it by
 *  construction rather than by two lists staying in sync by hand. */
export const NIGHT_SURVEY: Keyframe = {
  u: 0,
  sun: hexToRgb01(NIGHT_SUN_HEX),
  sunI: NIGHT_SUN_INTENSITY,
  hemiSky: NIGHT_HEMI_SKY_HEX,
  hemiGround: NIGHT_HEMI_GROUND_HEX,
  hemiI: NIGHT_HEMI_INTENSITY,
  zenith: NIGHT_ZENITH_HEX,
  horizon: NIGHT_HORIZON_HEX,
  fogNear: NIGHT_FOG[0],
  fogFar: NIGHT_FOG[1],
  lamp: 1,
  ghost: 1,
};
