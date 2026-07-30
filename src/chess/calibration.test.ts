import { describe, expect, it } from "vitest";
import { PRESETS, clockBudget } from "./calibration.ts";

describe("PRESETS", () => {
  it("defines the two past selves at their real ratings", () => {
    expect(PRESETS.sid2019.rating).toBe(1078);
    expect(PRESETS.sid2026.rating).toBe(1425);
  });

  it("gives the stronger preset more depth and less noise", () => {
    expect(PRESETS.sid2026.depth).toBeGreaterThanOrEqual(PRESETS.sid2019.depth);
    expect(PRESETS.sid2026.noise).toBeLessThan(PRESETS.sid2019.noise);
  });
});

describe("clockBudget", () => {
  it("models the measured shape: fast opening, slow middlegame, hurried finish", () => {
    const opening = clockBudget(PRESETS.sid2026, 4);
    const middle = clockBudget(PRESETS.sid2026, 18);
    const late = clockBudget(PRESETS.sid2026, 45);
    expect(middle).toBeGreaterThan(opening);
    expect(middle).toBeGreaterThan(late);
  });

  it("never returns a non-positive budget", () => {
    for (const n of [1, 10, 25, 60, 200]) expect(clockBudget(PRESETS.sid2026, n)).toBeGreaterThan(0);
  });
});
