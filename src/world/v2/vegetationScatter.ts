/**
 * T3 scatter gating (world-v2-spec.md §7 "Vegetation" + §8 tier table;
 * visual-catalogue.md#T3 density-mask instance gating; master-plan.md#M67
 * "T3 scatter gating... P3-01b"). The pure placement core for grass tufts,
 * fern clumps and riverbank boulders: given a real height/density surface,
 * decides which grid cells actually spawn an instance and where inside
 * their own cell it lands.
 *
 * Zero three/R3F imports — the same discipline `valley.ts` and
 * `terrainMaterial.ts`'s pure helpers already keep, so this file (and the
 * caller supplying a real `ScatterSurface`) can be unit-tested against a
 * synthetic surface without a browser, a heightmap fetch or a splat-worker
 * bake.
 *
 * Determinism: every random-looking choice (which cells spawn, where in
 * the cell, rotation, scale) is `hashNoise(stringSeed(id))` keyed by the
 * cell's own `"<kind>:<col>:<row>"` id, never `Math.random` and never a
 * bare array-index (hash.ts's own "never a bare counter" rule) — two calls
 * with the same inputs deep-equal, and a lower tier is a stable SUBSET of
 * a higher one (the same `keepRoll < keepFraction` id survives at every
 * tier whose fraction it clears), not an independently reshuffled draw.
 */

import { hashNoise, stringSeed } from "./hash.ts";
import { distanceToRiver, riverWidthAtZ } from "./valley.ts";
import type { DeviceTier } from "../deviceTier.ts";

export type ScatterKind = "grass" | "fern" | "rock";

/** world-v2-spec §7: "rejects grass, fern and rock points where the baked
 *  aAux.x density is below its threshold [or] the slope is above 38 deg
 *  [or] the point falls in the river channel." A real caller (Vegetation.tsx)
 *  supplies these from the same heightmap the terrain itself displaces
 *  from; a test supplies a synthetic one. */
export interface ScatterSurface {
  /** World-space terrain height (m) at (x, z). */
  heightAt(x: number, z: number): number;
  /** The baked canopy/density mask (0..1, world-v2-spec §9's aAux.x
   *  channel) at (x, z). 1 = full density, 0 = bare ground. */
  densityAt(x: number, z: number): number;
}

export interface ScatterPoint {
  id: string;
  kind: ScatterKind;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

export interface ScatterBounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface ScatterParams {
  kind: ScatterKind;
  bounds: ScatterBounds;
  /** Grid cell size (m); one candidate point per cell, jittered inside it. */
  cellSize: number;
  /** aAux.x floor (world-v2-spec §7) — below this, the cell never spawns. */
  densityThreshold: number;
  surface: ScatterSurface;
  tier: DeviceTier;
}

/** world-v2-spec §8 "foliage" row: T1 100%, T2 40%, T3 25%. The ONE place
 *  this table is encoded — vegetationScatter.test.ts asserts against it
 *  directly rather than a second hand-copied literal. */
export const TIER_KEEP_FRACTION: Readonly<Record<DeviceTier, number>> = {
  1: 1,
  2: 0.4,
  3: 0.25,
};

/** world-v2-spec §7: "the slope is above 38 deg" is a reject. */
export const SLOPE_LIMIT_DEG = 38;

const SLOPE_SAMPLE_EPS_M = 0.5;

function slopeDegAt(x: number, z: number, surface: ScatterSurface): number {
  const hx0 = surface.heightAt(x - SLOPE_SAMPLE_EPS_M, z);
  const hx1 = surface.heightAt(x + SLOPE_SAMPLE_EPS_M, z);
  const hz0 = surface.heightAt(x, z - SLOPE_SAMPLE_EPS_M);
  const hz1 = surface.heightAt(x, z + SLOPE_SAMPLE_EPS_M);
  const dx = (hx1 - hx0) / (2 * SLOPE_SAMPLE_EPS_M);
  const dz = (hz1 - hz0) / (2 * SLOPE_SAMPLE_EPS_M);
  const gradient = Math.hypot(dx, dz);
  return (Math.atan(gradient) * 180) / Math.PI;
}

/** [0, 1) from hash.ts's own [-1, 1) noise, one line, no second RNG. */
function unit(seed: number): number {
  return (hashNoise(seed) + 1) / 2;
}

/**
 * Scatters `kind` over `bounds` on a `cellSize` grid, applying (in order,
 * so the cheapest reject runs first) the tier keep-fraction, the density
 * floor, the slope limit and the river-channel exclusion. Pure function of
 * its arguments — the same inputs always produce the same array, in the
 * same order (row-major by cell), which is what makes "two calls deep-equal"
 * a meaningful test rather than a coincidence of insertion order.
 */
export function scatterVegetation(params: ScatterParams): ScatterPoint[] {
  const { kind, bounds, cellSize, densityThreshold, surface, tier } = params;
  const keepFraction = TIER_KEEP_FRACTION[tier];
  const cols = Math.max(0, Math.floor((bounds.xMax - bounds.xMin) / cellSize));
  const rows = Math.max(0, Math.floor((bounds.zMax - bounds.zMin) / cellSize));
  const points: ScatterPoint[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = `${kind}:${col}:${row}`;

      // Tier decimation first (cheapest check): a fixed per-id roll means
      // T3's surviving ids are exactly the ones T2 and T1 also keep.
      if (unit(stringSeed(`${id}:tier`)) >= keepFraction) continue;

      const cellX0 = bounds.xMin + col * cellSize;
      const cellZ0 = bounds.zMin + row * cellSize;
      const x = cellX0 + unit(stringSeed(`${id}:jx`)) * cellSize;
      const z = cellZ0 + unit(stringSeed(`${id}:jz`)) * cellSize;

      if (surface.densityAt(x, z) < densityThreshold) continue;
      if (slopeDegAt(x, z, surface) > SLOPE_LIMIT_DEG) continue;
      if (distanceToRiver(x, z) < riverWidthAtZ(z) / 2) continue;

      const y = surface.heightAt(x, z);
      const rotationY = unit(stringSeed(`${id}:rot`)) * Math.PI * 2;
      const scale = 0.8 + unit(stringSeed(`${id}:scale`)) * 0.4;
      points.push({ id, kind, x, y, z, rotationY, scale });
    }
  }
  return points;
}
