/**
 * The live-uniform contract (world-v2-spec.md §7 "Atmosphere", amended by
 * living-ledger-spec.md §4/§5.3-5.4 "the sky, made of real things"). One
 * row per shader uniform every P2/P3 render lane binds to, up front, so
 * `skyChunk.glsl.ts` (P2-06a), `terrainMaterial.ts` (P2-05) and the water
 * shader (P3) all initialise from the SAME design (pre-live) value instead
 * of three copies of the same magic number drifting apart.
 *
 * `design` is the value rendered before any live stream has answered —
 * the same "never a stale value dressed as live" doctrine `streams.ts`'
 * `failure` field states per row (living-ledger §4): it is a real, honest
 * default, not a placeholder that happens to be zero.
 *
 * `drivenBy` names a `streams.ts` `Stream.id` once that stream is wired in
 * (a later lane's job); `"static"` means world-v2 §7's own fixed literal,
 * not yet amended to read live.
 *
 * This module is pure data (no three/R3F import) — the same discipline as
 * `streams.ts`.
 */

export type UniformName =
  | "uSunDir"
  | "uSunCol"
  | "uSkyZen"
  | "uSkyUp"
  | "uHorizonGlow"
  | "uHaze"
  | "uCloudCover"
  | "uCloudShade"
  | "uFogK"
  | "uMist"
  | "uWind"
  | "uFlowSpeed"
  | "uFoam"
  | "uRainRings"
  | "uGrassWet"
  | "uVolStrength";

export type UniformType = "float" | "vec2" | "vec3";

export interface UniformSpec {
  name: UniformName;
  type: UniformType;
  /** The pre-live/golden-hour design value (world-v2-spec §7 literals
   *  where one exists; otherwise the honest "no live signal yet" neutral —
   *  0 for an additive/intensity term, 1 for a multiplier). */
  design: readonly number[];
  /** A `streams.ts` `Stream.id`, or `"static"` (world-v2 §7's own fixed
   *  literal, not amended to read live). */
  drivenBy: string;
  /** Where the literal (or the "no literal yet" call) comes from. */
  note: string;
}

export const LIVE_CONTRACT: readonly UniformSpec[] = [
  {
    name: "uSunDir",
    type: "vec3",
    design: [0.18, 0.14, 0.97],
    drivenBy: "sun",
    note: "world-v2-spec §7: normalize(.18,.14,.97), downstream and slightly west; live sun replaces it (S1).",
  },
  {
    name: "uSunCol",
    type: "vec3",
    design: [1.0, 0.74, 0.46],
    drivenBy: "sun",
    note: "world-v2-spec §7 literal.",
  },
  {
    name: "uSkyZen",
    type: "vec3",
    design: [0.1, 0.17, 0.29],
    drivenBy: "sun",
    note: "world-v2-spec §7 literal (golden-hour zenith); living-ledger §5.2 KEYFRAMES_V2 swaps rows by real sun altitude.",
  },
  {
    name: "uSkyUp",
    type: "vec3",
    design: [0.3, 0.38, 0.44],
    drivenBy: "sun",
    note: "world-v2-spec §7 literal.",
  },
  {
    name: "uHorizonGlow",
    type: "vec3",
    design: [1.0, 0.58, 0.26],
    drivenBy: "sun",
    note: "world-v2-spec §7 literal.",
  },
  {
    name: "uHaze",
    type: "vec3",
    design: [0.86, 0.62, 0.38],
    drivenBy: "air",
    note: "world-v2-spec §7 literal (dust term); living-ledger §4 S5: haze/fog density scale from AOD.",
  },
  {
    name: "uCloudCover",
    type: "float",
    design: [0],
    drivenBy: "weather",
    note: "No literal in any spec (only uCloudLit/uCloudShade colours are given) — 0 (clear) is the honest pre-live default; S3 weather drives the real fraction.",
  },
  {
    name: "uCloudShade",
    type: "vec3",
    design: [0.36, 0.33, 0.4],
    drivenBy: "weather",
    note: "world-v2-spec §7 literal (cirrus shade colour).",
  },
  {
    name: "uFogK",
    type: "float",
    design: [0.018],
    drivenBy: "air",
    note: "world-v2-spec §7 literal (k, falloff 0.09 fixed elsewhere); living-ledger §4 S5 scales density from AOD.",
  },
  {
    name: "uMist",
    type: "float",
    design: [0],
    drivenBy: "rain6h",
    note: "No literal given (only the 0-4 m band geometry is fixed) — 0 is the dry pre-live default; S4 rain6h raises it.",
  },
  {
    name: "uWind",
    type: "vec3",
    design: [0, 1, 0.3],
    drivenBy: "weather",
    note: "Packed [dirX, dirZ, strength] — open-data-spec §3 A4's windUniforms() shape, this contract's one slot for it. No numeric literal given for the 'ambient wind' fallback; [0,1,0.3] is a calm, honest placeholder for wind.ts (not owned here) to replace.",
  },
  {
    name: "uFlowSpeed",
    type: "float",
    design: [1],
    drivenBy: "river",
    note: "1 = the baked flow map's own speed, unscaled — the honest pre-live multiplier; S6 river (GloFAS) scales it live.",
  },
  {
    name: "uFoam",
    type: "float",
    design: [1],
    drivenBy: "river",
    note: "1 = the baked flow map's own foam mask (flow.B), unscaled; S6 river scales it live.",
  },
  {
    name: "uRainRings",
    type: "float",
    design: [0],
    drivenBy: "rain6h",
    note: "0 (no rain) is the honest pre-live default; S4 rain6h raises it.",
  },
  {
    name: "uGrassWet",
    type: "float",
    design: [0],
    drivenBy: "rain6h",
    note: "0 (dry) is the honest pre-live default — terrainMaterial.ts (P2-05) reads this uniform by name.",
  },
  {
    name: "uVolStrength",
    type: "float",
    design: [1],
    drivenBy: "static",
    note: "world-v2-spec §7's volumetrics (T1) are a fixed technique, not yet amended to read a live stream.",
  },
];

/** Per-vertex normalised height (0..1), the terrain/vegetation shaders'
 *  named attribute (world-v2-spec §7's `aAux.y`-adjacent convention). */
export const ATTRIBUTE_A_ALTITUDE = "aAltitude";

/** The `userData.liveKey` convention: a mesh/material bound to a
 *  `streams.ts` stream tags itself so the Reality ledger can scan the
 *  scene graph for provenance without a second, hand-kept binding list. */
export function liveKey(streamId: string): string {
  return `live:${streamId}`;
}

/** The inverse — reads a `streams.ts` id back out of a `userData.liveKey`
 *  value, or `null` for anything that isn't one. */
export function streamIdFromLiveKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("live:")) return null;
  return value.slice("live:".length);
}
