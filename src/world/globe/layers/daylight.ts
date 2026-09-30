// LANE C4 ("Living daylight"): pure band maths and the DaylightLayer/
// DaylightReadout shader + data plumbing. Everything here is computed from
// the same subsolar point layers/sun.ts already draws the terminator from
// (lib/sky.ts's subsolarPoint) -- there is no second sun model anywhere in
// this file, so the golden-hour band, the waking band and the readout can
// never drift against the terminator a visitor already sees.
import * as THREE from "three";
import { subsolarPoint } from "../../../lib/sky.ts";
import { latLonToXyz } from "../geoMath.ts";
import { DAYLIGHT_CITIES, type DaylightCity } from "./daylightCities.ts";

const RAD = Math.PI / 180;

/** Sun altitude in degrees at (lat, lon) at instant `now`: the dot product
 *  of the point's unit-sphere position and the subsolar unit vector is
 *  cos(angular separation from the subsolar point), which is sin(altitude)
 *  (altitude = 90 - angular separation). Same identity sun.ts's ATMO_FRAG
 *  spends a comment deriving for its `cosSun` term -- restated here in
 *  testable TS rather than re-derived, since this file needs the actual
 *  degree value, not just the cosine. */
export function altitudeDeg(now: Date, lat: number, lon: number): number {
  const sub = subsolarPoint(now);
  const p = latLonToXyz(lat, lon);
  const s = latLonToXyz(sub.lat, sub.lon);
  const cosSun = Math.max(-1, Math.min(1, p.x * s.x + p.y * s.y + p.z * s.z));
  return Math.asin(cosSun) / RAD;
}

/** True solar time in minutes since local midnight (0..1440) at longitude
 *  `lon`, derived from the subsolar longitude alone: local solar noon
 *  (720min) happens exactly where lon === subLon (that IS how subsolarPoint
 *  is defined -- lib/sky.ts inverts this same relationship to find it), and
 *  every other longitude's true solar time is 4 minutes earlier per degree
 *  west, later per degree east (a full 360deg sweep is a 1440min day). This
 *  reuses subsolarPoint's own equation-of-time correction implicitly
 *  (through subLon) rather than re-deriving eot, so it can't disagree with
 *  it the way exploreMath.ts's longitude-only "solar (approx.)" clock can. */
export function localSolarMinutes(now: Date, lon: number): number {
  const subLon = subsolarPoint(now).lon;
  const minutes = 720 + 4 * (lon - subLon);
  return ((minutes % 1440) + 1440) % 1440;
}

/** (a) Golden-hour altitude band: -4deg to +6deg (civil-twilight-adjacent
 *  low sun, the plan's own definition). A 2deg feather on each side gives
 *  the shader/JS-mirror a soft edge instead of a hard ring. */
export const GOLDEN_MIN_ALT = -4;
export const GOLDEN_MAX_ALT = 6;
const GOLDEN_FEATHER = 2;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 0 outside the band, 1 across the [-4, 6] plateau, feathered in between.
 *  Mirrors DAYLIGHT_FRAG's `golden` term exactly (same smoothstep pair on
 *  cosSun = sin(altitude)), kept in degrees here because a fragment shader
 *  cannot be unit-tested directly. */
export function goldenBandWeight(altDeg: number): number {
  const lo = smoothstep(GOLDEN_MIN_ALT - GOLDEN_FEATHER, GOLDEN_MIN_ALT, altDeg);
  const hi = 1 - smoothstep(GOLDEN_MAX_ALT, GOLDEN_MAX_ALT + GOLDEN_FEATHER, altDeg);
  return Math.max(0, Math.min(lo, hi));
}

/** (b) Waking band: local solar time 06:00-09:00 (360-540min). */
export const WAKE_START_MIN = 360;
export const WAKE_END_MIN = 540;
export const WAKE_HALF_WIDTH_DEG = ((WAKE_END_MIN - WAKE_START_MIN) / 4) / 2; // 22.5deg
const WAKE_CENTER_OFFSET_MIN = (WAKE_START_MIN + WAKE_END_MIN) / 2 - 720; // -270min from noon

export function isWakingBand(minutes: number): boolean {
  return minutes >= WAKE_START_MIN && minutes < WAKE_END_MIN;
}

/** Longitude of the waking band's centre (07:30 local solar time), wrapped
 *  to (-180, 180]. West of the subsolar point, same side the morning
 *  terminator trails on -- DaylightLayer.tsx's uWakeCenter uniform and
 *  DaylightReadout's "rising" filter both key off this same value. */
export function wakeBandCenterLonDeg(now: Date): number {
  const subLon = subsolarPoint(now).lon;
  const lon = subLon + WAKE_CENTER_OFFSET_MIN / 4;
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

/** One `{ uSun, uWakeCenter }` uniforms object, mutated in place per frame
 *  update -- same "construct once, write into .value" discipline as sun.ts's
 *  useSunUniforms (shaderUniforms.test.ts's whole reason for existing: a
 *  replaced object never reaches the GPU once bound at mount). */
export function daylightUniforms() {
  return { uSun: { value: new THREE.Vector3() }, uWakeCenter: { value: 0 } };
}

export function updateDaylightUniforms(now: Date, uniforms: ReturnType<typeof daylightUniforms>) {
  const sub = subsolarPoint(now);
  const p = latLonToXyz(sub.lat, sub.lon);
  uniforms.uSun.value.set(p.x, p.y, p.z);
  uniforms.uWakeCenter.value = wakeBandCenterLonDeg(now) * RAD;
}

// Vertex shader: reuses sun.ts's VERT (vW is the object-space normal, which
// IS the world position on the unit sphere since the globe is never
// rotated -- same reasoning ATMO_FRAG/OCEAN_FRAG already depend on).
//
// Fragment: `golden` is goldenBandWeight's exact GLSL twin (cosSun bounds
// are sin(GOLDEN_MIN_ALT-FEATHER)/sin(GOLDEN_MIN_ALT)/sin(GOLDEN_MAX_ALT)/
// sin(GOLDEN_MAX_ALT+FEATHER), computed once as literals since a fragment
// shader can't call Math.sin on a `const`). `wake` reconstructs longitude
// from vW the same way geoMath.xyzToLatLon does (atan2(-z, x)), wraps the
// delta to (-PI, PI], and fades a thin line out from the band's centre --
// "a faint line of light moving west", not a flat block. Colours are both
// literal ambient warm/pale tones, never a --color-* brand token (globe-
// lanes.md: "ambient things ... never use brand tokens").
export const VERT = `varying vec3 vW;
void main(){vW=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export { DAYLIGHT_FRAG } from "./layerKeys.ts";

// ---------------------------------------------------------------------------
// (c) The readout: up to five cities rising, five setting, right now.
// ---------------------------------------------------------------------------

export interface DaylightCityStatus {
  city: DaylightCity;
  altitudeDeg: number;
  phase: "rising" | "setting";
}

/** How far from the horizon a city still counts as "rising/setting right
 *  now" for the readout -- wide enough to always have candidates (every
 *  longitude passes through this band twice a day), tight enough that
 *  every listed city is genuinely near its own terminator, not just
 *  daytime or nighttime. */
const READOUT_HORIZON_BAND_DEG = 8;

/** Up to `max` cities nearest the horizon on the morning (rising) and
 *  evening (setting) side, closest-to-horizon first. `localSolarMinutes`
 *  alone decides the side (< 720 is this point's morning half, which is
 *  where a near-horizon altitude can only mean sunrise, never sunset --
 *  the two terminators sit on opposite sides of the subsolar point, see
 *  wakeBandCenterLonDeg's comment). Pure and synchronous: `now` and the
 *  bundled city list are the only inputs, so it is called straight from a
 *  render, not an effect. */
export function risingAndSettingCities(now: Date, cities: readonly DaylightCity[] = DAYLIGHT_CITIES, max = 5): { rising: DaylightCityStatus[]; setting: DaylightCityStatus[] } {
  const rising: DaylightCityStatus[] = [];
  const setting: DaylightCityStatus[] = [];
  for (const city of cities) {
    const alt = altitudeDeg(now, city.lat, city.lon);
    if (Math.abs(alt) > READOUT_HORIZON_BAND_DEG) continue;
    const minutes = localSolarMinutes(now, city.lon);
    const phase: "rising" | "setting" = minutes < 720 ? "rising" : "setting";
    (phase === "rising" ? rising : setting).push({ city, altitudeDeg: alt, phase });
  }
  const byHorizon = (a: DaylightCityStatus, b: DaylightCityStatus) => Math.abs(a.altitudeDeg) - Math.abs(b.altitudeDeg);
  return { rising: rising.sort(byHorizon).slice(0, max), setting: setting.sort(byHorizon).slice(0, max) };
}
