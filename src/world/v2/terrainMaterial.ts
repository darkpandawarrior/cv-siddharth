/**
 * World v2 ("Sangam") terrain material — world-v2-spec.md §3, amended by
 * visual-catalogue.md §10.2 (T1 basalt strata, T2 slope smoothstep) and
 * living-ledger-spec.md §3.3 G1 (year strata). Owns the ONE
 * `MeshStandardMaterial.onBeforeCompile` extension `Terrain.tsx` mounts:
 * splats soil/grass/laterite/pebble from the per-vertex `aSplat`/`aAux`
 * attributes `splat.worker.ts` bakes, T1's real-data basalt strata in the
 * rock channel, T2's slope band, a macro-noise anti-tile term, a 3-step
 * shader LOD and `uGrassWet` from `liveContract.ts`.
 *
 * G1 year-strata (living-ledger §3.3): "band per closed year... oldest at
 * the waterline", read through `GRAMMAR`/`ledger.ts` the same way every
 * other real number here is — never re-derived, never a second copy of
 * G1's own thickness formula. This is genuinely a "1D data texture": one
 * texel per closed year, height=1, sampled by the cut face's own worldY.
 */
import * as THREE from "three";
import { GRAMMAR, type GrowthRule } from "./grammar.ts";
import { ledger } from "./ledger.ts";
import { LIVE_CONTRACT } from "./liveContract.ts";
import type { DeviceTier } from "../deviceTier.ts";

// ── T1: named constants at the top of the file, per the lane's own task ────
export const STRATA_FREQ = 0.35; // uStrataFreq — bank-cut band frequency (1/m along worldY)
export const STRATA_JITTER = 0.6; // uStrataJitter — fbm-driven phase jitter, keeps bands from reading as pure rings

// ── T2: smoothstep(28deg, 36deg) replaces the old hard `slope > 32deg`
// branch — visual-catalogue.md §10.2 T2. ────────────────────────────────────
export const SLOPE_BAND_LO_DEG = 28.0;
export const SLOPE_BAND_HI_DEG = 36.0;

// ── shader LOD (world-v2-spec §3): triplanar/macro detail only inside
// LOD_NEAR_M, fading out by LOD_MID_M; normal-map-strength detail is fully
// off past LOD_FAR_M. ───────────────────────────────────────────────────────
export const LOD_NEAR_M = 18.0;
export const LOD_MID_M = 70.0;
export const LOD_FAR_M = 260.0;

const GRASS_WET_UNIFORM = LIVE_CONTRACT.find((u) => u.name === "uGrassWet");
if (!GRASS_WET_UNIFORM) throw new Error("terrainMaterial.ts: liveContract.ts is missing uGrassWet");
const GRASS_WET_DESIGN = GRASS_WET_UNIFORM.design[0];

interface YearBandRow {
  year: string;
  total: number;
}

/** G1's own thickness-per-year, cumulative from the waterline, read through
 *  GRAMMAR/ledger.ts (never re-derived) — one texel per closed year. */
function buildYearStrataTexture(): { texture: THREE.DataTexture; depthM: number } {
  const rule = GRAMMAR.find((r) => r.id === "year-strata") as unknown as GrowthRule<YearBandRow> | undefined;
  if (!rule) throw new Error("terrainMaterial.ts: grammar.ts's GRAMMAR is missing 'year-strata'");
  const rows = rule.source(ledger); // ascending by year (grammar.ts's own buildYearBands sort)
  const thicknesses = rows.map((r) => rule.featureOf(r, rows).scalar ?? 0);
  const n = Math.max(1, thicknesses.length);
  const data = new Uint8Array(n);
  let cum = 0;
  for (let i = 0; i < thicknesses.length; i++) {
    cum += thicknesses[i];
    data[i] = Math.round(Math.min(1, i / Math.max(1, thicknesses.length - 1)) * 255);
  }
  const depthM = cum || 1;
  const texture = new THREE.DataTexture(data, n, 1, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, depthM };
}

// ── a small 2D value-noise fbm, GLSL source shared by T1's jitter and the
// macro-noise anti-tile term (world-v2-spec §3: "a 2-octave macro-noise
// anti-tile term") — one function, injected once. ───────────────────────────
const NOISE_GLSL = /* glsl */ `
float nsHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float nsNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = nsHash(i);
  float b = nsHash(i + vec2(1.0, 0.0));
  float c = nsHash(i + vec2(0.0, 1.0));
  float d = nsHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float nsFbm2(vec2 p) {
  float sum = nsNoise2(p) * 0.6;
  sum += nsNoise2(p * 2.17) * 0.4;
  return sum;
}
`;

export interface TerrainMaterialOptions {
  tier: DeviceTier;
}

/** Builds the terrain's one MeshStandardMaterial, patched via
 *  onBeforeCompile. `tier` gates the macro-noise anti-tile term off on the
 *  throttled tier (T3) — the same "cumulative drops" discipline
 *  deviceTier.ts's own tierBudget documents, applied to shader cost instead
 *  of geometry/texture size. */
export interface TerrainMaterialHandle {
  material: THREE.MeshStandardMaterial;
  /** Written from `Terrain.tsx`'s own `useFrame`, same "one small uniform
   *  per frame" contract v1 Terrain.tsx's `uHeadZ` keeps — the LOD fade
   *  needs the live camera position, not a value baked at compile time. */
  uCamPos: { value: THREE.Vector3 };
  uGrassWet: { value: number };
}

export function buildTerrainMaterial(options: TerrainMaterialOptions): TerrainMaterialHandle {
  const { tier } = options;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 });
  const { texture: yearStrataTex, depthM: yearStrataDepthM } = buildYearStrataTexture();
  // T3 (throttled): skip the macro-noise anti-tile detail term entirely —
  // the single most expensive per-fragment call here (two nsNoise2 samples).
  const includeMacroNoise = tier !== 3;

  const uCamPos = { value: new THREE.Vector3() };
  const uGrassWet = { value: GRASS_WET_DESIGN };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassWet = uGrassWet;
    shader.uniforms.uStrataFreq = { value: STRATA_FREQ };
    shader.uniforms.uStrataJitter = { value: STRATA_JITTER };
    shader.uniforms.uStrataYearTex = { value: yearStrataTex };
    shader.uniforms.uStrataYearDepth = { value: yearStrataDepthM };
    shader.uniforms.uCamPos = uCamPos;

    shader.vertexShader = `
attribute vec4 aSplat;
attribute vec3 aAux;
varying vec4 vSplat;
varying vec3 vAux;
varying vec3 vWorldPos;
${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vSplat = aSplat;
vAux = aAux;
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader = `
varying vec4 vSplat;
varying vec3 vAux;
varying vec3 vWorldPos;
uniform float uGrassWet;
uniform float uStrataFreq;
uniform float uStrataJitter;
uniform sampler2D uStrataYearTex;
uniform float uStrataYearDepth;
uniform vec3 uCamPos;
${NOISE_GLSL}
${shader.fragmentShader}`
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
// ── splat: soil / grass / laterite rock / pebble, baked per vertex by
// splat.worker.ts from the heightmap's own neighbourhood (world-v2-spec §3).
vec3 nsSoil = vec3(0.36, 0.25, 0.16);
vec3 nsGrass = vec3(0.40, 0.46, 0.24);
vec3 nsLaterite = vec3(0.40, 0.19, 0.11);
vec3 nsPebble = vec3(0.55, 0.53, 0.48);
vec3 nsSplatColor = nsSoil * vSplat.x + nsGrass * vSplat.y + nsLaterite * vSplat.z + nsPebble * vSplat.w;
diffuseColor.rgb *= mix(vec3(1.0), nsSplatColor, clamp(vSplat.x + vSplat.y + vSplat.z + vSplat.w, 0.0, 1.0));

// aAux.y — baked curvature AO (splat.worker.ts). aAux.x — canopy mask
// (0 until a props lane places real banyans). aAux.z — REC-6's west-terrace
// grain (real history.ts filesChanged): a faint per-fragment brightness
// jitter on the soil channel, so a heavy-rewrite month reads as slightly
// rougher-grained ground, never a new colour.
diffuseColor.rgb *= mix(0.72, 1.0, vAux.y);
diffuseColor.rgb *= 1.0 - vAux.z * vSplat.x * 0.12 * nsHash(vWorldPos.xz * 3.0 + vAux.z);

// T2 — smoothstep(28deg, 36deg) replaces the old hard slope-angle branch.
float nsSlopeDeg = degrees(acos(clamp(normal.y, -1.0, 1.0)));
float nsRockWeight = smoothstep(${SLOPE_BAND_LO_DEG.toFixed(1)}, ${SLOPE_BAND_HI_DEG.toFixed(1)}, nsSlopeDeg);

// LOD — macro detail fades out between LOD_NEAR_M and LOD_MID_M; past
// LOD_FAR_M the detail term is fully zero (stand-in for "normal maps off":
// this material has no normal map input yet, so the term it gates is the
// only per-fragment detail signal that exists to turn off).
float nsCamDist = distance(uCamPos, vWorldPos);
float nsDetailFade = 1.0 - smoothstep(${LOD_NEAR_M.toFixed(1)}, ${LOD_MID_M.toFixed(1)}, nsCamDist);
float nsFarFade = 1.0 - smoothstep(${LOD_FAR_M.toFixed(1)} - 40.0, ${LOD_FAR_M.toFixed(1)}, nsCamDist);
nsDetailFade *= nsFarFade;

${
  includeMacroNoise
    ? `float nsMacro = (nsFbm2(vWorldPos.xz * 0.02) - 0.5) * nsDetailFade;`
    : `float nsMacro = 0.0; // T3 — macro-noise anti-tile term skipped, deviceTier.ts's own cumulative-drop discipline`
}

// T1 — basalt strata bands in the rock channel (visual-catalogue §10.2 T1),
// only where the slope weight is above 0.5; G1's real per-year thicknesses
// (uStrataYearTex) nudge the band phase so the ramp is data-driven, not
// purely decorative fbm.
if (nsRockWeight > 0.5) {
  float nsYearT = texture2D(uStrataYearTex, vec2(clamp(vWorldPos.y / uStrataYearDepth, 0.0, 1.0), 0.5)).r;
  float nsBand = fract(vWorldPos.y * uStrataFreq + nsMacro * uStrataJitter + nsYearT * 0.15);
  vec3 nsStrataDark = vec3(0.05, 0.045, 0.05);
  vec3 nsStrataLaterite = vec3(0.40, 0.16, 0.09);
  vec3 nsStrataGrey = vec3(0.40, 0.39, 0.37);
  vec3 nsStrataColor = nsBand < 0.33 ? nsStrataDark : nsBand < 0.66 ? nsStrataLaterite : nsStrataGrey;
  diffuseColor.rgb = mix(diffuseColor.rgb, nsStrataColor, nsRockWeight);
}
`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
// uGrassWet — the grass channel darkens and sharpens under real rain
// (liveContract.ts's own honest pre-live default is 0/dry).
roughnessFactor = mix(roughnessFactor, 0.22, uGrassWet * vSplat.y);
`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance *= 1.0; // no emissive term here yet — placeholder slot kept for a later lane's ghost/lit-map work, same seam Terrain.tsx's v1 sibling uses
`,
      );
  };
  material.customProgramCacheKey = () => `sangam-terrain-t${tier}`;

  return { material, uCamPos, uGrassWet };
}
