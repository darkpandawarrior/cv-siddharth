import { describe, expect, test } from "vitest";
import { scatterVegetation, SLOPE_LIMIT_DEG, TIER_KEEP_FRACTION, type ScatterSurface } from "./vegetationScatter.ts";
import { BOUNDS, riverX, riverWidthAtZ } from "./valley.ts";

// A synthetic surface, independent of the real (fetched) heightmap: flat
// ground everywhere except a steep bank rising sharply for x > 200 (well
// clear of the river channel), and full density everywhere. Exercises the
// slope reject without needing any real terrain data.
const FLAT_FULL_DENSITY: ScatterSurface = {
  heightAt: (x) => (x > 200 ? (x - 200) * 5 : 0), // dz/dx = 5 -> ~78.7 deg, well past the 38 deg limit
  densityAt: () => 1,
};

const BASE_PARAMS = {
  kind: "grass" as const,
  bounds: BOUNDS,
  cellSize: 8,
  densityThreshold: 0.3,
  surface: FLAT_FULL_DENSITY,
};

describe("scatterVegetation", () => {
  test("is deterministic by id: two calls deep-equal", () => {
    const a = scatterVegetation({ ...BASE_PARAMS, tier: 1 });
    const b = scatterVegetation({ ...BASE_PARAMS, tier: 1 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test("per-tier counts track the section 8 table (T1 100% / T2 40% / T3 25%)", () => {
    const t1 = scatterVegetation({ ...BASE_PARAMS, tier: 1 });
    const t2 = scatterVegetation({ ...BASE_PARAMS, tier: 2 });
    const t3 = scatterVegetation({ ...BASE_PARAMS, tier: 3 });

    expect(t1.length).toBeGreaterThan(200); // enough samples for the ratio check below to be meaningful
    expect(t2.length / t1.length).toBeCloseTo(TIER_KEEP_FRACTION[2], 1);
    expect(t3.length / t1.length).toBeCloseTo(TIER_KEEP_FRACTION[3], 1);

    // Lower tiers are a stable SUBSET of higher ones (same per-id roll),
    // not an independently reshuffled draw.
    const t1Ids = new Set(t1.map((p) => p.id));
    const t2Ids = new Set(t2.map((p) => p.id));
    for (const id of t2Ids) expect(t1Ids.has(id)).toBe(true);
    for (const p of t3) expect(t2Ids.has(p.id)).toBe(true);
  });

  test("break-it fixture: no point lies on a slope above the 38 deg limit", () => {
    const points = scatterVegetation({ ...BASE_PARAMS, tier: 1 });
    for (const p of points) {
      // The fixture's steep bank starts at x=200; every surviving point
      // must be on the flat side of it.
      expect(p.x).toBeLessThanOrEqual(200);
    }
    expect(SLOPE_LIMIT_DEG).toBe(38);
  });

  test("break-it fixture: no point falls inside the river channel", () => {
    const points = scatterVegetation({ ...BASE_PARAMS, kind: "fern", tier: 1, cellSize: 4 });
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      const half = riverWidthAtZ(p.z) / 2;
      expect(Math.abs(p.x - riverX(p.z))).toBeGreaterThanOrEqual(half);
    }
  });

  test("a density floor above 1 rejects every point", () => {
    const points = scatterVegetation({ ...BASE_PARAMS, kind: "rock", densityThreshold: 1.01, tier: 1 });
    expect(points).toEqual([]);
  });

  test("river-channel fixture actually rejects something (break-it proof)", () => {
    // A surface with no slope at all, over the full river-crossing bounds:
    // any point landing inside the channel is rejected purely by the river
    // check, proving that guard fires rather than always vacuously passing.
    const flat: ScatterSurface = { heightAt: () => 0, densityAt: () => 1 };
    const withRiverGuard = scatterVegetation({ ...BASE_PARAMS, surface: flat, tier: 1, cellSize: 4 }).length;

    // A tiny cellSize inside just the river's own centre band, using the
    // real river geometry: at z=CENTER.z the channel is centred on riverX(z).
    const z = 40;
    const half = riverWidthAtZ(z) / 2;
    const bandOnlyBounds = { xMin: riverX(z) - half + 0.1, xMax: riverX(z) + half - 0.1, zMin: z - 2, zMax: z + 2 };
    const inChannelOnly = scatterVegetation({ ...BASE_PARAMS, surface: flat, tier: 1, cellSize: 1, bounds: bandOnlyBounds });
    expect(inChannelOnly).toEqual([]); // every cell in this band is inside the channel -> all rejected
    expect(withRiverGuard).toBeGreaterThan(0); // the guard doesn't reject everything globally
  });
});
