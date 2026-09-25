import { describe, it, expect } from "vitest";
import { lookAngles, SANGAM } from "./lookAngles";

describe("lookAngles", () => {
  it("returns az 48.0 +-0.1 for a point 8.42 km out on bearing 48.0 deg (Pune airport)", () => {
    // Constructed with the same forward-geodesic formula lookAngles inverts:
    // bearing 48.0 deg, distance 8420 m from SANGAM.
    const target = { lat: 18.582224821949435, lon: 73.9197154766793, altM: 500 };
    const { azDeg, rangeKm } = lookAngles(target);
    expect(azDeg).toBeCloseTo(48.0, 1);
    expect(rangeKm).toBeCloseTo(8.42, 1);
  });

  it("reads 0 range and ~90 deg elevation directly overhead", () => {
    const target = { lat: SANGAM.lat, lon: SANGAM.lon, altM: SANGAM.altM + 10_000 };
    const { elDeg, rangeKm } = lookAngles(target);
    expect(rangeKm).toBeCloseTo(0, 5);
    expect(elDeg).toBeCloseTo(90, 0);
  });

  it("reads a negative elevation for a target below the local horizon", () => {
    const target = { lat: SANGAM.lat + 0.5, lon: SANGAM.lon, altM: SANGAM.altM };
    const { elDeg } = lookAngles(target);
    expect(elDeg).toBeLessThan(0);
  });
});
