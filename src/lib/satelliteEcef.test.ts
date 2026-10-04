import { describe, expect, it } from "vitest";
import { ecefToScene, orbitalPeriodMin, propagateState, type TleObject } from "./satelliteEcef.ts";
import tleFixture from "../../e2e/fixtures/tle.json" with { type: "json" };

// Same fixture and instant satellites.test.ts already validates SGP4 against
// (open-data-spec.md §1's measured snapshot), so ISS is known-fresh here.
const CLOCK = new Date("2026-09-23T22:26:56Z");
const OBJECTS = tleFixture.objects as TleObject[];
const ISS = OBJECTS.find((o) => o.norad === "25544")!;
const TEST_RADIUS = 6; // GLOBE_RADIUS, duplicated rather than imported: this
// file has no reason to depend on EarthDots.tsx/three.js for one constant.

describe("ecefToScene", () => {
  it("maps a point over (0N, 0E) to +X", () => {
    const scene = ecefToScene({ x: 6371, y: 0, z: 0 }, TEST_RADIUS);
    expect(scene.x).toBeCloseTo(TEST_RADIUS, 6);
    expect(scene.y).toBeCloseTo(0, 6);
    expect(scene.z).toBeCloseTo(0, 6);
  });

  it("maps a point over the north pole to +Y", () => {
    const scene = ecefToScene({ x: 0, y: 0, z: 6371 }, TEST_RADIUS);
    expect(scene.x).toBeCloseTo(0, 6);
    expect(scene.y).toBeCloseTo(TEST_RADIUS, 6);
    expect(scene.z).toBeCloseTo(0, 6);
  });

  it("maps a point over (0N, 90E) to -Z", () => {
    const scene = ecefToScene({ x: 0, y: 6371, z: 0 }, TEST_RADIUS);
    expect(scene.x).toBeCloseTo(0, 6);
    expect(scene.y).toBeCloseTo(0, 6);
    expect(scene.z).toBeCloseTo(-TEST_RADIUS, 6);
  });

  it("scales true altitude by the same ratio the globe's own radius uses", () => {
    // A point 420 km above the surface (roughly ISS altitude) over (0,0).
    const scene = ecefToScene({ x: 6371 + 420, y: 0, z: 0 }, TEST_RADIUS);
    const heightAboveGlobeUnits = scene.x - TEST_RADIUS;
    expect(heightAboveGlobeUnits).toBeCloseTo(420 * (TEST_RADIUS / 6371), 6);
  });
});

describe("propagateState", () => {
  it("ISS true-scale altitude sits close to the ~0.40-unit figure the plan expects", () => {
    const state = propagateState(ISS, CLOCK)!;
    expect(state).not.toBeNull();
    // Real ISS altitude is ~400-430 km; sanity-check the raw figure too.
    expect(state.altKm).toBeGreaterThan(350);
    expect(state.altKm).toBeLessThan(450);
    const scene = ecefToScene(state.ecef, TEST_RADIUS);
    const renderAlt = Math.hypot(scene.x, scene.y, scene.z) - TEST_RADIUS;
    expect(renderAlt).toBeCloseTo(0.4, 1);
  });

  it("eclipse state actually varies across one ISS orbit, not stuck true or false", () => {
    const periodMin = orbitalPeriodMin(ISS);
    const samples = Array.from({ length: 12 }, (_, i) => propagateState(ISS, new Date(CLOCK.getTime() + i * ((periodMin * 60_000) / 12)))!.sunlit);
    expect(samples).toContain(true);
    expect(samples).toContain(false);
  });

  it("returns null for a stale (>7 day old) element", () => {
    const stale: TleObject = { ...ISS, l1: staleLine(ISS.l1, 8) };
    expect(propagateState(stale, CLOCK)).toBeNull();
  });

  it("orbitalPeriodMin lands near the ISS's real ~92.5 minute period", () => {
    expect(orbitalPeriodMin(ISS)).toBeGreaterThan(90);
    expect(orbitalPeriodMin(ISS)).toBeLessThan(95);
  });
});

/** Same helper as satellites.test.ts (kept local — this file doesn't import
 *  test code from another module): rewrites a TLE line-1's epoch to
 *  `daysAgo` before CLOCK, keeping the rest of the line intact. */
function staleLine(l1: string, daysAgo: number): string {
  const past = new Date(CLOCK.getTime() - daysAgo * 86_400_000);
  const start = Date.UTC(past.getUTCFullYear(), 0, 1);
  const dayOfYear = (past.getTime() - start) / 86_400_000 + 1;
  const yy = String(past.getUTCFullYear() % 100).padStart(2, "0");
  const doy = dayOfYear.toFixed(8).padStart(12, "0");
  return l1.slice(0, 18) + yy + doy + l1.slice(32);
}
