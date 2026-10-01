import { describe, it, expect } from "vitest";
import { moonDistanceKm } from "./skyMoonMath.ts";

// Real perigee/apogee bound the whole orbit: roughly 356,500-406,700 km.
// This truncation (top 4 terms of ~60) is good to a few hundred km, not
// exact - the test asserts the honest bound, not a pinned digit.
describe("moonDistanceKm", () => {
  it("stays within the Moon's real perigee/apogee range", () => {
    for (const iso of ["2026-09-26T22:19:00+05:30", "2026-09-24T12:00:00+05:30", "2000-01-01T12:00:00Z", "1987-04-10T00:00:00Z"]) {
      const km = moonDistanceKm(new Date(iso));
      expect(km).toBeGreaterThan(356_000);
      expect(km).toBeLessThan(407_000);
    }
  });

  it("varies from one date to the next (not a constant mean)", () => {
    const a = moonDistanceKm(new Date("2026-09-01T00:00:00Z"));
    const b = moonDistanceKm(new Date("2026-09-15T00:00:00Z"));
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});
