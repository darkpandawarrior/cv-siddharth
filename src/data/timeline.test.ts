import { describe, it, expect } from "vitest";
import { timeline } from "./timeline.ts";

/**
 * Relationships, not values.
 *
 * This world has a documented history of passing every gate while being
 * unplayable, because the gates asserted numbers that a hand-kept copy of the
 * same numbers agreed with. So nothing here asserts "chess peaked at 619" —
 * that is true today and will be false the next time the archive refreshes.
 * These assert the properties the terrain builder actually depends on.
 */
describe("timeline", () => {
  it("covers a contiguous month range with no gaps", () => {
    expect(timeline.months.length).toBeGreaterThan(24);
    expect(timeline.months[0]).toBe(timeline.from);
    expect(timeline.months.at(-1)).toBe(timeline.to);
    for (let i = 1; i < timeline.months.length; i++) {
      const [py, pm] = timeline.months[i - 1].split("-").map(Number);
      const [y, m] = timeline.months[i].split("-").map(Number);
      expect(y * 12 + m).toBe(py * 12 + pm + 1);
    }
  });

  it("gives every lane a value for every month — a missing key is a hole in the ground", () => {
    for (const lane of timeline.lanes) {
      for (const ym of timeline.months) {
        expect(typeof lane.months[ym], `${lane.key} is missing ${ym}`).toBe("number");
        expect(lane.months[ym]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("reports a peak that is actually the maximum", () => {
    for (const lane of timeline.lanes) {
      const max = Math.max(...Object.values(lane.months));
      expect(lane.peak.v).toBe(max);
      expect(lane.months[lane.peak.ym]).toBe(max);
    }
  });

  it("keeps the open-source lane's private-repo caveat", () => {
    // The terrain is a claim about his career. Public GitHub reads near-zero
    // for 2021-2024 because Jugnoo and Dice are private repos, not because he
    // stopped working. If this caveat is ever edited away, the lane starts
    // asserting a four-year hole in his employment. This test is the guard.
    const os = timeline.lanes.find((l) => l.key === "opensource");
    if (!os) return; // lane is optional; the caveat is not
    expect(os.label).not.toMatch(/^(code|commits|work)$/i);
    expect(os.source.toLowerCase()).toContain("private");
  });

  it("never lets a year-resolution lane claim month resolution", () => {
    for (const lane of timeline.lanes) {
      expect(["month", "year"]).toContain(lane.resolution);
      if (lane.resolution === "year") expect(lane.source.toLowerCase()).toContain("year");
    }
  });
});
