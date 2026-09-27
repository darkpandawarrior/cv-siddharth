/**
 * world-v2-spec.md §8 "Performance tiers" — the one table every phase-3/4
 * tier-gated feature reads instead of re-deriving its own cutoff. Encodes
 * every cell of the section-8 matrix as data (`tiers.test.ts` pins it
 * verbatim against the spec), plus this lane's own three gating cells
 * (master-plan.md#M67): caustics (T1), volumetric (T1) and lamp shafts
 * (T1 night, T2, T3).
 *
 * Caustics's T1-only gate is NOT re-declared here as a second literal:
 * `Water.tsx` (P2-06b) already exports `CAUSTICS_TIERS` for exactly this
 * purpose (its own doc comment: "this file's own tier gate and any later
 * tier-matrix test both read the ONE list"), so this file imports it
 * rather than risking a second copy drifting from the first. The
 * volumetric step count/resolution likewise come from `Volumetric.ts`
 * itself, not a restated pair of numbers.
 */
import type { DeviceTier } from "../deviceTier.ts";
import { CAUSTICS_TIERS } from "./Water.tsx";
import { SCALE_CEIL, SCALE_FLOOR } from "./dynamicResolution.ts";
import { VOLUMETRIC_RESOLUTION_SCALE, VOLUMETRIC_STEPS } from "./Volumetric.ts";

export type WorldTier = DeviceTier; // 1 | 2 | 3, restated for this table's own readability

const TIER_LABEL: Readonly<Record<WorldTier, "T1" | "T2" | "T3">> = { 1: "T1", 2: "T2", 3: "T3" };

export interface TierRow {
  /** "internal res" row: `<Canvas dpr>` ceiling. */
  dprMax: number;
  /** Dynamic-resolution range this tier renders at — T1 is the only tier
   *  `dynamicResolution.ts` ever moves (its own floor/ceiling); T2/T3 are
   *  fixed at one literal scale. */
  resScaleMin: number;
  resScaleMax: number;
  /** `null` = no shadow map at all (T3: baked AO only). */
  shadowMapSize: number | null;
  terrainGrid: number;
  /** `null` where §8 gives no separate heightmap number for that tier
   *  (T3's cell is just "256²", nothing more). */
  terrainHeightmap: number | null;
  textureSize: number;
  /** `null` = no cap (T1/T2); T3: "no normal maps past 18 m". */
  textureNormalMapMaxDistM: number | null;
  water: "planar" | "pmrem";
  waterNormalLayers: number;
  volumetrics: "raymarch26" | "analytic";
  /** `null` = no bloom pass at all (T3: grade only). */
  bloomMips: number | null;
  smaa: boolean;
  foliagePercent: number;
  /** [marigold, petalsOnWater, dustMotesInShafts] — §8's own three-number
   *  "particles" row, in that order. */
  particles: readonly [number, number, number];
  /** `null` = vsync (T1/T2); T3: "30 fps". */
  frameCapFps: number | null;
}

const T1: TierRow = {
  dprMax: 2,
  resScaleMin: SCALE_FLOOR,
  resScaleMax: SCALE_CEIL,
  shadowMapSize: 4096,
  terrainGrid: 512,
  terrainHeightmap: 1025,
  textureSize: 1024,
  textureNormalMapMaxDistM: null,
  water: "planar",
  waterNormalLayers: 2,
  volumetrics: "raymarch26",
  bloomMips: 6,
  smaa: true,
  foliagePercent: 100,
  particles: [2400, 1800, 800],
  frameCapFps: null,
};

const T2: TierRow = {
  dprMax: 1.5,
  resScaleMin: 0.75,
  resScaleMax: 0.75,
  shadowMapSize: 2048,
  terrainGrid: 256,
  terrainHeightmap: 513,
  textureSize: 512,
  textureNormalMapMaxDistM: null,
  water: "pmrem",
  waterNormalLayers: 1,
  volumetrics: "analytic",
  bloomMips: 4,
  smaa: false,
  foliagePercent: 40,
  particles: [600, 500, 0],
  frameCapFps: null,
};

const T3: TierRow = {
  dprMax: 1,
  resScaleMin: 0.6,
  resScaleMax: 0.6,
  shadowMapSize: null,
  terrainGrid: 256,
  terrainHeightmap: null,
  textureSize: 512,
  textureNormalMapMaxDistM: 18,
  water: "pmrem",
  waterNormalLayers: 1,
  volumetrics: "analytic",
  bloomMips: null,
  smaa: false,
  foliagePercent: 25,
  particles: [0, 200, 0],
  frameCapFps: 30,
};

export const TIER_MATRIX: Readonly<Record<WorldTier, TierRow>> = { 1: T1, 2: T2, 3: T3 };

/** The volumetric row's own numbers, restated here only for anyone reading
 *  `TIER_MATRIX` who wants the literal step count behind `"raymarch26"`
 *  without a second import — always equal to `Volumetric.ts`'s own
 *  constants (`tiers.test.ts` pins that equality, not a duplicate literal). */
export const VOLUMETRIC_TIER_DETAIL = { steps: VOLUMETRIC_STEPS, resolutionScale: VOLUMETRIC_RESOLUTION_SCALE } as const;

export function showsCaustics(tier: WorldTier): boolean {
  return (CAUSTICS_TIERS as readonly string[]).includes(TIER_LABEL[tier]);
}

export function showsVolumetric(tier: WorldTier): boolean {
  return TIER_MATRIX[tier].volumetrics === "raymarch26";
}

/** L3 (visual-catalogue.md, master-plan.md#M67): lamp shafts show "on T2
 *  and T3 always, on T1 only at night; hidden while the volumetric pass is
 *  active in daylight" — which, since the volumetric pass IS the T1-only
 *  raymarch, collapses to the one rule below. */
export function showsLampShafts(tier: WorldTier, isNight: boolean): boolean {
  return tier !== 1 || isNight;
}
