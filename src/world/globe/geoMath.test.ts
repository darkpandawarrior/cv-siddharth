import { describe, it, expect } from "vitest";
import { PUNE, subsolarPoint } from "../../lib/sky.ts";
import { fibonacciLattice, isDayAt, isDaySide, latLonToXyz, xyzToLatLon } from "./geoMath.ts";

describe("latLonToXyz / xyzToLatLon", () => {
  it("round-trips lat/lon through xyz for a spread of points", () => {
    const samples: [number, number][] = [
      [0, 0],
      [90, 0],
      [-90, 45],
      [18.5204, 73.8567],
      [-33.4, 151.2],
      [0, 179.9],
    ];
    for (const [lat, lon] of samples) {
      const { lat: lat2, lon: lon2 } = xyzToLatLon(latLonToXyz(lat, lon));
      expect(lat2).toBeCloseTo(lat, 6);
      // Longitude is undefined at the poles -- only check it away from them.
      if (Math.abs(lat) < 89.99) expect(lon2).toBeCloseTo(lon, 6);
    }
  });

  it("returns a unit vector for any lat/lon", () => {
    const p = latLonToXyz(37, -122);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 10);
  });
});

describe("fibonacciLattice", () => {
  it("returns exactly `count` points, deterministically", () => {
    const a = fibonacciLattice(500);
    const b = fibonacciLattice(500);
    expect(a.length).toBe(500);
    expect(a).toEqual(b);
  });

  it("spreads points across the whole latitude range, not clustered at one pole", () => {
    const points = fibonacciLattice(1000);
    const lats = points.map((p) => p.lat);
    expect(Math.max(...lats)).toBeGreaterThan(85);
    expect(Math.min(...lats)).toBeLessThan(-85);
  });

  it("never produces NaN, even for a single point", () => {
    const [p] = fibonacciLattice(1);
    expect(Number.isFinite(p.lat)).toBe(true);
    expect(Number.isFinite(p.lon)).toBe(true);
  });
});

describe("isDaySide / isDayAt", () => {
  it("the subsolar point itself always lies on the day hemisphere", () => {
    expect(isDaySide(23.4, 100, 23.4, 100)).toBe(true);
  });

  it("the real subsolar point (from sky.ts) lies on the day hemisphere", () => {
    for (const iso of ["2026-09-24T06:24:00Z", "2026-09-24T12:27:00Z", "2026-09-24T17:53:00Z"]) {
      const d = new Date(iso);
      const sub = subsolarPoint(d);
      expect(isDayAt(d, sub.lat, sub.lon)).toBe(true);
    }
  });

  it("Pune at 03:15 IST (2026-09-24, i.e. 2026-09-23T21:45:00Z) is on the night side", () => {
    const pune0315Ist = new Date("2026-09-23T21:45:00Z");
    expect(isDayAt(pune0315Ist, PUNE.lat, PUNE.lon)).toBe(false);
  });

  it("Pune at solar noon-ish (12:27 IST, 2026-09-24T06:57:00Z) is on the day side", () => {
    const puneNoonIst = new Date("2026-09-24T06:57:00Z");
    expect(isDayAt(puneNoonIst, PUNE.lat, PUNE.lon)).toBe(true);
  });

  it("antipodal points are never both lit", () => {
    const d = new Date("2026-09-24T12:27:00Z");
    const antipodeLit = isDayAt(d, -PUNE.lat, PUNE.lon > 0 ? PUNE.lon - 180 : PUNE.lon + 180);
    const puneLit = isDayAt(d, PUNE.lat, PUNE.lon);
    expect(antipodeLit).toBe(!puneLit);
  });
});
