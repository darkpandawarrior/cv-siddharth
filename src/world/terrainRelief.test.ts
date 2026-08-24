import { describe, expect, it } from "vitest";
import { CITY } from "./city.ts";
import { heightAt, laneCenterX } from "./heightfield.ts";
import { visualHeightAt } from "./terrainRelief.ts";

describe("visualHeightAt — the four lane treatments", () => {
  it("work terraces to 0.25m risers", () => {
    const x = laneCenterX(0); // work
    for (let z = CITY.z0 + 1; z < CITY.z1; z += 3.7) {
      const h = visualHeightAt(x, z) - CITY.groundY;
      const steps = h / 0.25;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    }
  });

  it("chess is smoother than the raw heightfield across a spike", () => {
    const x = laneCenterX(1); // chess — 2020-12 (lockdown peak) is the spike
    const z = -30; // somewhere inside the corridor
    // A neighbouring pair of samples on the raw field can differ by more than
    // the smoothed field ever does, once averaged over +/-2 months.
    const rawSpread = Math.abs(heightAt(x, z + 1.83) - heightAt(x, z - 1.83));
    const smoothedSpread = Math.abs(visualHeightAt(x, z + 1.83) - visualHeightAt(x, z - 1.83));
    expect(smoothedSpread).toBeLessThanOrEqual(rawSpread + 1e-6);
  });

  it("writing goes flat outside its 6m band", () => {
    const centre = laneCenterX(2); // writing
    const farEdge = centre + 6.9; // outside the 6m band, still inside the 14m lane
    expect(visualHeightAt(farEdge, 0)).toBeCloseTo(CITY.groundY, 3);
  });

  it("writing keeps relief inside its band, when the raw field has any", () => {
    const centre = laneCenterX(2);
    // Find a z where the raw field actually has relief to preserve.
    let z = CITY.z0 + 5;
    for (; z < CITY.z1; z += 5) {
      if (heightAt(centre, z) - CITY.groundY > 0.05) break;
    }
    const raw = heightAt(centre, z) - CITY.groundY;
    const kept = visualHeightAt(centre, z) - CITY.groundY;
    expect(kept).toBeGreaterThan(raw * 0.5);
  });

  it("opensource is flat before 2025-10 and can differ from flat after", () => {
    const x = laneCenterX(3); // opensource
    expect(visualHeightAt(x, CITY.z0 + 4)).toBeCloseTo(CITY.groundY, 3);
    // z1 is inside the flooding-after-2025-10 window per the timeline data.
    const late = visualHeightAt(x, CITY.z1 - 4);
    expect(late).toBeGreaterThanOrEqual(CITY.groundY);
  });
});
