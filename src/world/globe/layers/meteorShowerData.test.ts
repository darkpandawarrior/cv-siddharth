import { describe, expect, it } from "vitest";
import { monthDayInRange } from "./meteors.ts";
import { MAJOR_SHOWERS } from "./meteorShowerData.ts";

describe("MAJOR_SHOWERS", () => {
  it("gives every shower a name, parent body and a peak date inside its own window", () => {
    for (const s of MAJOR_SHOWERS) {
      expect(monthDayInRange(s.peakMonth, s.peakDay, s.startMonth, s.startDay, s.endMonth, s.endDay)).toBe(true);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.parentBody.length).toBeGreaterThan(0);
      expect(s.zhr).toBeGreaterThan(0);
      expect(s.raHours).toBeGreaterThanOrEqual(0);
      expect(s.raHours).toBeLessThan(24);
      expect(s.decDeg).toBeGreaterThanOrEqual(-90);
      expect(s.decDeg).toBeLessThanOrEqual(90);
    }
  });

  it("has ten distinctly named major showers", () => {
    const names = new Set(MAJOR_SHOWERS.map((s) => s.name));
    expect(names.size).toBe(MAJOR_SHOWERS.length);
    expect(MAJOR_SHOWERS.length).toBe(10);
  });
});
