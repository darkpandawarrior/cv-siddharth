import { describe, it, expect } from "vitest";
import { moonPhaseName, moonPhaseLabel } from "./skyMoonText.ts";

describe("moonPhaseName", () => {
  it("names the eight standard phase bands", () => {
    expect(moonPhaseName(0)).toBe("new");
    expect(moonPhaseName(90)).toBe("first quarter");
    expect(moonPhaseName(180)).toBe("full");
    expect(moonPhaseName(270)).toBe("last quarter");
    expect(moonPhaseName(359)).toBe("new");
  });
});

describe("moonPhaseLabel", () => {
  it("reads the known 2026-09-26 22:19 IST full-moon oracle as full, ~100%", () => {
    // Same USNO-recorded reading moon.test.ts already pins (fraction >= 0.99
    // at phaseAngleDeg close to 180 for a full moon).
    expect(moonPhaseLabel({ fraction: 0.995, waxing: false, phaseAngleDeg: 181 })).toBe("full 100%");
  });
});
