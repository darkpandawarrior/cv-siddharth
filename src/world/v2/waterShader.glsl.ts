/**
 * world-v2-spec.md §7 "Water": three's `Reflector` (examples/jsm) with a
 * custom `shader` option, "to get the mirror camera and RT without forking
 * drei". This module is that custom shader — the uniform declarations plus
 * vertex/fragment source `Water.tsx` hands to `new Reflector(geometry,
 * { shader: createWaterShader(...) })`.
 *
 * Everything Reflector itself needs (`color`, `tDiffuse`, `textureMatrix`)
 * stays exactly as `Reflector.ReflectorShader` declares it, because
 * Reflector's constructor writes those three directly onto
 * `material.uniforms` after cloning whatever `shader.uniforms` this module
 * returns — dropping one would leave the mirror pass with nowhere to put
 * its render target.
 *
 * The live uniforms (`uFlowSpeed`, `uFoam`, `uRainRings`) are `liveContract`
 * rows, at their pre-live design values until a later lane wires in
 * `river_discharge`/`precipMmH` (live-data-spec.md §2.2 rows 5 and 10).
 *
 * The wave uniforms (`uTime`/`uWaveAmp`/`uWaveFreq`/`uWaveSpeed`) and the
 * `waterHeight()` function they drive are exported separately so
 * `waterline.glsl.ts` (W1's synced foam stripe) can embed the SAME
 * function against the SAME uniform names, rather than a second hand-typed
 * copy that could drift out of phase with the water's own swell.
 */

import * as THREE from "three";
import { LIVE_CONTRACT, type UniformName, type UniformSpec } from "./liveContract.ts";
import { SKY_CHUNK, type SkyUniformName, createSkyUniforms } from "./skyChunk.glsl.ts";

// ── live uniforms (liveContract rows) ───────────────────────────────────────

export const WATER_LIVE_UNIFORM_NAMES = [
  "uFlowSpeed",
  "uFoam",
  "uRainRings",
] as const satisfies readonly UniformName[];

export type WaterLiveUniformName = (typeof WATER_LIVE_UNIFORM_NAMES)[number];

function contractRow(name: UniformName): UniformSpec {
  const row = LIVE_CONTRACT.find((r) => r.name === name);
  if (!row) throw new Error(`waterShader: liveContract has no row for "${name}"`);
  return row;
}

export function createWaterLiveUniforms(): Record<WaterLiveUniformName, THREE.IUniform<number>> {
  const out = {} as Record<WaterLiveUniformName, THREE.IUniform<number>>;
  for (const name of WATER_LIVE_UNIFORM_NAMES) out[name] = { value: contractRow(name).design[0] };
  return out;
}

// ── the shared wave/swell uniforms and function (waterline.glsl.ts's other
// half of W1) ────────────────────────────────────────────────────────────

/** Declared once here; `waterline.glsl.ts` re-declares the SAME names (a
 *  second material's own shader needs its own `uniform` statements — GLSL
 *  has no cross-shader-program sharing) but must never rename one, or the
 *  stripe stops reading the water's actual swell. `waterline.test.ts`
 *  enforces the two files agree. */
export const WATER_WAVE_UNIFORM_NAMES = ["uTime", "uWaveAmp", "uWaveFreq", "uWaveSpeed"] as const;
export type WaterWaveUniformName = (typeof WATER_WAVE_UNIFORM_NAMES)[number];

/** Metres/Hz, tuned by feel — a shallow river's own small chop, not open
 *  sea (drive.ts's own doctrine: no simulation to fit, so no false
 *  precision pretending there is one). */
const WAVE_AMP_DESIGN = 0.05;
const WAVE_FREQ_DESIGN = 0.35;
const WAVE_SPEED_DESIGN = 0.6;

export function createWaterWaveUniforms(): Record<WaterWaveUniformName, THREE.IUniform<number>> {
  return {
    uTime: { value: 0 },
    uWaveAmp: { value: WAVE_AMP_DESIGN },
    uWaveFreq: { value: WAVE_FREQ_DESIGN },
    uWaveSpeed: { value: WAVE_SPEED_DESIGN },
  };
}

/** The uniform declarations `WATER_HEIGHT_FUNCTION` depends on. Split out
 *  from the function itself so a consumer that already declares `uTime` for
 *  its own other uses (the water shader's fragment stage does) can embed
 *  `WATER_HEIGHT_FUNCTION` alone without a duplicate-uniform compile error. */
export const WATER_WAVE_UNIFORM_DECLARATIONS = /* glsl */ `
uniform float uTime;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uWaveSpeed;
`;

/**
 * The water surface's own small ripple displacement above its nominal
 * plane — two wave trains at different frequency/speed/direction so the
 * surface doesn't read as one tiling pattern. Same function, same uniforms,
 * in both the water's own vertex displacement and `waterline.glsl.ts`'s
 * foam-stripe threshold (visual-catalogue.md W1: "the SAME uTime/wave
 * uniforms as the water").
 */
export const WATER_HEIGHT_FUNCTION = /* glsl */ `
float waterHeight(vec2 xz, float t) {
  float w1 = sin(dot(xz, vec2(0.08, 0.05)) * 6.2831853 * uWaveFreq + t * uWaveSpeed);
  float w2 = sin(dot(xz, vec2(-0.05, 0.09)) * 6.2831853 * uWaveFreq * 1.7 - t * uWaveSpeed * 1.3);
  return uWaveAmp * (w1 * 0.65 + w2 * 0.35);
}
`;

// ── the hull wake (hullProfile.json's own two derived scalars) ─────────────

/** Up to this many nearest lamps glint in the specular loop (world-v2-spec
 *  §7: "a loop over the 8 nearest lamps"). A `#define` rather than a JS
 *  template literal for the array size, because GLSL array lengths must be
 *  compile-time constants. */
const MAX_LAMPS = 8;

export interface WaterShaderOptions {
  /** hullProfile.json's own `length` field (metres) — the single source
   *  world-v2-spec §6 and master-plan M44 name; never a second hand-typed
   *  hull dimension. */
  hullLength: number;
  /** max(hullProfile.json samples' halfBeam) — likewise read from the JSON,
   *  not re-declared. */
  hullMaxHalfBeam: number;
}

export type WaterUniforms = Record<WaterLiveUniformName, THREE.IUniform<number>> &
  Record<WaterWaveUniformName, THREE.IUniform<number>> &
  Record<SkyUniformName, THREE.IUniform> & {
    color: THREE.IUniform<THREE.Color>;
    tDiffuse: THREE.IUniform<THREE.Texture | null>;
    textureMatrix: THREE.IUniform<THREE.Matrix4>;
    uPlanarMix: THREE.IUniform<number>;
    uWaterY: THREE.IUniform<number>;
    uHeightMap: THREE.IUniform<THREE.Texture>;
    uHeightWorldMin: THREE.IUniform<THREE.Vector2>;
    uHeightWorldSize: THREE.IUniform<THREE.Vector2>;
    uHeightRange: THREE.IUniform<THREE.Vector2>;
    uFlowMap: THREE.IUniform<THREE.Texture>;
    uFlowMapWorldMin: THREE.IUniform<THREE.Vector2>;
    uFlowMapWorldSize: THREE.IUniform<THREE.Vector2>;
    uHodiPos: THREE.IUniform<THREE.Vector2>;
    uHodiHeading: THREE.IUniform<number>;
    uHullLength: THREE.IUniform<number>;
    uHullMaxHalfBeam: THREE.IUniform<number>;
    uOarPos: THREE.IUniform<THREE.Vector2>;
    uLampPos: THREE.IUniform<THREE.Vector3[]>;
    uLampColor: THREE.IUniform<THREE.Vector3[]>;
    uLampCount: THREE.IUniform<number>;
  };

/**
 * A 1x1 fallback so every sampler2D uniform has something bound before the
 * real terrain heightmap / flow map (P2-05's `gen-terrain.mjs` output) is
 * wired in by a later integration lane. Black decodes to `uHeightRange.x`
 * through `terrainHeight()` below, and to "no flow bias, no foam mask, main
 * channel" through `sampleFlow()` — an honest flat-river default, the same
 * "real, honest default, not a placeholder that happens to be zero" doctrine
 * `liveContract.ts` documents for its own design values.
 */
function createFallbackTexture(): THREE.DataTexture {
  const data = new Uint8Array([0, 0, 0, 0]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export function createWaterUniforms(options: WaterShaderOptions): WaterUniforms {
  return {
    ...createWaterLiveUniforms(),
    ...createWaterWaveUniforms(),
    ...createSkyUniforms(),
    color: { value: new THREE.Color(0x35454a) },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    // T1 = 1 (full planar mirror pass); T2/T3 = 0 (sky/PMREM reflect only) —
    // world-v2-spec §7's per-tier water row, applied as one continuous mix
    // rather than two shader variants (Water.tsx sets this per deviceTier()).
    uPlanarMix: { value: 1 },
    uWaterY: { value: 0 },
    uHeightMap: { value: createFallbackTexture() },
    uHeightWorldMin: { value: new THREE.Vector2(-384, -344) },
    uHeightWorldSize: { value: new THREE.Vector2(768, 768) },
    uHeightRange: { value: new THREE.Vector2(0, 0) },
    uFlowMap: { value: createFallbackTexture() },
    uFlowMapWorldMin: { value: new THREE.Vector2(-384, -344) },
    uFlowMapWorldSize: { value: new THREE.Vector2(768, 768) },
    uHodiPos: { value: new THREE.Vector2(0, -1000) }, // parked off-map until Hodi.tsx writes it
    uHodiHeading: { value: 0 },
    uHullLength: { value: options.hullLength },
    uHullMaxHalfBeam: { value: options.hullMaxHalfBeam },
    uOarPos: { value: new THREE.Vector2(0, -1000) },
    uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3()) },
    uLampColor: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3()) },
    uLampCount: { value: 0 },
  };
}

const WATER_VERTEX = /* glsl */ `
uniform mat4 textureMatrix;
${WATER_WAVE_UNIFORM_DECLARATIONS}
${WATER_HEIGHT_FUNCTION}

varying vec4 vUv;
varying vec3 vWorldPosition;

void main() {
  // The reflection texcoord reads the UNDISPLACED plane (Reflector's own
  // convention) so the mirrored scene itself stays geometrically flat; only
  // the visible surface (gl_Position, vWorldPosition) gets the ripple.
  vUv = textureMatrix * vec4(position, 1.0);

  vec3 displaced = position;
  displaced.z += waterHeight(position.xy, uTime);

  vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

function buildFragmentShader(): string {
  return /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
varying vec4 vUv;
varying vec3 vWorldPosition;

uniform float uFlowSpeed;
uniform float uFoam;
uniform float uRainRings;
${WATER_WAVE_UNIFORM_DECLARATIONS}
${WATER_HEIGHT_FUNCTION}
${SKY_CHUNK}

uniform float uPlanarMix;
uniform float uWaterY;
uniform sampler2D uHeightMap;
uniform vec2 uHeightWorldMin;
uniform vec2 uHeightWorldSize;
uniform vec2 uHeightRange;
uniform sampler2D uFlowMap;
uniform vec2 uFlowMapWorldMin;
uniform vec2 uFlowMapWorldSize;

uniform vec2 uHodiPos;
uniform float uHodiHeading;
uniform float uHullLength;
uniform float uHullMaxHalfBeam;
uniform vec2 uOarPos;

uniform vec3 uLampPos[${MAX_LAMPS}];
uniform vec3 uLampColor[${MAX_LAMPS}];
uniform int uLampCount;

// world-v2-spec §7 "Water": Beer-Lambert silt absorb/scatter literals.
const vec3 SILT_ABSORB = vec3(0.62, 0.30, 0.36);
const vec3 SILT_SCATTER = vec3(0.10, 0.11, 0.07);
// A flat pebble/tan riverbed, standing in for a sampled bed-texture colour
// until the terrain material (P2-05) is wired in as a real uHeightMap/bed
// colour source (world-v2-spec §7: "the pebble riverbed... renders beneath
// naturally" — this is that colour's honest placeholder).
const vec3 BED_COLOR = vec3(0.42, 0.35, 0.30);
// world-v2-spec §0: cyan is a MEASURED-connection colour, never decorative —
// the water shader's one legitimate use, on a tributary whose includeBuild
// edge is measured (flow.a >= 1, valley.ts's tributaries()).
const vec3 TRIBUTARY_TINT = vec3(0.15, 0.85, 1.0);

vec2 heightUv(vec2 xz) {
  return clamp((xz - uHeightWorldMin) / max(uHeightWorldSize, vec2(0.0001)), 0.0, 1.0);
}

float terrainHeight(vec2 xz) {
  float g = texture2D(uHeightMap, heightUv(xz)).r;
  return mix(uHeightRange.x, uHeightRange.y, g);
}

// R,G = flow tangent (packed 0..1, decoded to -1..1); B = foam mask
// (confluence collars, stepping-stone rapids, shoreline); A = channel id,
// 0 = main, >=1/255-scaled = tributary (world-v2-spec §3's flow-map bullet).
vec4 sampleFlow(vec2 xz) {
  vec2 uv = clamp((xz - uFlowMapWorldMin) / max(uFlowMapWorldSize, vec2(0.0001)), 0.0, 1.0);
  return texture2D(uFlowMap, uv);
}

// Mirrors hullProfile.json's own cos^1.35 taper (hullProfile.test.ts pins
// the sampled curve; this reconstructs its SHAPE from the profile's own
// length/max-half-beam rather than a hand-typed second literal).
// ponytail: an analytic envelope, not a per-sample texture lookup of the
// full curve — adequate for a wake silhouette seen through moving water.
// Upgrade to a 1D LUT baked straight from hullProfile.json's samples if the
// wake ever needs the exact cross-section rather than its envelope.
float hullHalfBeamEnvelope(float t) {
  float at = clamp(abs(t), 0.0, 1.0);
  return uHullMaxHalfBeam * pow(cos(1.5707963 * at), 1.35);
}

// The hodi's own displacement (near-field) plus a decaying trailing wake
// behind the stern — world-v2-spec §7: "hull wake from hullProfile" plus
// "oar rings... at stepping stones and confluence collars from flow.B".
float hullWakeMask(vec2 xz) {
  float c = cos(uHodiHeading);
  float s = sin(uHodiHeading);
  vec2 d = xz - uHodiPos;
  // Heading convention (drive.ts / driveSpline.ts): forward = (sin, cos).
  float along = d.x * s + d.y * c;
  float across = d.x * c - d.y * s;

  float tNorm = along / max(uHullLength * 0.5, 0.001);
  float envelope = hullHalfBeamEnvelope(tNorm) + 0.18;
  float hull = (abs(tNorm) <= 1.0) ? (1.0 - smoothstep(envelope * 0.55, envelope, abs(across))) : 0.0;

  float behindDist = max(0.0, -along - uHullLength * 0.5);
  float trailWidth = envelope + behindDist * 0.12;
  float trail = exp(-behindDist * 0.05) * (1.0 - smoothstep(trailWidth * 0.5, trailWidth, abs(across)));

  return clamp(max(hull, trail * 0.7), 0.0, 1.0);
}

// world-v2-spec §7 literal: "oar rings cos(d*13 - t*7)*exp(-d*1.1)".
float oarRingMask(vec2 xz, float t) {
  float d = length(xz - uOarPos);
  return clamp(cos(d * 13.0 - t * 7.0) * exp(-d * 1.1), 0.0, 1.0);
}

// Concentric expanding rings per raindrop cell, gated by uRainRings
// (live-data-spec.md §2.2 row 5: "rings = sat(mmh/8)").
float rainRingMask(vec2 xz, float t) {
  vec2 cell = floor(xz * 0.35);
  float seed = sangamHash21(cell);
  vec2 centre = (cell + 0.5) / 0.35;
  float d = length(xz - centre);
  float phase = fract(t * 0.5 + seed);
  float radius = phase * 3.5;
  float ring = 1.0 - smoothstep(0.0, 0.18, abs(d - radius));
  float fade = 1.0 - phase;
  return ring * fade;
}

void main() {
  vec2 xz = vWorldPosition.xz;
  vec4 flow = sampleFlow(xz);
  vec2 flowDir = normalize(flow.rg * 2.0 - 1.0 + vec2(0.0001));

  // Two scrolling fbm-ish layers, advected along the baked flow direction
  // and scaled by the live uFlowSpeed multiplier (world-v2-spec §7:
  // "Normals: 2 scrolling fbm layers advected by the flow map").
  vec2 uvA = xz * 0.15 + flowDir * uTime * uFlowSpeed * 0.6;
  vec2 uvB = xz * 0.31 - flowDir * uTime * uFlowSpeed * 0.9 + vec2(17.0, 4.0);
  float eps = 0.35;
  float ndx = (sangamValueNoise(uvA + vec2(eps, 0.0)) - sangamValueNoise(uvA - vec2(eps, 0.0)))
            + (sangamValueNoise(uvB + vec2(eps, 0.0)) - sangamValueNoise(uvB - vec2(eps, 0.0))) * 0.6;
  float ndz = (sangamValueNoise(uvA + vec2(0.0, eps)) - sangamValueNoise(uvA - vec2(0.0, eps)))
            + (sangamValueNoise(uvB + vec2(0.0, eps)) - sangamValueNoise(uvB - vec2(0.0, eps))) * 0.6;
  vec3 N = normalize(vec3(-ndx * 0.9, 1.0, -ndz * 0.9));

  vec3 viewDirW = normalize(cameraPosition - vWorldPosition);
  vec3 reflectDir = reflect(-viewDirW, N);

  // Analytic depth: no depth-copy pass (world-v2-spec §7). The riverbed and
  // any submerged geometry read through via Beer-Lambert transmittance
  // rather than a real refraction sample.
  float bedHeight = terrainHeight(xz);
  float depth = max(uWaterY - bedHeight, 0.0);
  float path = depth / max(abs(viewDirW.y), 0.12);
  vec3 transmittance = exp(-SILT_ABSORB * path);
  vec3 scatterCol = SILT_SCATTER * (1.0 - transmittance);
  float trLum = dot(transmittance, vec3(0.299, 0.587, 0.114));
  float alpha = clamp(1.0 - trLum, 0.0, 1.0);

  vec4 planar = texture2DProj(tDiffuse, vUv);
  vec3 reflectionColor = mix(skyColor(reflectDir), planar.rgb, clamp(uPlanarMix, 0.0, 1.0));

  vec3 base = mix(BED_COLOR, reflectionColor, alpha) + scatterCol;

  // Double-lobe sun glint (world-v2-spec §7 literal: pow 380*6 + pow 60*.06).
  float sunDot = max(dot(reflectDir, normalize(uSunDir)), 0.0);
  vec3 sunGlint = uSunCol * (pow(sunDot, 380.0) * 6.0 + pow(sunDot, 60.0) * 0.06);

  // The 8 nearest lamps (diyas/deepmal/lantern) — amber glints, world-v2-
  // spec §7. uLampCount is set by whichever later lane feeds the nearest-8
  // list; 0 until then, so this loop costs nothing yet.
  vec3 lampGlints = vec3(0.0);
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    if (i >= uLampCount) break;
    vec3 toLamp = uLampPos[i] - vWorldPosition;
    float d = max(length(toLamp), 0.001);
    float ld = max(dot(reflectDir, toLamp / d), 0.0);
    float atten = 1.0 / (1.0 + d * d * 0.015);
    lampGlints += uLampColor[i] * pow(ld, 220.0) * atten;
  }

  float foamMask = clamp(
    flow.b * uFoam
    + hullWakeMask(xz)
    + oarRingMask(xz, uTime) * 0.3
    + rainRingMask(xz, uTime) * uRainRings,
    0.0, 1.0
  );

  // Tributary channels (flow.a >= 1) add a faint probe-cyan tint to the
  // glint — the ONLY place cyan appears on water (world-v2-spec §7/§0).
  float tributary = step(1.0, flow.a);
  vec3 tint = TRIBUTARY_TINT * tributary * 0.12 * (sunGlint.r + sunGlint.g + sunGlint.b);

  vec3 outColor = base + sunGlint + lampGlints + tint;
  outColor = mix(outColor, vec3(1.0), foamMask * 0.85);

  gl_FragColor = vec4(outColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

export const WATER_FRAGMENT_CHUNK: string = buildFragmentShader();

/**
 * The full shader object `Water.tsx` passes as `new Reflector(geometry,
 * { shader: createWaterShader(...) })`'s `shader` option.
 */
export function createWaterShader(options: WaterShaderOptions): {
  name: string;
  uniforms: WaterUniforms;
  vertexShader: string;
  fragmentShader: string;
} {
  return {
    name: "SangamWaterShader",
    uniforms: createWaterUniforms(options),
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT_CHUNK,
  };
}
