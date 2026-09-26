/**
 * world-v2-spec.md §7 "Atmosphere" — "Sky: one shared GLSL chunk,
 * `skyChunk.glsl.ts`, used by the BackSide dome, fog and water." This is
 * that one chunk: the reference's analytic 3-colour gradient, the 5/28/220
 * sun power terms and the 2-octave cirrus band, as a single GLSL string
 * three consumers embed verbatim instead of hand-copying the gradient:
 *   - `SkyDome.tsx` (the BackSide dome itself)
 *   - `atmosphere.ts`'s `applyAtmosphere()` (the fog's in-scattered term,
 *     via `skyFogColor(rd)`)
 *   - the water shader (P2-06b), which samples `skyColor(reflect(rd))`
 *     for its T2/T3 sky/PMREM reflection (world-v2-spec §7 "Water")
 *
 * Every uniform this chunk declares is a `liveContract.ts` row — golden
 * literal (design value) or later a live-bound one — so a consumer never
 * has to choose between two copies of the same magic number.
 */

import * as THREE from "three";
import { LIVE_CONTRACT, type UniformName, type UniformSpec } from "./liveContract.ts";

/** The liveContract rows that belong to the shared sky gradient (world-v2-
 *  spec §7's "Sky:" bullet list) — as opposed to `uFogK` (atmosphere.ts's
 *  own fog density) or the water/vegetation/volumetric uniforms, which live
 *  in their own materials. The ONE place this grouping is written; every
 *  other reader (atmosphere.test.ts) imports it rather than re-listing it. */
export const SKY_UNIFORM_NAMES = [
  "uSunDir",
  "uSunCol",
  "uSkyZen",
  "uSkyUp",
  "uHorizonGlow",
  "uHaze",
  "uCloudCover",
  "uCloudShade",
] as const satisfies readonly UniformName[];

export type SkyUniformName = (typeof SKY_UNIFORM_NAMES)[number];

function contractRow(name: UniformName): UniformSpec {
  const row = LIVE_CONTRACT.find((r) => r.name === name);
  if (!row) throw new Error(`skyChunk: liveContract has no row for "${name}"`);
  return row;
}

function designThreeValue(row: UniformSpec): number | THREE.Vector3 {
  if (row.type === "float") return row.design[0];
  // Every sky uniform is float or vec3 (see liveContract.ts's UniformType) —
  // vec2 belongs to uWind alone, which isn't a sky uniform.
  return new THREE.Vector3(row.design[0], row.design[1], row.design[2]);
}

/**
 * The sky uniforms at their pre-live (golden-hour) design values, read
 * straight from `liveContract.ts` — `SkyDome.tsx` and `Env.tsx` both call
 * this instead of restating the world-v2-spec §7 literals a second time.
 * `uSunDir` is normalized here; `skyColor()` below re-normalizes it too, so
 * a caller that substitutes its own (unnormalized) live direction still
 * renders correctly.
 */
export function createSkyUniforms(): Record<SkyUniformName, THREE.IUniform> {
  const out = {} as Record<SkyUniformName, THREE.IUniform>;
  for (const name of SKY_UNIFORM_NAMES) {
    const value = designThreeValue(contractRow(name));
    out[name] = { value: name === "uSunDir" && value instanceof THREE.Vector3 ? value.clone().normalize() : value };
  }
  return out;
}

export const SKY_CHUNK = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyZen;
uniform vec3 uSkyUp;
uniform vec3 uHorizonGlow;
uniform vec3 uHaze;
uniform float uCloudCover;
uniform vec3 uCloudShade;

// world-v2-spec §7: "Clouds are a 2-octave fbm cirrus band (uCloudLit
// (1.25,.92,.62) / uCloudShade (.36,.33,.40))" — uCloudLit has no live
// driver (it is not a liveContract row), so it is a fixed literal here
// rather than a ninth uniform nothing will ever set.
const vec3 SANGAM_CLOUD_LIT = vec3(1.25, 0.92, 0.62);

float sangamHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float sangamValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = sangamHash21(i);
  float b = sangamHash21(i + vec2(1.0, 0.0));
  float c = sangamHash21(i + vec2(0.0, 1.0));
  float d = sangamHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// The cirrus band's own texture: 2 octaves, no third — world-v2-spec §7 is
// explicit about the octave count.
float sangamCirrusFbm(vec2 p) {
  float f = sangamValueNoise(p) * 0.6;
  f += sangamValueNoise(p * 2.13) * 0.4;
  return f;
}

/**
 * The reference's analytic 3-colour gradient (zenith / up-sky / horizon
 * glow) plus the 5/28/220 sun power terms (a wide halo, a tighter corona
 * and the sun disc itself) and the cirrus band, masked by uCloudCover.
 * rd is a normalized world-space view/reflection direction.
 */
vec3 skyColor(vec3 rd) {
  float up = clamp(rd.y, -1.0, 1.0);
  vec3 zenithToUp = mix(uSkyUp, uSkyZen, smoothstep(0.0, 1.0, up));
  float horizonMix = 1.0 - smoothstep(0.0, 0.35, abs(up));
  vec3 base = mix(zenithToUp, uHorizonGlow, horizonMix * 0.6);

  float sunDot = max(dot(rd, normalize(uSunDir)), 0.0);
  vec3 sunGlow = uSunCol * (pow(sunDot, 5.0) * 0.35 + pow(sunDot, 28.0) * 0.9 + pow(sunDot, 220.0) * 4.0);

  vec3 hazeTint = uHaze * horizonMix * 0.5;

  vec2 cirrusUv = rd.xz / max(abs(rd.y) + 0.08, 0.08) * 0.2;
  float cirrus = sangamCirrusFbm(cirrusUv);
  float band = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.2, cirrus) * smoothstep(-0.05, 0.25, up);
  vec3 cirrusCol = mix(SANGAM_CLOUD_LIT, uCloudShade, 0.5 - sunDot * 0.5);

  vec3 col = base + sunGlow + hazeTint;
  return mix(col, cirrusCol, band * 0.6);
}

/** The in-scattered-sun fog tint atmosphere.ts blends toward — the same
 *  sky the dome shows, sampled along the fog ray, so ground fog reads as
 *  part of one sky rather than a flat second colour (world-v2-spec §7
 *  "Fog: ... plus in-scattered sun from skyFogColor(rd)"). */
vec3 skyFogColor(vec3 rd) {
  return skyColor(rd);
}
`;
