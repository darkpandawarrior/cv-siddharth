// P4 (wave 9): the Pune-coincident layers (ReachColumns, familyCiRing,
// LiveDots, reachAppRing, hazardHalos, TogetherLayer) used to share a
// surface-lift height across several files - the exact z-fight the
// design.md/perf.md audits both independently flagged as a green/magenta
// moire over Pune. This is the acceptance test the wave-9 plan asks for
// ("no two layers render at an identical radius from GLOBE_RADIUS"),
// written against the real exported constants rather than a source-text
// grep, so it breaks the moment any future edit reintroduces a collision.
import { describe, it, expect } from "vitest";
import { SURFACE_LIFT as REACH_COLUMNS_LIFT } from "./ReachColumns.tsx";
import { SURFACE_EPS as APP_RING_LIFT } from "./layers/reachAppRing.tsx";
import { SURFACE_EPS as CI_RING_LIFT } from "./layers/familyCiRing.tsx";
import { SURFACE_LIFT as HAZARD_HALO_LIFT } from "./layers/hazardHalos.tsx";
import { RING_LIFT as TOGETHER_RING_LIFT } from "./layers/TogetherLayer.tsx";
import { SURFACE_LIFT as LIVE_DOT_LIFT } from "./LiveDots.tsx";

describe("Pune marker-cluster stack (P4 declutter)", () => {
  const lifts = {
    ReachColumns: REACH_COLUMNS_LIFT,
    reachAppRing: APP_RING_LIFT,
    familyCiRing: CI_RING_LIFT,
    hazardHalos: HAZARD_HALO_LIFT,
    TogetherLayer: TOGETHER_RING_LIFT,
    LiveDots: LIVE_DOT_LIFT,
  };

  it("gives every Pune-coincident layer a distinct lift above GLOBE_RADIUS", () => {
    const values = Object.values(lifts);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps every lift a small, deliberate offset (not zero, not absurd)", () => {
    for (const [name, v] of Object.entries(lifts)) {
      expect(v, name).toBeGreaterThan(0);
      expect(v, name).toBeLessThan(0.1);
    }
  });
});
