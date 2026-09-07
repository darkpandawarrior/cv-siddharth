import { describe, it, expect } from "vitest";
import { lanes, laneMonths } from "./lanes.ts";
import { timeline } from "./timeline.ts";

// Relationships, not values — same house rule as timeline.test.ts. This file
// is a re-shape of timeline.ts, so what it must prove is that the re-shape
// lost nothing, not that any one number is still what it was today.
describe("lanes", () => {
  it("carries exactly the four lanes the Profile repo's strip draws", () => {
    expect(lanes.map((l) => l.key).sort()).toEqual(["chess", "opensource", "work", "writing"]);
  });

  it("shares timeline.ts's exact month axis", () => {
    expect(laneMonths).toEqual(timeline.months);
  });

  it("gives every lane a value for every month", () => {
    for (const lane of lanes) {
      for (const ym of laneMonths) {
        expect(typeof lane.months[ym], `${lane.key} is missing ${ym}`).toBe("number");
        expect(lane.months[ym]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("matches the totals and peaks timeline.ts computed", () => {
    for (const lane of lanes) {
      const src = timeline.lanes.find((l) => l.key === lane.key)!;
      expect(lane.total).toBe(src.total);
      expect(lane.peak).toEqual(src.peak);
    }
  });

  it("gives every lane a distinct CSS custom property to draw with", () => {
    const vars = lanes.map((l) => l.hueVar);
    expect(new Set(vars).size).toBe(vars.length);
    for (const v of vars) expect(v).toMatch(/^--[a-z0-9-]+$/);
  });
});
