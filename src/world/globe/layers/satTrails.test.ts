import { describe, expect, it } from "vitest";
import { groundTrackPoints, trailPoints } from "./satTrails.ts";
import type { TleObject } from "../../../lib/satelliteEcef.ts";
import tleFixture from "../../../../e2e/fixtures/tle.json" with { type: "json" };

const CLOCK = new Date("2026-09-23T22:26:56Z");
const OBJECTS = tleFixture.objects as TleObject[];
const ISS = OBJECTS.find((o) => o.norad === "25544")!;
const GLOBE_RADIUS = 6;

function isFinitePoint(p: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

describe("trailPoints", () => {
  it("returns steps+1 finite scene points for a fresh element", () => {
    const points = trailPoints(ISS, CLOCK, GLOBE_RADIUS);
    expect(points.length).toBe(31);
    expect(points.every(isFinitePoint)).toBe(true);
  });
});

describe("groundTrackPoints", () => {
  it("returns a dense set of finite points spanning +-1 orbit", () => {
    const points = groundTrackPoints(ISS, CLOCK, GLOBE_RADIUS);
    expect(points.length).toBeGreaterThan(300);
    expect(points.every(isFinitePoint)).toBe(true);
    // Every ground-track point sits on the globe's own surface radius.
    for (const p of points) expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(GLOBE_RADIUS, 6);
  });
});
